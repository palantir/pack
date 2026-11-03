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

/**
 * How a `ResourceIdentifierRef` value is stored. Apps read and write the ref string; the stored
 * object says it is a ref and of what kind, so peering can find and translate it from the Yjs
 * update alone.
 */
export interface StoredPackRef {
  readonly __packRef: 1;
  readonly __type: "resourceRef";
  readonly __ref: string;
}

export function toStoredPackRef(refType: StoredPackRef["__type"], id: string): StoredPackRef {
  return { __packRef: 1, __type: refType, __ref: id };
}

export function isStoredPackRef(value: unknown): value is StoredPackRef {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.__packRef === "number"
    && typeof candidate.__type === "string"
    && typeof candidate.__ref === "string";
}
