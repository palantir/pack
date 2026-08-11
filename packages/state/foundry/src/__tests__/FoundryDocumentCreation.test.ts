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

import type { Document } from "@osdk/foundry.pack";
import { Documents } from "@osdk/foundry.pack";
import type { PackAppInternal } from "@palantir/pack.core";
import type { DocumentSchema } from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import type { CreateDocumentMetadata } from "@palantir/pack.state.core";
import type { FoundryEventService } from "@palantir/pack.state.foundry-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { internalCreateFoundryDocumentService } from "../FoundryDocumentService.js";

vi.mock("@osdk/foundry.pack", () => ({
  Documents: {
    create: vi.fn(),
    createV2: vi.fn(),
  },
}));

const mockLogger = {
  child: vi.fn(),
  debug: vi.fn((..._args: unknown[]) => {}),
  error: vi.fn((..._args: unknown[]) => {}),
  info: vi.fn((..._args: unknown[]) => {}),
  warn: vi.fn((..._args: unknown[]) => {}),
};
mockLogger.child.mockReturnValue(mockLogger);

const mockOsdkClient = {};
const mockApp = {
  getModule: vi.fn().mockReturnValue({}),
  config: {
    logger: mockLogger,
    ontologyRid: "ri.ontology..default",
    osdkClient: mockOsdkClient,
  },
} as unknown as PackAppInternal;

const testSchema = {
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema;

const document = { id: "ri.pack.document..test" } as Document;
const wireSecurity = {
  discretionary: {
    editors: [],
    owners: [],
    viewers: [],
  },
  mandatory: {
    classification: [],
    markings: [],
  },
};

const mixedCreateMetadata = {
  documentTypeName: "com.palantir.pack.test",
  name: "Invalid document",
  ontologyRid: "ri.ontology..legacy",
  parent: {
    type: "namespace",
    namespaceRid: "ri.artifacts.main.namespace.test",
  },
} as unknown as CreateDocumentMetadata;

const malformedParentMetadata = {
  documentTypeName: "com.palantir.pack.test",
  name: "Invalid document",
  parent: {
    type: "namespace",
    folderRid: "ri.compass.main.folder.test",
  },
} as unknown as CreateDocumentMetadata;

describe("FoundryDocumentService document creation", () => {
  beforeEach(() => {
    vi.mocked(Documents.create).mockReset().mockResolvedValue(document);
    vi.mocked(Documents.createV2).mockReset().mockResolvedValue(document);
    mockLogger.warn.mockClear();
  });

  it("keeps existing createDocument calls on the legacy endpoint", async () => {
    const service = internalCreateFoundryDocumentService(mockApp, {}, mock<FoundryEventService>());

    await service.createDocument(
      {
        documentTypeName: "com.palantir.pack.test",
        name: "Legacy document",
        parentFolderRid: "ri.compass.main.folder.legacy",
      },
      testSchema,
    );

    expect(Documents.create).toHaveBeenCalledWith(
      mockOsdkClient,
      {
        documentTypeName: "com.palantir.pack.test",
        name: "Legacy document",
        ontologyRid: "ri.ontology..default",
        parentFolderRid: "ri.compass.main.folder.legacy",
        security: wireSecurity,
      },
      { preview: true },
    );
    expect(Documents.createV2).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "The legacy document create endpoint is deprecated; provide CreateDocumentMetadata.parent to use createV2",
    );
  });

  it("uses createV2 when a namespace parent is provided", async () => {
    const service = internalCreateFoundryDocumentService(mockApp, {}, mock<FoundryEventService>());

    await service.createDocument(
      {
        documentTypeName: "com.palantir.pack.test",
        name: "V2 document",
        parent: {
          type: "namespace",
          namespaceRid: "ri.artifacts.main.namespace.test",
        },
      },
      testSchema,
    );

    expect(Documents.createV2).toHaveBeenCalledWith(
      mockOsdkClient,
      {
        requestBody: {
          documentTypeName: "com.palantir.pack.test",
          name: "V2 document",
          parent: {
            type: "namespace",
            namespaceRid: "ri.artifacts.main.namespace.test",
          },
          security: wireSecurity,
        },
      },
      { preview: true },
    );
    expect(Documents.create).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("supports folder parents on createV2", async () => {
    const service = internalCreateFoundryDocumentService(mockApp, {}, mock<FoundryEventService>());

    await service.createDocument(
      {
        documentTypeName: "com.palantir.pack.test",
        name: "V2 document",
        parent: {
          type: "parentFolder",
          folderRid: "ri.compass.main.folder.test",
        },
      },
      testSchema,
    );

    expect(Documents.createV2).toHaveBeenCalledWith(
      mockOsdkClient,
      {
        requestBody: {
          documentTypeName: "com.palantir.pack.test",
          name: "V2 document",
          parent: {
            type: "parentFolder",
            folderRid: "ri.compass.main.folder.test",
          },
          security: wireSecurity,
        },
      },
      { preview: true },
    );
    expect(Documents.create).not.toHaveBeenCalled();
  });

  it("rejects metadata that mixes legacy and V2 routing", async () => {
    const service = internalCreateFoundryDocumentService(mockApp, {}, mock<FoundryEventService>());

    await expect(service.createDocument(mixedCreateMetadata, testSchema)).rejects.toThrow(
      "CreateDocumentMetadata cannot combine parent with parentFolderRid or ontologyRid",
    );
    expect(Documents.create).not.toHaveBeenCalled();
    expect(Documents.createV2).not.toHaveBeenCalled();
  });

  it("rejects malformed V2 parent variants", async () => {
    const service = internalCreateFoundryDocumentService(mockApp, {}, mock<FoundryEventService>());

    await expect(service.createDocument(malformedParentMetadata, testSchema)).rejects.toThrow(
      "Invalid CreateDocumentMetadata.parent",
    );
    expect(Documents.create).not.toHaveBeenCalled();
    expect(Documents.createV2).not.toHaveBeenCalled();
  });
});
