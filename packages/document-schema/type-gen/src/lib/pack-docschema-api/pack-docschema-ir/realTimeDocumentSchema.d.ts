import { IModelTypeKey } from "../pack-docschema-api/modelTypeKey";
import { ISchemaVersion } from "../pack-docschema-api/schemaVersion";
import * as IModelDef from "./modelDef";
export interface IRealTimeDocumentSchema {
    readonly 'name': string;
    readonly 'description': string;
    readonly 'version': ISchemaVersion;
    /** The primary models. There may be others described internally as nested/sub-models. */
    readonly 'primaryModelKeys': ReadonlyArray<IModelTypeKey>;
    readonly 'models': {
        readonly [key: IModelTypeKey]: IModelDef.IModelDef;
    };
}
