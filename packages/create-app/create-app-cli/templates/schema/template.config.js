export default {
  name: "pack-schema",
  description: "A standalone Palantir PACK schema package",

  prompts: [
    {
      type: "input",
      name: "packageName",
      message: "Schema package name?",
      default: "@my-org/my-pack.schema",
    },
    {
      type: "input",
      name: "sdkPackageName",
      message: "Generated SDK package name?",
      default: "@my-org/my-pack.sdk",
    },
    {
      type: "input",
      name: "description",
      message: "Description?",
      default: "My PACK schema",
    },
    {
      type: "input",
      name: "documentTypeName",
      message: "Document type name?",
      default: "My Document Type",
    },
  ],

  templateFiles: ["**/*.ejs"],
  staticFiles: ["**/*", "!**/*.ejs", "_gitignore"],
};
