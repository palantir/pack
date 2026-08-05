import { Schema } from "@palantir/pack.schema";

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
      "artifactRef": {
        "type": "artifactRef",
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
      "optionalArtifactRef": {
        "type": "optional",
        "item": {
          "type": "artifactRef",
        },
      },
      "artifactRefArray": {
        "type": "array",
        "items": {
          "type": "artifactRef",
        },
      },
    },
  },
} satisfies Schema<any>;

export default refTypes;
