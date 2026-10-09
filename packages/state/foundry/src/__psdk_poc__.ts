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
import type { CreateDocumentRequest, Document } from "@osdk/foundry.pack";
import { Documents } from "@osdk/foundry.pack";
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
