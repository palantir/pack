import * as IFieldValueUnion from "./fieldValueUnion";
export interface IFieldTypeCollection {
    readonly 'allowNullValue': boolean;
    readonly 'value': IFieldValueUnion.IFieldValueUnion;
}
