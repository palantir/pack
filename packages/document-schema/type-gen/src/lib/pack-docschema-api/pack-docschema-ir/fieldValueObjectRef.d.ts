import { IInterfaceTypeRid } from "../pack-docschema-api/interfaceTypeRid";
import { IObjectTypeRid } from "../pack-docschema-api/objectTypeRid";
export interface IFieldValueObjectRef {
    readonly 'interfaceTypeRids': ReadonlyArray<IInterfaceTypeRid>;
    readonly 'objectTypeRids': ReadonlyArray<IObjectTypeRid>;
}
