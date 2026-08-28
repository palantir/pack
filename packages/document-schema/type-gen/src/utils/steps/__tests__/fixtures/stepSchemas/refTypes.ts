import type { ModelDefs } from "@palantir/pack.schema";

const refTypes = {
  "Document": {
    "type": "record",
    "name": "Document",
    "docs": "A record containing all reference types",
    "fields": {
      "id": {
        "type": "string",
      },
      "docRef": {
        "type": "docRef",
      },
      "userRef": {
        "type": "userRef",
      },
      "objectRef": {
        "type": "objectRef",
      },
      "mediaRef": {
        "type": "mediaRef",
      },
      "resourceRef": {
        "type": "resourceRef",
      },
      "optionalDocRef": {
        "type": "optional",
        "item": {
          "type": "docRef",
        },
      },
      "docRefArray": {
        "type": "array",
        "items": {
          "type": "docRef",
        },
      },
      "userRefArray": {
        "type": "array",
        "items": {
          "type": "userRef",
        },
      },
      "optionalResourceRef": {
        "type": "optional",
        "item": {
          "type": "resourceRef",
        },
      },
      "resourceRefArray": {
        "type": "array",
        "items": {
          "type": "resourceRef",
        },
      },
    },
  },
} satisfies ModelDefs;

export default refTypes;
