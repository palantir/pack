import { ISchemaVersion } from "../pack-docschema-api/schemaVersion";
export interface ISchemaMeta {
    readonly 'addedIn': ISchemaVersion;
    readonly 'deprecated'?: ISchemaVersion | null;
    readonly 'deprecatedMessage'?: string | null;
}
