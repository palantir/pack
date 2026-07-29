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

/* eslint-disable @typescript-eslint/no-deprecated -- Mirror current generated `.passthrough()` schemas. */

import type { DocumentSchema, Model, RecordId } from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { z } from "zod";
import * as YjsSchemaMapper from "../service/YjsSchemaMapper.js";

const MODEL_NAME = "MergeFixture";
const RECORD_ID = "fixture" as RecordId;
const BASE_CLIENT_ID = 1;

type SharedPath = ReadonlyArray<string | number>;

type MergeOperation =
  | {
    readonly kind: "patch";
    readonly value: Readonly<Record<string, unknown>>;
  }
  | {
    readonly kind: "replaceRecord";
    readonly value: Readonly<Record<string, unknown>>;
  }
  | {
    readonly index: number;
    readonly kind: "arrayDelete";
    readonly length?: number;
    readonly path: SharedPath;
  }
  | {
    readonly index: number;
    readonly kind: "arrayInsert";
    readonly path: SharedPath;
    readonly values: ReadonlyArray<unknown>;
  }
  | {
    readonly index: number;
    readonly kind: "arrayReplace";
    readonly order: "deleteThenInsert" | "insertThenDelete";
    readonly path: SharedPath;
    readonly value: unknown;
  }
  | {
    /** Destination index after the source element has been deleted. */
    readonly destinationIndex: number;
    readonly kind: "arrayMove";
    readonly path: SharedPath;
    readonly sourceIndex: number;
  };

interface MergeScenario {
  readonly clientA: ReadonlyArray<MergeOperation>;
  readonly clientB: ReadonlyArray<MergeOperation>;
  readonly discriminant?: string;
  readonly initial: Readonly<Record<string, unknown>>;
  readonly modelName?: string;
  readonly name: string;
  readonly schema: z.ZodType<unknown>;
  readonly schemaSource?: "generator-shaped";
  /** Number of logical field/collection writes performed by A and B, respectively. */
  readonly writes: `${number}+${number}`;
  readonly dataType:
    | "array"
    | "array of records"
    | "discriminated union"
    | "nested record"
    | "record"
    | "union";
}

const rangeSchema = z.object({
  lower: z.number(),
  upper: z.number(),
}).refine(value => value.lower <= value.upper, {
  message: "lower must not exceed upper",
});

const nestedRangeSchema = z.object({
  window: z.object({
    lower: z.number(),
    upper: z.number(),
  }),
}).refine(value => value.window.lower <= value.window.upper, {
  message: "window.lower must not exceed window.upper",
});

const allocationSchema = z.object({
  allocations: z.record(z.string(), z.number()),
}).refine(
  value => Object.values(value.allocations).reduce((sum, allocation) => sum + allocation, 0) <= 100,
  { message: "allocations must total at most 100" },
);

const conditionalFieldSchema = z.object({
  mode: z.enum(["automatic", "manual"]),
  threshold: z.number().optional(),
}).refine(
  value =>
    (value.mode === "automatic" && value.threshold == null)
    || (value.mode === "manual" && value.threshold != null),
  { message: "threshold must be present exactly when mode is manual" },
);

const boundedNumberUnionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("nonnegative"),
    value: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal("atMostTen"),
    value: z.number().max(10),
  }),
]);

const uniqueStrings = z.array(z.string()).refine(
  values => new Set(values).size === values.length,
  { message: "array elements must be unique" },
);

/*
 * These schemas deliberately mirror generateZodSchemasFromIr output. Record
 * variants are emitted first, each union variant extends its record with a
 * literal discriminant, and the union is a z.discriminatedUnion over those
 * extended schemas.
 */
const generatedShapeFields = {
  x: z.number(),
  y: z.number(),
};
const GeneratedShapeCircleSchema = z.object(generatedShapeFields).passthrough();
const GeneratedShapeBoxSchema = z.object(generatedShapeFields).passthrough();
const GeneratedNodeShapeCircleSchema = GeneratedShapeCircleSchema.extend({
  shapeType: z.literal("circle"),
});
const GeneratedNodeShapeBoxSchema = GeneratedShapeBoxSchema.extend({
  shapeType: z.literal("box"),
});
const GeneratedNodeShapeSchema = z.discriminatedUnion("shapeType", [
  GeneratedNodeShapeBoxSchema,
  GeneratedNodeShapeCircleSchema,
]);

const GeneratedFlexibleShapeCircleSchema = z.object({
  ...generatedShapeFields,
  payload: z.unknown(),
}).passthrough();
const GeneratedTextShapeBoxSchema = z.object({
  ...generatedShapeFields,
  payload: z.string(),
}).passthrough();
const GeneratedPayloadShapeCircleSchema = GeneratedFlexibleShapeCircleSchema.extend({
  shapeType: z.literal("circle"),
});
const GeneratedPayloadShapeBoxSchema = GeneratedTextShapeBoxSchema.extend({
  shapeType: z.literal("box"),
});
const GeneratedPayloadShapeSchema = z.discriminatedUnion("shapeType", [
  GeneratedPayloadShapeBoxSchema,
  GeneratedPayloadShapeCircleSchema,
]);

const GeneratedOptionalShapeCircleSchema = z.object({
  ...generatedShapeFields,
  label: z.string().optional(),
}).passthrough();
const GeneratedRequiredShapeBoxSchema = z.object({
  ...generatedShapeFields,
  label: z.string(),
}).passthrough();
const GeneratedLabeledShapeCircleSchema = GeneratedOptionalShapeCircleSchema.extend({
  shapeType: z.literal("circle"),
});
const GeneratedLabeledShapeBoxSchema = GeneratedRequiredShapeBoxSchema.extend({
  shapeType: z.literal("box"),
});
const GeneratedLabeledShapeSchema = z.discriminatedUnion("shapeType", [
  GeneratedLabeledShapeBoxSchema,
  GeneratedLabeledShapeCircleSchema,
]);

const GeneratedPointSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
}).passthrough();
const GeneratedDrawingSchema = z.object({
  points: z.array(z.lazy(() => GeneratedPointSchema)),
}).passthrough();
const GeneratedBoundsSchema = z.object({
  height: z.number(),
  width: z.number(),
  x: z.number(),
  y: z.number(),
}).passthrough();
const GeneratedNestedRecordSchema = z.object({
  bounds: z.lazy(() => GeneratedBoundsSchema),
  id: z.string(),
}).passthrough();
const GeneratedNestedShapeRecordSchema = z.object({
  id: z.string(),
  shape: z.lazy(() => GeneratedPayloadShapeSchema),
}).passthrough();

const GeneratedLooseCollectionSchema = z.object({
  items: z.array(z.unknown()),
}).passthrough();
const GeneratedPointCollectionSchema = z.object({
  items: z.array(z.lazy(() => GeneratedPointSchema)),
}).passthrough();
const GeneratedCollectionLooseSchema = GeneratedLooseCollectionSchema.extend({
  collectionType: z.literal("loose"),
});
const GeneratedCollectionPointsSchema = GeneratedPointCollectionSchema.extend({
  collectionType: z.literal("points"),
});
const GeneratedCollectionSchema = z.discriminatedUnion("collectionType", [
  GeneratedCollectionLooseSchema,
  GeneratedCollectionPointsSchema,
]);

const SCENARIOS: ReadonlyArray<MergeScenario> = [
  {
    dataType: "discriminated union",
    schemaSource: "generator-shaped",
    modelName: "NodeShape",
    discriminant: "shapeType",
    name: "identical ShapeBox and ShapeCircle fields (control)",
    writes: "1+1",
    schema: GeneratedNodeShapeSchema,
    initial: { shapeType: "circle", x: 0, y: 0 },
    clientA: [{ kind: "patch", value: { shapeType: "box" } }],
    clientB: [{ kind: "patch", value: { x: 1 } }],
  },
  {
    dataType: "discriminated union",
    schemaSource: "generator-shaped",
    modelName: "PayloadShape",
    discriminant: "shapeType",
    name: "discriminant changed while variant payload changes type",
    writes: "1+1",
    schema: GeneratedPayloadShapeSchema,
    initial: { shapeType: "circle", x: 0, y: 0, payload: "text" },
    clientA: [{ kind: "patch", value: { shapeType: "box" } }],
    clientB: [{ kind: "patch", value: { payload: { rich: true } } }],
  },
  {
    dataType: "discriminated union",
    schemaSource: "generator-shaped",
    modelName: "LabeledShape",
    discriminant: "shapeType",
    name: "discriminant changed while a newly-required field is deleted",
    writes: "1+1",
    schema: GeneratedLabeledShapeSchema,
    initial: { shapeType: "circle", x: 0, y: 0, label: "shape" },
    clientA: [{ kind: "patch", value: { shapeType: "box" } }],
    clientB: [{ kind: "patch", value: { label: undefined } }],
  },
  {
    dataType: "nested record",
    schemaSource: "generator-shaped",
    modelName: "NestedRecord",
    name: "independent fields in a nested record (control)",
    writes: "1+1",
    schema: GeneratedNestedRecordSchema,
    initial: { id: "node", bounds: { height: 10, width: 10, x: 0, y: 0 } },
    clientA: [{ kind: "patch", value: { bounds: { x: 1 } } }],
    clientB: [{ kind: "patch", value: { bounds: { y: 2 } } }],
  },
  {
    dataType: "nested record",
    schemaSource: "generator-shaped",
    modelName: "NestedShapeRecord",
    name: "discriminated union nested inside a record",
    writes: "1+1",
    schema: GeneratedNestedShapeRecordSchema,
    initial: {
      id: "node",
      shape: { shapeType: "circle", x: 0, y: 0, payload: "text" },
    },
    clientA: [{ kind: "patch", value: { shape: { shapeType: "box" } } }],
    clientB: [{ kind: "patch", value: { shape: { payload: { rich: true } } } }],
  },
  {
    dataType: "array of records",
    schemaSource: "generator-shaped",
    modelName: "Drawing",
    name: "concurrent insertion of records (control)",
    writes: "1+1",
    schema: GeneratedDrawingSchema,
    initial: { points: [{ id: "seed", x: 0, y: 0 }] },
    clientA: [{
      kind: "arrayInsert",
      path: ["points"],
      index: 1,
      values: [{ id: "a", x: 1, y: 1 }],
    }],
    clientB: [{
      kind: "arrayInsert",
      path: ["points"],
      index: 1,
      values: [{ id: "b", x: 2, y: 2 }],
    }],
  },
  {
    dataType: "array of records",
    schemaSource: "generator-shaped",
    modelName: "Drawing",
    name: "concurrent replacement of one record (control)",
    writes: "2+2",
    schema: GeneratedDrawingSchema,
    initial: { points: [{ id: "seed", x: 0, y: 0 }] },
    clientA: [{
      kind: "arrayReplace",
      path: ["points"],
      index: 0,
      order: "deleteThenInsert",
      value: { id: "a", x: 1, y: 1 },
    }],
    clientB: [{
      kind: "arrayReplace",
      path: ["points"],
      index: 0,
      order: "deleteThenInsert",
      value: { id: "b", x: 2, y: 2 },
    }],
  },
  {
    dataType: "array of records",
    schemaSource: "generator-shaped",
    modelName: "Collection",
    discriminant: "collectionType",
    name: "array item schema changes with a union discriminant",
    writes: "1+1",
    schema: GeneratedCollectionSchema,
    initial: {
      collectionType: "loose",
      items: [{ id: "seed", x: 0, y: 0 }],
    },
    clientA: [{ kind: "patch", value: { collectionType: "points" } }],
    clientB: [{ kind: "arrayInsert", path: ["items"], index: 1, values: ["not-a-point"] }],
  },
  {
    dataType: "record",
    name: "independent scalar fields (control)",
    writes: "1+1",
    schema: z.object({ left: z.number(), right: z.number() }),
    initial: { left: 0, right: 0 },
    clientA: [{ kind: "patch", value: { left: 1 } }],
    clientB: [{ kind: "patch", value: { right: 2 } }],
  },
  {
    dataType: "record",
    name: "coupled range endpoints",
    writes: "1+1",
    schema: rangeSchema,
    initial: { lower: 0, upper: 10 },
    clientA: [{ kind: "patch", value: { lower: 8 } }],
    clientB: [{ kind: "patch", value: { upper: 2 } }],
  },
  {
    dataType: "record",
    name: "whole-record replacement competing with a field write",
    writes: "2+1",
    schema: rangeSchema,
    initial: { lower: 0, upper: 10 },
    clientA: [{ kind: "replaceRecord", value: { lower: 8, upper: 10 } }],
    clientB: [{ kind: "patch", value: { upper: 2 } }],
  },
  {
    dataType: "record",
    name: "concurrent whole-record replacements (control)",
    writes: "2+2",
    schema: rangeSchema,
    initial: { lower: 0, upper: 10 },
    clientA: [{ kind: "replaceRecord", value: { lower: 8, upper: 10 } }],
    clientB: [{ kind: "replaceRecord", value: { lower: 0, upper: 2 } }],
  },
  {
    dataType: "record",
    name: "coupled fields in a nested record",
    writes: "1+1",
    schema: nestedRangeSchema,
    initial: { window: { lower: 0, upper: 10 } },
    clientA: [{ kind: "patch", value: { window: { lower: 8 } } }],
    clientB: [{ kind: "patch", value: { window: { upper: 2 } } }],
  },
  {
    dataType: "record",
    name: "coupled entries in a record map",
    writes: "1+1",
    schema: allocationSchema,
    initial: { allocations: { engineering: 40, product: 40 } },
    clientA: [{ kind: "patch", value: { allocations: { engineering: 60 } } }],
    clientB: [{ kind: "patch", value: { allocations: { product: 60 } } }],
  },
  {
    dataType: "record",
    name: "conditional field deletion competing with a write",
    writes: "2+1",
    schema: conditionalFieldSchema,
    initial: { mode: "manual", threshold: 1 },
    clientA: [{ kind: "patch", value: { mode: "automatic", threshold: undefined } }],
    clientB: [{ kind: "patch", value: { threshold: 2 } }],
  },
  {
    dataType: "union",
    name: "discriminant and payload changed independently",
    writes: "1+1",
    schema: boundedNumberUnionSchema,
    initial: { kind: "nonnegative", value: 5 },
    clientA: [{ kind: "patch", value: { kind: "atMostTen" } }],
    clientB: [{ kind: "patch", value: { value: 20 } }],
  },
  {
    dataType: "union",
    name: "whole variant change competing with a payload write",
    writes: "2+1",
    schema: boundedNumberUnionSchema,
    initial: { kind: "nonnegative", value: 5 },
    clientA: [{ kind: "patch", value: { kind: "atMostTen", value: 8 } }],
    clientB: [{ kind: "patch", value: { value: 20 } }],
  },
  {
    dataType: "union",
    name: "whole variant changes written in opposite field orders",
    writes: "2+2",
    schema: boundedNumberUnionSchema,
    initial: { kind: "nonnegative", value: 5 },
    clientA: [
      { kind: "patch", value: { kind: "atMostTen" } },
      { kind: "patch", value: { value: 8 } },
    ],
    clientB: [
      { kind: "patch", value: { value: 20 } },
      { kind: "patch", value: { kind: "nonnegative" } },
    ],
  },
  {
    dataType: "array",
    name: "concurrent insertion into an unconstrained array (control)",
    writes: "1+1",
    schema: z.object({ items: z.array(z.string()) }),
    initial: { items: ["seed"] },
    clientA: [{ kind: "arrayInsert", path: ["items"], index: 1, values: ["a"] }],
    clientB: [{ kind: "arrayInsert", path: ["items"], index: 1, values: ["b"] }],
  },
  {
    dataType: "array",
    name: "distinct deletions from a non-empty array",
    writes: "1+1",
    schema: z.object({ items: z.array(z.string()).min(1) }),
    initial: { items: ["a", "b"] },
    clientA: [{ kind: "arrayDelete", path: ["items"], index: 0 }],
    clientB: [{ kind: "arrayDelete", path: ["items"], index: 1 }],
  },
  {
    dataType: "array",
    name: "inserting the same unique value",
    writes: "1+1",
    schema: z.object({ items: uniqueStrings }),
    initial: { items: ["seed"] },
    clientA: [{ kind: "arrayInsert", path: ["items"], index: 1, values: ["duplicate"] }],
    clientB: [{ kind: "arrayInsert", path: ["items"], index: 1, values: ["duplicate"] }],
  },
  {
    dataType: "array",
    name: "replacing one element using delete then insert",
    writes: "2+2",
    schema: z.object({ items: z.array(z.string()).length(1) }),
    initial: { items: ["seed"] },
    clientA: [{
      kind: "arrayReplace",
      path: ["items"],
      index: 0,
      order: "deleteThenInsert",
      value: "a",
    }],
    clientB: [{
      kind: "arrayReplace",
      path: ["items"],
      index: 0,
      order: "deleteThenInsert",
      value: "b",
    }],
  },
  {
    dataType: "array",
    name: "replacing one element using insert then delete",
    writes: "2+2",
    schema: z.object({ items: z.array(z.string()).length(1) }),
    initial: { items: ["seed"] },
    clientA: [{
      kind: "arrayReplace",
      path: ["items"],
      index: 0,
      order: "insertThenDelete",
      value: "a",
    }],
    clientB: [{
      kind: "arrayReplace",
      path: ["items"],
      index: 0,
      order: "insertThenDelete",
      value: "b",
    }],
  },
  {
    dataType: "array",
    name: "moving the same element to different destinations",
    writes: "2+2",
    schema: z.object({ items: uniqueStrings.length(3) }),
    initial: { items: ["a", "b", "c"] },
    clientA: [{
      kind: "arrayMove",
      path: ["items"],
      sourceIndex: 0,
      destinationIndex: 1,
    }],
    clientB: [{
      kind: "arrayMove",
      path: ["items"],
      sourceIndex: 0,
      destinationIndex: 2,
    }],
  },
  {
    dataType: "array",
    name: "whole-array replacement through the mapper (control)",
    writes: "1+1",
    schema: z.object({ items: z.array(z.string()).min(1) }),
    initial: { items: ["seed"] },
    clientA: [{ kind: "patch", value: { items: ["a"] } }],
    clientB: [{ kind: "patch", value: { items: ["b"] } }],
  },
];

const CLIENT_ID_ORDERS = [
  { label: "A=2, B=3", clientA: 2, clientB: 3 },
  { label: "A=3, B=2", clientA: 3, clientB: 2 },
] as const;

function getModelName(scenario: MergeScenario): string {
  return scenario.modelName ?? MODEL_NAME;
}

function getSchemaSource(scenario: MergeScenario): "generator-shaped" | "hand-authored" {
  return scenario.schemaSource ?? "hand-authored";
}

function createSchema(scenario: MergeScenario): DocumentSchema {
  const modelName = getModelName(scenario);
  const model: Model<Record<string, unknown>> = {
    __type: {},
    zodSchema: scenario.schema as z.ZodType<Record<string, unknown>>,
    [Metadata]: scenario.discriminant == null
      ? { name: modelName }
      : { discriminant: scenario.discriminant, name: modelName },
  };

  return {
    [modelName]: model,
    [Metadata]: { version: 1 },
  };
}

function createBaseDocument(scenario: MergeScenario): Y.Doc {
  const yDoc = new Y.Doc();
  yDoc.clientID = BASE_CLIENT_ID;
  YjsSchemaMapper.initializeDocumentStructure(yDoc, createSchema(scenario));
  YjsSchemaMapper.setRecord(yDoc, getModelName(scenario), RECORD_ID, scenario.initial);
  return yDoc;
}

function cloneDocument(update: Uint8Array, clientId: number): Y.Doc {
  const yDoc = new Y.Doc();
  yDoc.clientID = clientId;
  Y.applyUpdate(yDoc, update);
  return yDoc;
}

function getSnapshot(yDoc: Y.Doc, scenario: MergeScenario): unknown {
  return YjsSchemaMapper.getRecordSnapshot(yDoc, getModelName(scenario), RECORD_ID);
}

function getSharedValue(yDoc: Y.Doc, scenario: MergeScenario, path: SharedPath): unknown {
  let value: unknown = YjsSchemaMapper.getRecordData(
    yDoc,
    getModelName(scenario),
    RECORD_ID,
  );

  for (const segment of path) {
    if (value instanceof Y.Map && typeof segment === "string") {
      value = value.get(segment);
    } else if (value instanceof Y.Array && typeof segment === "number") {
      value = value.get(segment);
    } else {
      throw new Error(`Cannot resolve shared Yjs value at ${JSON.stringify(path)}`);
    }
  }

  return value;
}

function getSharedArray(
  yDoc: Y.Doc,
  scenario: MergeScenario,
  path: SharedPath,
): Y.Array<unknown> {
  const value = getSharedValue(yDoc, scenario, path);
  if (!(value instanceof Y.Array)) {
    throw new Error(`Expected a Y.Array at ${JSON.stringify(path)}`);
  }
  return value;
}

/**
 * Record operations go through YjsSchemaMapper. Collection-level operations
 * address the Y.Array created by that mapper because it currently exposes
 * whole-array replacement, but not insert/delete/move helpers.
 */
function applyOperation(
  yDoc: Y.Doc,
  scenario: MergeScenario,
  operation: MergeOperation,
): void {
  const modelName = getModelName(scenario);
  switch (operation.kind) {
    case "patch":
      if (!YjsSchemaMapper.updateRecord(yDoc, modelName, RECORD_ID, operation.value)) {
        throw new Error(`Record ${RECORD_ID} does not exist`);
      }
      break;
    case "replaceRecord":
      YjsSchemaMapper.setRecord(yDoc, modelName, RECORD_ID, operation.value);
      break;
    case "arrayDelete":
      getSharedArray(yDoc, scenario, operation.path).delete(
        operation.index,
        operation.length ?? 1,
      );
      break;
    case "arrayInsert":
      getSharedArray(yDoc, scenario, operation.path).insert(
        operation.index,
        [...operation.values],
      );
      break;
    case "arrayReplace": {
      const array = getSharedArray(yDoc, scenario, operation.path);
      if (operation.order === "deleteThenInsert") {
        array.delete(operation.index, 1);
        array.insert(operation.index, [operation.value]);
      } else {
        array.insert(operation.index, [operation.value]);
        array.delete(operation.index + 1, 1);
      }
      break;
    }
    case "arrayMove": {
      const array = getSharedArray(yDoc, scenario, operation.path);
      const value = array.get(operation.sourceIndex);
      array.delete(operation.sourceIndex, 1);
      array.insert(operation.destinationIndex, [value]);
      break;
    }
  }
}

function applyOperations(
  yDoc: Y.Doc,
  scenario: MergeScenario,
  operations: ReadonlyArray<MergeOperation>,
): void {
  yDoc.transact(() => {
    for (const operation of operations) {
      applyOperation(yDoc, scenario, operation);
    }
  });
}

function mergeUpdates(
  baseUpdate: Uint8Array,
  clientId: number,
  updates: ReadonlyArray<Uint8Array>,
): Y.Doc {
  const merged = cloneDocument(baseUpdate, clientId);
  for (const update of updates) {
    Y.applyUpdate(merged, update);
  }
  return merged;
}

function formatValidationFailure(
  scenario: MergeScenario,
  clientIds: typeof CLIENT_ID_ORDERS[number],
  startingState: unknown,
  clientAState: unknown,
  clientBState: unknown,
  mergedState: unknown,
  result: z.ZodSafeParseResult<unknown>,
): string {
  const issues = result.success ? [] : result.error.issues.map(issue => ({
    message: issue.message,
    path: issue.path,
  }));
  const formatState = (state: unknown): string => JSON.stringify(state, null, 2);

  return [
    `Schema-invalid Yjs merge: ${scenario.dataType}/${scenario.name}`,
    `schema=${getSchemaSource(scenario)}; model=${getModelName(scenario)}`,
    `writes=${scenario.writes}; clientIds=${clientIds.label}`,
    "",
    "Starting state:",
    formatState(startingState),
    "",
    "Client A state:",
    formatState(clientAState),
    "",
    "Client B state:",
    formatState(clientBState),
    "",
    "Merged state:",
    formatState(mergedState),
    "",
    "Schema issues:",
    formatState(issues),
  ].join("\n");
}

describe("schema validity after concurrent Yjs merges", () => {
  for (const scenario of SCENARIOS) {
    describe(`[${getSchemaSource(scenario)}] ${scenario.dataType}: ${scenario.name} (${scenario.writes} writes)`, () => {
      it.each(CLIENT_ID_ORDERS)("remains valid with client IDs $label", clientIds => {
        const base = createBaseDocument(scenario);
        const startingState = getSnapshot(base, scenario);
        expect(
          scenario.schema.safeParse(startingState).success,
          "starting state must be valid",
        ).toBe(true);
        const baseUpdate = Y.encodeStateAsUpdate(base);
        const baseStateVector = Y.encodeStateVector(base);
        const clientA = cloneDocument(baseUpdate, clientIds.clientA);
        const clientB = cloneDocument(baseUpdate, clientIds.clientB);

        applyOperations(clientA, scenario, scenario.clientA);
        applyOperations(clientB, scenario, scenario.clientB);

        const localA = getSnapshot(clientA, scenario);
        const localB = getSnapshot(clientB, scenario);
        expect(scenario.schema.safeParse(localA).success, "client A must be locally valid").toBe(
          true,
        );
        expect(scenario.schema.safeParse(localB).success, "client B must be locally valid").toBe(
          true,
        );

        const updateA = Y.encodeStateAsUpdate(clientA, baseStateVector);
        const updateB = Y.encodeStateAsUpdate(clientB, baseStateVector);

        // Merge into both original clients, and into fresh replicas with both
        // possible network delivery orders. All four must converge.
        Y.applyUpdate(clientA, updateB);
        Y.applyUpdate(clientB, updateA);
        const aThenB = mergeUpdates(baseUpdate, 4, [updateA, updateB]);
        const bThenA = mergeUpdates(baseUpdate, 5, [updateB, updateA]);
        const mergedSnapshot = getSnapshot(aThenB, scenario);

        expect(getSnapshot(clientA, scenario)).toEqual(mergedSnapshot);
        expect(getSnapshot(clientB, scenario)).toEqual(mergedSnapshot);
        expect(getSnapshot(bThenA, scenario)).toEqual(mergedSnapshot);

        // Each thrown error is a concrete schema-safety gap, and the case will
        // turn green if its merge behavior is made invariant-preserving.
        const validation = scenario.schema.safeParse(mergedSnapshot);
        if (!validation.success) {
          throw new Error(formatValidationFailure(
            scenario,
            clientIds,
            startingState,
            localA,
            localB,
            mergedSnapshot,
            validation,
          ));
        }
      });
    });
  }
});
