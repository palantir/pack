import { IFieldKey } from "../pack-docschema-api/fieldKey";
import * as IFieldTypeUnion from "./fieldTypeUnion";
import { ISchemaMeta } from "./schemaMeta";
export interface IFieldDef {
    readonly 'key': IFieldKey;
    readonly 'name': string;
    readonly 'description'?: string | null;
    readonly 'isOptional'?: boolean | null;
    readonly 'value': IFieldTypeUnion.IFieldTypeUnion;
    readonly 'meta': ISchemaMeta;
}
