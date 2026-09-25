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

import type {
  Document as WireDocument,
  DocumentTypeV2 as WireDocumentTypeV2,
} from "@osdk/foundry.pack";
import { Documents, DocumentTypes } from "@osdk/foundry.pack";
import type { PackAppInternal } from "@palantir/pack.core";
import type { DocumentRef, DocumentSchema } from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import type { FoundryEventService } from "@palantir/pack.state.foundry-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import type { FoundryDocumentService } from "../FoundryDocumentService.js";
import { internalCreateFoundryDocumentService } from "../FoundryDocumentService.js";

vi.mock("@osdk/foundry.pack", () => ({
  DocumentTypes: {
    loadV2: vi.fn(),
    loadByNameV2: vi.fn(),
    getOperationalVersion: vi.fn(),
  },
  Documents: {
    search: vi.fn(),
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

const testSchema = {
  [Metadata]: { version: 1 },
} as const satisfies DocumentSchema;

const RID_BACKED_DOCUMENT_TYPE: WireDocumentTypeV2 = {
  reference: { type: "rid", rid: "ri.pack..document-type.test-rid" },
  name: "com.palantir.pack.test.doctype",
  operationalVersion: 3,
  fileSystemType: "COMPASS",
  owningApplicationId: "ri.workspace..application.test-app",
};

const NAME_BACKED_DOCUMENT_TYPE: WireDocumentTypeV2 = {
  reference: { type: "name", name: "com.palantir.pack.name-backed" },
  name: "com.palantir.pack.name-backed",
  fileSystemType: "COMPASS",
};

function makeWireDocument(overrides: Partial<WireDocument> = {}): WireDocument {
  return {
    id: "ri.pack..document.test",
    documentTypeName: "com.palantir.pack.test.doctype",
    name: "Test Document",
    security: {
      discretionary: { editors: [], owners: [], viewers: [] },
      mandatory: { classification: [], markings: [] },
    },
    createdBy: "user-1",
    createdTime: "2026-01-01T00:00:00Z",
    updatedBy: "user-2",
    updatedTime: "2026-01-02T00:00:00Z",
    operations: [],
    ...overrides,
  };
}

describe("FoundryDocumentService document type loading", () => {
  let mockEventService: MockProxy<FoundryEventService>;
  let service: FoundryDocumentService;

  beforeEach(() => {
    mockEventService = mock();
    service = internalCreateFoundryDocumentService(mockApp, {}, mockEventService);
  });

  afterEach(() => {
    vi.mocked(DocumentTypes.loadV2).mockReset();
    vi.mocked(DocumentTypes.loadByNameV2).mockReset();
    vi.mocked(DocumentTypes.getOperationalVersion).mockReset();
    vi.mocked(Documents.search).mockReset();
    vi.mocked(Documents.resolveApplication).mockReset();
  });

  describe("loadDocumentTypeByName (ontology-scoped)", () => {
    it("calls loadByNameV2 with the provided ontologyRid", async () => {
      vi.mocked(DocumentTypes.loadByNameV2).mockResolvedValue(RID_BACKED_DOCUMENT_TYPE);

      await service.loadDocumentTypeByName(
        "com.palantir.pack.test.doctype",
        "ri.ontology..explicit-rid",
      );

      expect(DocumentTypes.loadByNameV2).toHaveBeenCalledWith(
        mockOsdkClient,
        {
          documentTypeName: "com.palantir.pack.test.doctype",
          ontologyRid: "ri.ontology..explicit-rid",
        },
        { preview: true },
      );
    });

    it("defaults the ontologyRid to the app's bound ontology when not provided", async () => {
      vi.mocked(DocumentTypes.loadByNameV2).mockResolvedValue(RID_BACKED_DOCUMENT_TYPE);

      await service.loadDocumentTypeByName("com.palantir.pack.test.doctype");

      expect(DocumentTypes.loadByNameV2).toHaveBeenCalledWith(
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
    it("calls loadV2 with a rid reference and maps the rid-backed result", async () => {
      vi.mocked(DocumentTypes.loadV2).mockResolvedValue(RID_BACKED_DOCUMENT_TYPE);

      const result = await service.getDocumentType("ri.pack..document-type.test-rid");

      expect(DocumentTypes.loadV2).toHaveBeenCalledWith(
        mockOsdkClient,
        { documentTypeReference: { type: "rid", rid: "ri.pack..document-type.test-rid" } },
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

    it("exposes no rid for a name-backed document type", async () => {
      vi.mocked(DocumentTypes.loadV2).mockResolvedValue(NAME_BACKED_DOCUMENT_TYPE);

      const result = await service.getDocumentType("ri.pack..document-type.name-backed");

      expect(result).toEqual({
        rid: undefined,
        name: "com.palantir.pack.name-backed",
        operationalVersion: undefined,
        fileSystemType: "COMPASS",
        owningApplicationId: undefined,
      });
    });
  });

  describe("wire document metadata mapping", () => {
    async function loadMappedMetadata(wireDocument: WireDocument) {
      vi.mocked(Documents.search).mockResolvedValue({ data: [wireDocument] });
      const result = await service.searchDocuments("com.palantir.pack.test.doctype", testSchema);
      const [metadata] = result.data;
      if (metadata == null) {
        throw new Error("expected searchDocuments to return one mapped document");
      }
      return metadata;
    }

    it("maps the ontologyRid when the document has one", async () => {
      const metadata = await loadMappedMetadata(
        makeWireDocument({ ontologyRid: "ri.ontology..document-ontology" }),
      );

      expect(metadata.ontologyRid).toBe("ri.ontology..document-ontology");
    });

    it("leaves the ontologyRid undefined for ontology-less documents", async () => {
      const metadata = await loadMappedMetadata(makeWireDocument());

      expect(metadata.ontologyRid).toBeUndefined();
    });

    it.each([true, false, undefined])(
      "maps presenceSupported %s straight through",
      async presenceSupported => {
        const metadata = await loadMappedMetadata(makeWireDocument({ presenceSupported }));

        expect(metadata.presenceSupported).toBe(presenceSupported);
      },
    );

    it("maps the operationalVersion from the wire document", async () => {
      const metadata = await loadMappedMetadata(makeWireDocument({ operationalVersion: 7 }));

      expect(metadata.operationalVersion).toBe(7);
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
