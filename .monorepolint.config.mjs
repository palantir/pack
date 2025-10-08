import { archetypes } from "@monorepolint/archetypes";
import * as Rules from "@monorepolint/rules";

// @ts-check

/**
 * @typedef {Object} ArchetypeRules
 * @property {boolean} [isCli]
 * @property {boolean} [isSdkgenTemplate]
 */

const archetypeConfig = archetypes(
  (shared, rules) => {
    if (rules.isBuildTools) {
      return [];
    }

    const baseScripts = {
      clean: "rimraf .turbo build dist lib test-output *.tgz tsconfig.tsbuildinfo",
      lint: "eslint ./src ; dprint check --config $(find-up dprint.json) --allow-no-files",
      "lint:fix":
        "eslint ./src --fix ; dprint fmt --config $(find-up dprint.json) --allow-no-files",
      "test:watch": "vitest --passWithNoTests",
      test: "vitest run --passWithNoTests -u",
      typecheck: "tsc --noEmit --emitDeclarationOnly false",
    };

    const libraryScripts = {
      ...baseScripts,
      transpileBrowser: "monorepo-transpile -f esm -m bundle -t browser",
      transpileCjs: "monorepo-transpile -f cjs -m bundle -t node",
      transpileEsm: "monorepo-transpile -f esm -m bundle -t node",
      transpileTypes: "monorepo-transpile -f esm -m types -t node",
    };

    const cliScripts = {
      ...baseScripts,
      // CLI packages use monorepo-transpile without bundling to preserve module structure
      transpileEsm: "monorepo-transpile -f esm -m normal -t node",
      transpileTypes: "tsc --emitDeclarationOnly",
    };

    const sdkgenTemplateScripts = {
      ...baseScripts,
      // sdkgen templates need individual files preserved
      transpileEsm: "tsc",
      transpileTypes: "tsc --emitDeclarationOnly",
    };

    return [
      // Package scripts - different for CLI vs library vs sdkgen template
      Rules.packageScript({
        ...shared,
        options: {
          scripts: rules.isSdkgenTemplate
            ? sdkgenTemplateScripts
            : (rules.isCli ? cliScripts : libraryScripts),
        },
      }),

      // Vitest config
      Rules.fileContents({
        ...shared,
        options: {
          file: "vitest.config.mjs",
          templateFile: "templates/vitest.config.mjs",
        },
      }),

      // Package exports - CLI packages have simpler exports
      Rules.packageEntry({
        ...shared,
        options: {
          entries: {
            version: "0.0.1",
            type: "module",
            ...(rules.isCli
              ? {
                // CLI packages: simpler exports for Node.js only
                exports: {
                  ".": {
                    types: "./build/types/index.d.ts",
                    default: "./build/esm/index.js",
                  },
                },
                files: ["bin", "build"],
                main: "./build/esm/index.js",
                types: "./build/types/index.d.ts",
              }
              : {
                // Library packages: full browser/node exports
                exports: {
                  ".": {
                    browser: "./build/browser/index.js",
                    import: {
                      types: "./build/types/index.d.ts",
                      default: "./build/esm/index.js",
                    },
                    require: "./build/cjs/index.js",
                    default: "./build/browser/index.js",
                  },
                  "./*": {
                    browser: "./build/browser/public/*.js",
                    import: {
                      types: "./build/types/public/*.d.ts",
                      default: "./build/js/public/*.js",
                    },
                    require: "./build/cjs/public/*.js",
                    default: "./build/browser/public/*.js",
                  },
                },
                main: "./build/cjs/index.js",
                module: "./build/esm/index.js",
                types: "./build/cjs/index.d.ts",
              }),
          },
        },
      }),

      // TypeScript config - different templates for CLI vs library vs sdkgen template
      Rules.standardTsconfig({
        ...shared,
        options: {
          excludedReferences: ["**/*"],
          templateFile: rules.isSdkgenTemplate
            ? "templates/tsconfig.sdkgen-template.json"
            : (rules.isCli ? "templates/tsconfig.cli.json" : "templates/tsconfig.json"),
        },
      }),

      // Required dependencies - CLI packages need @types/node
      Rules.requireDependency({
        ...shared,
        options: {
          devDependencies: {
            rimraf: "^6.0.1",
            typescript: "^5.9.2",
            tslib: "^2.8.1",
            ...(rules.isCli ? { "@types/node": "catalog:" } : {}),
          },
        },
      }),

      // Rules that apply to all packages
      Rules.packageOrder({
        options: {
          order: [
            "name",
            "private",
            "version",
            "description",
            "access",
            "author",
            "license",
            "repository",
            "bin",
            "exports",
            "file",
            "scripts",
            "dependencies",
            "peerDependencies",
            "peerDependenciesMeta",
            "devDependencies",
            "publishConfig",
            "imports",
            "keywords",
            "files",
            // since these are just for fallback support we can drop to bottom
            "main",
            "module",
            "types",
          ],
        },
      }),
      Rules.alphabeticalDependencies({ includeWorkspaceRoot: true }),
      Rules.consistentDependencies({}),
      Rules.alphabeticalScripts({ includeWorkspaceRoot: true }),

      // Banned dependencies
      Rules.bannedDependencies({
        ...shared,
        options: {
          bannedDependencies: ["lodash", "lodash-es"],
        },
      }),
    ];
  },
  { unmatched: "error" }, // Error if any package doesn't match an archetype
)
  .addArchetype(
    "build-tools",
    [
      "@palantir/pack.monorepo.*",
    ],
    { isBuildTools: true },
  )
  .addArchetype(
    "cli",
    [],
    { isCli: true },
  )
  .addArchetype(
    "library",
    [],
    {},
  )
  .addArchetype("sdkgen-template", [], { isSdkgenTemplate: true });

const config = () => ({
  rules: archetypeConfig.buildRules(),
});

export default config;
