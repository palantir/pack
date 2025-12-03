// Generated TypeScript interfaces from document schema

/**
 * A box.
 */
export interface ShapeBox {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly color?: string;
}

/**
 * A circle.
 */
export interface ShapeCircle {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly color?: string;
}

export interface NodeShapeBox extends ShapeBox {
  readonly shapeType: "box";
}

export interface NodeShapeCircle extends ShapeCircle {
  readonly shapeType: "circle";
}

export type NodeShape = NodeShapeBox | NodeShapeCircle;

export function isNodeShapeBox(value: NodeShape): value is NodeShapeBox {
  return value.shapeType === "box";
}

export function isNodeShapeCircle(value: NodeShape): value is NodeShapeCircle {
  return value.shapeType === "circle";
}

