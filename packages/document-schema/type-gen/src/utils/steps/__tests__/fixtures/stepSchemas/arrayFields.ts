import type { ModelDefs } from "@palantir/pack.schema";

const arrayFields = {
  "Container": {
    "type": "record",
    "name": "Container",
    "fields": {
      "items": {
        "type": "array",
        "items": {
          "type": "string",
        },
      },
      "numbers": {
        "type": "array",
        "items": {
          "type": "double",
        },
      },
    },
  },
} satisfies ModelDefs;

export default arrayFields;
