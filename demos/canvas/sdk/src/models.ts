import type { DocumentSchema, RecordModel, UnionModel } from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import type { NodeShape, NodeShapeBox, NodeShapeCircle, ShapeBox, ShapeCircle } from "./types.js";
import { NodeShapeBoxSchema, NodeShapeCircleSchema, NodeShapeSchema, ShapeBoxSchema, ShapeCircleSchema } from "./schema.js";

export interface ShapeBoxModel extends RecordModel<ShapeBox, typeof ShapeBoxSchema> {}
export const ShapeBoxModel: ShapeBoxModel = {
  __type: {} as ShapeBox,
  zodSchema: ShapeBoxSchema,
  [Metadata]: {
    name: "ShapeBox",
  },
};

export interface ShapeCircleModel extends RecordModel<ShapeCircle, typeof ShapeCircleSchema> {}
export const ShapeCircleModel: ShapeCircleModel = {
  __type: {} as ShapeCircle,
  zodSchema: ShapeCircleSchema,
  [Metadata]: {
    name: "ShapeCircle",
  },
};

export interface NodeShapeModel extends UnionModel<NodeShape, typeof NodeShapeSchema> {}
export const NodeShapeModel: NodeShapeModel = {
  __type: {} as NodeShape,
  zodSchema: NodeShapeSchema,
  [Metadata]: {
    discriminant: "shapeType",
    name: "NodeShape",
  },
};

export interface NodeShapeBoxModel extends UnionModel<NodeShapeBox, typeof NodeShapeBoxSchema> {}
export const NodeShapeBoxModel: NodeShapeBoxModel = {
  __type: {} as NodeShapeBox,
  zodSchema: NodeShapeBoxSchema,
  [Metadata]: {
    discriminant: "shapeType",
    name: "NodeShapeBox",
  },
};

export interface NodeShapeCircleModel extends UnionModel<NodeShapeCircle, typeof NodeShapeCircleSchema> {}
export const NodeShapeCircleModel: NodeShapeCircleModel = {
  __type: {} as NodeShapeCircle,
  zodSchema: NodeShapeCircleSchema,
  [Metadata]: {
    discriminant: "shapeType",
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
