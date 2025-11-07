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

import type { IFieldValueDatetime } from "./fieldValueDatetime";
import type { IFieldValueDocumentRef } from "./fieldValueDocumentRef";
import type { IFieldValueDouble } from "./fieldValueDouble";
import type { IFieldValueInteger } from "./fieldValueInteger";
import type { IFieldValueMediaRef } from "./fieldValueMediaRef";
import type { IFieldValueModelRef } from "./fieldValueModelRef";
import type { IFieldValueObjectRef } from "./fieldValueObjectRef";
import type { IFieldValueString } from "./fieldValueString";
import type { IFieldValueText } from "./fieldValueText";
import type { IFieldValueUnmanagedJson } from "./fieldValueUnmanagedJson";
import type { IFieldValueUserRef } from "./fieldValueUserRef";
export interface IFieldValueUnion_Datetime {
  readonly "datetime": IFieldValueDatetime;
  readonly "type": "datetime";
}
export interface IFieldValueUnion_DocRef {
  readonly "docRef": IFieldValueDocumentRef;
  readonly "type": "docRef";
}
export interface IFieldValueUnion_Double {
  readonly "double": IFieldValueDouble;
  readonly "type": "double";
}
export interface IFieldValueUnion_Integer {
  readonly "integer": IFieldValueInteger;
  readonly "type": "integer";
}
export interface IFieldValueUnion_MediaRef {
  readonly "mediaRef": IFieldValueMediaRef;
  readonly "type": "mediaRef";
}
export interface IFieldValueUnion_ModelRef {
  readonly "modelRef": IFieldValueModelRef;
  readonly "type": "modelRef";
}
export interface IFieldValueUnion_Object {
  readonly "object": IFieldValueObjectRef;
  readonly "type": "object";
}
export interface IFieldValueUnion_String {
  readonly "string": IFieldValueString;
  readonly "type": "string";
}
export interface IFieldValueUnion_Text {
  readonly "text": IFieldValueText;
  readonly "type": "text";
}
export interface IFieldValueUnion_UnmanagedJson {
  readonly "unmanagedJson": IFieldValueUnmanagedJson;
  readonly "type": "unmanagedJson";
}
export interface IFieldValueUnion_UserRef {
  readonly "userRef": IFieldValueUserRef;
  readonly "type": "userRef";
}
declare function isDatetime(obj: IFieldValueUnion): obj is IFieldValueUnion_Datetime;
declare function datetime(obj: IFieldValueDatetime): IFieldValueUnion_Datetime;
declare function isDocRef(obj: IFieldValueUnion): obj is IFieldValueUnion_DocRef;
declare function docRef(obj: IFieldValueDocumentRef): IFieldValueUnion_DocRef;
declare function isDouble(obj: IFieldValueUnion): obj is IFieldValueUnion_Double;
declare function double(obj: IFieldValueDouble): IFieldValueUnion_Double;
declare function isInteger(obj: IFieldValueUnion): obj is IFieldValueUnion_Integer;
declare function integer(obj: IFieldValueInteger): IFieldValueUnion_Integer;
declare function isMediaRef(obj: IFieldValueUnion): obj is IFieldValueUnion_MediaRef;
declare function mediaRef(obj: IFieldValueMediaRef): IFieldValueUnion_MediaRef;
declare function isModelRef(obj: IFieldValueUnion): obj is IFieldValueUnion_ModelRef;
declare function modelRef(obj: IFieldValueModelRef): IFieldValueUnion_ModelRef;
declare function isObject(obj: IFieldValueUnion): obj is IFieldValueUnion_Object;
declare function object(obj: IFieldValueObjectRef): IFieldValueUnion_Object;
declare function isString(obj: IFieldValueUnion): obj is IFieldValueUnion_String;
declare function string(obj: IFieldValueString): IFieldValueUnion_String;
declare function isText(obj: IFieldValueUnion): obj is IFieldValueUnion_Text;
declare function text(obj: IFieldValueText): IFieldValueUnion_Text;
declare function isUnmanagedJson(obj: IFieldValueUnion): obj is IFieldValueUnion_UnmanagedJson;
declare function unmanagedJson(obj: IFieldValueUnmanagedJson): IFieldValueUnion_UnmanagedJson;
declare function isUserRef(obj: IFieldValueUnion): obj is IFieldValueUnion_UserRef;
declare function userRef(obj: IFieldValueUserRef): IFieldValueUnion_UserRef;
export type IFieldValueUnion =
  | IFieldValueUnion_Datetime
  | IFieldValueUnion_DocRef
  | IFieldValueUnion_Double
  | IFieldValueUnion_Integer
  | IFieldValueUnion_MediaRef
  | IFieldValueUnion_ModelRef
  | IFieldValueUnion_Object
  | IFieldValueUnion_String
  | IFieldValueUnion_Text
  | IFieldValueUnion_UnmanagedJson
  | IFieldValueUnion_UserRef;
export interface IFieldValueUnionVisitor<T> {
  readonly "datetime": (obj: IFieldValueDatetime) => T;
  readonly "docRef": (obj: IFieldValueDocumentRef) => T;
  readonly "double": (obj: IFieldValueDouble) => T;
  readonly "integer": (obj: IFieldValueInteger) => T;
  readonly "mediaRef": (obj: IFieldValueMediaRef) => T;
  readonly "modelRef": (obj: IFieldValueModelRef) => T;
  readonly "object": (obj: IFieldValueObjectRef) => T;
  readonly "string": (obj: IFieldValueString) => T;
  readonly "text": (obj: IFieldValueText) => T;
  readonly "unmanagedJson": (obj: IFieldValueUnmanagedJson) => T;
  readonly "userRef": (obj: IFieldValueUserRef) => T;
  readonly "unknown": (obj: IFieldValueUnion) => T;
}
declare function visit<T>(obj: IFieldValueUnion, visitor: IFieldValueUnionVisitor<T>): T;
export declare const IFieldValueUnion: {
  isDatetime: typeof isDatetime;
  datetime: typeof datetime;
  isDocRef: typeof isDocRef;
  docRef: typeof docRef;
  isDouble: typeof isDouble;
  double: typeof double;
  isInteger: typeof isInteger;
  integer: typeof integer;
  isMediaRef: typeof isMediaRef;
  mediaRef: typeof mediaRef;
  isModelRef: typeof isModelRef;
  modelRef: typeof modelRef;
  isObject: typeof isObject;
  object: typeof object;
  isString: typeof isString;
  string: typeof string;
  isText: typeof isText;
  text: typeof text;
  isUnmanagedJson: typeof isUnmanagedJson;
  unmanagedJson: typeof unmanagedJson;
  isUserRef: typeof isUserRef;
  userRef: typeof userRef;
  visit: typeof visit;
};
export {};
