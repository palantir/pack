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

import { Documents } from "@osdk/foundry.pack";
import type { PackAppInternal } from "@palantir/pack.core";
import type { DocumentSchema } from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import type { FoundryEventService } from "@palantir/pack.state.foundry-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import { internalCreateFoundryDocumentService } from "../FoundryDocumentService.js";

vi.mock("@osdk/foundry.pack", () => ({
  Documents: {
    create: vi.fn(),
    get: vi.fn(),
  },
}));

const PRIMARY_ONTOLOGY_RID = "ri.ontology.main.ontology.primary";
const OTHER_ONTOLOGY_RID = "ri.ontology.main.ontology.other";

// Sentinel client stand-ins; identity is all these tests assert on.
const PRIMARY_CLIENT = { __label: "primary" };
const OTHER_CLIENT = { __label: "other" };

const mockLogger = {
  child: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

const testSchema = {
  [Metadata]: { version: 1 },
} as const satisfies DocumentSchema;

function createApp(): {
  app: PackAppInternal;
  factory: ReturnType<typeof vi.fn>;
} {
  // Factory returns a distinct client only for non-primary ontologies, mirroring how a host
  // mints per-ontology clients.
  const factory = vi.fn((ontologyRid: string) =>
    ontologyRid === OTHER_ONTOLOGY_RID ? OTHER_CLIENT : { __label: ontologyRid }
  );
  const app = {
    getModule: vi.fn().mockReturnValue({ onTokenChange: vi.fn(), getToken: vi.fn() }),
    config: {
      logger: mockLogger,
      osdkClient: PRIMARY_CLIENT,
      ontologyRid: Promise.resolve(PRIMARY_ONTOLOGY_RID),
      createOsdkClientForOntology: factory,
      remote: {
        packEventsUrl: "https://test.example.com/ws/cometd",
        baseUrl: "https://test.example.com",
      },
    },
  } as unknown as PackAppInternal;
  return { app, factory };
}

describe("FoundryDocumentService.createDocument ontology routing", () => {
  let mockEventService: MockProxy<FoundryEventService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.child.mockReturnValue(mockLogger);
    mockEventService = mock();
    vi.mocked(Documents.create).mockResolvedValue({ id: "created-doc-id" } as Awaited<
      ReturnType<typeof Documents.create>
    >);
  });

  it("routes to the primary client when no ontologyRid is given", async () => {
    const { app, factory } = createApp();
    const service = internalCreateFoundryDocumentService(app, {}, mockEventService);

    await service.createDocument({ name: "doc", documentTypeName: "Type" }, testSchema);

    const [client, request] = vi.mocked(Documents.create).mock.calls[0]!;
    expect(client).toBe(PRIMARY_CLIENT);
    expect(request.ontologyRid).toBe(PRIMARY_ONTOLOGY_RID);
    expect(factory).not.toHaveBeenCalled();
  });

  it("routes to the primary client when ontologyRid equals the app default (no redundant client)", async () => {
    const { app, factory } = createApp();
    const service = internalCreateFoundryDocumentService(app, {}, mockEventService);

    await service.createDocument(
      { name: "doc", documentTypeName: "Type", ontologyRid: PRIMARY_ONTOLOGY_RID },
      testSchema,
    );

    const [client, request] = vi.mocked(Documents.create).mock.calls[0]!;
    expect(client).toBe(PRIMARY_CLIENT);
    expect(request.ontologyRid).toBe(PRIMARY_ONTOLOGY_RID);
    // The fix: same-as-default must NOT mint a new client for an ontology the primary already serves.
    expect(factory).not.toHaveBeenCalled();
  });

  it("routes through the factory when ontologyRid differs from the app default", async () => {
    const { app, factory } = createApp();
    const service = internalCreateFoundryDocumentService(app, {}, mockEventService);

    await service.createDocument(
      { name: "doc", documentTypeName: "Type", ontologyRid: OTHER_ONTOLOGY_RID },
      testSchema,
    );

    const [client, request] = vi.mocked(Documents.create).mock.calls[0]!;
    expect(factory).toHaveBeenCalledExactlyOnceWith(OTHER_ONTOLOGY_RID);
    expect(client).toBe(OTHER_CLIENT);
    // The wire request still names the true target ontology, regardless of which client sends it.
    expect(request.ontologyRid).toBe(OTHER_ONTOLOGY_RID);
  });
});
