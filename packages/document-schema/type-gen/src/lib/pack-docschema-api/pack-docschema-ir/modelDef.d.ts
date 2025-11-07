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

import type { IRecordDef } from "./recordDef";
import type { IUnionDef } from "./unionDef";
export interface IModelDef_Record {
  readonly "record": IRecordDef;
  readonly "type": "record";
}
export interface IModelDef_Union {
  readonly "union": IUnionDef;
  readonly "type": "union";
}
declare function isRecord(obj: IModelDef): obj is IModelDef_Record;
declare function record(obj: IRecordDef): IModelDef_Record;
declare function isUnion(obj: IModelDef): obj is IModelDef_Union;
declare function union(obj: IUnionDef): IModelDef_Union;
export type IModelDef = IModelDef_Record | IModelDef_Union;
export interface IModelDefVisitor<T> {
  readonly "record": (obj: IRecordDef) => T;
  readonly "union": (obj: IUnionDef) => T;
  readonly "unknown": (obj: IModelDef) => T;
}
declare function visit<T>(obj: IModelDef, visitor: IModelDefVisitor<T>): T;
export declare const IModelDef: {
  isRecord: typeof isRecord;
  record: typeof record;
  isUnion: typeof isUnion;
  union: typeof union;
  visit: typeof visit;
};
export {};
