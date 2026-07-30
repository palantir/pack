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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Settings a live-stack integration run needs. Absent when the repo has no `.env.local`, which is
 * the normal case: integration tests skip rather than fail so a checkout without stack credentials
 * still passes.
 */
export interface FoundryTestEnv {
  readonly baseUrl: string;
  readonly documentTypeName: string;
  readonly ontologyRid: string;
  readonly parentFolderRid: string | undefined;
  readonly token: string;
}

/**
 * Reads `.env.local` from the repo root. Written by hand rather than pulled from a dotenv
 * dependency: this is the only consumer, and the file is a flat `KEY=value` list.
 *
 * The `VITE_` prefix is kept because the same file drives the browser harness these tests were
 * derived from, so one file serves both.
 */
export function getFoundryTestEnv(): FoundryTestEnv | undefined {
  const values = { ...readEnvFile(), ...process.env };

  const baseUrl = values.VITE_FOUNDRY_API_URL;
  const documentTypeName = values.VITE_PACK_DOCUMENT_TYPE_NAME;
  const ontologyRid = values.VITE_FOUNDRY_ONTOLOGY_RID;
  const token = values.VITE_DEV_FOUNDRY_TOKEN;

  if (!baseUrl || !documentTypeName || !ontologyRid || !token) {
    return undefined;
  }

  return {
    baseUrl,
    documentTypeName,
    ontologyRid,
    parentFolderRid: values.VITE_PACK_PARENT_FOLDER_RID || undefined,
    token,
  };
}

function readEnvFile(): Record<string, string> {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

  let contents: string;
  try {
    contents = readFileSync(join(repoRoot, ".env.local"), "utf8");
  } catch {
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1).replace(/^["']|["']$/g, "");
  }
  return values;
}
