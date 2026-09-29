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

import type { PackAppInternal } from "@palantir/pack.core";
import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import type { FoundryEventService } from "@palantir/pack.state.foundry-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { internalCreateFoundryDocumentService } from "../FoundryDocumentService.js";

const publishedVersions = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  deletePublishedVersion: vi.fn(),
  getLatest: vi.fn(),
  getContents: vi.fn(),
  getLatestContents: vi.fn(),
}));

vi.mock("@osdk/foundry.pack", () => ({
  Documents: {},
  DocumentTypes: {},
  PublishedVersions: publishedVersions,
}));

const osdkClient = {};
const logger = { child: vi.fn() };
logger.child.mockReturnValue(logger);
const app = {
  config: { logger, osdkClient },
} as unknown as PackAppInternal;
const docRef = { id: "ri.pack.document.test" } as DocumentRef;
const version = {
  ref: "opaque-ref",
  name: "First release",
  description: "Approved content",
  createdAt: "2026-09-29T12:00:00Z",
  createdBy: "user-1",
};

function createService(usePreviewApi?: boolean) {
  return internalCreateFoundryDocumentService(app, { usePreviewApi }, mock<FoundryEventService>());
}

describe("FoundryDocumentService published versions", () => {
  beforeEach(() => {
    for (const method of Object.values(publishedVersions)) {
      method.mockReset();
    }
  });

  // Verify create forwards optional metadata and preserves the published and evicted versions.
  it("sends publication options and maps the published and evicted versions", async () => {
    const evictedVersion = { ...version, ref: "evicted-ref" };
    publishedVersions.create.mockResolvedValue({
      publishedVersion: version,
      autoEvictedPublishedVersions: [evictedVersion],
    });

    const result = await createService().createPublishedVersion(docRef, {
      name: version.name,
      description: version.description,
    });

    expect(publishedVersions.create).toHaveBeenCalledWith(
      osdkClient,
      docRef.id,
      { requestBody: { name: version.name, description: version.description } },
      { preview: true },
    );
    expect(result).toEqual({
      publishedVersion: version,
      autoEvictedPublishedVersions: [evictedVersion],
    });
  });

  // Verify create uses an empty body when options are omitted and honors preview configuration.
  it("sends an empty body without options and respects the preview setting", async () => {
    publishedVersions.create.mockResolvedValue({
      publishedVersion: version,
      autoEvictedPublishedVersions: [],
    });

    await createService(false).createPublishedVersion(docRef);

    expect(publishedVersions.create).toHaveBeenCalledWith(
      osdkClient,
      docRef.id,
      { requestBody: {} },
      { preview: false },
    );
  });

  // Verify metadata reads route to list, get by ref, and get latest with the expected arguments.
  it("lists and loads version metadata by ref or latest", async () => {
    publishedVersions.list.mockResolvedValue({ data: [version] });
    publishedVersions.get.mockResolvedValue(version);
    publishedVersions.getLatest.mockResolvedValue(version);
    const service = createService();

    expect(await service.listPublishedVersions(docRef)).toEqual([version]);
    expect(await service.getPublishedVersion(docRef, version.ref)).toEqual(version);
    expect(await service.getLatestPublishedVersion(docRef)).toEqual(version);
    expect(publishedVersions.list).toHaveBeenCalledWith(osdkClient, docRef.id, {
      preview: true,
    });
    expect(publishedVersions.get).toHaveBeenCalledWith(
      osdkClient,
      docRef.id,
      version.ref,
      { preview: true },
    );
    expect(publishedVersions.getLatest).toHaveBeenCalledWith(osdkClient, docRef.id, {
      preview: true,
    });
  });

  // Verify both content reads convert binary responses to Uint8Array without changing the bytes.
  it("returns binary contents by ref or latest", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    publishedVersions.getContents.mockResolvedValue({ arrayBuffer: async () => bytes.buffer });
    publishedVersions.getLatestContents.mockResolvedValue({
      arrayBuffer: async () => bytes.buffer,
    });
    const service = createService();

    expect(await service.getPublishedVersionContents(docRef, version.ref)).toEqual(bytes);
    expect(await service.getLatestPublishedVersionContents(docRef)).toEqual(bytes);
    expect(publishedVersions.getContents).toHaveBeenCalledWith(
      osdkClient,
      docRef.id,
      version.ref,
      { preview: true },
    );
    expect(publishedVersions.getLatestContents).toHaveBeenCalledWith(osdkClient, docRef.id, {
      preview: true,
    });
  });

  // Verify delete forwards the server-generated ref unchanged.
  it("deletes a version by its opaque ref", async () => {
    await createService().deletePublishedVersion(docRef, version.ref);

    expect(publishedVersions.deletePublishedVersion).toHaveBeenCalledWith(
      osdkClient,
      docRef.id,
      version.ref,
      { preview: true },
    );
  });
});
