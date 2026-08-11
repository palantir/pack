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

import type { DocumentSecurity } from "@palantir/pack.document-schema.model-types";

export type CreateDocumentParent =
  | {
    readonly type: "parentFolder";
    readonly folderRid: string;
  }
  | {
    readonly type: "namespace";
    readonly namespaceRid: string;
  };

interface CreateDocumentMetadataBase {
  readonly name: string;
  readonly documentTypeName: string;
  readonly security?: DocumentSecurity;
}

export type CreateDocumentMetadata =
  & CreateDocumentMetadataBase
  & (
    | {
      readonly parent?: never;
      readonly parentFolderRid?: string;
      /**
       * Ontology to create the document in. When omitted, the app's default ontology is used.
       */
      readonly ontologyRid?: string;
    }
    | {
      /**
       * Parent used by the V2 create endpoint. The parent type must match the document type's file
       * system: `parentFolder` for Compass or `namespace` for Artifacts.
       */
      readonly parent: CreateDocumentParent;
      readonly parentFolderRid?: never;
      readonly ontologyRid?: never;
    }
  );

export const FileSystemType = {
  ARTIFACTS: "ARTIFACTS",
  COMPASS: "COMPASS",
} as const;
export type FileSystemType = typeof FileSystemType[keyof typeof FileSystemType];
