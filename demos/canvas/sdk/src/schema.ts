import type { ZodType } from "zod";
import { z } from 'zod';
import type { NodeShape, NodeShapeBox, NodeShapeCircle, ShapeBox, ShapeCircle } from "./types.js";

export const ShapeBoxSchema = z.object({
  bottom: z.number(),
  left: z.number(),
  right: z.number(),
  top: z.number(),
  color: z.string().optional()
}) satisfies ZodType<ShapeBox>;

export const ShapeCircleSchema = z.object({
  bottom: z.number(),
  left: z.number(),
  right: z.number(),
  top: z.number(),
  color: z.string().optional()
}) satisfies ZodType<ShapeCircle>;

export const NodeShapeBoxSchema = ShapeBoxSchema.extend({
  shapeType: z.literal("box")
}) satisfies ZodType<NodeShapeBox>;

export const NodeShapeCircleSchema = ShapeCircleSchema.extend({
  shapeType: z.literal("circle")
}) satisfies ZodType<NodeShapeCircle>;

export const NodeShapeSchema = z.discriminatedUnion("shapeType", [
  NodeShapeBoxSchema,
  NodeShapeCircleSchema
]) satisfies ZodType<NodeShape>;
