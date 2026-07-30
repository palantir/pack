/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Logger } from "@osdk/api";
import type {
  ActivityCollaborativeUpdate,
  ClientSupportedVersionRange,
  DocumentActivitySubscriptionRequest,
  DocumentEditDescription,
  DocumentMetadataUpdate,
  DocumentPresenceSubscriptionRequest,
  DocumentPublishMessage,
  DocumentUpdateMessage,
  DocumentUpdateSubscriptionRequest,
  PresenceCollaborativeUpdate,
  PresencePublishMessage,
} from "@osdk/foundry.pack";
import { getAuthModule } from "@palantir/pack.auth";
import { generateId, justOnce, type PackAppInternal } from "@palantir/pack.core";
import {
  type DocumentId,
  type EditDescription,
  getMetadata,
  hasMetadata,
  toChannelError,
  toUnknownChannelError,
} from "@palantir/pack.document-schema.model-types";
import {
  DocumentLiveStatus,
  DocumentLoadStatus,
  type DocumentSyncStatus,
  getDocumentUpdateSchemaVersionFromTransaction,
} from "@palantir/pack.state.core";
import { Base64 } from "js-base64";
import * as y from "yjs";
import { type CometDLoader, EventServiceCometD } from "./cometd/EventServiceCometD.js";
import type {
  EventService,
  SubscriptionId,
  TypedPublishChannelId,
  TypedReceiveChannelId,
} from "./types/EventService.js";

// TODO: replace with @osdk/foundry.pack types when they land.
export interface PresenceSubscriptionOptions {
  readonly ignoreSelfUpdates?: boolean;
}

export interface PresencePublishOptions {
  /**
   * If true (default), event is broadcast only and not persisted.
   * If false, event is persisted and replayed to new clients.
   *
   * @default true
   */
  readonly isEphemeral?: boolean;
}

const UPDATE_ORIGIN_REMOTE = "remote" as const;

/** Queue depth at which held updates stop looking like a normal load and start looking stuck. */
const PENDING_PUBLISH_WARN_THRESHOLD = 100;

const getDocumentUpdatesChannelId = (
  documentId: DocumentId,
): TypedReceiveChannelId<DocumentUpdateMessage> =>
  `/document/${documentId}/updates` as TypedReceiveChannelId<DocumentUpdateMessage>;

const getDocumentPublishChannelId = (
  documentId: DocumentId,
): TypedPublishChannelId<DocumentPublishMessage> =>
  `/document/${documentId}/publish` as TypedPublishChannelId<DocumentPublishMessage>;

const getDocumentActivityChannelId = (
  documentId: DocumentId,
): TypedReceiveChannelId<ActivityCollaborativeUpdate> =>
  `/document/${documentId}/activity` as TypedReceiveChannelId<ActivityCollaborativeUpdate>;

const getDocumentPresenceChannelId = (
  documentId: DocumentId,
): TypedReceiveChannelId<PresenceCollaborativeUpdate> =>
  `/document/${documentId}/presence` as TypedReceiveChannelId<PresenceCollaborativeUpdate>;

const getDocumentMetadataUpdatesChannelId = (
  documentId: DocumentId,
): TypedReceiveChannelId<DocumentMetadataUpdate> =>
  `/document/${documentId}/metadata/updates` as TypedReceiveChannelId<DocumentMetadataUpdate>;

const getDocumentPresencePublishChannelId = (
  documentId: DocumentId,
): TypedPublishChannelId<PresencePublishMessage> =>
  `/document/${documentId}/presence-publish` as TypedPublishChannelId<PresencePublishMessage>;

export interface SyncSession {
  readonly clientId: string;
  readonly documentId: DocumentId;
}

/**
 * A local Yjs update captured for publishing. Kept unresolved rather than as a finished
 * `DocumentPublishMessage` so the schema version is decided when it is sent, not when it is made.
 */
interface PendingPublish {
  readonly description?: DocumentPublishMessage["description"];
  /** Resolves the document's operational version at publish time; absent for callers without one. */
  readonly getDocumentSchemaOperationalVersion?: () => number;
  /** Version stamped on the originating transaction, when it carried one. */
  readonly transactionSchemaVersion?: number;
  readonly update: Uint8Array;
}

interface SyncSessionInternal extends SyncSession {
  documentSubscriptionId?: SubscriptionId;
  lastRevisionId?: number;
  localYDocUpdateHandler?: (
    update: Uint8Array,
    origin: unknown,
    doc: y.Doc,
    transaction: y.Transaction,
  ) => void;
  /**
   * Local updates produced before the server's first revision is known. They cannot be published
   * yet — a publish has to declare the revision it builds on — so they are held here and flushed in
   * order once the initial load establishes `lastRevisionId`.
   */
  pendingPublishes: PendingPublish[];
  /**
   * Identifies the current run of sync. Async callbacks compare against it to tell whether the run
   * that started them is still the current one. The update handler cannot serve as that token: it
   * outlives sync so local writes are still captured while sync is stopped.
   */
  syncToken?: object;
  yDoc?: y.Doc;
}

/**
 * This manages event subscriptions and publishing of document related events via
 * our PACK Foundry backend's cometd service.
 */
export interface FoundryEventService {
  /**
   * Begin capturing local Yjs updates for a document before any sync session exists, so writes
   * made before the first data subscription opens are held rather than lost. Safe to call more
   * than once for the same document.
   */
  beginDocumentCapture(
    documentId: DocumentId,
    yDoc: y.Doc,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    getDocumentSchemaOperationalVersion?: () => number,
  ): void;

  disposeDocument(documentId: DocumentId): void;

  publishCustomPresence(
    documentId: DocumentId,
    eventType: string,
    eventData: unknown,
    payloadSchemaVersion: number,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    options?: PresencePublishOptions,
  ): Promise<void>;

  startDocumentSync(
    documentId: DocumentId,
    yDoc: y.Doc,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    onStatusChange: (status: Partial<DocumentSyncStatus>) => void,
    getDocumentSchemaOperationalVersion?: () => number,
  ): SyncSession;

  stopDocumentSync(session: SyncSession): void;

  subscribeToActivityUpdates(
    documentId: DocumentId,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    callback: (event: ActivityCollaborativeUpdate) => void,
  ): Promise<SubscriptionId>;

  subscribeToMetadataUpdates(
    documentId: DocumentId,
    callback: (event: DocumentMetadataUpdate) => void,
  ): Promise<SubscriptionId>;

  subscribeToPresenceUpdates(
    documentId: DocumentId,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    callback: (update: PresenceCollaborativeUpdate) => void,
    options?: PresenceSubscriptionOptions,
  ): Promise<SubscriptionId>;

  unsubscribe(subscriptionId: SubscriptionId): void;
}

class FoundryEventServiceImpl implements FoundryEventService {
  private readonly eventService: EventService;
  private readonly logger: Logger;
  private readonly sessions = new Map<string, SyncSessionInternal>();

  constructor(
    private readonly app: PackAppInternal,
    cometdLoader?: CometDLoader,
  ) {
    this.eventService = new EventServiceCometD(app, cometdLoader);
    this.logger = app.config.logger.child({}, {
      level: "debug",
      msgPrefix: "FoundryEventService",
    });
  }

  private getOrCreateSession(documentId: DocumentId): SyncSessionInternal {
    const sessionId = this.getSessionId(documentId);
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        clientId: crypto.randomUUID(),
        documentId,
        documentSubscriptionId: undefined,
        lastRevisionId: undefined,
        localYDocUpdateHandler: undefined,
        pendingPublishes: [],
        yDoc: undefined,
      };
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  beginDocumentCapture(
    documentId: DocumentId,
    yDoc: y.Doc,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    getDocumentSchemaOperationalVersion?: () => number,
  ): void {
    this.captureLocalUpdates(
      documentId,
      yDoc,
      clientSupportedVersionRange,
      getDocumentSchemaOperationalVersion,
    );
  }

  /**
   * Start listening for local Yjs updates so none are missed, whether or not sync is running.
   * Updates are held until a sync session establishes the revision to publish them against.
   *
   * Idempotent per Y.Doc: re-attaching for the same Y.Doc swaps in a handler bound to the latest
   * arguments, leaving exactly one listener attached.
   */
  private captureLocalUpdates(
    documentId: DocumentId,
    yDoc: y.Doc,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    getDocumentSchemaOperationalVersion?: () => number,
  ): (update: Uint8Array, origin: unknown, doc: y.Doc, transaction: y.Transaction) => void {
    const session = this.getOrCreateSession(documentId);
    const isReplacingYDoc = session.yDoc != null && session.yDoc !== yDoc;

    if (session.localYDocUpdateHandler != null) {
      session.yDoc?.off("update", session.localYDocUpdateHandler);
    }

    if (isReplacingYDoc) {
      // Held updates describe operations in the previous Y.Doc. Publishing them against a document
      // that has been replaced would inject state the local document no longer has, so they are
      // dropped — loudly, because dropping writes is exactly what this queue exists to prevent.
      if (session.pendingPublishes.length > 0) {
        this.logger.warn("Discarding local document updates captured for a replaced Y.Doc", {
          docId: documentId,
          discardedCount: session.pendingPublishes.length,
        });
        session.pendingPublishes = [];
      }
    }

    const localYDocUpdateHandler = (
      update: Uint8Array,
      origin: unknown,
      _doc: y.Doc,
      transaction: y.Transaction,
    ) => {
      if (origin === UPDATE_ORIGIN_REMOTE) {
        return;
      }

      this.publishOrQueueUpdate(session, clientSupportedVersionRange, update, {
        description: isEditDescription(origin) ? createDocumentEditDescription(origin) : undefined,
        getDocumentSchemaOperationalVersion,
        // Absent when the transaction carried no version. Left unresolved here so a queued update
        // picks up the operational version at publish time: capture can happen before metadata
        // loads, when the fallback would understate the version the content actually needs.
        transactionSchemaVersion: getDocumentUpdateSchemaVersionFromTransaction(transaction),
      });
    };

    session.yDoc = yDoc;
    session.localYDocUpdateHandler = localYDocUpdateHandler;
    yDoc.on("update", localYDocUpdateHandler);

    return localYDocUpdateHandler;
  }

  startDocumentSync(
    documentId: DocumentId,
    yDoc: y.Doc,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    onStatusChange: (status: Partial<DocumentSyncStatus>) => void,
    getDocumentSchemaOperationalVersion?: () => number,
  ): SyncSession {
    const session = this.getOrCreateSession(documentId);

    if (session.syncToken != null) {
      throw new Error(`Document data sync already active for document ${documentId}`);
    }
    const syncToken = {};
    session.syncToken = syncToken;

    try {
      // Capture normally began at document creation. Re-attaching here covers a caller that starts
      // sync without having begun capture, and a document whose Y.Doc was replaced.
      this.captureLocalUpdates(
        documentId,
        yDoc,
        clientSupportedVersionRange,
        getDocumentSchemaOperationalVersion,
      );

      // Fans out to caller-supplied status subscribers, which are not guarded against throwing.
      onStatusChange({
        live: DocumentLiveStatus.CONNECTING,
        load: DocumentLoadStatus.LOADING,
      });
    } catch (e) {
      // Without this the token stays set and every later start is rejected as already active,
      // wedging the document for the lifetime of the session.
      session.syncToken = undefined;
      throw e;
    }

    const channelId = getDocumentUpdatesChannelId(documentId);

    this.eventService.subscribe(
      channelId,
      (message: DocumentUpdateMessage) => {
        if (session.syncToken !== syncToken) {
          return;
        }
        this.handleDocumentUpdateMessage(
          session,
          message,
          yDoc,
          clientSupportedVersionRange,
          onStatusChange,
        );
      },
      () => ({
        clientId: session.clientId,
        clientSupportedVersionRange,
        lastRevisionId: session.lastRevisionId?.toString(),
      } satisfies DocumentUpdateSubscriptionRequest),
    ).then(subscriptionId => {
      if (session.syncToken === syncToken) {
        session.documentSubscriptionId = subscriptionId;
        // The channel is subscribed, so the data channel is live. Reported separately from `load`,
        // which stays LOADING until the first update arrives. Matches how the activity and presence
        // channels report liveness on subscription establishment.
        onStatusChange({
          live: DocumentLiveStatus.CONNECTED,
        });
      } else {
        this.eventService.unsubscribe(subscriptionId);
      }
    }).catch((e: unknown) => {
      if (session.syncToken === syncToken) {
        onStatusChange({
          error: toUnknownChannelError(
            new Error("Failed to setup document data subscription", { cause: e }),
          ),
          live: DocumentLiveStatus.ERROR,
          load: DocumentLoadStatus.ERROR,
        });
      } else {
        this.logger.warn("Document data subscription error after subscription was closed", {
          docId: documentId,
          error: e,
        });
      }
    });

    return {
      clientId: session.clientId,
      documentId: session.documentId,
    };
  }

  subscribeToActivityUpdates(
    documentId: DocumentId,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    callback: (event: ActivityCollaborativeUpdate) => void,
  ): Promise<SubscriptionId> {
    const session = this.getOrCreateSession(documentId);

    const channelId = getDocumentActivityChannelId(documentId);

    return this.eventService.subscribe(
      channelId,
      (event: ActivityCollaborativeUpdate) => {
        this.logger.debug("Received activity event", {
          docId: documentId,
          event,
        });
        callback(event);
      },
      () => ({
        clientId: session.clientId,
        clientSupportedVersionRange,
      } satisfies DocumentActivitySubscriptionRequest),
    ).catch((e: unknown) => {
      this.logger.error("Failed to subscribe to activity updates", e, {
        docId: documentId,
      });
      throw new Error("Failed to subscribe to activity updates", { cause: e });
    });
  }

  subscribeToMetadataUpdates(
    documentId: DocumentId,
    callback: (event: DocumentMetadataUpdate) => void,
  ): Promise<SubscriptionId> {
    const channelId = getDocumentMetadataUpdatesChannelId(documentId);

    return this.eventService.subscribe(
      channelId,
      (event: DocumentMetadataUpdate) => {
        this.logger.debug("Received metadata update event", {
          docId: documentId,
          event,
        });
        callback(event);
      },
    ).catch((e: unknown) => {
      this.logger.error("Failed to subscribe to metadata updates", e, {
        docId: documentId,
      });
      throw new Error("Failed to subscribe to metadata updates", { cause: e });
    });
  }

  subscribeToPresenceUpdates(
    documentId: DocumentId,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    callback: (update: PresenceCollaborativeUpdate) => void,
    options: PresenceSubscriptionOptions = {},
  ): Promise<SubscriptionId> {
    const { ignoreSelfUpdates = true } = options;
    const session = this.getOrCreateSession(documentId);

    const channelId = getDocumentPresenceChannelId(documentId);

    return this.eventService.subscribe(
      channelId,
      (update: PresenceCollaborativeUpdate) => {
        // A channel error carries no user; forward it directly (the consumer
        // surfaces it as channel status) and skip self-presence filtering.
        if (update.type === "error") {
          callback(update);
          return;
        }

        // TODO: api should provide clientId so we filter on our presence messages only,
        // but allow apps to decide what they do with same-user-different-client messages ie
        // from different tabs or devices.
        const localUserId = getAuthModule(this.app).getCurrentUser(true)?.userId;
        if (ignoreSelfUpdates && localUserId != null) {
          switch (update.type) {
            case "presenceChangeEvent":
              if (update.userId === localUserId) {
                return;
              }
              break;
            case "customPresenceEvent":
              if (update.userId === localUserId) {
                return;
              }
              break;
            default:
              update satisfies never;
              break;
          }
        }

        this.logger.debug("Received presence update", {
          docId: documentId,
          updateType: update.type,
        });
        callback(update);
      },
      () => ({
        clientId: session.clientId,
        clientSupportedVersionRange,
      } satisfies DocumentPresenceSubscriptionRequest),
    ).catch((e: unknown) => {
      this.logger.error("Failed to subscribe to presence updates", e, {
        docId: documentId,
      });
      throw new Error("Failed to subscribe to presence updates", { cause: e });
    });
  }

  publishCustomPresence(
    documentId: DocumentId,
    eventType: string,
    eventData: unknown,
    payloadSchemaVersion: number,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    options?: PresencePublishOptions,
  ): Promise<void> {
    const { isEphemeral = true } = options ?? {};
    const session = this.getOrCreateSession(documentId);
    const channelId = getDocumentPresencePublishChannelId(documentId);

    // TODO: maybe the session should hold userId
    // Though would need better reconnection handling to ensure userId doesn't change.
    const userId = getAuthModule(this.app).getCurrentUser(true)?.userId;
    if (userId == null) {
      throw new Error("Could not get current userId");
    }

    const message = {
      clientSupportedVersionRange,
      messageType: {
        type: "custom",
        clientId: session.clientId,
        // FIXME: why do we have to send this, we are authenticated
        eventData,
        eventType,
        isEphemeral,
        userId,
        schemaVersion: payloadSchemaVersion,
      },
    } satisfies PresencePublishMessage;

    return this.eventService.publish(channelId, message).catch((error: unknown) => {
      this.logger.error("Failed to publish custom presence", error, {
        docId: documentId,
      });
      throw error;
    });
  }

  stopDocumentSync(session: SyncSession): void {
    const sessionId = this.getSessionId(session.documentId);
    const internalSession = this.sessions.get(sessionId);

    if (internalSession == null) {
      this.logger.warn("Attempted to stop sync for unknown session", {
        documentId: session.documentId,
        clientId: session.clientId,
      });
      return;
    }

    if (internalSession.documentSubscriptionId) {
      this.eventService.unsubscribe(internalSession.documentSubscriptionId);
      internalSession.documentSubscriptionId = undefined;
    }
    internalSession.syncToken = undefined;
    internalSession.lastRevisionId = undefined;
    // The update handler and any held updates deliberately survive: the document is still open and
    // writable, so writes made while sync is stopped are captured and published when sync resumes.
    // Only disposeDocument tears capture down.
  }

  unsubscribe(subscriptionId: SubscriptionId): void {
    this.eventService.unsubscribe(subscriptionId);
  }

  disposeDocument(documentId: DocumentId): void {
    const sessionId = this.getSessionId(documentId);
    const session = this.sessions.get(sessionId);
    if (session == null) {
      return;
    }
    this.stopDocumentSync(session);

    if (session.localYDocUpdateHandler != null) {
      session.yDoc?.off("update", session.localYDocUpdateHandler);
      session.localYDocUpdateHandler = undefined;
    }
    session.yDoc = undefined;

    // The document is going away, so held updates have no future sync session to publish them.
    // They are lost from the server's perspective — the loss this queue exists to prevent, so it
    // is stated rather than left silent.
    if (session.pendingPublishes.length > 0) {
      this.logger.warn("Discarding local document updates that were never published", {
        docId: session.documentId,
        discardedCount: session.pendingPublishes.length,
      });
      session.pendingPublishes = [];
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Publish a local Yjs update, or hold it until the initial load establishes the revision it
   * builds on. Updates were previously dropped with only a log line in that window, which lost
   * them silently.
   */
  private publishOrQueueUpdate(
    session: SyncSessionInternal,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    update: Uint8Array,
    options: Omit<PendingPublish, "update">,
  ): void {
    if (session.lastRevisionId == null) {
      session.pendingPublishes.push({ ...options, update });
      const pendingCount = session.pendingPublishes.length;
      // Nothing bounds the queue: an initial load that never completes grows it for as long as
      // edits keep arriving. Warn periodically rather than dropping edits, since dropping is the
      // failure this queue exists to prevent — and warn again as it keeps growing, so a stalled
      // load does not go quiet after one message.
      if (pendingCount % PENDING_PUBLISH_WARN_THRESHOLD === 0) {
        this.logger.warn("Local document updates are piling up while the initial load completes", {
          docId: session.documentId,
          pendingCount,
        });
      } else {
        this.logger.debug("Holding local document update until the initial load completes", {
          docId: session.documentId,
          pendingCount,
        });
      }
      return;
    }

    this.publishUpdate(session, clientSupportedVersionRange, { ...options, update });
  }

  private publishUpdate(
    session: SyncSessionInternal,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    pending: PendingPublish,
  ): void {
    const publishMessage: DocumentPublishMessage = {
      clientId: session.clientId,
      clientSupportedVersionRange,
      description: pending.description,
      // Resolved here rather than at capture: an update held through the initial load was captured
      // before metadata was available, when the operational version would still be a schema
      // fallback that can understate what the content needs.
      documentUpdateSchemaVersion: pending.transactionSchemaVersion
        ?? pending.getDocumentSchemaOperationalVersion?.()
        ?? getFallbackDocumentUpdateSchemaVersion(clientSupportedVersionRange),
      editId: generateId(),
      yjsUpdate: {
        data: Base64.fromUint8Array(pending.update),
      },
    };

    void this.eventService.publish(
      getDocumentPublishChannelId(session.documentId),
      publishMessage,
    ).catch((error: unknown) => {
      this.logger.error("Failed to publish document update", error, {
        docId: session.documentId,
      });
    });
  }

  /** Flush updates held while the revision was unknown, preserving the order they were made in. */
  private flushPendingPublishes(
    session: SyncSessionInternal,
    clientSupportedVersionRange: ClientSupportedVersionRange,
  ): void {
    if (session.pendingPublishes.length === 0) {
      return;
    }

    const pending = session.pendingPublishes;
    session.pendingPublishes = [];
    this.logger.debug("Publishing local document updates held during the initial load", {
      docId: session.documentId,
      pendingCount: pending.length,
    });

    for (const pendingPublish of pending) {
      this.publishUpdate(session, clientSupportedVersionRange, pendingPublish);
    }
  }

  private handleDocumentUpdateMessage(
    session: SyncSessionInternal,
    message: DocumentUpdateMessage,
    yDoc: y.Doc,
    clientSupportedVersionRange: ClientSupportedVersionRange,
    onStatusChange: (status: Partial<DocumentSyncStatus>) => void,
  ): void {
    switch (message.type) {
      case "error":
        const { args, code, errorInstanceId } = message;
        this.logger.error("Received document update error message", {
          docId: session.documentId,
          code,
          errorInstanceId,
          args,
        });
        // A channel-level error from the server means the subscription itself is unusable, so
        // liveness fails with the load. Data-integrity failures below (revision gap, update that
        // will not apply) leave `live` alone: the connection is still up, only the state is stale.
        onStatusChange({
          error: toChannelError(code, errorInstanceId),
          live: DocumentLiveStatus.ERROR,
          load: DocumentLoadStatus.ERROR,
        });
        break;
      case "update":
        const { baseRevisionId, clientId, revisionId, update } = message;

        const data = update != null && typeof update.data === "string"
          ? Base64.toUint8Array(update.data)
          : undefined;

        const messageDetail = {
          baseRevisionId,
          clientId,
          revisionId,
          updateSize: data?.byteLength ?? 0,
        };

        // FIXME: the typescript generators for api types come out as string, hard to be clear that they are numbers.
        if (session.lastRevisionId != null && Number(baseRevisionId) !== session.lastRevisionId) {
          this.logger.error("Got unexpected update for baseRevisionId", {
            docId: session.documentId,
            lastRevisionId: session.lastRevisionId,
            message: messageDetail,
          });
          onStatusChange({
            error: toUnknownChannelError(
              new Error(
                `Revision gap: expected base revision ${session.lastRevisionId}, `
                  + `received ${baseRevisionId}. Local document state is stale.`,
              ),
            ),
            load: DocumentLoadStatus.ERROR,
          });
          return;
        }

        this.logger.debug("Applying remote Y.js update", {
          docId: session.documentId,
          lastRevisionId: session.lastRevisionId,
          message: messageDetail,
        });

        if (data != null) {
          try {
            y.applyUpdate(yDoc, data, UPDATE_ORIGIN_REMOTE);
          } catch (e) {
            this.logger.error("Failed to apply remote Y.js update; local state is now stale", e, {
              docId: session.documentId,
              lastRevisionId: session.lastRevisionId,
              message: messageDetail,
            });
            onStatusChange({
              error: toUnknownChannelError(
                new Error(
                  `Failed to apply remote update at revision ${revisionId}`,
                  { cause: e },
                ),
              ),
              load: DocumentLoadStatus.ERROR,
            });
            return;
          }
        }
        session.lastRevisionId = Number(revisionId);

        // The revision is known, so anything held during the load can go out now.
        this.flushPendingPublishes(session, clientSupportedVersionRange);

        onStatusChange({
          load: DocumentLoadStatus.LOADED,
        });

        break;
      case "deletion":
        this.logger.info("Document was deleted", {
          docId: session.documentId,
          deletionMethod: message.deletionMethod,
        });
        onStatusChange({
          error: toUnknownChannelError(
            new Error(`Document was deleted [${message.deletionMethod}]`),
          ),
          load: DocumentLoadStatus.ERROR,
        });
        break;
      default:
        message satisfies never;
        const { type } = message as { type: string };
        justOnce(`unknown-collab-update-type:${type}`, () => {
          this.logger.warn(
            "Received unknown DocumentUpdateMessage type. This is only warned the first occurrence.",
            {
              docId: session.documentId,
              updateType: type,
            },
          );
        });
        break;
    }
  }

  private getSessionId(documentId: DocumentId): string {
    return documentId;
  }
}

export function createFoundryEventService(
  app: PackAppInternal,
  /** @internal */
  cometdLoader?: CometDLoader,
): FoundryEventService {
  return new FoundryEventServiceImpl(app, cometdLoader);
}

function isEditDescription(obj: unknown): obj is EditDescription {
  return (
    obj != null
    && typeof obj === "object"
    && "data" in obj
    && "model" in obj
    && typeof obj.model === "object"
    && obj.model != null
    && hasMetadata(obj.model)
  );
}

function createDocumentEditDescription(editDescription: EditDescription): DocumentEditDescription {
  const eventType = getMetadata(editDescription.model).name;
  return {
    eventData: {
      data: editDescription.data,
      eventType,
      schemaVersion: editDescription.schemaVersion ?? 1,
    },
  };
}

function getFallbackDocumentUpdateSchemaVersion(
  clientSupportedVersionRange: ClientSupportedVersionRange,
): number {
  const { maxVersion } = clientSupportedVersionRange;
  if (Number.isFinite(maxVersion)) {
    return maxVersion;
  }
  return clientSupportedVersionRange.minVersion;
}
