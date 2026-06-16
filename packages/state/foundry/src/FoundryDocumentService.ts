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
import { getMetadata } from "@palantir/pack.document-schema.model-types";
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
  DocumentLoadStatus,
} from "@palantir/pack.state.core";
import type { FoundryEventService, SyncSession } from "@palantir/pack.state.foundry-event";
import { createFoundryEventService } from "@palantir/pack.state.foundry-event";
import { getActivityEvent, getPresenceEvent } from "./eventMappers.js";

const DEFAULT_USE_PREVIEW_API = true;
const EMPTY_DOCUMENT_SECURITY: DocumentSecurity = Object.freeze({
  discretionary: {},
  mandatory: {},
});

interface FoundryDocumentServiceConfig {
  readonly usePreviewApi?: boolean;
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
  metadataUpdateUnsubscribed?: boolean;
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
    },
  ): Promise<SearchDocumentsResult> => {
    const request: SearchDocumentsRequest = {
      documentTypeName,
      requestBody: {
        query: options?.documentName != null ? { documentName: options.documentName } : undefined,
        pageSize: options?.pageSize,
        pageToken: options?.pageToken,
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

  protected onMetadataSubscriptionOpened(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (internalDoc.metadataStatus.load !== DocumentLoadStatus.UNLOADED) {
      throw new Error(
        `Cannot subscribe to document metadata when status is ${internalDoc.metadataStatus.load}`,
      );
    }

    this.updateMetadataStatus(internalDoc, docRef, {
      load: DocumentLoadStatus.LOADING,
    });

    Documents.get(this.app.config.osdkClient, docRef.id, {
      preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
    })
      .then(document => {
        if (!this.documents.has(docRef.id)) {
          return;
        }
        const metadata = getLocalDocumentMetadata(document);

        internalDoc.metadata = metadata;
        this.notifyMetadataSubscribers(internalDoc, docRef, metadata);
        this.updateMetadataStatus(internalDoc, docRef, {
          load: DocumentLoadStatus.LOADED,
        });

        // The metadata channel is for document metadata edits/deletion. Name
        // and description changes arrive as generic updates; operationalVersion
        // only refreshes here if it changed by the time this Document is loaded again.
        this.eventService
          .subscribeToMetadataUpdates(docRef.id, _event => {
            if (!internalDoc.metadataUpdateUnsubscribed) {
              this.refetchMetadata(docRef);
            }
          })
          .catch((e: unknown) => {
            this.logger.error("Failed to subscribe to metadata updates", e, {
              docId: docRef.id,
            });
          });
      })
      .catch((e: unknown) => {
        if (!this.documents.has(docRef.id)) {
          return;
        }
        const error = new Error("Failed to load document metadata", {
          cause: e,
        });
        this.updateMetadataStatus(internalDoc, docRef, {
          error,
          load: DocumentLoadStatus.ERROR,
        });
      });
  }

  protected onDataSubscriptionOpened(
    internalDoc: FoundryInternalDoc,
    docRef: DocumentRef,
  ): void {
    if (internalDoc.syncSession != null) {
      throw new Error("Document data subscription already opened");
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
  }

  protected onMetadataSubscriptionClosed(
    internalDoc: FoundryInternalDoc,
    _docRef: DocumentRef,
  ): void {
    internalDoc.metadataUpdateUnsubscribed = true;
  }

  protected onDataSubscriptionClosed(
    internalDoc: FoundryInternalDoc,
    _docRef: DocumentRef,
  ): void {
    if (internalDoc.syncSession) {
      this.eventService.stopDocumentSync(internalDoc.syncSession);
      internalDoc.syncSession = undefined;
    }
  }

  onActivity<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: ActivityEvent) => void,
  ): Unsubscribe {
    let unsubscribed = false;
    const unsubscribeFn = () => {
      unsubscribed = true;
    };

    this.eventService
      .subscribeToActivityUpdates(
        docRef.id,
        getClientSupportedVersionRange(docRef.schema),
        foundryEvent => {
          if (!unsubscribed) {
            const localEvent = getActivityEvent(docRef.schema, foundryEvent);
            if (localEvent != null) {
              callback(docRef, localEvent);
            }
          }
        },
      )
      .catch((e: unknown) => {
        this.logger.error("Failed to subscribe to activity updates", e, {
          docId: docRef.id,
        });
      });

    return unsubscribeFn;
  }

  private refetchMetadata(docRef: DocumentRef): void {
    if (!this.documents.has(docRef.id)) {
      return;
    }
    Documents.get(this.app.config.osdkClient, docRef.id, {
      preview: this.config.usePreviewApi ?? DEFAULT_USE_PREVIEW_API,
    })
      .then(document => {
        if (!this.documents.has(docRef.id)) {
          return;
        }
        const metadata = getLocalDocumentMetadata(document);

        this.updateMetadata(docRef.id, metadata);
      })
      .catch((e: unknown) => {
        if (!this.documents.has(docRef.id)) {
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
    let unsubscribed = false;
    const unsubscribeFn = () => {
      unsubscribed = true;
    };

    this.eventService
      .subscribeToPresenceUpdates(
        docRef.id,
        getClientSupportedVersionRange(docRef.schema),
        foundryUpdate => {
          if (!unsubscribed) {
            const localEvent = getPresenceEvent(docRef.schema, foundryUpdate);
            callback(docRef, localEvent);
          }
        },
        options,
      )
      .catch((e: unknown) => {
        this.logger.error("Failed to subscribe to presence updates", e, {
          docId: docRef.id,
        });
      });

    return unsubscribeFn;
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
  };
}
