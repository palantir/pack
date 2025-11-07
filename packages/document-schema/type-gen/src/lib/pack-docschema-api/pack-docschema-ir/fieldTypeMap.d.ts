import * as IFieldValueUnion from "./fieldValueUnion";
export interface IFieldTypeMap {
    readonly 'allowNullValue': boolean;
    readonly 'key': IFieldValueUnion.IFieldValueUnion;
    readonly 'value': IFieldValueUnion.IFieldValueUnion;
}
