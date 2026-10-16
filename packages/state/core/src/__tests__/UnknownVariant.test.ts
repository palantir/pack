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
  DocumentId,
  DocumentSchema,
  Model,
  ModelData,
  RecordId,
  UnionUpgradeRegistry,
  UpgradeRegistry,
  UpgradeRegistryMap,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { z } from "zod";
import { DOCUMENT_SERVICE_MODULE_KEY } from "../DocumentServiceModule.js";
import type { BaseYjsDocumentService } from "../service/BaseYjsDocumentService.js";
import { getRecordSnapshot, setRecord } from "../service/YjsSchemaMapper.js";
import { createDocRef } from "../types/DocumentRefImpl.js";
import { getStateModule } from "../types/StateModule.js";
import { restoreUnknownVariants } from "../upgrade/UnknownVariant.js";
import { createTestApp } from "./testUtils.js";

// A 1.0 SDK knows `paragraph` blocks; a newer app added `checklist`.
const blockUnion: UnionUpgradeRegistry = {
  modelName: "Block",
  discriminant: "type",
  variants: { paragraph: "Paragraph" },
};
const paragraph: UpgradeRegistry = {
  modelName: "Paragraph",
  allFields: { text: { type: { kind: "primitive" } } },
  steps: [],
};
const page: UpgradeRegistry = {
  modelName: "Page",
  allFields: {
    title: { type: { kind: "primitive" } },
    blocks: { type: { kind: "array", element: { kind: "modelRef", model: "Block" } } },
    status: { type: { kind: "primitive" } },
    rawValue: { type: { kind: "primitive" } },
  },
  steps: [],
};
// A union model whose `frame` variant holds a list of blocks.
const layoutUnion: UnionUpgradeRegistry = {
  modelName: "Layout",
  discriminant: "kind",
  variants: { frame: "Frame" },
};
const frame: UpgradeRegistry = {
  modelName: "Frame",
  allFields: {
    blocks: { type: { kind: "array", element: { kind: "modelRef", model: "Block" } } },
  },
  steps: [],
};
const upgrades: UpgradeRegistryMap = {
  Block: blockUnion,
  Paragraph: paragraph,
  Page: page,
  Layout: layoutUnion,
  Frame: frame,
};
const PageModel: Model = { __type: {}, zodSchema: z.object({}), [Metadata]: { name: "Page" } };
const schema = {
  Page: PageModel,
  [Metadata]: { version: 1, upgrades },
} as unknown as DocumentSchema;

const checklist = { type: "checklist", items: ["a", "b"] };
const pageId = "page-1" as RecordId;

function readPage(): { title: string; blocks: unknown[] } {
  const yDoc = new Y.Doc();
  const storedPage = { title: "Notes", blocks: [{ type: "paragraph", text: "Hi" }, checklist] };
  setRecord(yDoc, "Page", pageId, storedPage as unknown as ModelData<Model>);
  return getRecordSnapshot(yDoc, "Page", pageId, upgrades) as { title: string; blocks: unknown[] };
}

describe("unknown union variants", () => {
  it("reads a variant this SDK doesn't know as an unknown variant", () => {
    const { blocks } = readPage();

    expect(blocks).toEqual([
      { type: "paragraph", text: "Hi" },
      { type: "unknown", rawValue: checklist },
    ]);
  });

  it("restores the stored value when the app saves what it read", () => {
    const read = readPage();

    expect(restoreUnknownVariants(schema, "Page", { ...read, title: "Renamed" })).toEqual({
      title: "Renamed",
      blocks: [{ type: "paragraph", text: "Hi" }, checklist],
    });
  });

  it("restores the stored value after the app deep-copies it", () => {
    const { blocks } = readPage();

    expect(restoreUnknownVariants(schema, "Page", { blocks: structuredClone(blocks) })).toEqual({
      blocks: [{ type: "paragraph", text: "Hi" }, checklist],
    });
  });

  it("leaves non-union fields unchanged even when they look like an unknown variant", () => {
    const value = { status: "unknown", rawValue: { status: "ready" } };

    expect(restoreUnknownVariants(schema, "Page", value)).toEqual(value);
  });

  it("uses the current record to find the variant when a partial update leaves it out", () => {
    const { blocks } = readPage();

    expect(
      restoreUnknownVariants(schema, "Layout", { blocks }, { kind: "frame", blocks: [] }),
    ).toEqual({ blocks: [{ type: "paragraph", text: "Hi" }, checklist] });
  });

  it("restores edit descriptions and presence sent through app.state", () => {
    const app = createTestApp();
    const service = app.getModule(DOCUMENT_SERVICE_MODULE_KEY) as BaseYjsDocumentService;
    const withTransaction = vi.spyOn(service, "withTransaction").mockImplementation(() => {});
    const updateCustomPresence = vi.spyOn(service, "updateCustomPresence")
      .mockImplementation(() => {});
    const stateModule = getStateModule(app);
    const docRef = createDocRef(app, "doc-1" as DocumentId, schema);
    const { blocks } = readPage();
    const restored = { blocks: [{ type: "paragraph", text: "Hi" }, checklist] };

    stateModule.withTransaction(docRef, () => {}, { model: PageModel, data: { blocks } });
    stateModule.updateCustomPresence(docRef, PageModel, { blocks } as never);

    expect(withTransaction.mock.calls[0]![2]).toMatchObject({ data: restored });
    expect(updateCustomPresence.mock.calls[0]![2]).toEqual(restored);
  });

  it("leaves a value without unknown variants unchanged", () => {
    const value = { title: "Notes", blocks: [{ type: "paragraph", text: "Hi" }] };

    expect(restoreUnknownVariants(schema, "Page", value)).toEqual(value);
  });
});
