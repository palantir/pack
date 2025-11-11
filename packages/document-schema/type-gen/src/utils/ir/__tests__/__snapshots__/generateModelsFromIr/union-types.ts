import type {
  DocumentSchema,
  Model,
} from '@palantir/pack.document-schema.model-types';
import { Metadata } from '@palantir/pack.document-schema.model-types';
import type {
  Node,
  NodeObject,
  NodeTextBox,
  ObjectNode,
  TextBox,
} from './types.js';
import {
  NodeObjectSchema,
  NodeSchema,
  NodeTextBoxSchema,
  ObjectNodeSchema,
  TextBoxSchema,
} from './schema.js';

export interface ObjectNodeModel
  extends Model<ObjectNode, typeof ObjectNodeSchema> {}
export const ObjectNodeModel: ObjectNodeModel = {
  __type: {} as ObjectNode,
  zodSchema: ObjectNodeSchema,
  [Metadata]: {
    name: 'ObjectNode',
  },
};

export interface TextBoxModel extends Model<TextBox, typeof TextBoxSchema> {}
export const TextBoxModel: TextBoxModel = {
  __type: {} as TextBox,
  zodSchema: TextBoxSchema,
  [Metadata]: {
    name: 'TextBox',
  },
};

export interface NodeModel extends Model<Node, typeof NodeSchema> {}
export const NodeModel: NodeModel = {
  __type: {} as Node,
  zodSchema: NodeSchema,
  [Metadata]: {
    name: 'Node',
  },
};

export interface NodeObjectModel
  extends Model<NodeObject, typeof NodeObjectSchema> {}
export const NodeObjectModel: NodeObjectModel = {
  __type: {} as NodeObject,
  zodSchema: NodeObjectSchema,
  [Metadata]: {
    name: 'NodeObject',
  },
};

export interface NodeTextBoxModel
  extends Model<NodeTextBox, typeof NodeTextBoxSchema> {}
export const NodeTextBoxModel: NodeTextBoxModel = {
  __type: {} as NodeTextBox,
  zodSchema: NodeTextBoxSchema,
  [Metadata]: {
    name: 'NodeTextBox',
  },
};

export const DocumentModel = {
  ObjectNode: ObjectNodeModel,
  TextBox: TextBoxModel,
  Node: NodeModel,
  NodeObject: NodeObjectModel,
  NodeTextBox: NodeTextBoxModel,
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema;

export type DocumentModel = typeof DocumentModel;
