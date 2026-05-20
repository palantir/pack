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

import type { Flavored } from "@palantir/pack.core";
import type { DocumentRef } from "./DocumentRef.js";
import type { Model, ModelData } from "./Model.js";
import type { Unsubscribe } from "./Unsubscribe.js";

export type RecordId = Flavored<"RecordId">;

export const RecordRefBrand: unique symbol = Symbol("pack:RecordRef");

/**
 * A reference providing an API to interact with a specific record in a
 * document. This is the main interface for accessing and updating individual
 * records.
 *
 * These will be created by docRef or recordCollectionRef APIs for example and
 * should not be created manually. RecordRefs are stable objects that can be
 * used for reference equality checks.
 *
 * @example
 * ```ts
 * import { DocumentRef, DocumentSchema, MyModel } from "@myapp/schema";
 * import { app } from "./appInstance";
 *
 * const docRef = app.getDocRef<DocumentSchema>(someDocumentId);
 *
 * // Create a record via the version-narrowed setCollectionRecord on DocumentRef.
 * await docRef.setCollectionRecord(MyModel, "my-record-id", { myFieldName: "some value", foo: 42 });
 *
 * // Then get the ref back.
 * const recordRef = docRef.getRecords(MyModel).get("my-record-id");
 */
export interface RecordRef<M extends Model = Model> {
  readonly docRef: DocumentRef;
  readonly id: RecordId;
  readonly model: M;
  readonly [RecordRefBrand]: typeof RecordRefBrand;

  /**
   * Get the current state of the record in a plain object.
   * If there is an active subscription to the document this is the current state of the record in memory.
   * Otherwise, this will fetch the latest state from the server.
   */
  getSnapshot(): Promise<ModelData<M>>;

  /**
   * Subscribe to changes in the record.
   * @param callback The callback to invoke when the record changes.
   * @returns An unsubscribe function.
   *
   * @example
   * ```ts
   * // Subscribe to changes
   * recordRef.onChange((newSnapshot, recordRef) => {
   *   console.log("Record changed:", newSnapshot);
   * });
   *
   * // Submit a change via the version-narrowed updateRecord on DocumentRef.
   * await docRef.updateRecord(recordRef, { myFieldName: "new value" });
   * ```
   */
  onChange(callback: (snapshot: ModelData<M>, recordRef: RecordRef<M>) => void): Unsubscribe;

  /**
   * Subscribe to deletion of the record.
   * @param callback The callback to invoke when the record is deleted.
   * @returns An unsubscribe function.
   *
   * @example
   * ```ts
   * // Subscribe to deletion
   * recordRef.onDeleted((recordRef) => {
   *   console.log("Record deleted:", recordRef.id);
   * });
   *
   * // Trigger the deletion
   * recordRef.delete();
   * ```
   */
  onDeleted(callback: (recordRef: RecordRef<M>) => void): Unsubscribe;

  /**
   * Delete the record from the document.
   *
   * Version-agnostic: deletion needs only the record's identity, not its
   * payload shape, so this is safe to call without narrowing to a version.
   *
   * @returns An ignorable promise that resolves when the record is deleted.
   *
   * @example
   * ```ts
   * await recordRef.delete();
   * ```
   */
  delete(): Promise<void>;
}
