function isRecord(obj) {
    return (obj.type === "record");
}
function record(obj) {
    return {
        record: obj,
        type: "record",
    };
}
function isUnion(obj) {
    return (obj.type === "union");
}
function union(obj) {
    return {
        union: obj,
        type: "union",
    };
}
function visit(obj, visitor) {
    if (isRecord(obj)) {
        return visitor.record(obj.record);
    }
    if (isUnion(obj)) {
        return visitor.union(obj.union);
    }
    return visitor.unknown(obj);
}
export var IModelDef = {
    isRecord: isRecord,
    record: record,
    isUnion: isUnion,
    union: union,
    visit: visit
};
