/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
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

// PoC: the same Documents load/create calls FoundryDocumentService makes, but
// resolved against the LOCALLY GENERATED @osdk/foundry.pack (via tsconfig paths)
// instead of the published package.
import type {
  CreateDocumentRequest,
  Document,
  ListPublishedVersionsResponse,
  PublishedVersion,
  SchemaMinorVersion,
} from "@osdk/foundry.pack";
import { Documents, PublishedVersions } from "@osdk/foundry.pack";
// v2 flat-API modules, resolved via the "@osdk/<pkg>/v2/*" -> "<pkg>/src/v2/public/*.ts"
// path mappings recently added to tsconfig.paths.json.
import * as DocumentsV2 from "@osdk/foundry.pack/v2/Document";
import * as ProjectsV2 from "@osdk/foundry.filesystem/v2/Project";
import * as PublishedVersionsV2 from "@osdk/foundry.pack/v2/PublishedVersion";
import type { SharedClient } from "@osdk/shared.client2";

declare const osdkClient: SharedClient;

// LOAD — mirrors: Documents.get(this.app.config.osdkClient, docRef.id, { preview })
export function loadDocument(id: string): Promise<Document> {
  return Documents.get(osdkClient, id, { preview: true });
}

// CREATE — mirrors: Documents.create(this.app.config.osdkClient, request, { preview })
export function createDocument(
  request: CreateDocumentRequest,
): Promise<Document> {
  return Documents.create(osdkClient, request, { preview: true });
}

// --- Ahead-of-release surface -------------------------------------------------
// The following only exist in the api-gateway IR we regenerated from (1.1856.0),
// NOT in the published @osdk/foundry.pack (2.79.0): the entire `PublishedVersions`
// resource and the `SchemaMinorVersion` type / `documentSchemaMinorVersion` field.
// They type-check here purely because we compile the locally generated source.

// NEW resource + method — absent from the published package.
export function listPublishedVersions(
  documentId: string,
): Promise<ListPublishedVersionsResponse> {
  return PublishedVersions.list(osdkClient, documentId, { preview: true });
}

export function latestPublishedVersion(
  documentId: string,
): Promise<PublishedVersion> {
  return PublishedVersions.getLatest(osdkClient, documentId, { preview: true });
}

// NEW "minor version" field — `documentSchemaMinorVersion` is typed
// `SchemaMinorVersion`, neither of which exists on the published package.
export async function latestSchemaMinorVersion(
  documentId: string,
): Promise<SchemaMinorVersion> {
  const version = await PublishedVersions.getLatest(osdkClient, documentId, {
    preview: true,
  });
  return version.documentSchemaMinorVersion;
}

// --- Exercising the v2 subpaths -----------------------------------------------
// The v2 public modules export the flat per-resource functions; their request /
// response types ride on those signatures (there are no standalone type exports
// on these subpaths), so pulling types off them proves the "@osdk/<pkg>/v2/*"
// mappings resolve and type-check.
type DocumentV2 = Awaited<ReturnType<typeof DocumentsV2.get>>;
type PublishedVersionV2 = Awaited<ReturnType<typeof PublishedVersionsV2.getLatest>>;
type ProjectV2 = Awaited<ReturnType<typeof ProjectsV2.get>>;

// GET a document via the v2 flat API (cf. the v1 `Documents.get` above).
export function getDocumentV2(id: string): Promise<DocumentV2> {
  return DocumentsV2.get(osdkClient, id, { preview: true });
}

// GET the latest published version via the v2 flat API.
export function latestPublishedVersionV2(
  documentId: string,
): Promise<PublishedVersionV2> {
  return PublishedVersionsV2.getLatest(osdkClient, documentId, {
    preview: true,
  });
}

// Cross-package v2 path: resolve a Project from the filesystem v2 subpath.
export function getProjectV2(projectRid: string): Promise<ProjectV2> {
  return ProjectsV2.get(osdkClient, projectRid);
}
