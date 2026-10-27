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

import { CommanderError } from "commander";
import type { IRealTimeDocumentSchema } from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { assertSdkNamesUnique } from "../../utils/schema/assertSdkNamesUnique.js";
import {
  getEntryMinorVersion,
  type IrChainPayload,
  resolveMinVersion,
} from "../../utils/schema/resolveSchemaChain.js";

export interface ResolvedIrInput {
  readonly ir: IRealTimeDocumentSchema;
  readonly latestVersion: number;
  /** The minor version within `latestVersion`. 0 for a .0 version. */
  readonly latestMinorVersion: number;
  readonly minSupportedVersion: number;
  readonly owningApplicationId?: string;
}

function isChainPayload(parsed: unknown): parsed is IrChainPayload {
  return (
    typeof parsed === "object"
    && parsed != null
    && "chain" in parsed
    && Array.isArray((parsed as IrChainPayload).chain)
    && typeof (parsed as IrChainPayload).latestVersion === "number"
  );
}

function resolveFromChain(payload: IrChainPayload, irPath: string): ResolvedIrInput {
  if (payload.chain.length === 0) {
    throw new CommanderError(
      1,
      "EINVAL",
      `Invalid IR chain payload at ${irPath}: 'chain' is empty`,
    );
  }
  const { latestVersion, minVersion } = resolveMinVersion(
    payload.chain,
    payload.minSupportedVersion,
  );
  // The last entry is the latest version. Several entries can share a major (e.g. 2.0 and 2.1).
  const latestEntry = payload.chain[payload.chain.length - 1]!;
  assertSdkNamesUnique(payload.chain, payload.minSupportedVersion);
  return {
    ir: latestEntry.ir,
    latestVersion,
    latestMinorVersion: getEntryMinorVersion(latestEntry),
    minSupportedVersion: minVersion,
    owningApplicationId: payload.owningApplicationId,
  };
}

function resolveFromSingleIr(ir: IRealTimeDocumentSchema): ResolvedIrInput {
  return { ir, latestVersion: ir.version, latestMinorVersion: 0, minSupportedVersion: ir.version };
}

export function resolveIrInput(parsed: unknown, irPath: string): ResolvedIrInput {
  return isChainPayload(parsed)
    ? resolveFromChain(parsed, irPath)
    : resolveFromSingleIr(parsed as IRealTimeDocumentSchema);
}
