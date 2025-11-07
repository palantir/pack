function isArray(obj) {
    return (obj.type === "array");
}
function array(obj) {
    return {
        array: obj,
        type: "array",
    };
}
function isMap(obj) {
    return (obj.type === "map");
}
function map(obj) {
    return {
        map: obj,
        type: "map",
    };
}
function isSet(obj) {
    return (obj.type === "set");
}
function set(obj) {
    return {
        set: obj,
        type: "set",
    };
}
function isValue(obj) {
    return (obj.type === "value");
}
function value(obj) {
    return {
        value: obj,
        type: "value",
    };
}
function visit(obj, visitor) {
    if (isArray(obj)) {
        return visitor.array(obj.array);
    }
    if (isMap(obj)) {
        return visitor.map(obj.map);
    }
    if (isSet(obj)) {
        return visitor.set(obj.set);
    }
    if (isValue(obj)) {
        return visitor.value(obj.value);
    }
    return visitor.unknown(obj);
}
export var IFieldTypeUnion = {
    isArray: isArray,
    array: array,
    isMap: isMap,
    map: map,
    isSet: isSet,
    set: set,
    isValue: isValue,
    value: value,
    visit: visit
};
