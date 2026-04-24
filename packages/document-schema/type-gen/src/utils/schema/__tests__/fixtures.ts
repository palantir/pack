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

import type { SchemaBuilder, SchemaDefinition } from "@palantir/pack.schema";
import {
  defineRecord,
  defineSchema,
  defineSchemaUpdate,
  defineUnion,
  modelToRef,
  nextSchema,
} from "@palantir/pack.schema";
import * as P from "@palantir/pack.schema";

/** Single-version schema: ShapeBox with 5 fields */
const singleVersionModels = {
  ShapeBox: defineRecord("ShapeBox", {
    docs: "A box shape",
    fields: {
      left: P.Double,
      right: P.Double,
      top: P.Double,
      bottom: P.Double,
      color: P.Optional(P.String),
    },
  }),
};
const singleVersionSchemaNarrow = defineSchema(singleVersionModels);
export const singleVersionSchema: SchemaDefinition = singleVersionSchemaNarrow;

/** Two-version schema with field removal (color removed, fillColor + strokeColor + opacity added) */
export const twoVersionFieldRemovalSchema: SchemaDefinition = {
  type: "versioned",
  models: {
    ShapeBox: defineRecord("ShapeBox", {
      docs: "A box shape",
      fields: {
        left: P.Double,
        right: P.Double,
        top: P.Double,
        bottom: P.Double,
        fillColor: P.Optional(P.String),
        strokeColor: P.Optional(P.String),
        opacity: P.Optional(P.Double),
      },
    }),
  },
  version: 2,
  previous: singleVersionSchema,
};

/** Two-version schema with additive change only (adds fillColor) */
const addFillColorUpdate = defineSchemaUpdate(
  "addFillColor",
  (schema: SchemaBuilder<typeof singleVersionModels>) => ({
    ShapeBox: schema.ShapeBox
      .addField("fillColor", P.Optional(P.String))
      .build(),
  }),
);

export const twoVersionAdditiveSchema: SchemaDefinition = nextSchema(singleVersionSchemaNarrow)
  .addSchemaUpdate(addFillColorUpdate)
  .build();

/** Schema with ref fields: tests import paths for record refs, DocumentRef, UserRef */
const CircleRecord = defineRecord("Circle", {
  docs: "A circle",
  fields: {
    radius: P.Double,
  },
});

const DocRef: P.DocRef = { type: "docRef" };
const UserRefField: P.UserRef = { type: "userRef" };

export const refFieldsSchema: SchemaDefinition = defineSchema({
  Circle: CircleRecord,
  Drawing: defineRecord("Drawing", {
    docs: "A drawing with references",
    fields: {
      mainShape: CircleRecord,
      extraShapes: P.Array(modelToRef(CircleRecord)),
      background: P.Optional(modelToRef(CircleRecord)),
      attachment: DocRef,
      owner: P.Optional(UserRefField),
    },
  }),
});

/** Schema with union types: tests union variant interfaces, discriminated union, and type guards */
const RectangleRecord = defineRecord("Rectangle", {
  docs: "A rectangle",
  fields: {
    width: P.Double,
    height: P.Double,
  },
});

export const unionTypesSchema: SchemaDefinition = defineSchema({
  Circle: CircleRecord,
  Rectangle: RectangleRecord,
  Shape: defineUnion("Shape", {
    docs: "A shape",
    variants: {
      circle: CircleRecord,
      rectangle: RectangleRecord,
    },
  }),
});

/** Schema with nested optionals: tests that optional inside array/nested structures is preserved */
export const nestedOptionalsSchema: SchemaDefinition = defineSchema({
  Config: defineRecord("Config", {
    docs: "A config with nested optional fields",
    fields: {
      tags: P.Array(P.Optional(P.String)),
      matrix: P.Array(P.Array(P.Optional(P.Double))),
      label: P.Optional(P.String),
      // Sparse 3D point cloud: pages of rows where each row may omit coordinate triples
      pointCloud: P.Array(P.Array(P.Optional(P.Array(P.Double)))),
    },
  }),
});

/** Two-version schema with derived fields (color split into fillColor + strokeColor) */
export const twoVersionDerivedFieldsSchema: SchemaDefinition = {
  type: "versioned",
  models: {
    ShapeBox: defineRecord("ShapeBox", {
      docs: "A box shape",
      fields: {
        left: P.Double,
        right: P.Double,
        top: P.Double,
        bottom: P.Double,
        fillColor: P.Optional(P.String),
        strokeColor: P.Optional(P.String),
        opacity: P.Optional(P.Double),
      },
    }),
  },
  version: 2,
  previous: singleVersionSchema,
  migrations: {
    ShapeBox: {
      fillColor: {
        derivedFrom: ["color"],
        forward: ({ color }: Record<string, unknown>) => color,
      },
      strokeColor: {
        derivedFrom: ["color"],
        forward: ({ color }: Record<string, unknown>) => color,
      },
    },
  },
};

/** Three-version chain: Item (name, color -> name, hexColor -> name, hexColor, tags) */
export const threeVersionChainSchema: SchemaDefinition = (() => {
  const v1Models = {
    Item: defineRecord("Item", {
      docs: "",
      fields: {
        name: P.String,
        color: P.Optional(P.String),
      },
    }),
  };
  const v2Models = {
    Item: defineRecord("Item", {
      docs: "",
      fields: {
        name: P.String,
        hexColor: P.Optional(P.String),
      },
    }),
  };
  const v3Models = {
    Item: defineRecord("Item", {
      docs: "",
      fields: {
        name: P.String,
        hexColor: P.Optional(P.String),
        tags: P.Optional(P.String),
      },
    }),
  };
  return {
    type: "versioned",
    models: v3Models,
    version: 3,
    previous: {
      type: "versioned",
      models: v2Models,
      version: 2,
      previous: { type: "initial", version: 1, models: v1Models },
    },
  };
})();
