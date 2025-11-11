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

export const Metadata: symbol = Symbol("@palantir/pack.document-schema/metadata");

export interface WithMetadata<T> {
  readonly [Metadata]: T;
}

export function getMetadata<T>(obj: WithMetadata<T>): T {
  // First try the direct symbol access
  const directMetadata = obj[Metadata];
  if (directMetadata != null) {
    return directMetadata;
  }

  // Fallback: search for a symbol with matching string representation
  // If the different copies of this package are used, the symbol references will not match directly
  const metadataString = Metadata.toString();
  const symbolKeys = Object.getOwnPropertySymbols(obj);

  for (const symbolKey of symbolKeys) {
    if (symbolKey.toString() === metadataString) {
      const fallbackMetadata = (obj as any)[symbolKey];
      if (fallbackMetadata != null) {
        return fallbackMetadata;
      }
    }
  }

  throw new Error("Object does not have metadata");
}
