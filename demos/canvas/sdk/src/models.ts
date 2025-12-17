import type { DocumentSchema, RecordModel, UnionModel } from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import type { ActivityEvent, ActivityEventShapeAdd, ActivityEventShapeDelete, ActivityEventShapeUpdate, ActivityShapeAddEvent, ActivityShapeDeleteEvent, ActivityShapeUpdateEvent, NodeShape, NodeShapeBox, NodeShapeCircle, ShapeBox, ShapeCircle } from "./types.js";
import { ActivityEventSchema, ActivityEventShapeAddSchema, ActivityEventShapeDeleteSchema, ActivityEventShapeUpdateSchema, ActivityShapeAddEventSchema, ActivityShapeDeleteEventSchema, ActivityShapeUpdateEventSchema, NodeShapeBoxSchema, NodeShapeCircleSchema, NodeShapeSchema, ShapeBoxSchema, ShapeCircleSchema } from "./schema.js";

export interface ActivityShapeAddEventModel extends RecordModel<ActivityShapeAddEvent, typeof ActivityShapeAddEventSchema> {}
export const ActivityShapeAddEventModel: ActivityShapeAddEventModel = {
  __type: {} as ActivityShapeAddEvent,
  zodSchema: ActivityShapeAddEventSchema,
  [Metadata]: {
    name: "ActivityShapeAddEvent",
  },
};

export interface ActivityShapeDeleteEventModel extends RecordModel<ActivityShapeDeleteEvent, typeof ActivityShapeDeleteEventSchema> {}
export const ActivityShapeDeleteEventModel: ActivityShapeDeleteEventModel = {
  __type: {} as ActivityShapeDeleteEvent,
  zodSchema: ActivityShapeDeleteEventSchema,
  [Metadata]: {
    name: "ActivityShapeDeleteEvent",
  },
};

export interface ActivityShapeUpdateEventModel extends RecordModel<ActivityShapeUpdateEvent, typeof ActivityShapeUpdateEventSchema> {}
export const ActivityShapeUpdateEventModel: ActivityShapeUpdateEventModel = {
  __type: {} as ActivityShapeUpdateEvent,
  zodSchema: ActivityShapeUpdateEventSchema,
  [Metadata]: {
    name: "ActivityShapeUpdateEvent",
  },
};

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

export interface ActivityEventModel extends UnionModel<ActivityEvent, typeof ActivityEventSchema> {}
export const ActivityEventModel: ActivityEventModel = {
  __type: {} as ActivityEvent,
  zodSchema: ActivityEventSchema,
  [Metadata]: {
    discriminant: "eventType",
    name: "ActivityEvent",
  },
};

export interface ActivityEventShapeAddModel extends UnionModel<ActivityEventShapeAdd, typeof ActivityEventShapeAddSchema> {}
export const ActivityEventShapeAddModel: ActivityEventShapeAddModel = {
  __type: {} as ActivityEventShapeAdd,
  zodSchema: ActivityEventShapeAddSchema,
  [Metadata]: {
    discriminant: "eventType",
    name: "ActivityEventShapeAdd",
  },
};

export interface ActivityEventShapeDeleteModel extends UnionModel<ActivityEventShapeDelete, typeof ActivityEventShapeDeleteSchema> {}
export const ActivityEventShapeDeleteModel: ActivityEventShapeDeleteModel = {
  __type: {} as ActivityEventShapeDelete,
  zodSchema: ActivityEventShapeDeleteSchema,
  [Metadata]: {
    discriminant: "eventType",
    name: "ActivityEventShapeDelete",
  },
};

export interface ActivityEventShapeUpdateModel extends UnionModel<ActivityEventShapeUpdate, typeof ActivityEventShapeUpdateSchema> {}
export const ActivityEventShapeUpdateModel: ActivityEventShapeUpdateModel = {
  __type: {} as ActivityEventShapeUpdate,
  zodSchema: ActivityEventShapeUpdateSchema,
  [Metadata]: {
    discriminant: "eventType",
    name: "ActivityEventShapeUpdate",
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
  ActivityShapeAddEvent: ActivityShapeAddEventModel,
  ActivityShapeDeleteEvent: ActivityShapeDeleteEventModel,
  ActivityShapeUpdateEvent: ActivityShapeUpdateEventModel,
  ShapeBox: ShapeBoxModel,
  ShapeCircle: ShapeCircleModel,
  ActivityEvent: ActivityEventModel,
  ActivityEventShapeAdd: ActivityEventShapeAddModel,
  ActivityEventShapeDelete: ActivityEventShapeDeleteModel,
  ActivityEventShapeUpdate: ActivityEventShapeUpdateModel,
  NodeShape: NodeShapeModel,
  NodeShapeBox: NodeShapeBoxModel,
  NodeShapeCircle: NodeShapeCircleModel,
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema;

 export type DocumentModel = typeof DocumentModel;
