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

export type {
  DiscretionaryPrincipal,
  DiscretionaryPrincipal_All,
  DiscretionaryPrincipal_GroupId,
  DiscretionaryPrincipal_UserId,
  DocumentMetadata,
} from "./types/DocumentMetadata.js";
export { DocumentRefBrand } from "./types/DocumentRef.js";
export type { DocumentId, DocumentRef } from "./types/DocumentRef.js";
export type {
  DocumentSchema,
  DocumentSchemaMetadata,
  DocumentState,
} from "./types/DocumentSchema.js";
export { MediaRefBrand } from "./types/MediaRef.js";
export type { MediaId, MediaRef } from "./types/MediaRef.js";
export { getMetadata, Metadata } from "./types/Metadata.js";
export type { WithMetadata } from "./types/Metadata.js";
export { ExternalRefType } from "./types/Model.js";
export type { EditDescription, Model, ModelData, ModelMetadata } from "./types/Model.js";
export { ObjectRefBrand } from "./types/ObjectRef.js";
export type { ObjectId, ObjectRef } from "./types/ObjectRef.js";
export { RecordCollectionRefBrand } from "./types/RecordCollectionRef.js";
export type { RecordCollectionRef } from "./types/RecordCollectionRef.js";
export { RecordRefBrand } from "./types/RecordRef.js";
export type { RecordId, RecordRef } from "./types/RecordRef.js";
export type { Unsubscribe } from "./types/Unsubscribe.js";
export { UserRefBrand } from "./types/UserRef.js";
export type { UserId, UserRef } from "./types/UserRef.js";
