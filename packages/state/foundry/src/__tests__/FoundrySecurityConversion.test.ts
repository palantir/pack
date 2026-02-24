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

import type { Document, DocumentSearchResponse } from "@osdk/foundry.pack";
import { Documents } from "@osdk/foundry.pack";
import type { PackAppInternal } from "@palantir/pack.core";
import type {
  DocumentId,
  DocumentMetadata,
  DocumentSchema,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { createDocRef, DocumentLoadStatus } from "@palantir/pack.state.core";
import type { FoundryEventService, SyncSession } from "@palantir/pack.state.foundry-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import type { FoundryDocumentService } from "../FoundryDocumentService.js";
import { internalCreateFoundryDocumentService } from "../FoundryDocumentService.js";

vi.mock("@osdk/foundry.pack", () => ({
  Documents: {
    get: vi.fn(),
    search: vi.fn(),
  },
}));

const mockAuthModule = {
  onTokenChange: vi.fn(),
  getToken: vi.fn().mockReturnValue("mock-token"),
};

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
  getModule: vi.fn().mockReturnValue(mockAuthModule),
  config: {
    logger: mockLogger,
    osdkClient: mockOsdkClient,
    remote: {
      packWsPath: "/ws",
      baseUrl: "https://test.example.com",
    },
  },
} as unknown as PackAppInternal;

const testSchema = {
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema;

const WIRE_DOCUMENT_WITH_SECURITY: Document = {
  id: "test-doc-security",
  name: "Secure Document",
  documentTypeName: "SecureType",
  ontologyRid: "ri.ontology..test-ontology-rid",
  createdBy: "user-1",
  createdTime: "2025-01-01T00:00:00Z",
  updatedBy: "user-2",
  updatedTime: "2025-01-02T00:00:00Z",
  security: {
    mandatory: {
      classification: ["SECRET"],
      markings: ["MARKING-1", "MARKING-2"],
    },
    discretionary: {
      owners: [{ type: "userId", userId: "owner-user-1" }],
      editors: [{ type: "groupId", groupId: "editors-group-1" }],
      viewers: [{ type: "all" }],
    },
  },
};

describe("Foundry Security Conversion", () => {
  let mockEventService: MockProxy<FoundryEventService>;
  let service: FoundryDocumentService;
  let sessionCounter: number;

  beforeEach(() => {
    vi.useFakeTimers();
    mockEventService = mock();
    sessionCounter = 0;

    vi.mocked(Documents.get).mockResolvedValue(WIRE_DOCUMENT_WITH_SECURITY);

    mockEventService.startDocumentSync.mockImplementation((documentId, _yDoc, onStatusChange) => {
      const session: SyncSession = {
        clientId: `test-client-${++sessionCounter}`,
        documentId,
      };

      void Promise.resolve().then(() => {
        onStatusChange({
          load: DocumentLoadStatus.LOADED,
        });
      });

      return session;
    });

    mockEventService.stopDocumentSync.mockImplementation(() => {});

    service = internalCreateFoundryDocumentService(mockApp, {}, mockEventService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(Documents.get).mockClear();
    vi.mocked(Documents.search).mockClear();
  });

  describe("searchDocuments", () => {
    it("should convert wire security to local security", async () => {
      const searchResponse: DocumentSearchResponse = {
        data: [WIRE_DOCUMENT_WITH_SECURITY],
      };
      vi.mocked(Documents.search).mockResolvedValue(searchResponse);

      const result = await service.searchDocuments("SecureType", testSchema);

      expect(result.data).toHaveLength(1);
      const doc = result.data[0];

      expect(doc?.security).toEqual({
        mandatory: {
          classification: ["SECRET"],
          markings: ["MARKING-1", "MARKING-2"],
        },
        discretionary: {
          owners: [{ type: "userId", userId: "owner-user-1" }],
          editors: [{ type: "groupId", groupId: "editors-group-1" }],
          viewers: [{ type: "all" }],
        },
      });
    });

    it("should preserve ontologyRid from response", async () => {
      const searchResponse: DocumentSearchResponse = {
        data: [WIRE_DOCUMENT_WITH_SECURITY],
      };
      vi.mocked(Documents.search).mockResolvedValue(searchResponse);

      const result = await service.searchDocuments("SecureType", testSchema);

      expect(result.data[0]?.ontologyRid).toBe("ri.ontology..test-ontology-rid");
    });
  });

  describe("onMetadataSubscriptionOpened", () => {
    const unsubscribes: Array<() => void> = [];

    afterEach(() => {
      unsubscribes.forEach(fn => {
        fn();
      });
      unsubscribes.length = 0;
    });

    it("should convert wire security to local security in metadata", async () => {
      const docRef = createDocRef(mockApp, "test-doc-security" as DocumentId, testSchema);

      const metadataUpdates: DocumentMetadata[] = [];

      unsubscribes.push(
        service.onMetadataChange(docRef, (_, metadata) => {
          metadataUpdates.push(metadata);
        }),
      );

      await vi.runAllTimersAsync();

      expect(metadataUpdates).toHaveLength(1);
      const metadata = metadataUpdates[0];

      expect(metadata?.security).toEqual({
        mandatory: {
          classification: ["SECRET"],
          markings: ["MARKING-1", "MARKING-2"],
        },
        discretionary: {
          owners: [{ type: "userId", userId: "owner-user-1" }],
          editors: [{ type: "groupId", groupId: "editors-group-1" }],
          viewers: [{ type: "all" }],
        },
      });
    });

    it("should preserve ontologyRid in metadata", async () => {
      const docRef = createDocRef(mockApp, "test-doc-security" as DocumentId, testSchema);

      const metadataUpdates: DocumentMetadata[] = [];

      unsubscribes.push(
        service.onMetadataChange(docRef, (_, metadata) => {
          metadataUpdates.push(metadata);
        }),
      );

      await vi.runAllTimersAsync();

      expect(metadataUpdates).toHaveLength(1);
      expect(metadataUpdates[0]?.ontologyRid).toBe("ri.ontology..test-ontology-rid");
    });
  });
});
