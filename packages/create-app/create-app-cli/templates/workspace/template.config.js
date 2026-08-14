export default {
  name: "pack-workspace",
  description: "A schema + sdk + app npm-workspace starter for a Palantir PACK application",

  prompts: [
    {
      type: "input",
      name: "scope",
      message: "Package scope/prefix for the workspace packages?",
      default: "@my-org/my-pack",
    },
    {
      type: "input",
      name: "description",
      message: "Description?",
      default: "My PACK application",
    },
    {
      type: "input",
      name: "foundryClientId",
      message: "Foundry OAuth client id?",
      default: "",
    },
    {
      type: "input",
      name: "foundryApiUrl",
      message: "Foundry API URL?",
      default: "https://example.palantirfoundry.com",
    },
    {
      type: "input",
      name: "foundryOntologyRid",
      message: "Foundry ontology RID?",
      default: "ri.ontology.main.ontology.00000000-0000-0000-0000-000000000000",
    },
    {
      type: "input",
      name: "parentFolderRid",
      message: "Compass folder RID where new documents will be created (PARENT_FOLDER_RID)?",
      default: "ri.compass.main.folder.00000000-0000-0000-0000-000000000000",
    },
  ],

  templateFiles: ["**/*.ejs"],
  staticFiles: ["**/*", "!**/*.ejs", "_gitignore"],
};
