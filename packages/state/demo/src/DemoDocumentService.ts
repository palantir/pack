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

import type { PackAppInternal, Unsubscribe } from "@palantir/pack.core";
import { generateId, getOntologyRid } from "@palantir/pack.core";
import type {
  ActivityEvent,
  ActivityEventId,
  DocumentId,
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
  EditDescription,
  Model,
  ModelData,
  PresenceEvent,
  PresencePublishOptions,
  UserId,
} from "@palantir/pack.document-schema.model-types";
import {
  ActivityEventDataType,
  getMetadata,
  hasMetadata,
  toUnknownChannelError,
} from "@palantir/pack.document-schema.model-types";
import type {
  CreateDocumentMetadata,
  DocumentType,
  InternalYjsDoc,
  SearchDocumentsResult,
  UpdateDocumentMetadata,
} from "@palantir/pack.state.core";
import {
  BaseYjsDocumentService,
  createDocRef,
  DocumentLiveStatus,
  DocumentLoadStatus,
} from "@palantir/pack.state.core";
import { Base64 } from "js-base64";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { MetadataStore } from "./MetadataStore.js";
import { PresenceManager } from "./PresenceManager.js";

const EMPTY_DOCUMENT_SECURITY = Object.freeze({
  discretionary: {},
  mandatory: {},
});

const CLIENT_ID_STORAGE_KEY = "pack-demo-client-id";

function getOrCreateClientId(): string {
  try {
    const storedId = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);

    if (storedId != null) {
      return storedId;
    }

    const newId = crypto.randomUUID();

    sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, newId);

    return newId;
  } catch {
    return crypto.randomUUID();
  }
}

export interface DemoDocumentServiceOptions {
  readonly dbPrefix?: string;
  readonly clearOnInit?: boolean;
}

interface DemoInternalDoc extends InternalYjsDoc {
  channel?: BroadcastChannel;
  /** Identifies the current metadata open, so stale async continuations can be discarded. */
  metadataSubscriptionOpenToken?: object;
  presenceManager?: PresenceManager;
  provider?: IndexeddbPersistence;
  unobserveMetadata?: () => void;
  updateHandler?: (update: Uint8Array, origin: unknown) => void;
}

export class DemoDocumentService extends BaseYjsDocumentService<DemoInternalDoc> {
  private readonly clientId: string;
  private readonly dbPrefix: string;
  private readonly metadataStore: MetadataStore;

  constructor(app: PackAppInternal, options: DemoDocumentServiceOptions = {}) {
    super(app, app.config.logger.child({}, { level: "debug", msgPrefix: "DemoDocumentService" }), {
      isDemo: true,
    });

    this.clientId = getOrCreateClientId();
    this.dbPrefix = options.dbPrefix ?? "pack-demo";
    this.metadataStore = new MetadataStore(this.dbPrefix);
  }

  private static readonly SCHEMA_VERSION_KEY_PREFIX = "pack-demo-schema-version:";

  /**
   * Checks localStorage for a synchronously-available schema version
   * before falling back to metadata / minSupportedVersion.
   *
   * localStorage is used because the metadata from IndexedDB is loaded
   * asynchronously and not available on first render.
   */
  override readonly getDocumentSchemaOperationalVersion = (
    docRef: DocumentRef,
  ): number => {
    try {
      const stored = localStorage.getItem(
        DemoDocumentService.SCHEMA_VERSION_KEY_PREFIX + docRef.id,
      );
      if (stored != null) return parseInt(stored, 10);
    } catch {
      // localStorage may be unavailable
    }
    // Inline the base class logic — class fields can't call `super`.
    const internalDoc = this.documents.get(docRef.id);
    if (internalDoc?.metadata?.operationalVersion != null) {
      return internalDoc.metadata.operationalVersion;
    }
    const schemaMeta = getMetadata(docRef.schema);
    return schemaMeta.minSupportedVersion ?? schemaMeta.version;
  };

  /**
   * Persist a schema version for a document to localStorage (synchronous)
   * and metadata (async). Used by demo apps to simulate backend version bumps.
   */
  readonly setDocumentSchemaVersion = (
    docRef: DocumentRef,
    version: number,
  ): void => {
    try {
      localStorage.setItem(
        DemoDocumentService.SCHEMA_VERSION_KEY_PREFIX + docRef.id,
        String(version),
      );
    } catch {
      // localStorage may be unavailable
    }
    void this.updateDocument(docRef, {
      operationalVersion: version,
    });
  };

  override createInternalDoc(
    ref: DocumentRef,
    metadata?: DocumentMetadata,
  ): DemoInternalDoc {
    const internalDoc = this.createBaseInternalDoc(ref, metadata) as DemoInternalDoc;
    this.ensureUpdateHandler(internalDoc, ref);
    return internalDoc;
  }

  private ensureUpdateHandler(internalDoc: DemoInternalDoc, docRef: DocumentRef): void {
    if (internalDoc.updateHandler) {
      return;
    }

    const channel = new BroadcastChannel(`pack-demo-doc-${docRef.id}`);
    internalDoc.channel = channel;

    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;

      if (isEditDescription(origin)) {
        if (!internalDoc.presenceManager) {
          internalDoc.presenceManager = new PresenceManager(
            docRef.id,
            this.clientId,
            docRef.schema,
          );
        }

        const modelName = getMetadata(origin.model).name;
        const event: ActivityEvent = {
          aggregationKey: `${docRef.id}-${modelName}`,
          createdBy: this.clientId as UserId,
          createdInstant: Date.now(),
          eventData: {
            data: origin.data,
            eventType: modelName,
            model: origin.model,
            schemaVersion: origin.schemaVersion ?? docRef.version,
            type: ActivityEventDataType.CUSTOM_EVENT,
          },
          eventId: generateId() as ActivityEventId,
          isRead: false,
        };

        internalDoc.presenceManager.broadcastActivity(event);
      }

      channel.postMessage({
        type: "update",
        data: Base64.fromUint8Array(update),
      });
    };

    internalDoc.yDoc.on("update", updateHandler);
    internalDoc.updateHandler = updateHandler;

    channel.onmessage = event => {
      if (event.data.type === "update") {
        const update = Base64.toUint8Array(event.data.data);
        Y.applyUpdate(internalDoc.yDoc, update, "remote");
      }
    };
  }

  get hasMetadataSubscriptions(): boolean {
    return Array.from(this.documents.values()).some(
      doc => this.hasSubscriptions(doc) && doc.metadataSubscribers.size > 0,
    );
  }

  get hasStateSubscriptions(): boolean {
    return Array.from(this.documents.values()).some(
      doc => this.hasSubscriptions(doc) && doc.docStateSubscribers.size > 0,
    );
  }

  readonly createDocument = async <T extends DocumentSchema>(
    {
      documentTypeName,
      name,
      security = EMPTY_DOCUMENT_SECURITY,
      ontologyRid: metadataOntologyRid,
    }: CreateDocumentMetadata,
    schema: T,
  ): Promise<DocumentRef<T>> => {
    await this.metadataStore.whenReady();
    const ontologyRid = metadataOntologyRid ?? await getOntologyRid(this.app);

    const id = generateDocumentId();
    const docRef = createDocRef(this.app, id, schema);

    const schemaMeta = getMetadata(schema);
    const operationalVersion = schemaMeta.minSupportedVersion ?? schemaMeta.version;

    const metadata: DocumentMetadata = {
      documentTypeName,
      name,
      operationalVersion,
      ontologyRid,
      security, // TODO: may want to add in auth.getUserId() as owner here
    };

    this.metadataStore.setDocument(id, metadata);

    const yDoc = this.initializeYDoc(schema);
    this.getCreateInternalDoc(docRef, metadata, yDoc);

    return docRef;
  };

  readonly searchDocuments = async <T extends DocumentSchema>(
    documentTypeName: string,
    schema: T,
    options?: {
      documentName?: string;
      pageSize?: number;
      pageToken?: string;
      ontologyRid?: string;
    },
  ): Promise<SearchDocumentsResult> => {
    await this.metadataStore.whenReady();
    return this.metadataStore.searchDocuments(documentTypeName, options);
  };

  readonly updateDocument = async (
    docRef: DocumentRef,
    update: UpdateDocumentMetadata,
  ): Promise<DocumentMetadata> => {
    await this.metadataStore.whenReady();
    const existing = this.metadataStore.getDocument(docRef.id);
    if (existing == null) {
      throw new Error(`Document not found: ${docRef.id}`);
    }

    const metadata: DocumentMetadata = {
      ...existing,
      ...update,
    };

    this.logger.debug("updateDocument", {
      docId: docRef.id,
      newOperationalVersion: metadata.operationalVersion,
      updateKeys: Object.keys(update),
    });

    this.metadataStore.setDocument(docRef.id, metadata);
    this.updateMetadata(docRef.id, metadata);

    return metadata;
  };

  readonly deleteDocument = async (
    docRef: DocumentRef,
  ): Promise<void> => {
    await this.metadataStore.whenReady();
    const existing = this.metadataStore.getDocument(docRef.id);
    if (existing == null) {
      throw new Error(`Document not found: ${docRef.id}`);
    }
    this.metadataStore.deleteDocument(docRef.id);
    this.documents.delete(docRef.id);
  };

  readonly loadDocumentTypeByName = (
    _documentTypeName: string,
    _ontologyRid?: string,
  ): Promise<DocumentType> => {
    return Promise.reject(
      new Error("loadDocumentTypeByName is not supported by the demo document service"),
    );
  };

  readonly getDocumentType = (
    _documentTypeRid: string,
  ): Promise<DocumentType> => {
    return Promise.reject(
      new Error("getDocumentType is not supported by the demo document service"),
    );
  };

  readonly getDocumentTypeOperationalVersion = (
    _documentTypeName: string,
    _ontologyRid?: string,
  ): Promise<number | undefined> => {
    return Promise.reject(
      new Error(
        "getDocumentTypeOperationalVersion is not supported by the demo document service",
      ),
    );
  };

  readonly resolveDocumentApplication = (
    _docRef: DocumentRef,
  ): Promise<string | undefined> => {
    return Promise.reject(
      new Error(
        "resolveDocumentApplication is not supported by the demo document service",
      ),
    );
  };

  protected onMetadataSubscriptionOpened(
    internalDoc: DemoInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (
      internalDoc.metadataSubscriptionOpenToken != null
      || !this.hasMetadataDemand(internalDoc)
    ) {
      return;
    }
    const openToken = {};
    internalDoc.metadataSubscriptionOpenToken = openToken;

    this.updateMetadataStatus(internalDoc, docRef, {
      live: DocumentLiveStatus.CONNECTING,
      // Metadata already held (from createDocument, or an earlier open that only closed the
      // channel) must not flash back to LOADING: consumers gate on `load === LOADED`, and
      // waitForMetadataLoad would stop resolving immediately. Reopening re-establishes liveness,
      // not the load — unlike Foundry, which genuinely fetches again over HTTP.
      ...(internalDoc.metadata == null ? { load: DocumentLoadStatus.LOADING } : {}),
    });

    this.metadataStore.whenReady().then(() => {
      if (!this.isMetadataOpenGeneration(internalDoc, docRef, openToken)) {
        return;
      }
      const metadata = this.metadataStore.getDocument(docRef.id);

      if (metadata == null) {
        this.updateMetadataStatus(internalDoc, docRef, {
          error: toUnknownChannelError(new Error("Document not found")),
          live: DocumentLiveStatus.ERROR,
          load: DocumentLoadStatus.ERROR,
        });
        return;
      }

      internalDoc.metadata = metadata;

      internalDoc.unobserveMetadata = this.metadataStore.observeDocument(
        docRef.id,
        updatedMetadata => {
          if (updatedMetadata != null) {
            internalDoc.metadata = updatedMetadata;
            this.notifyMetadataSubscribers(internalDoc, docRef, updatedMetadata);
          }
        },
      );

      this.updateMetadataStatus(internalDoc, docRef, {
        live: DocumentLiveStatus.CONNECTED,
        load: DocumentLoadStatus.LOADED,
      });
    }).catch((error: unknown) => {
      if (!this.isMetadataOpenGeneration(internalDoc, docRef, openToken)) {
        return;
      }
      this.updateMetadataStatus(internalDoc, docRef, {
        error: toUnknownChannelError(error),
        live: DocumentLiveStatus.ERROR,
        load: DocumentLoadStatus.ERROR,
      });
    });
  }

  private hasMetadataDemand(internalDoc: DemoInternalDoc): boolean {
    return internalDoc.hasDataSubscriptions || internalDoc.hasMetadataSubscriptions;
  }

  /**
   * Checks whether a metadata load's result is still safe to use. It is not safe if the load was
   * replaced, nobody needs metadata anymore, or the document was recreated.
   */
  private isMetadataOpenGeneration(
    internalDoc: DemoInternalDoc,
    docRef: DocumentRef,
    openToken: object,
  ): boolean {
    return this.documents.get(docRef.id) === internalDoc
      && internalDoc.metadataSubscriptionOpenToken === openToken
      && this.hasMetadataDemand(internalDoc);
  }

  protected onDataSubscriptionOpened(
    internalDoc: DemoInternalDoc,
    docRef: DocumentRef,
  ): void {
    // Couple metadata loading to data loading so docRef.version (operationalVersion)
    // is correct whenever document state is loaded, even without a metadata subscriber.
    this.ensureMetadataLoaded(internalDoc, docRef);

    this.updateDataStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.LOADING,
      live: DocumentLiveStatus.CONNECTING,
    });

    try {
      // Ensure update handler is set up (may already be done in createInternalDoc)
      this.ensureUpdateHandler(internalDoc, docRef);

      // Set up persistence
      if (!internalDoc.provider) {
        const provider = new IndexeddbPersistence(
          `${this.dbPrefix}-doc-${docRef.id}`,
          internalDoc.yDoc,
        );
        internalDoc.provider = provider;

        provider.whenSynced.then(() => {
          this.updateDataStatus(internalDoc, docRef, {
            load: DocumentLoadStatus.LOADED,
            live: DocumentLiveStatus.CONNECTED,
          });
        }).catch((error: unknown) => {
          this.updateDataStatus(internalDoc, docRef, {
            error: toUnknownChannelError(error),
            load: DocumentLoadStatus.ERROR,
            live: DocumentLiveStatus.ERROR,
          });
        });
      } else {
        // Provider already exists, just update status
        this.updateDataStatus(internalDoc, docRef, {
          load: DocumentLoadStatus.LOADED,
          live: DocumentLiveStatus.CONNECTED,
        });
      }
    } catch (error) {
      this.updateDataStatus(internalDoc, docRef, {
        error: toUnknownChannelError(error),
        load: DocumentLoadStatus.ERROR,
        live: DocumentLiveStatus.ERROR,
      });
    }
  }

  protected onMetadataSubscriptionClosed(
    internalDoc: DemoInternalDoc,
    docRef: DocumentRef,
  ): void {
    this.closeMetadataSubscription(internalDoc, docRef);
  }

  private closeMetadataSubscription(
    internalDoc: DemoInternalDoc,
    docRef: DocumentRef,
  ): void {
    // Data subscriptions drive metadata through ensureMetadataLoaded, so metadata stays live
    // until nobody needs it — otherwise the indicator reads disconnected while updates flow.
    if (this.hasMetadataDemand(internalDoc)) {
      return;
    }
    internalDoc.metadataSubscriptionOpenToken = undefined;
    internalDoc.unobserveMetadata?.();
    internalDoc.unobserveMetadata = undefined;
    if (internalDoc.metadataStatus.load === DocumentLoadStatus.LOADING) {
      this.updateMetadataStatus(internalDoc, docRef, {
        live: DocumentLiveStatus.DISCONNECTED,
        load: DocumentLoadStatus.UNLOADED,
      });
    } else if (
      internalDoc.metadataStatus.live !== DocumentLiveStatus.DISCONNECTED
      || internalDoc.metadataStatus.error != null
    ) {
      this.updateMetadataStatus(internalDoc, docRef, {
        live: DocumentLiveStatus.DISCONNECTED,
        // Replaying the current load is a no-op for `load` itself but lets updateChannelStatus
        // drop a subscription error: closing on purpose is not a failure. A load of ERROR is
        // preserved, since that error describes the metadata, not the channel.
        load: internalDoc.metadataStatus.load,
      });
    }
  }

  protected onDataSubscriptionClosed(
    internalDoc: DemoInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (internalDoc.updateHandler) {
      internalDoc.yDoc.off("update", internalDoc.updateHandler);
      internalDoc.updateHandler = undefined;
    }

    if (internalDoc.channel) {
      internalDoc.channel.close();
      internalDoc.channel = undefined;
    }

    if (internalDoc.provider) {
      void internalDoc.provider.destroy();
      internalDoc.provider = undefined;
    }

    if (internalDoc.presenceManager) {
      internalDoc.presenceManager.dispose();
      internalDoc.presenceManager = undefined;
    }

    this.closeMetadataSubscription(internalDoc, docRef);
  }

  onActivity<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: ActivityEvent) => void,
  ): Unsubscribe {
    const { internalDoc } = this.getCreateInternalDoc(docRef);

    if (!internalDoc.presenceManager) {
      internalDoc.presenceManager = new PresenceManager(docRef.id, this.clientId, docRef.schema);
    }

    this.updateActivityStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.LOADED,
      live: DocumentLiveStatus.CONNECTED,
    });

    const unsubscribe = internalDoc.presenceManager.onActivity(event => {
      callback(docRef, event);
    });

    return () => {
      unsubscribe();
    };
  }

  onPresence<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: PresenceEvent) => void,
  ): Unsubscribe {
    const { internalDoc } = this.getCreateInternalDoc(docRef);

    if (!internalDoc.presenceManager) {
      internalDoc.presenceManager = new PresenceManager(docRef.id, this.clientId, docRef.schema);
    }

    this.updatePresenceStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.LOADED,
      live: DocumentLiveStatus.CONNECTED,
    });

    const unsubscribe = internalDoc.presenceManager.onPresence(event => {
      callback(docRef, event);
    });

    return () => {
      unsubscribe();
    };
  }

  updateCustomPresence<M extends Model>(
    docRef: DocumentRef,
    model: M,
    eventData: ModelData<M>,
    _options?: PresencePublishOptions,
  ): void {
    const { internalDoc } = this.getCreateInternalDoc(docRef);

    if (!internalDoc.presenceManager) {
      internalDoc.presenceManager = new PresenceManager(docRef.id, this.clientId, docRef.schema);
    }

    const event: PresenceEvent = {
      eventData: {
        eventData,
        model,
        schemaVersion: docRef.version,
        type: ActivityEventDataType.CUSTOM_EVENT,
      },
      userId: this.clientId as UserId,
    };

    internalDoc.presenceManager.broadcastPresence(event);
  }
}

function generateDocumentId(): DocumentId {
  return generateId() as DocumentId;
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
