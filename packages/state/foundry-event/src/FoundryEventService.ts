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
  DocumentPublishMessage,
  DocumentUpdateMessage,
  DocumentUpdateSubscriptionRequest,
} from "@osdk/foundry.pack";
import { generateId, justOnce, type PackAppInternal } from "@palantir/pack.core";
import type { DocumentId } from "@palantir/pack.document-schema.model-types";
import { DocumentLoadStatus, type DocumentSyncStatus } from "@palantir/pack.state.core";
import type { CometD } from "cometd";
import { Base64 } from "js-base64";
import * as y from "yjs";
import { EventServiceCometD } from "./cometd/EventServiceCometD.js";
import type {
  EventService,
  SubscriptionId,
  TypedPublishChannelId,
  TypedReceiveChannelId,
} from "./types/EventService.js";

const UPDATE_ORIGIN_REMOTE = "remote" as const;

const getDocumentUpdatesChannelId = (
  documentId: DocumentId,
): TypedReceiveChannelId<DocumentUpdateMessage> =>
  `/document/${documentId}/updates` as TypedReceiveChannelId<DocumentUpdateMessage>;

const getDocumentPublishChannelId = (
  documentId: DocumentId,
): TypedPublishChannelId<DocumentPublishMessage> =>
  `/document/${documentId}/publish` as TypedPublishChannelId<DocumentPublishMessage>;

export interface SyncSession {
  readonly clientId: string;
  readonly documentId: DocumentId;
}

interface SyncSessionInternal extends SyncSession {
  documentSubscriptionId?: SubscriptionId;
  lastRevisionId?: number;
  localYDocUpdateHandler?: (update: Uint8Array, origin: unknown) => void;
  yDoc: y.Doc;
}

export class FoundryEventService {
  private readonly eventService: EventService;
  private readonly logger: Logger;
  private readonly sessions = new Map<string, SyncSessionInternal>();

  constructor(
    private readonly app: PackAppInternal,
    cometd?: CometD,
  ) {
    this.eventService = new EventServiceCometD(app, cometd);
    this.logger = app.config.logger.child({}, {
      level: "debug",
      msgPrefix: "FoundryEventService",
    });
  }

  startDocumentSync(
    documentId: DocumentId,
    yDoc: y.Doc,
    onStatusChange: (status: Partial<DocumentSyncStatus>) => void,
  ): SyncSession {
    const sessionId = this.getSessionId(documentId);

    if (this.sessions.has(sessionId)) {
      throw new Error(`Sync session already exists for document ${documentId}`);
    }

    const session: SyncSessionInternal = {
      clientId: crypto.randomUUID(),
      documentId,
      documentSubscriptionId: undefined,
      lastRevisionId: undefined,
      localYDocUpdateHandler: undefined,
      yDoc,
    };

    this.sessions.set(sessionId, session);

    const localYDocUpdateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === UPDATE_ORIGIN_REMOTE) {
        return;
      }

      const lastRevisionId = session.lastRevisionId;
      if (lastRevisionId == null) {
        this.logger.error(
          "Cannot publish document update before initial load is complete. The local state will remain inconsistent.",
          { docId: documentId },
        );
        return;
      }

      const publishChannelId = getDocumentPublishChannelId(documentId);
      const editId = generateId();
      void this.eventService.publish(publishChannelId, {
        clientId: session.clientId,
        editId,
        yjsUpdate: {
          data: Base64.fromUint8Array(update),
        },
      }).catch((error: unknown) => {
        this.logger.error("Failed to publish document update", error, {
          docId: documentId,
        });
      });
    };

    session.localYDocUpdateHandler = localYDocUpdateHandler;
    yDoc.on("update", localYDocUpdateHandler);

    onStatusChange({
      load: DocumentLoadStatus.LOADING,
    });

    const channelId = getDocumentUpdatesChannelId(documentId);

    this.eventService.subscribe(
      channelId,
      (message: DocumentUpdateMessage) => {
        if (session.localYDocUpdateHandler !== localYDocUpdateHandler) {
          return;
        }
        this.handleDocumentUpdateMessage(session, message, onStatusChange);
      },
      () => ({
        clientId: session.clientId,
        lastRevisionId: session.lastRevisionId?.toString(),
      } satisfies DocumentUpdateSubscriptionRequest),
    ).then(subscriptionId => {
      if (session.localYDocUpdateHandler === localYDocUpdateHandler) {
        session.documentSubscriptionId = subscriptionId;
      } else {
        this.eventService.unsubscribe(subscriptionId);
        this.sessions.delete(this.getSessionId(documentId));
      }
    }).catch((e: unknown) => {
      if (session.localYDocUpdateHandler === localYDocUpdateHandler) {
        const error = new Error("Failed to setup document data subscription", { cause: e });
        onStatusChange({
          error,
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

    if (internalSession.localYDocUpdateHandler != null) {
      internalSession.yDoc.off("update", internalSession.localYDocUpdateHandler);
      internalSession.localYDocUpdateHandler = undefined;
    }

    if (internalSession.documentSubscriptionId) {
      this.eventService.unsubscribe(internalSession.documentSubscriptionId);
      this.sessions.delete(sessionId);
    }
  }

  private handleDocumentUpdateMessage(
    session: SyncSessionInternal,
    message: DocumentUpdateMessage,
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
        onStatusChange({
          error: new Error(`Subscription in error state [${errorInstanceId}]`, { cause: message }),
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
          return;
        }

        this.logger.debug("Applying remote Y.js update", {
          docId: session.documentId,
          lastRevisionId: session.lastRevisionId,
          message: messageDetail,
        });

        session.lastRevisionId = Number(revisionId);
        if (data != null) {
          y.applyUpdate(session.yDoc, data, UPDATE_ORIGIN_REMOTE);
        }

        onStatusChange({
          load: DocumentLoadStatus.LOADED,
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
  cometd?: CometD,
): FoundryEventService {
  return new FoundryEventService(app, cometd);
}
