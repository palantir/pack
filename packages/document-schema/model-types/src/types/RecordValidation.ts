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

import type { RecordId } from "./RecordRef.js";

/**
 * A single schema-validation failure within a record snapshot.
 */
export interface RecordValidationIssue {
  /** Path of the failing field within the record (empty for record-level issues). */
  readonly path: ReadonlyArray<string | number>;
  /** Human-readable description of the failure. */
  readonly message: string;
}

/**
 * Describes why a record's stored data failed schema validation against its
 * model.
 *
 * Delivered to {@link RecordRef.onInvalid} subscribers and queryable per
 * document via `getInvalidRecords`. A record can become invalid when the
 * document's persisted state does not match what the model's schema promises
 * (for example, after a partial write left the document corrupted).
 */
export interface RecordValidationError {
  /** Name of the model the record was expected to conform to. */
  readonly modelName: string;
  /** Id of the failing record. */
  readonly recordId: RecordId;
  /** Individual field-level failures. */
  readonly issues: readonly RecordValidationIssue[];
  /** Summary message suitable for logging. */
  readonly message: string;
}

/**
 * Error used to reject promise-based snapshot reads (e.g.
 * {@link RecordRef.getSnapshot}) when the record exists but its data fails
 * schema validation.
 */
export class RecordInvalidError extends Error {
  readonly validation: RecordValidationError;

  constructor(validation: RecordValidationError) {
    super(validation.message);
    this.name = "RecordInvalidError";
    this.validation = validation;
  }
}
