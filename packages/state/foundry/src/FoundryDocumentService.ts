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

import type {
  ClientSupportedVersionRange,
  CreateDocumentRequest,
  DiscretionaryPrincipal,
  DiscretionaryPrincipal as WireDiscretionaryPrincipal,
  Document as WireDocument,
  DocumentSecurity as WireDocumentSecurity,
  DocumentType as WireDocumentType,
  SearchDocumentsRequest,
} from "@osdk/foundry.pack";
import { Documents, DocumentTypes } from "@osdk/foundry.pack";
import { getAuthModule } from "@palantir/pack.auth";
import {
  assertNever,
  getOntologyRid,
  type ModuleConfigTuple,
  type PackAppInternal,
  type Unsubscribe,
} from "@palantir/pack.core";
import type {
  ActivityEvent,
  DocumentId,
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
  DocumentSecurity,
  Model,
  ModelData,
  PresenceEvent,
  PresencePublishOptions,
  PresenceSubscriptionOptions,
} from "@palantir/pack.document-schema.model-types";
import { getMetadata, toUnknownChannelError } from "@palantir/pack.document-schema.model-types";
import type {
  CreateDocumentMetadata,
  DocumentService,
  DocumentType,
  FileSystemType,
  InternalYjsDoc,
  SearchDocumentsResult,
  UpdateDocumentMetadata,
} from "@palantir/pack.state.core";
import {
  BaseYjsDocumentService,
  createDocumentServiceConfig,
  DocumentLiveStatus,
  DocumentLoadStatus,
} from "@palantir/pack.state.core";
import type {
  FoundryEventService,
  SubscriptionId,
  SyncSession,
} from "@palantir/pack.state.foundry-event";
import { createFoundryEventService } from "@palantir/pack.state.foundry-event";
import { getActivityEvent, getPresenceEvent, toChannelError } from "./eventMappers.js";

const DEFAULT_USE_PREVIEW_API = true;
const EMPTY_DOCUMENT_SECURITY: DocumentSecurity = Object.freeze({
  discretionary: {},
  mandatory: {},
});

interface FoundryDocumentServiceConfig {
  readonly usePreviewApi?: boolean;
}

interface ActivitySubscriber {
  readonly callback: (event: ActivityEvent) => void;
}

interface PresenceSubscriber {
  readonly callback: (event: PresenceEvent) => void;
  readonly ignoreSelfUpdates: boolean;
}

export function createFoundryDocumentServiceConfig(
  config: FoundryDocumentServiceConfig = {},
): ModuleConfigTuple<DocumentService> {
  return createDocumentServiceConfig(
    (app: PackAppInternal, config: FoundryDocumentServiceConfig) =>
      internalCreateFoundryDocumentService(app, config),
    config,
  );
}

export function internalCreateFoundryDocumentService(
  app: PackAppInternal,
  config: FoundryDocumentServiceConfig,
  eventService?: FoundryEventService,
): FoundryDocumentService {
  return new FoundryDocumentService(
    app,
    config,
    eventService ?? createFoundryEventService(app),
  );
}

interface FoundryInternalDoc extends InternalYjsDoc {
  activitySubscribers?: Set<ActivitySubscriber>;
  activitySubscriptionId?: SubscriptionId;
  dataSubscriptionOpenToken?: object;
  metadataSubscriptionId?: SubscriptionId;
  metadataSubscriptionOpenToken?: object;
  presenceSubscribers?: Set<PresenceSubscriber>;
  presenceSubscriptionId?: SubscriptionId;
  syncSession?: SyncSession;
}

// TODO: remove once foundry sdk is updated.
interface WireDocumentWithOperationalVersion extends WireDocument {
  readonly operationalVersion?: number;
}

export class FoundryDocumentService extends BaseYjsDocumentService<FoundryInternalDoc> {
  constructor(
    app: PackAppInternal,
    readonly config: FoundryDocumentServiceConfig,
    readonly eventService: FoundryEventService,
  ) {
    super(
      app,
      app.config.logger.child(
        {},
        { level: "debug", msgPrefix: "FoundryDocumentService" },
      ),
    );
  }

  protected createInternalDoc(
    ref: DocumentRef,
    metadata: DocumentMetadata | undefined,
  ): FoundryInternalDoc {
    return {
      ...this.createBaseInternalDoc(ref, metadata),
      syncSession: undefined,
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
    metadata: CreateDocumentMetadata,
    schema: T,
  ): Promise<DocumentRef<T>> => {
    const { documentTypeName, name, parentFolderRid, security } = metadata;
    const ontologyRid = metadata.ontologyRid ?? await getOntologyRid(this.app);

    const request: CreateDocumentRequest = {
      documentTypeName: documentTypeName,
      name: name,
      ontologyRid: ontologyRid,
      security: getWireSecurity(security),
    };

    if (parentFolderRid != null) {
      request.parentFolderRid = parentFolderRid;
    }

    const createResponse = await Documents.create(
      this.app.config.osdkClient,
      request,
      {
        preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
      },
    );

    const documentId = createResponse.id as DocumentId;
    const docRef = this.createDocRef(documentId, schema);
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
    const request: SearchDocumentsRequest = {
      documentTypeName,
      requestBody: {
        query: options?.documentName != null ? { documentName: options.documentName } : undefined,
        pageSize: options?.pageSize,
        pageToken: options?.pageToken,
        ontologyRid: options?.ontologyRid,
      },
    };

    const searchResponse = await Documents.search(
      this.app.config.osdkClient,
      request,
      {
        preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
      },
    );

    return {
      data: searchResponse.data.map(doc => ({
        ...getLocalDocumentMetadata(doc),
        id: doc.id as DocumentId,
      })),
      nextPageToken: searchResponse.nextPageToken,
    };
  };

  readonly updateDocument = async (
    docRef: DocumentRef,
    update: UpdateDocumentMetadata,
  ): Promise<DocumentMetadata> => {
    const document = await Documents.update(
      this.app.config.osdkClient,
      docRef.id,
      {
        requestBody: {
          ...(update.name != null ? { name: update.name } : {}),
          ...(update.description != null ? { description: update.description } : {}),
          ...(update.security != null ? { security: getWireSecurity(update.security) } : {}),
        },
      },
      {
        preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
      },
    );

    const metadata = getLocalDocumentMetadata(document);

    this.updateMetadata(docRef.id, metadata);

    return metadata;
  };

  readonly deleteDocument = async (
    docRef: DocumentRef,
  ): Promise<void> => {
    await Documents.deleteDocument(
      this.app.config.osdkClient,
      docRef.id,
      {
        preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
      },
    );
    const internalDoc = this.documents.get(docRef.id);
    if (internalDoc != null) {
      internalDoc.activitySubscribers = undefined;
      internalDoc.presenceSubscribers = undefined;
      internalDoc.metadataSubscriptionOpenToken = undefined;
      for (
        const subscriptionId of [
          internalDoc.activitySubscriptionId,
          internalDoc.metadataSubscriptionId,
          internalDoc.presenceSubscriptionId,
        ]
      ) {
        if (subscriptionId != null) {
          this.eventService.unsubscribe(subscriptionId);
        }
      }
    }
    this.eventService.disposeDocument(docRef.id);
    this.documents.delete(docRef.id);
  };

  readonly loadDocumentTypeByName = async (
    documentTypeName: string,
    ontologyRid?: string,
  ): Promise<DocumentType> => {
    const resolvedOntologyRid = ontologyRid ?? await getOntologyRid(this.app);

    const documentType = await DocumentTypes.loadByName(
      this.app.config.osdkClient,
      { documentTypeName, ontologyRid: resolvedOntologyRid },
      {
        preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
      },
    );

    return getLocalDocumentType(documentType);
  };

  readonly getDocumentType = async (
    documentTypeRid: string,
  ): Promise<DocumentType> => {
    const documentType = await DocumentTypes.get(
      this.app.config.osdkClient,
      documentTypeRid,
      {
        preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
      },
    );

    return getLocalDocumentType(documentType);
  };

  readonly getDocumentTypeOperationalVersion = async (
    documentTypeName: string,
    ontologyRid?: string,
  ): Promise<number | undefined> => {
    const resolvedOntologyRid = ontologyRid ?? await getOntologyRid(this.app);

    const response = await DocumentTypes.getOperationalVersion(
      this.app.config.osdkClient,
      { documentTypeName, ontologyRid: resolvedOntologyRid },
      {
        preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
      },
    );

    return response.operationalVersion;
  };

  readonly resolveDocumentApplication = async (
    docRef: DocumentRef,
  ): Promise<string | undefined> => {
    const response = await Documents.resolveApplication(
      this.app.config.osdkClient,
      docRef.id,
      {
        preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
      },
    );

    return response.owningApplicationId;
  };

  protected onMetadataSubscriptionOpened(
    internalDoc: FoundryInternalDoc,
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
      load: DocumentLoadStatus.LOADING,
    });

    Documents.get(this.app.config.osdkClient, docRef.id, {
      preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
    })
      .then(document => {
        if (!this.isMetadataOpenGeneration(internalDoc, docRef, openToken)) {
          return;
        }
        const metadata = getLocalDocumentMetadata(document);

        internalDoc.metadata = metadata;
        this.notifyMetadataSubscribers(internalDoc, docRef, metadata);
        this.updateMetadataStatus(internalDoc, docRef, {
          load: DocumentLoadStatus.LOADED,
        });

        this.openMetadataUpdatesSubscription(internalDoc, docRef, openToken);
      })
      .catch((e: unknown) => {
        if (!this.isMetadataOpenGeneration(internalDoc, docRef, openToken)) {
          return;
        }
        internalDoc.metadataSubscriptionOpenToken = undefined;
        this.updateMetadataStatus(internalDoc, docRef, {
          error: toUnknownChannelError(
            new Error("Failed to load document metadata", { cause: e }),
          ),
          load: DocumentLoadStatus.ERROR,
        });
      });
  }

  private openMetadataUpdatesSubscription(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
    openToken: object,
  ): void {
    this.eventService
      .subscribeToMetadataUpdates(docRef.id, _event => {
        if (this.isMetadataOpenGeneration(internalDoc, docRef, openToken)) {
          this.refetchMetadata(internalDoc, docRef);
        }
      })
      .then(subscriptionId => {
        if (!this.isMetadataOpenGeneration(internalDoc, docRef, openToken)) {
          this.eventService.unsubscribe(subscriptionId);
          return;
        }
        internalDoc.metadataSubscriptionId = subscriptionId;
      })
      .catch((e: unknown) => {
        if (!this.isMetadataOpenGeneration(internalDoc, docRef, openToken)) {
          return;
        }
        this.logger.error("Failed to subscribe to metadata updates", e, {
          docId: docRef.id,
        });
      });
  }

  private hasMetadataDemand(internalDoc: FoundryInternalDoc): boolean {
    return internalDoc.hasDataSubscriptions || internalDoc.hasMetadataSubscriptions;
  }

  /**
   * Checks whether a metadata request's result is still safe to use. It is not safe if the
   * request was replaced, nobody needs metadata anymore, or the document was recreated.
   */
  private isMetadataOpenGeneration(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
    openToken: object,
  ): boolean {
    return this.documents.get(docRef.id) === internalDoc
      && internalDoc.metadataSubscriptionOpenToken === openToken
      && this.hasMetadataDemand(internalDoc);
  }

  protected onDataSubscriptionOpened(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (
      internalDoc.dataSubscriptionOpenToken != null
      || internalDoc.syncSession != null
    ) {
      throw new Error("Document data subscription already opened");
    }
    const openToken = {};
    internalDoc.dataSubscriptionOpenToken = openToken;

    this.updateDataStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.LOADING,
    });
    if (internalDoc.metadataStatus.load === DocumentLoadStatus.ERROR) {
      this.updateMetadataStatus(internalDoc, docRef, {
        load: DocumentLoadStatus.UNLOADED,
      });
    }
    this.ensureMetadataLoaded(internalDoc, docRef);

    void this.waitForMetadataLoad(docRef)
      .then(() => {
        const currentDoc = this.documents.get(docRef.id);
        if (
          currentDoc !== internalDoc
          || currentDoc.dataSubscriptionOpenToken !== openToken
          || !currentDoc.hasDataSubscriptions
          || currentDoc.syncSession != null
        ) {
          return;
        }

        internalDoc.syncSession = this.eventService.startDocumentSync(
          docRef.id,
          internalDoc.yDoc,
          getClientSupportedVersionRange(docRef.schema),
          status => {
            this.updateDataStatus(internalDoc, docRef, status);
          },
          () => this.getDocumentSchemaOperationalVersion(docRef),
        );
      })
      .catch((e: unknown) => {
        const currentDoc = this.documents.get(docRef.id);
        if (
          currentDoc !== internalDoc
          || currentDoc.dataSubscriptionOpenToken !== openToken
          || !currentDoc.hasDataSubscriptions
        ) {
          return;
        }
        this.updateDataStatus(internalDoc, docRef, {
          error: toUnknownChannelError(
            new Error("Failed to load document metadata before data sync", { cause: e }),
          ),
          load: DocumentLoadStatus.ERROR,
        });
      });
  }

  protected onMetadataSubscriptionClosed(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    this.closeMetadataUpdatesSubscription(internalDoc, docRef);
  }

  protected onDataSubscriptionClosed(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    internalDoc.dataSubscriptionOpenToken = undefined;
    if (internalDoc.syncSession) {
      this.eventService.stopDocumentSync(internalDoc.syncSession);
      internalDoc.syncSession = undefined;
      this.updateDataStatus(internalDoc, docRef, {
        live: DocumentLiveStatus.DISCONNECTED,
        load: DocumentLoadStatus.UNLOADED,
      });
    } else if (
      internalDoc.dataStatus.load === DocumentLoadStatus.LOADING
      || internalDoc.dataStatus.load === DocumentLoadStatus.ERROR
    ) {
      this.updateDataStatus(internalDoc, docRef, {
        live: DocumentLiveStatus.DISCONNECTED,
        load: DocumentLoadStatus.UNLOADED,
      });
    }
    if (
      internalDoc.metadataStatus.load === DocumentLoadStatus.ERROR
      && internalDoc.metadataSubscribers.size === 0
    ) {
      this.updateMetadataStatus(internalDoc, docRef, {
        load: DocumentLoadStatus.UNLOADED,
      });
    }
    this.closeMetadataUpdatesSubscription(internalDoc, docRef);
  }

  private closeMetadataUpdatesSubscription(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (this.hasMetadataDemand(internalDoc)) {
      return;
    }
    internalDoc.metadataSubscriptionOpenToken = undefined;
    if (internalDoc.metadataSubscriptionId != null) {
      this.eventService.unsubscribe(internalDoc.metadataSubscriptionId);
      internalDoc.metadataSubscriptionId = undefined;
    }
    if (internalDoc.metadataStatus.load === DocumentLoadStatus.LOADING) {
      this.updateMetadataStatus(internalDoc, docRef, {
        load: DocumentLoadStatus.UNLOADED,
      });
    }
  }

  onActivity<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: ActivityEvent) => void,
  ): Unsubscribe {
    const { internalDoc } = this.getCreateInternalDoc(docRef);
    const subscriber: ActivitySubscriber = {
      callback: event => callback(docRef, event),
    };
    const subscribers = (internalDoc.activitySubscribers ??= new Set());
    const isFirstSubscriber = subscribers.size === 0;
    subscribers.add(subscriber);

    if (isFirstSubscriber) {
      this.openActivitySubscription(internalDoc, docRef);
    }

    return () => {
      const currentDoc = this.documents.get(docRef.id);
      if (currentDoc?.activitySubscribers == null) {
        return;
      }
      currentDoc.activitySubscribers.delete(subscriber);
      if (currentDoc.activitySubscribers.size === 0) {
        this.closeActivitySubscription(currentDoc, docRef);
      }
    };
  }

  private openActivitySubscription(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    const expectedSubscribers = internalDoc.activitySubscribers;
    this.updateActivityStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.LOADING,
      live: DocumentLiveStatus.CONNECTING,
    });

    this.eventService
      .subscribeToActivityUpdates(
        docRef.id,
        getClientSupportedVersionRange(docRef.schema),
        foundryEvent => {
          const currentDoc = this.documents.get(docRef.id);
          if (
            expectedSubscribers == null
            || currentDoc?.activitySubscribers !== expectedSubscribers
          ) {
            return;
          }
          if (foundryEvent.type === "error") {
            this.updateActivityStatus(currentDoc, docRef, {
              error: toChannelError(foundryEvent),
              load: DocumentLoadStatus.ERROR,
              live: DocumentLiveStatus.ERROR,
            });
            return;
          }
          const localEvent = getActivityEvent(docRef.schema, foundryEvent);
          if (localEvent != null) {
            for (const subscriber of currentDoc.activitySubscribers) {
              subscriber.callback(localEvent);
            }
          }
        },
      )
      .then(subscriptionId => {
        const currentDoc = this.documents.get(docRef.id);
        if (
          expectedSubscribers == null
          || expectedSubscribers.size === 0
          || currentDoc?.activitySubscribers !== expectedSubscribers
        ) {
          this.eventService.unsubscribe(subscriptionId);
          return;
        }
        currentDoc.activitySubscriptionId = subscriptionId;
        this.updateActivityStatus(currentDoc, docRef, {
          load: DocumentLoadStatus.LOADED,
          live: DocumentLiveStatus.CONNECTED,
        });
      })
      .catch((e: unknown) => {
        this.logger.error("Failed to subscribe to activity updates", e, {
          docId: docRef.id,
        });
        const currentDoc = this.documents.get(docRef.id);
        if (
          expectedSubscribers == null
          || currentDoc?.activitySubscribers !== expectedSubscribers
        ) {
          return;
        }
        this.updateActivityStatus(currentDoc, docRef, {
          error: toUnknownChannelError(e),
          load: DocumentLoadStatus.ERROR,
          live: DocumentLiveStatus.ERROR,
        });
      });
  }

  private closeActivitySubscription(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (internalDoc.activitySubscriptionId != null) {
      this.eventService.unsubscribe(internalDoc.activitySubscriptionId);
      internalDoc.activitySubscriptionId = undefined;
    }
    internalDoc.activitySubscribers = undefined;
    this.updateActivityStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.UNLOADED,
      live: DocumentLiveStatus.DISCONNECTED,
    });
  }

  private refetchMetadata(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (this.documents.get(docRef.id) !== internalDoc) {
      return;
    }
    Documents.get(this.app.config.osdkClient, docRef.id, {
      preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
    })
      .then(document => {
        if (this.documents.get(docRef.id) !== internalDoc) {
          return;
        }
        const metadata = getLocalDocumentMetadata(document);

        this.updateMetadata(docRef.id, metadata);
      })
      .catch((e: unknown) => {
        if (this.documents.get(docRef.id) !== internalDoc) {
          return;
        }
        this.logger.error("Failed to refetch document metadata", e, {
          docId: docRef.id,
        });
      });
  }

  onPresence<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: PresenceEvent) => void,
    options?: PresenceSubscriptionOptions,
  ): Unsubscribe {
    const { internalDoc } = this.getCreateInternalDoc(docRef);
    const subscriber: PresenceSubscriber = {
      callback: event => callback(docRef, event),
      ignoreSelfUpdates: options?.ignoreSelfUpdates ?? true,
    };
    const subscribers = (internalDoc.presenceSubscribers ??= new Set());
    const isFirstSubscriber = subscribers.size === 0;
    subscribers.add(subscriber);

    if (isFirstSubscriber) {
      this.openPresenceSubscription(internalDoc, docRef);
    }

    return () => {
      const currentDoc = this.documents.get(docRef.id);
      if (currentDoc?.presenceSubscribers == null) {
        return;
      }
      currentDoc.presenceSubscribers.delete(subscriber);
      if (currentDoc.presenceSubscribers.size === 0) {
        this.closePresenceSubscription(currentDoc, docRef);
      }
    };
  }

  private openPresenceSubscription(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    const expectedSubscribers = internalDoc.presenceSubscribers;
    this.updatePresenceStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.LOADING,
      live: DocumentLiveStatus.CONNECTING,
    });

    this.eventService
      .subscribeToPresenceUpdates(
        docRef.id,
        getClientSupportedVersionRange(docRef.schema),
        foundryUpdate => {
          const currentDoc = this.documents.get(docRef.id);
          if (
            expectedSubscribers == null
            || currentDoc?.presenceSubscribers !== expectedSubscribers
          ) {
            return;
          }
          if (foundryUpdate.type === "error") {
            this.updatePresenceStatus(currentDoc, docRef, {
              error: toChannelError(foundryUpdate),
              load: DocumentLoadStatus.ERROR,
              live: DocumentLiveStatus.ERROR,
            });
            return;
          }
          const localEvent = getPresenceEvent(docRef.schema, foundryUpdate);
          if (localEvent != null) {
            const localUserId = getAuthModule(this.app).getCurrentUser(true)?.userId;
            const isSelfUpdate = localUserId != null && localEvent.userId === localUserId;
            for (const subscriber of currentDoc.presenceSubscribers) {
              if (!isSelfUpdate || !subscriber.ignoreSelfUpdates) {
                subscriber.callback(localEvent);
              }
            }
          }
        },
        { ignoreSelfUpdates: false },
      )
      .then(subscriptionId => {
        const currentDoc = this.documents.get(docRef.id);
        if (
          expectedSubscribers == null
          || expectedSubscribers.size === 0
          || currentDoc?.presenceSubscribers !== expectedSubscribers
        ) {
          this.eventService.unsubscribe(subscriptionId);
          return;
        }
        currentDoc.presenceSubscriptionId = subscriptionId;
        this.updatePresenceStatus(currentDoc, docRef, {
          load: DocumentLoadStatus.LOADED,
          live: DocumentLiveStatus.CONNECTED,
        });
      })
      .catch((e: unknown) => {
        this.logger.error("Failed to subscribe to presence updates", e, {
          docId: docRef.id,
        });
        const currentDoc = this.documents.get(docRef.id);
        if (
          expectedSubscribers == null
          || currentDoc?.presenceSubscribers !== expectedSubscribers
        ) {
          return;
        }
        this.updatePresenceStatus(currentDoc, docRef, {
          error: toUnknownChannelError(e),
          load: DocumentLoadStatus.ERROR,
          live: DocumentLiveStatus.ERROR,
        });
      });
  }

  private closePresenceSubscription(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (internalDoc.presenceSubscriptionId != null) {
      this.eventService.unsubscribe(internalDoc.presenceSubscriptionId);
      internalDoc.presenceSubscriptionId = undefined;
    }
    internalDoc.presenceSubscribers = undefined;
    this.updatePresenceStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.UNLOADED,
      live: DocumentLiveStatus.DISCONNECTED,
    });
  }

  updateCustomPresence<M extends Model>(
    docRef: DocumentRef,
    model: M,
    eventData: ModelData<M>,
    options?: PresencePublishOptions,
  ): void {
    const eventType = getMetadata(model).name;

    void this.eventService
      .publishCustomPresence(
        docRef.id,
        eventType,
        eventData,
        docRef.version,
        getClientSupportedVersionRange(docRef.schema),
        options,
      )
      .catch((e: unknown) => {
        this.logger.error("Failed to publish custom presence", e, {
          docId: docRef.id,
        });
      });
  }
}

function getClientSupportedVersionRange(schema: DocumentSchema): ClientSupportedVersionRange {
  const schemaMeta = getMetadata(schema);
  return {
    minVersion: schemaMeta.minSupportedVersion ?? schemaMeta.version,
    maxVersion: schemaMeta.version,
  };
}

function getWireSecurity({
  discretionary,
  mandatory,
}: DocumentSecurity = EMPTY_DOCUMENT_SECURITY): WireDocumentSecurity {
  const { editors = [], owners = [], viewers = [] } = discretionary;

  return {
    discretionary: {
      editors: editors.map(getWirePrincipal),
      owners: owners.map(getWirePrincipal),
      viewers: viewers.map(getWirePrincipal),
    },
    mandatory: {
      classification: mandatory.classification != null ? [...mandatory.classification] : [],
      markings: mandatory.markings != null ? [...mandatory.markings] : [],
    },
  };
}

function getWirePrincipal(
  principal: DiscretionaryPrincipal,
): WireDiscretionaryPrincipal {
  switch (principal.type) {
    case "all":
      return { type: "all" };
    case "groupId":
      return { type: "groupId", groupId: principal.groupId };
    case "userId":
      return { type: "userId", userId: principal.userId };
    default:
      assertNever(principal);
  }
}

function getLocalSecurity(wireSecurity: WireDocumentSecurity): DocumentSecurity {
  return {
    discretionary: {
      editors: wireSecurity.discretionary.editors.map(getLocalPrincipal),
      owners: wireSecurity.discretionary.owners.map(getLocalPrincipal),
      viewers: wireSecurity.discretionary.viewers.map(getLocalPrincipal),
    },
    mandatory: {
      classification: [...wireSecurity.mandatory.classification],
      markings: [...wireSecurity.mandatory.markings],
    },
  };
}

function getLocalPrincipal(
  wirePrincipal: WireDiscretionaryPrincipal,
): DiscretionaryPrincipal {
  switch (wirePrincipal.type) {
    case "all":
      return { type: "all" };
    case "groupId":
      return { type: "groupId", groupId: wirePrincipal.groupId };
    case "userId":
      return { type: "userId", userId: wirePrincipal.userId };
    default:
      assertNever(wirePrincipal);
  }
}

function getLocalDocumentMetadata(
  wireDocument: WireDocumentWithOperationalVersion,
): DocumentMetadata {
  return {
    createdBy: wireDocument.createdBy,
    createdTime: wireDocument.createdTime,
    description: wireDocument.description,
    documentTypeName: wireDocument.documentTypeName,
    name: wireDocument.name,
    operationalVersion: wireDocument.operationalVersion,
    operations: wireDocument.operations,
    ontologyRid: wireDocument.ontologyRid,
    security: getLocalSecurity(wireDocument.security),
    updatedBy: wireDocument.updatedBy,
    updatedTime: wireDocument.updatedTime,
  };
}

function getLocalDocumentType(wireDocumentType: WireDocumentType): DocumentType {
  return {
    rid: wireDocumentType.rid,
    name: wireDocumentType.name,
    operationalVersion: wireDocumentType.operationalVersion,
    fileSystemType: wireDocumentType.fileSystemType as FileSystemType | undefined,
    owningApplicationId: wireDocumentType.owningApplicationId,
  };
}
