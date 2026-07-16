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
  ],

  templateFiles: ["**/*.ejs"],
  staticFiles: ["**/*", "!**/*.ejs", "_gitignore"],
};
