import { IModelTypeKey } from "../pack-docschema-api/modelTypeKey";
import { IFieldDef } from "./fieldDef";
import { ISchemaMeta } from "./schemaMeta";
export interface IRecordDef {
    readonly 'key': IModelTypeKey;
    readonly 'name': string;
    readonly 'description'?: string | null;
    readonly 'fields': ReadonlyArray<IFieldDef>;
    readonly 'meta': ISchemaMeta;
}
