import { IFieldTypeCollection } from "./fieldTypeCollection";
import { IFieldTypeMap } from "./fieldTypeMap";
import * as IFieldValueUnion from "./fieldValueUnion";
export interface IFieldTypeUnion_Array {
    readonly 'array': IFieldTypeCollection;
    readonly 'type': "array";
}
export interface IFieldTypeUnion_Map {
    readonly 'map': IFieldTypeMap;
    readonly 'type': "map";
}
export interface IFieldTypeUnion_Set {
    readonly 'set': IFieldTypeCollection;
    readonly 'type': "set";
}
export interface IFieldTypeUnion_Value {
    readonly 'value': IFieldValueUnion.IFieldValueUnion;
    readonly 'type': "value";
}
declare function isArray(obj: IFieldTypeUnion): obj is IFieldTypeUnion_Array;
declare function array(obj: IFieldTypeCollection): IFieldTypeUnion_Array;
declare function isMap(obj: IFieldTypeUnion): obj is IFieldTypeUnion_Map;
declare function map(obj: IFieldTypeMap): IFieldTypeUnion_Map;
declare function isSet(obj: IFieldTypeUnion): obj is IFieldTypeUnion_Set;
declare function set(obj: IFieldTypeCollection): IFieldTypeUnion_Set;
declare function isValue(obj: IFieldTypeUnion): obj is IFieldTypeUnion_Value;
declare function value(obj: IFieldValueUnion.IFieldValueUnion): IFieldTypeUnion_Value;
export type IFieldTypeUnion = IFieldTypeUnion_Array | IFieldTypeUnion_Map | IFieldTypeUnion_Set | IFieldTypeUnion_Value;
export interface IFieldTypeUnionVisitor<T> {
    readonly 'array': (obj: IFieldTypeCollection) => T;
    readonly 'map': (obj: IFieldTypeMap) => T;
    readonly 'set': (obj: IFieldTypeCollection) => T;
    readonly 'value': (obj: IFieldValueUnion.IFieldValueUnion) => T;
    readonly 'unknown': (obj: IFieldTypeUnion) => T;
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
