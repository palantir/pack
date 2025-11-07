import { IRecordDef } from "./recordDef";
import { IUnionDef } from "./unionDef";
export interface IModelDef_Record {
    readonly 'record': IRecordDef;
    readonly 'type': "record";
}
export interface IModelDef_Union {
    readonly 'union': IUnionDef;
    readonly 'type': "union";
}
declare function isRecord(obj: IModelDef): obj is IModelDef_Record;
declare function record(obj: IRecordDef): IModelDef_Record;
declare function isUnion(obj: IModelDef): obj is IModelDef_Union;
declare function union(obj: IUnionDef): IModelDef_Union;
export type IModelDef = IModelDef_Record | IModelDef_Union;
export interface IModelDefVisitor<T> {
    readonly 'record': (obj: IRecordDef) => T;
    readonly 'union': (obj: IUnionDef) => T;
    readonly 'unknown': (obj: IModelDef) => T;
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
