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

import type { IFieldTypeCollection } from "./fieldTypeCollection";
import type { IFieldTypeMap } from "./fieldTypeMap";
import type * as IFieldValueUnion from "./fieldValueUnion";
export interface IFieldTypeUnion_Array {
  readonly "array": IFieldTypeCollection;
  readonly "type": "array";
}
export interface IFieldTypeUnion_Map {
  readonly "map": IFieldTypeMap;
  readonly "type": "map";
}
export interface IFieldTypeUnion_Set {
  readonly "set": IFieldTypeCollection;
  readonly "type": "set";
}
export interface IFieldTypeUnion_Value {
  readonly "value": IFieldValueUnion.IFieldValueUnion;
  readonly "type": "value";
}
declare function isArray(obj: IFieldTypeUnion): obj is IFieldTypeUnion_Array;
declare function array(obj: IFieldTypeCollection): IFieldTypeUnion_Array;
declare function isMap(obj: IFieldTypeUnion): obj is IFieldTypeUnion_Map;
declare function map(obj: IFieldTypeMap): IFieldTypeUnion_Map;
declare function isSet(obj: IFieldTypeUnion): obj is IFieldTypeUnion_Set;
declare function set(obj: IFieldTypeCollection): IFieldTypeUnion_Set;
declare function isValue(obj: IFieldTypeUnion): obj is IFieldTypeUnion_Value;
declare function value(obj: IFieldValueUnion.IFieldValueUnion): IFieldTypeUnion_Value;
export type IFieldTypeUnion =
  | IFieldTypeUnion_Array
  | IFieldTypeUnion_Map
  | IFieldTypeUnion_Set
  | IFieldTypeUnion_Value;
export interface IFieldTypeUnionVisitor<T> {
  readonly "array": (obj: IFieldTypeCollection) => T;
  readonly "map": (obj: IFieldTypeMap) => T;
  readonly "set": (obj: IFieldTypeCollection) => T;
  readonly "value": (obj: IFieldValueUnion.IFieldValueUnion) => T;
  readonly "unknown": (obj: IFieldTypeUnion) => T;
}
declare function visit<T>(obj: IFieldTypeUnion, visitor: IFieldTypeUnionVisitor<T>): T;
export declare const IFieldTypeUnion: {
  isArray: typeof isArray;
  array: typeof array;
  isMap: typeof isMap;
  map: typeof map;
  isSet: typeof isSet;
  set: typeof set;
  isValue: typeof isValue;
  value: typeof value;
  visit: typeof visit;
};
export {};
