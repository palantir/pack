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

import type { DocumentType as WireDocumentType } from "@osdk/foundry.pack";
import { Documents, DocumentTypes } from "@osdk/foundry.pack";
import type { PackAppInternal } from "@palantir/pack.core";
import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import type { FoundryEventService } from "@palantir/pack.state.foundry-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import type { FoundryDocumentService } from "../FoundryDocumentService.js";
import { internalCreateFoundryDocumentService } from "../FoundryDocumentService.js";

vi.mock("@osdk/foundry.pack", () => ({
  DocumentTypes: {
    get: vi.fn(),
    loadByName: vi.fn(),
    getOperationalVersion: vi.fn(),
  },
  Documents: {
    resolveApplication: vi.fn(),
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
const DEFAULT_ONTOLOGY_RID = "ri.ontology..default-ontology-rid";

const mockApp = {
  getModule: vi.fn(),
  config: {
    logger: mockLogger,
    osdkClient: mockOsdkClient,
    ontologyRid: DEFAULT_ONTOLOGY_RID,
  },
} as unknown as PackAppInternal;

const WIRE_DOCUMENT_TYPE: WireDocumentType = {
  rid: "ri.pack..document-type.test-rid",
  name: "com.palantir.pack.test.doctype",
  operationalVersion: 3,
  fileSystemType: "COMPASS",
  owningApplicationId: "ri.workspace..application.test-app",
};

describe("FoundryDocumentService document type loading", () => {
  let mockEventService: MockProxy<FoundryEventService>;
  let service: FoundryDocumentService;

  beforeEach(() => {
    mockEventService = mock();
    service = internalCreateFoundryDocumentService(mockApp, {}, mockEventService);
  });

  afterEach(() => {
    vi.mocked(DocumentTypes.get).mockReset();
    vi.mocked(DocumentTypes.loadByName).mockReset();
    vi.mocked(DocumentTypes.getOperationalVersion).mockReset();
    vi.mocked(Documents.resolveApplication).mockReset();
  });

  describe("loadDocumentTypeByName", () => {
    it("calls loadByName with the provided ontologyRid and maps the wire result", async () => {
      vi.mocked(DocumentTypes.loadByName).mockResolvedValue(WIRE_DOCUMENT_TYPE);

      const result = await service.loadDocumentTypeByName(
        "com.palantir.pack.test.doctype",
        "ri.ontology..explicit-rid",
      );

      expect(DocumentTypes.loadByName).toHaveBeenCalledWith(
        mockOsdkClient,
        {
          documentTypeName: "com.palantir.pack.test.doctype",
          ontologyRid: "ri.ontology..explicit-rid",
        },
        { preview: true },
      );
      expect(result).toEqual({
        rid: "ri.pack..document-type.test-rid",
        name: "com.palantir.pack.test.doctype",
        operationalVersion: 3,
        fileSystemType: "COMPASS",
        owningApplicationId: "ri.workspace..application.test-app",
      });
    });

    it("defaults the ontologyRid to the app's bound ontology when not provided", async () => {
      vi.mocked(DocumentTypes.loadByName).mockResolvedValue(WIRE_DOCUMENT_TYPE);

      await service.loadDocumentTypeByName("com.palantir.pack.test.doctype");

      expect(DocumentTypes.loadByName).toHaveBeenCalledWith(
        mockOsdkClient,
        {
          documentTypeName: "com.palantir.pack.test.doctype",
          ontologyRid: DEFAULT_ONTOLOGY_RID,
        },
        { preview: true },
      );
    });
  });

  describe("getDocumentType", () => {
    it("calls get with the rid and maps the wire result", async () => {
      vi.mocked(DocumentTypes.get).mockResolvedValue(WIRE_DOCUMENT_TYPE);

      const result = await service.getDocumentType("ri.pack..document-type.test-rid");

      expect(DocumentTypes.get).toHaveBeenCalledWith(
        mockOsdkClient,
        "ri.pack..document-type.test-rid",
        { preview: true },
      );
      expect(result).toEqual({
        rid: "ri.pack..document-type.test-rid",
        name: "com.palantir.pack.test.doctype",
        operationalVersion: 3,
        fileSystemType: "COMPASS",
        owningApplicationId: "ri.workspace..application.test-app",
      });
    });

    it("maps optional fields as undefined when absent", async () => {
      vi.mocked(DocumentTypes.get).mockResolvedValue({
        rid: "ri.pack..document-type.minimal",
        name: "minimal",
      } as WireDocumentType);

      const result = await service.getDocumentType("ri.pack..document-type.minimal");

      expect(result).toEqual({
        rid: "ri.pack..document-type.minimal",
        name: "minimal",
        operationalVersion: undefined,
        fileSystemType: undefined,
        owningApplicationId: undefined,
      });
    });
  });

  describe("getDocumentTypeOperationalVersion", () => {
    it("returns the operational version and defaults the ontologyRid", async () => {
      vi.mocked(DocumentTypes.getOperationalVersion).mockResolvedValue({
        operationalVersion: 5,
      });

      const result = await service.getDocumentTypeOperationalVersion(
        "com.palantir.pack.test.doctype",
      );

      expect(DocumentTypes.getOperationalVersion).toHaveBeenCalledWith(
        mockOsdkClient,
        {
          documentTypeName: "com.palantir.pack.test.doctype",
          ontologyRid: DEFAULT_ONTOLOGY_RID,
        },
        { preview: true },
      );
      expect(result).toBe(5);
    });

    it("returns undefined when the response has no operational version", async () => {
      vi.mocked(DocumentTypes.getOperationalVersion).mockResolvedValue({});

      const result = await service.getDocumentTypeOperationalVersion(
        "com.palantir.pack.test.doctype",
        "ri.ontology..explicit-rid",
      );

      expect(result).toBeUndefined();
    });
  });

  describe("resolveDocumentApplication", () => {
    const docRef = { id: "test-doc-1" } as DocumentRef;

    it("calls resolveApplication with the document id and returns the owning application id", async () => {
      vi.mocked(Documents.resolveApplication).mockResolvedValue({
        owningApplicationId: "ri.workspace..application.test-app",
      });

      const result = await service.resolveDocumentApplication(docRef);

      expect(Documents.resolveApplication).toHaveBeenCalledWith(
        mockOsdkClient,
        "test-doc-1",
        { preview: true },
      );
      expect(result).toBe("ri.workspace..application.test-app");
    });

    it("returns undefined when no owning application is configured", async () => {
      vi.mocked(Documents.resolveApplication).mockResolvedValue({});

      const result = await service.resolveDocumentApplication(docRef);

      expect(result).toBeUndefined();
    });
  });
});
