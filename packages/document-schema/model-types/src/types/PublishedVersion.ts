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

import type { Flavored } from "@palantir/pack.core";
import type { DocumentRef } from "./DocumentRef.js";
import type { DocumentSchema } from "./DocumentSchema.js";

/**
 * Server-generated identifier for a published Document version. Treat it as opaque and return it
 * unchanged; never parse or synthesize one.
 */
export type PublishedVersionRef = Flavored<"PublishedVersionRef">;

/**
 * An immutable published version of a PACK Document: a named, frozen snapshot of the document's
 * persisted state.
 */
export interface PublishedVersion {
  readonly ref: PublishedVersionRef;
  readonly name?: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly createdBy?: string;
}

/**
 * A read-only {@link DocumentRef} pinned to one published version. Records, collections, and hooks
 * read its frozen snapshot the same way they read the live draft. Writes are rejected, and presence
 * and activity are no-ops. It never syncs, so its live status is always disconnected. Its data
 * starts loaded, is marked unloaded when the last subscriber leaves, and is marked loaded again on
 * the next subscribe. Metadata and `version` come from the live draft, so `version` is the live
 * draft's operational schema version, not the schema version the snapshot was saved with. It has
 * the same `id` as the live draft, so use `publishedVersion.ref` to tell them apart, and keep this
 * ref: `app.state.createDocRef(id, schema)` returns the live draft.
 */
export interface PublishedVersionDocumentRef<D extends DocumentSchema = DocumentSchema>
  extends DocumentRef<D>
{
  readonly publishedVersion: PublishedVersion;
}
