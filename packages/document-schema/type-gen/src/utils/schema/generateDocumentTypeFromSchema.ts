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

import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import type { ResolvedIrChain } from "./resolveSchemaChain.js";

/**
 * Generate documentType.ts: runtime constants for the document type's user-facing
 * identity, sourced from the IR's top-level `name` and `description`.
 *
 * Output:
 * ```
 * export const DOCUMENT_TYPE_NAME = "Canvas Document";
 * export const DOCUMENT_TYPE_DESCRIPTION = "Schema for the Demo Canvas Application";
 * ```
 *
 * Identity is read off the latest chain entry's IR — it is the same string on
 * every entry (populated by `resolveSchemaChain` from pack-config), so the
 * choice of entry is incidental.
 */
export function generateDocumentTypeFromChain(resolved: ResolvedIrChain): string {
  const latestIr = resolved.chain[resolved.chain.length - 1]!.ir;

  let output = GENERATED_FILE_HEADER;
  output += `export const DOCUMENT_TYPE_NAME = ${JSON.stringify(latestIr.name)};\n`;
  output += `export const DOCUMENT_TYPE_DESCRIPTION = ${JSON.stringify(latestIr.description)};\n`;
  return output;
}
