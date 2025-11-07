import { IFieldKey } from "../pack-docschema-api/fieldKey";
import { IModelTypeKey } from "../pack-docschema-api/modelTypeKey";
import { IUnionVariantKey } from "../pack-docschema-api/unionVariantKey";
import { ISchemaMeta } from "./schemaMeta";
export interface IUnionDef {
    readonly 'key': IModelTypeKey;
    readonly 'discriminant': IFieldKey;
    readonly 'name': string;
    readonly 'description'?: string | null;
    readonly 'variants': {
        readonly [key: IUnionVariantKey]: IModelTypeKey;
    };
    readonly 'meta': ISchemaMeta;
}
