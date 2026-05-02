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

import { asVersioned, DocumentModel } from "@demo/canvas.sdk";
import type { SupportedVersions, VersionedDocRef } from "@demo/canvas.sdk";
import type { PackApp } from "@palantir/pack.core";
import type { DocumentId } from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { useDocRef } from "@palantir/pack.state.react";

/**
 * Shared key prefix with DemoDocumentService for synchronous schema version
 * reads. The demo service reads from localStorage to get the version before
 * IndexedDB metadata loads; the app writes to localStorage when a ?schema
 * override is applied.
 */
const SCHEMA_VERSION_KEY_PREFIX = "pack-demo-schema-version:";

function getPersistedSchemaVersion(docId: string): number | undefined {
  try {
    const stored = localStorage.getItem(SCHEMA_VERSION_KEY_PREFIX + docId);
    return stored != null ? parseInt(stored, 10) : undefined;
  } catch {
    return undefined;
  }
}

function persistSchemaVersion(docId: string, version: number): void {
  try {
    localStorage.setItem(SCHEMA_VERSION_KEY_PREFIX + docId, String(version));
  } catch {
    // localStorage may be unavailable
  }
}

export interface UseCanvasDocRefResult {
  readonly doc: VersionedDocRef;
  /** The document's persisted version (without ?schema override). */
  readonly persistedVersion: number;
}

export function useCanvasDocRef(
  app: WithStateModule<PackApp>,
  canvasId: DocumentId | undefined,
  versionOverride?: SupportedVersions,
): UseCanvasDocRefResult {
  const docRef = useDocRef(app, DocumentModel, canvasId);

  // Read the persisted version (from localStorage, synchronous).
  const persistedVersion = (canvasId != null ? getPersistedSchemaVersion(canvasId) : undefined)
    ?? docRef.version;

  // Apply the override: only upgrades, never downgrades.
  if (versionOverride != null && canvasId != null && versionOverride >= persistedVersion) {
    persistSchemaVersion(canvasId, versionOverride);
  }

  return { doc: asVersioned(docRef), persistedVersion };
}
