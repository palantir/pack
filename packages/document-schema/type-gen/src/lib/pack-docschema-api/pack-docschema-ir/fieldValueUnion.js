function isDatetime(obj) {
    return (obj.type === "datetime");
}
function datetime(obj) {
    return {
        datetime: obj,
        type: "datetime",
    };
}
function isDocRef(obj) {
    return (obj.type === "docRef");
}
function docRef(obj) {
    return {
        docRef: obj,
        type: "docRef",
    };
}
function isDouble(obj) {
    return (obj.type === "double");
}
function double(obj) {
    return {
        double: obj,
        type: "double",
    };
}
function isInteger(obj) {
    return (obj.type === "integer");
}
function integer(obj) {
    return {
        integer: obj,
        type: "integer",
    };
}
function isMediaRef(obj) {
    return (obj.type === "mediaRef");
}
function mediaRef(obj) {
    return {
        mediaRef: obj,
        type: "mediaRef",
    };
}
function isModelRef(obj) {
    return (obj.type === "modelRef");
}
function modelRef(obj) {
    return {
        modelRef: obj,
        type: "modelRef",
    };
}
function isObject(obj) {
    return (obj.type === "object");
}
function object(obj) {
    return {
        object: obj,
        type: "object",
    };
}
function isString(obj) {
    return (obj.type === "string");
}
function string(obj) {
    return {
        string: obj,
        type: "string",
    };
}
function isText(obj) {
    return (obj.type === "text");
}
function text(obj) {
    return {
        text: obj,
        type: "text",
    };
}
function isUnmanagedJson(obj) {
    return (obj.type === "unmanagedJson");
}
function unmanagedJson(obj) {
    return {
        unmanagedJson: obj,
        type: "unmanagedJson",
    };
}
function isUserRef(obj) {
    return (obj.type === "userRef");
}
function userRef(obj) {
    return {
        userRef: obj,
        type: "userRef",
    };
}
function visit(obj, visitor) {
    if (isDatetime(obj)) {
        return visitor.datetime(obj.datetime);
    }
    if (isDocRef(obj)) {
        return visitor.docRef(obj.docRef);
    }
    if (isDouble(obj)) {
        return visitor.double(obj.double);
    }
    if (isInteger(obj)) {
        return visitor.integer(obj.integer);
    }
    if (isMediaRef(obj)) {
        return visitor.mediaRef(obj.mediaRef);
    }
    if (isModelRef(obj)) {
        return visitor.modelRef(obj.modelRef);
    }
    if (isObject(obj)) {
        return visitor.object(obj.object);
    }
    if (isString(obj)) {
        return visitor.string(obj.string);
    }
    if (isText(obj)) {
        return visitor.text(obj.text);
    }
    if (isUnmanagedJson(obj)) {
        return visitor.unmanagedJson(obj.unmanagedJson);
    }
    if (isUserRef(obj)) {
        return visitor.userRef(obj.userRef);
    }
    return visitor.unknown(obj);
}
export var IFieldValueUnion = {
    isDatetime: isDatetime,
    datetime: datetime,
    isDocRef: isDocRef,
    docRef: docRef,
    isDouble: isDouble,
    double: double,
    isInteger: isInteger,
    integer: integer,
    isMediaRef: isMediaRef,
    mediaRef: mediaRef,
    isModelRef: isModelRef,
    modelRef: modelRef,
    isObject: isObject,
    object: object,
    isString: isString,
    string: string,
    isText: isText,
    text: text,
    isUnmanagedJson: isUnmanagedJson,
    unmanagedJson: unmanagedJson,
    isUserRef: isUserRef,
    userRef: userRef,
    visit: visit
};
