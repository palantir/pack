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

import type {
  DocumentSchema,
  UpgradeRegistryMap,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  addDocumentUpdateSchemaVersionToTransaction,
  getDocumentUpdateSchemaVersionFromTransaction,
  getModelDataSchemaVersion,
  getPartialModelDataSchemaVersion,
} from "../service/DocumentUpdateSchemaVersion.js";

const upgrades: UpgradeRegistryMap = {
  Activity: {
    modelName: "Activity",
    allFields: {
      newShape: { type: { kind: "modelRef", model: "NodeShape" }, addedInVersion: 1 },
      title: { type: { kind: "primitive" }, addedInVersion: 1 },
    },
    steps: [],
  },
  ShapeBox: {
    modelName: "ShapeBox",
    allFields: {
      color: { type: { kind: "primitive" }, addedInVersion: 1 },
      fillColor: { type: { kind: "primitive" }, addedInVersion: 2 },
      opacity: { type: { kind: "primitive" }, addedInVersion: 3 },
    },
    steps: [],
  },
  ShapeCircle: {
    modelName: "ShapeCircle",
    allFields: {
      radius: { type: { kind: "primitive" }, addedInVersion: 1 },
    },
    steps: [],
  },
  NodeShape: {
    modelName: "NodeShape",
    discriminant: "shapeType",
    variants: {
      box: "ShapeBox",
      circle: "ShapeCircle",
    },
  },
};

const schema = {
  [Metadata]: {
    minSupportedVersion: 1,
    upgrades,
    version: 3,
  },
} as DocumentSchema;

describe("DocumentUpdateSchemaVersion", () => {
  it("uses the max addedInVersion across changed top-level fields", () => {
    expect(
      getPartialModelDataSchemaVersion(schema, "ShapeBox", {
        color: "red",
        opacity: 0.5,
      }),
    ).toBe(3);
  });

  it("recurses through model refs and unions", () => {
    expect(
      getModelDataSchemaVersion(schema, "Activity", {
        newShape: {
          fillColor: "red",
          shapeType: "box",
        },
        title: "added",
      }),
    ).toBe(2);
  });

  it("resolves a partial nested union from the current value", () => {
    expect(
      getPartialModelDataSchemaVersion(
        schema,
        "Activity",
        {
          newShape: {
            fillColor: "blue",
          },
        },
        {
          newShape: {
            color: "red",
            shapeType: "box",
          },
          title: "existing",
        },
      ),
    ).toBe(2);
  });

  it("resolves a partial root union from the current value", () => {
    expect(
      getPartialModelDataSchemaVersion(
        schema,
        "NodeShape",
        {
          opacity: 0.5,
        },
        {
          color: "red",
          shapeType: "box",
        },
      ),
    ).toBe(3);
  });

  it("stores the max write version on a Yjs transaction", () => {
    const yDoc = new Y.Doc();
    let transaction: Y.Transaction | undefined;

    yDoc.on("update", (_update, _origin, _doc, updateTransaction) => {
      transaction = updateTransaction;
    });

    yDoc.transact(activeTransaction => {
      addDocumentUpdateSchemaVersionToTransaction(activeTransaction, 2);
      addDocumentUpdateSchemaVersionToTransaction(activeTransaction, 3);
      yDoc.getMap("ShapeBox").set("shape-1", new Y.Map());
    });

    expect(transaction).toBeDefined();
    expect(getDocumentUpdateSchemaVersionFromTransaction(transaction!)).toBe(3);
  });
});
