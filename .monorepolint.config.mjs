/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { archetypes } from "@monorepolint/archetypes";
import * as Rules from "@monorepolint/rules";
import * as path from "path";

// @ts-check

const REPOSITORY_URL = "https://github.com/palantir/pack.git";

/**
 * @typedef {Object} ArchetypeRules
 * @property {boolean} [isCli]
 * @property {boolean} [isSdkgenTemplate]
 * @property {boolean} [isBuildTools]
 * @property {boolean} [hasSdkgenTemplates]
 */

const archetypeConfig = archetypes(
  (shared, rules) => {
    const baseScripts = {
      clean: "rimraf .turbo build dist lib test-output *.tgz tsconfig.tsbuildinfo",
      lint: "eslint ./src && dprint check --config $(find-up dprint.json) --allow-no-files",
      "lint:fix":
        "eslint ./src --fix && dprint fmt --config $(find-up dprint.json) --allow-no-files",
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

    // Package scripts - different for CLI vs library vs sdkgen template
    const scriptsRule = Rules.packageScript({
      ...shared,
      options: {
        scripts: rules.isSdkgenTemplate
          ? sdkgenTemplateScripts
          : (rules.isCli ? cliScripts : libraryScripts),
      },
    });

    // Required dependencies - CLI packages need @types/node
    const requiredScriptsDependenciesRule = Rules.requireDependency({
      ...shared,
      options: {
        devDependencies: {
          rimraf: "^6.0.1",
          typescript: "^5.9.2",
          tslib: "^2.8.1",
          ...(rules.isCli ? { "@types/node": "catalog:" } : {}),
        },
      },
    });

    // Rules that apply to all packages
    const baseRules = [
      Rules.packageEntry({
        ...shared,
        options: {
          entriesExist: ["version"],
          entries: {
            license: "Apache-2.0",
            repository: {
              "type": "git",
              "url": REPOSITORY_URL,
            },
          },
        },
      }),
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

    // TypeScript config - different templates for CLI vs library vs sdkgen template
    const standardTsConfigRule = Rules.standardTsconfig({
      ...shared,
      options: {
        excludedReferences: ["**/*"],
        templateFile: rules.isSdkgenTemplate
          ? "templates/tsconfig.sdkgen-template.json"
          : (rules.isCli ? "templates/tsconfig.cli.json" : "templates/tsconfig.json"),
      },
    });

    const privateRule = Rules.packageEntry({
      ...shared,
      options: {
        entries: {
          private: true,
        },
      },
    });

    const publicRules = [
      noPackageEntry({
        ...shared,
        options: {
          entries: ["private"],
        },
      }),
      allLocalDepsMustNotBePrivate({
        ...shared,
      }),
    ];

    if (rules.isBuildTools) {
      if (!rules.isCli) {
        return [
          privateRule,
          ...baseRules,
        ];
      }
      return [
        privateRule,
        scriptsRule,
        requiredScriptsDependenciesRule,
        standardTsConfigRule,
        ...baseRules,
      ];
    }

    return [
      ...publicRules,
      scriptsRule,

      // Vitest config
      Rules.fileContents({
        ...shared,
        options: {
          file: "vitest.config.mjs",
          generator: (context) => {
            const packageJson = context.getPackageJson();
            const devDeps = packageJson.devDependencies ?? {};
            const hasHappyDom = "happy-dom" in devDeps;

            const templateFile = hasHappyDom
              ? "templates/vitest.with-dom.config.mjs"
              : "templates/vitest.config.mjs";

            const { packageDir: workspacePackageDir } = context.getWorkspaceContext();
            const fullPath = path.resolve(workspacePackageDir, templateFile);
            return context.host.readFile(fullPath, { encoding: "utf-8" });
          },
        },
      }),

      // Package exports - CLI packages have simpler exports
      Rules.packageEntry({
        ...shared,
        options: {
          entries: {
            type: "module",
            publishConfig: {
              "access": "public",
            },
            ...(rules.isCli
              ? {
                // CLI packages: simpler exports for Node.js only
                exports: {
                  ".": {
                    types: "./build/types/index.d.ts",
                    default: "./build/esm/index.js",
                  },
                },
                files: rules.hasSdkgenTemplates
                  ? ["bin", "build", "templates"]
                  : ["bin", "build"],
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
      standardTsConfigRule,
      requiredScriptsDependenciesRule,
      ...baseRules,
    ];
  },
  { unmatched: "error" }, // Error if any package doesn't match an archetype
)
  .addArchetype(
    "build-tools",
    [
      "@palantir/pack.monorepo.tsconfig",
      "@palantir/pack.monorepo.cspell",
    ],
    { isBuildTools: true },
  )
  .addArchetype(
    "build-tools-clis",
    [
      "@palantir/pack.monorepo.release",
      "@palantir/pack.monorepo.transpile",
    ],
    { isBuildTools: true, isCli: true },
  )
  .addArchetype(
    "cli",
    [
      "@palantir/pack.document-schema.type-gen",
    ],
    { isCli: true },
  )
  .addArchetype(
    "sdkgen-cli",
    [
      "@palantir/pack.sdkgen",
    ],
    { isCli: true, hasSdkgenTemplates: true },
  )
  .addArchetype(
    "library",
    [
      "@palantir/pack.document-schema.model-types",
      "@palantir/pack.app",
      "@palantir/pack.auth",
      "@palantir/pack.auth.foundry",
      "@palantir/pack.core",
      "@palantir/pack.schema",
      "@palantir/pack.state.core",
      "@palantir/pack.state.foundry",
      "@palantir/pack.state.foundry-event",
      "@palantir/pack.state.react",
    ],
    {},
  )
  .addArchetype("sdkgen-template", [
    "@palantir/pack.sdkgen.demo-template",
    "@palantir/pack.sdkgen.pack-template",
  ], { isSdkgenTemplate: true });

const allLocalDepsMustNotBePrivate = Rules.createRuleFactory({
  name: "allLocalDepsMustNotBePrivate",
  check: async context => {
    const packageJson = context.getPackageJson();
    const deps = packageJson.dependencies ?? {};

    const nameToDir = await context.getWorkspaceContext().getPackageNameToDir();

    for (const [dep, version] of Object.entries(deps)) {
      if (nameToDir.has(dep)) {
        const packageDir = nameToDir.get(dep);
        /** @type any */
        const theirPackageJson = context.host.readJson(
          path.join(packageDir, "package.json"),
        );

        if (theirPackageJson.private) {
          const message =
            `${dep} is private and cannot be used as a regular dependency for this package`;
          context.addError({
            message,
            longMessage: message,
            file: context.getPackageJsonPath(),
          });
        }
      }
    }
  },
  validateOptions: () => {}, // no options right now
});

/**
 * @type {import("@monorepolint/rules").RuleFactoryFn<{entries: string[]}>}
 */
const noPackageEntry = Rules.createRuleFactory({
  name: "noPackageEntry",
  check: async (context, options) => {
    const packageJson = context.getPackageJson();
    for (const entry of options.entries) {
      if (packageJson[entry]) {
        context.addError({
          message: `${entry} field is not allowed`,
          longMessage: `${entry} field is not allowed`,
          file: context.getPackageJsonPath(),
        });
      }
    }
  },
  validateOptions: options => {
    return typeof options === "object" && "entries" in options
      && Array.isArray(options.entries);
  },
});

const config = () => ({
  rules: archetypeConfig.buildRules(),
});

export default config;
