import type { DocumentSchema, Model } from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import type { NodeShape, NodeShapeBox, NodeShapeCircle, ShapeBox, ShapeCircle } from "./types.js";
import { NodeShapeBoxSchema, NodeShapeCircleSchema, NodeShapeSchema, ShapeBoxSchema, ShapeCircleSchema } from "./schema.js";

export interface ShapeBoxModel extends Model<ShapeBox, typeof ShapeBoxSchema> {}
export const ShapeBoxModel: ShapeBoxModel = {
  __type: {} as ShapeBox,
  zodSchema: ShapeBoxSchema,
  [Metadata]: {
    name: "ShapeBox",
  },
};

export interface ShapeCircleModel extends Model<ShapeCircle, typeof ShapeCircleSchema> {}
export const ShapeCircleModel: ShapeCircleModel = {
  __type: {} as ShapeCircle,
  zodSchema: ShapeCircleSchema,
  [Metadata]: {
    name: "ShapeCircle",
  },
};

export interface NodeShapeModel extends Model<NodeShape, typeof NodeShapeSchema> {}
export const NodeShapeModel: NodeShapeModel = {
  __type: {} as NodeShape,
  zodSchema: NodeShapeSchema,
  [Metadata]: {
    name: "NodeShape",
  },
};

export interface NodeShapeBoxModel extends Model<NodeShapeBox, typeof NodeShapeBoxSchema> {}
export const NodeShapeBoxModel: NodeShapeBoxModel = {
  __type: {} as NodeShapeBox,
  zodSchema: NodeShapeBoxSchema,
  [Metadata]: {
    name: "NodeShapeBox",
  },
};

export interface NodeShapeCircleModel extends Model<NodeShapeCircle, typeof NodeShapeCircleSchema> {}
export const NodeShapeCircleModel: NodeShapeCircleModel = {
  __type: {} as NodeShapeCircle,
  zodSchema: NodeShapeCircleSchema,
  [Metadata]: {
    name: "NodeShapeCircle",
  },
};

export const DocumentModel = {
  ShapeBox: ShapeBoxModel,
  ShapeCircle: ShapeCircleModel,
  NodeShape: NodeShapeModel,
  NodeShapeBox: NodeShapeBoxModel,
  NodeShapeCircle: NodeShapeCircleModel,
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema;

 export type DocumentModel = typeof DocumentModel;
