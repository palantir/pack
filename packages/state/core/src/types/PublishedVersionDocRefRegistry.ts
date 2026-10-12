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

import type {
  DocumentRef,
  DocumentSchema,
  PublishedVersionDocumentRef,
} from "@palantir/pack.document-schema.model-types";
import type { DocumentService } from "./DocumentService.js";

// Which read-only service holds each published version doc ref's snapshot. It's keyed by the ref
// object, because a published version doc ref has the same id as its live draft. Ref creation
// writes to it and app.state reads it, so it lives in its own module that imports nothing at
// runtime.
const publishedVersionDocumentServices = new WeakMap<DocumentRef, DocumentService>();

/** Registers a new published version doc ref's read-only service, so app.state routes to it. */
export function registerPublishedVersionDocRef(
  docRef: PublishedVersionDocumentRef,
  documentService: DocumentService,
): void {
  publishedVersionDocumentServices.set(docRef, documentService);
}

/** Returns a published version doc ref's read-only service, or undefined for any other ref. */
export function getPublishedVersionDocumentService(
  docRef: DocumentRef,
): DocumentService | undefined {
  return publishedVersionDocumentServices.get(docRef);
}

/**
 * Check if a document reference is pinned to a published version. Published version doc refs are
 * read-only, so apps can use this to hide editing UI.
 */
export function isPublishedVersionDocRef<D extends DocumentSchema = DocumentSchema>(
  docRef: DocumentRef<D>,
): docRef is PublishedVersionDocumentRef<D> {
  return publishedVersionDocumentServices.has(docRef);
}
