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

import type { DocumentSchema, Model, RecordId } from "@palantir/pack.document-schema.model-types";
import { getMetadata, Metadata } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { z } from "zod";
import * as YjsSchemaMapper from "../service/YjsSchemaMapper.js";

/*
 * Generated SDK source is intentionally kept in type-gen's excluded fixture
 * directory: it is byte-for-byte generator output, which does not satisfy
 * state-core's isolated-declarations build. This non-literal import lets
 * Vitest execute it without adding it to state-core's compilation graph.
 */
const GENERATED_MODELS_MODULE: string = new URL(
  "../../../../document-schema/type-gen/src/utils/schema/__tests__/fixtures/generated-schema-merge/models.ts",
  import.meta.url,
).href;
const { DocumentModel: GeneratedDocumentModel } = await import(GENERATED_MODELS_MODULE) as {
  readonly DocumentModel: DocumentSchema;
};

function getRequiredModel(documentSchema: DocumentSchema, modelName: string): Model {
  const model = documentSchema[modelName];
  if (model == null) {
    throw new Error(`Generated document schema does not contain model ${modelName}`);
  }
  return model;
}

const GENERATED_NODE_SHAPE_MODEL = getRequiredModel(GeneratedDocumentModel, "MergeNodeShape");
const GENERATED_SCENE_NODE_MODEL = getRequiredModel(GeneratedDocumentModel, "MergeSceneNode");

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

interface MergeScenarioBase {
  readonly clientA: ReadonlyArray<MergeOperation>;
  readonly clientB: ReadonlyArray<MergeOperation>;
  readonly initial: Readonly<Record<string, unknown>>;
  readonly name: string;
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

interface GeneratedMergeScenario extends MergeScenarioBase {
  /** The exact generated SDK schema used to initialize the Yjs document. */
  readonly documentSchema: DocumentSchema;
  /** The exact generated model whose schema validates this scenario. */
  readonly model: Model;
}

interface HandAuthoredMergeScenario extends MergeScenarioBase {
  readonly discriminant?: string;
  readonly documentSchema?: undefined;
  readonly modelName?: string;
  readonly schema: z.ZodType<unknown>;
  /**
   * Retained to document broader CRDT behavior, but not run as a structural
   * schema-safety test because generated schemas do not express this invariant.
   */
  readonly validationScope?: "application-invariant";
}

type MergeScenario = GeneratedMergeScenario | HandAuthoredMergeScenario;

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

const GENERATED_SHAPE_INITIAL = {
  items: [{ id: "seed", x: 0, y: 0 }],
  label: "shape",
  payload: "text",
  shapeType: "circle",
  x: 0,
  y: 0,
};

const GENERATED_SCENE_INITIAL = {
  bounds: { height: 10, width: 10, x: 0, y: 0 },
  id: "node",
  points: [{ id: "seed", x: 0, y: 0 }],
  shape: GENERATED_SHAPE_INITIAL,
};

const SCENARIOS: ReadonlyArray<MergeScenario> = [
  {
    dataType: "discriminated union",
    documentSchema: GeneratedDocumentModel,
    model: GENERATED_NODE_SHAPE_MODEL,
    name: "common-field edit while the discriminant changes (control)",
    writes: "1+1",
    initial: GENERATED_SHAPE_INITIAL,
    clientA: [{ kind: "patch", value: { shapeType: "box" } }],
    clientB: [{ kind: "patch", value: { x: 1 } }],
  },
  {
    dataType: "discriminated union",
    documentSchema: GeneratedDocumentModel,
    model: GENERATED_NODE_SHAPE_MODEL,
    name: "discriminant changed while variant payload changes type",
    writes: "1+1",
    initial: GENERATED_SHAPE_INITIAL,
    clientA: [{ kind: "patch", value: { shapeType: "box" } }],
    clientB: [{ kind: "patch", value: { payload: { rich: true } } }],
  },
  {
    dataType: "discriminated union",
    documentSchema: GeneratedDocumentModel,
    model: GENERATED_NODE_SHAPE_MODEL,
    name: "discriminant changed while a newly-required field is deleted",
    writes: "1+1",
    initial: GENERATED_SHAPE_INITIAL,
    clientA: [{ kind: "patch", value: { shapeType: "box" } }],
    clientB: [{ kind: "patch", value: { label: undefined } }],
  },
  {
    dataType: "discriminated union",
    documentSchema: GeneratedDocumentModel,
    model: GENERATED_NODE_SHAPE_MODEL,
    name: "array item schema changes with the discriminant",
    writes: "1+1",
    initial: GENERATED_SHAPE_INITIAL,
    clientA: [{ kind: "patch", value: { shapeType: "box" } }],
    clientB: [{ kind: "arrayInsert", path: ["items"], index: 1, values: ["not-a-point"] }],
  },
  {
    dataType: "nested record",
    documentSchema: GeneratedDocumentModel,
    model: GENERATED_SCENE_NODE_MODEL,
    name: "independent fields in nested bounds (control)",
    writes: "1+1",
    initial: GENERATED_SCENE_INITIAL,
    clientA: [{ kind: "patch", value: { bounds: { x: 1 } } }],
    clientB: [{ kind: "patch", value: { bounds: { y: 2 } } }],
  },
  {
    dataType: "nested record",
    documentSchema: GeneratedDocumentModel,
    model: GENERATED_SCENE_NODE_MODEL,
    name: "discriminated union nested inside a record",
    writes: "1+1",
    initial: GENERATED_SCENE_INITIAL,
    clientA: [{ kind: "patch", value: { shape: { shapeType: "box" } } }],
    clientB: [{ kind: "patch", value: { shape: { payload: { rich: true } } } }],
  },
  {
    dataType: "array of records",
    documentSchema: GeneratedDocumentModel,
    model: GENERATED_SCENE_NODE_MODEL,
    name: "concurrent insertion of records (control)",
    writes: "1+1",
    initial: GENERATED_SCENE_INITIAL,
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
    documentSchema: GeneratedDocumentModel,
    model: GENERATED_SCENE_NODE_MODEL,
    name: "concurrent replacement of one record (control)",
    writes: "2+2",
    initial: GENERATED_SCENE_INITIAL,
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
    validationScope: "application-invariant",
    name: "coupled range endpoints",
    writes: "1+1",
    schema: rangeSchema,
    initial: { lower: 0, upper: 10 },
    clientA: [{ kind: "patch", value: { lower: 8 } }],
    clientB: [{ kind: "patch", value: { upper: 2 } }],
  },
  {
    dataType: "record",
    validationScope: "application-invariant",
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
    validationScope: "application-invariant",
    name: "coupled fields in a nested record",
    writes: "1+1",
    schema: nestedRangeSchema,
    initial: { window: { lower: 0, upper: 10 } },
    clientA: [{ kind: "patch", value: { window: { lower: 8 } } }],
    clientB: [{ kind: "patch", value: { window: { upper: 2 } } }],
  },
  {
    dataType: "record",
    validationScope: "application-invariant",
    name: "coupled entries in a record map",
    writes: "1+1",
    schema: allocationSchema,
    initial: { allocations: { engineering: 40, product: 40 } },
    clientA: [{ kind: "patch", value: { allocations: { engineering: 60 } } }],
    clientB: [{ kind: "patch", value: { allocations: { product: 60 } } }],
  },
  {
    dataType: "record",
    validationScope: "application-invariant",
    name: "conditional field deletion competing with a write",
    writes: "2+1",
    schema: conditionalFieldSchema,
    initial: { mode: "manual", threshold: 1 },
    clientA: [{ kind: "patch", value: { mode: "automatic", threshold: undefined } }],
    clientB: [{ kind: "patch", value: { threshold: 2 } }],
  },
  {
    dataType: "union",
    validationScope: "application-invariant",
    name: "discriminant and payload changed independently",
    writes: "1+1",
    schema: boundedNumberUnionSchema,
    initial: { kind: "nonnegative", value: 5 },
    clientA: [{ kind: "patch", value: { kind: "atMostTen" } }],
    clientB: [{ kind: "patch", value: { value: 20 } }],
  },
  {
    dataType: "union",
    validationScope: "application-invariant",
    name: "whole variant change competing with a payload write",
    writes: "2+1",
    schema: boundedNumberUnionSchema,
    initial: { kind: "nonnegative", value: 5 },
    clientA: [{ kind: "patch", value: { kind: "atMostTen", value: 8 } }],
    clientB: [{ kind: "patch", value: { value: 20 } }],
  },
  {
    dataType: "union",
    validationScope: "application-invariant",
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
    validationScope: "application-invariant",
    name: "distinct deletions from a non-empty array",
    writes: "1+1",
    schema: z.object({ items: z.array(z.string()).min(1) }),
    initial: { items: ["a", "b"] },
    clientA: [{ kind: "arrayDelete", path: ["items"], index: 0 }],
    clientB: [{ kind: "arrayDelete", path: ["items"], index: 1 }],
  },
  {
    dataType: "array",
    validationScope: "application-invariant",
    name: "inserting the same unique value",
    writes: "1+1",
    schema: z.object({ items: uniqueStrings }),
    initial: { items: ["seed"] },
    clientA: [{ kind: "arrayInsert", path: ["items"], index: 1, values: ["duplicate"] }],
    clientB: [{ kind: "arrayInsert", path: ["items"], index: 1, values: ["duplicate"] }],
  },
  {
    dataType: "array",
    validationScope: "application-invariant",
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
    validationScope: "application-invariant",
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
    validationScope: "application-invariant",
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
type ClientIdOrder = typeof CLIENT_ID_ORDERS[number];

function isGeneratedScenario(scenario: MergeScenario): scenario is GeneratedMergeScenario {
  return scenario.documentSchema != null;
}

function isApplicationInvariantScenario(scenario: MergeScenario): boolean {
  return !isGeneratedScenario(scenario) && scenario.validationScope === "application-invariant";
}

function createHandAuthoredModel(
  scenario: HandAuthoredMergeScenario,
): Model<Record<string, unknown>> {
  const modelName = scenario.modelName ?? MODEL_NAME;
  return {
    __type: {},
    zodSchema: scenario.schema as z.ZodType<Record<string, unknown>>,
    [Metadata]: scenario.discriminant == null
      ? { name: modelName }
      : { discriminant: scenario.discriminant, name: modelName },
  } satisfies Model<Record<string, unknown>>;
}

function getModelName(scenario: MergeScenario): string {
  return isGeneratedScenario(scenario)
    ? getMetadata(scenario.model).name
    : scenario.modelName ?? MODEL_NAME;
}

function getSchemaSource(scenario: MergeScenario): "generated SDK" | "hand-authored" {
  return isGeneratedScenario(scenario) ? "generated SDK" : "hand-authored";
}

function getValidationSchema(scenario: MergeScenario): z.ZodType<unknown> {
  return isGeneratedScenario(scenario) ? scenario.model.zodSchema : scenario.schema;
}

function getDocumentSchema(scenario: MergeScenario): DocumentSchema {
  if (isGeneratedScenario(scenario)) {
    const modelName = getModelName(scenario);
    if (scenario.documentSchema[modelName] !== scenario.model) {
      throw new Error(`Generated model ${modelName} does not belong to its document schema`);
    }
    return scenario.documentSchema;
  }

  const model = createHandAuthoredModel(scenario);
  const modelName = getMetadata(model).name;

  return {
    [modelName]: model,
    [Metadata]: { version: 1 },
  };
}

function createBaseDocument(scenario: MergeScenario): Y.Doc {
  const yDoc = new Y.Doc();
  yDoc.clientID = BASE_CLIENT_ID;
  YjsSchemaMapper.initializeDocumentStructure(yDoc, getDocumentSchema(scenario));
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
  clientIds: ClientIdOrder,
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

function runSchemaValidityTest(scenario: MergeScenario, clientIds: ClientIdOrder): void {
  const base = createBaseDocument(scenario);
  const validationSchema = getValidationSchema(scenario);
  const startingState = getSnapshot(base, scenario);
  expect(
    validationSchema.safeParse(startingState).success,
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
  expect(validationSchema.safeParse(localA).success, "client A must be locally valid").toBe(true);
  expect(validationSchema.safeParse(localB).success, "client B must be locally valid").toBe(true);

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

  // Each thrown error is a concrete structural schema-safety gap, and the
  // case will turn green if its merge behavior is made shape-preserving.
  const validation = validationSchema.safeParse(mergedSnapshot);
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
}

describe("structural schema validity after concurrent Yjs merges", () => {
  for (const scenario of SCENARIOS) {
    describe(`[${getSchemaSource(scenario)}] ${scenario.dataType}: ${scenario.name} (${scenario.writes} writes)`, () => {
      for (const clientIds of CLIENT_ID_ORDERS) {
        const testName = `remains valid with client IDs '${clientIds.label}'`;
        if (isApplicationInvariantScenario(scenario)) {
          it.todo(testName);
        } else {
          it(testName, () => runSchemaValidityTest(scenario, clientIds));
        }
      }
    });
  }
});
