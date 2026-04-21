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

/** Two-version schema with field removal (color → fillColor + strokeColor + opacity) */
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

/** Three-version chain: Item (name, color → name, hexColor → name, hexColor, tags) */
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
      previous: { type: "initial", models: v1Models },
    },
  };
})();

/** Schema with records and a union */
export const unionSchema: SchemaDefinition = defineSchema({
  ShapeBox: defineRecord("ShapeBox", {
    docs: "",
    fields: {
      left: P.Double,
      color: P.Optional(P.String),
    },
  }),
  ShapeCircle: defineRecord("ShapeCircle", {
    docs: "",
    fields: {
      radius: P.Double,
      color: P.Optional(P.String),
    },
  }),
  NodeShape: defineUnion("NodeShape", {
    docs: "",
    discriminant: "shapeType",
    variants: {
      box: defineRecord("ShapeBox", {
        docs: "",
        fields: {
          left: P.Double,
          color: P.Optional(P.String),
        },
      }),
      circle: defineRecord("ShapeCircle", {
        docs: "",
        fields: {
          radius: P.Double,
          color: P.Optional(P.String),
        },
      }),
    },
  }),
});
