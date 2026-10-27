/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
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

import type { ModelDef } from "@palantir/pack.schema";
import {
  defineRecord,
  defineSchema,
  defineSchemaUpdate,
  defineUnion,
  nextSchema,
} from "@palantir/pack.schema";
import * as P from "@palantir/pack.schema";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { assertSdkNamesUnique, listSdkNames } from "../assertSdkNamesUnique.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import { writeAllSdkFiles } from "../writeAllSdkFiles.js";
import * as fixtures from "./fixtures.js";

const record = (name: string) => defineRecord(name, { docs: name, fields: { x: P.Double } });
const union = (name: string, variants: Record<string, ModelDef>) =>
  defineUnion(name, { discriminant: "kind", docs: name, variants });

function check(models: Record<string, ModelDef>): void {
  assertSdkNamesUnique(resolveSchemaChain(defineSchema(models)).chain, undefined);
}

/**
 * Library names that generated files import only next to suffixed names like `Foo_v1` or
 * `FooModel`, so no model can clash with them and the check doesn't list them. A new import
 * fails the test below until it is added here or to `RESERVED_SDK_NAMES`.
 */
const NON_CLASHING_IMPORTS = new Set([
  "DocumentId",
  "DocumentRef",
  "EditDescription",
  "MediaId",
  "ObjectId",
  "PresencePublishOptions",
  "RecordId",
  "RecordRef",
  "ResourceRid",
  "UnionUpgradeRegistry",
  "UnknownUnionVariant",
  "UpgradeRegistry",
  "UserId",
  "ZodType",
  "z",
]);

/** Top-level names a generated file declares, re-exports, or imports. */
function namesInFile(content: string): string[] {
  const names: string[] = [];
  for (const [, name] of content.matchAll(/^export (?:interface|type|const|function) (\w+)/gm)) {
    names.push(name!);
  }
  for (const [, list] of content.matchAll(/^(?:import|export)(?: type)? \{([^}]*)\} from /gm)) {
    for (const entry of list!.split(",")) {
      // `type Foo_v1 as Foo` binds `Foo`.
      const name = entry.trim().replace(/^type /, "").split(" as ").pop()!.trim();
      if (name !== "") names.push(name);
    }
  }
  return names;
}

describe("assertSdkNamesUnique", () => {
  const Bar = record("Bar");
  const Baz = record("Baz");

  it.each(Object.entries(fixtures))(
    "lists every name the SDK generated from %s uses",
    async (_fixtureName, schema) => {
      const { chain } = resolveSchemaChain(schema);
      const minSupportedVersion = chain[0]!.version;
      const resolved = resolveSchemaChain(schema, minSupportedVersion);
      const listed = listSdkNames(resolved.chain, minSupportedVersion);

      const outputDir = await mkdtemp(path.join(os.tmpdir(), "sdk-names-"));
      try {
        await writeAllSdkFiles(resolved, outputDir, minSupportedVersion);
        const files = (await readdir(outputDir, { recursive: true })).filter(file =>
          file.endsWith(".ts")
        );
        const generated = new Set<string>();
        for (const file of files) {
          const content = await readFile(path.join(outputDir, file), "utf8");
          for (const name of namesInFile(content)) generated.add(name);
        }

        // A name missing here means a generator creates a name the check doesn't know about.
        expect(
          [...generated].filter(name => !listed.has(name) && !NON_CLASHING_IMPORTS.has(name)),
        ).toEqual([]);
      } finally {
        await rm(outputDir, { recursive: true });
      }
    },
  );

  it("says which two models produce the same name", () => {
    expect(() => check({ Bar, KnownFoo: record("KnownFoo"), Foo: union("Foo", { bar: Bar }) }))
      .toThrow(
        `The generated SDK would use the name "KnownFoo" for both record "KnownFoo" and`
          + ` union "Foo" (Known type). Rename a model so the names differ.`,
      );
  });

  it("rejects two variant keys that format to the same name", () => {
    expect(() => check({ Bar, Baz, Foo: union("Foo", { "my-box": Bar, myBox: Baz }) })).toThrow(
      `The generated SDK would use the name "FooMyBox" for both`,
    );
  });

  it("rejects a model named like a name the SDK reserves", () => {
    expect(() => check({ Metadata: record("Metadata") })).toThrow(
      `The generated SDK would use the name "Metadata" for both the SDK itself and record "Metadata"`,
    );
  });

  it("rejects a model key that could clash in a later version", () => {
    // At v2 this would clash with record Foo's v2 type, Foo_v2.
    expect(() => check({ Foo: record("Foo"), Foo_v2: record("Foo_v2") })).toThrow(
      `Model "Foo_v2" can't contain "_v" followed by a number.`,
    );
  });

  it("ignores deprecated fields, which the SDK leaves out", () => {
    const Box = defineRecord("Box", { docs: "Box", fields: { kind: P.Double, x: P.Double } });
    const v1 = defineSchema({ Box });
    // v2 deprecates `kind`, so it no longer collides with the new union's discriminant.
    const addShape = defineSchemaUpdate(
      "addShape",
      (schema: P.SchemaBuilder<typeof v1.models>) => {
        const box = schema.Box.deprecateField("kind", "Use Shape instead.").build();
        return { Box: box, Shape: union("Shape", { box }) };
      },
    );
    const v2 = nextSchema(v1).addSchemaUpdate(addShape).build();

    expect(() => assertSdkNamesUnique(resolveSchemaChain(v2).chain, 1)).not.toThrow();
  });

  it("rejects a variant record with a field named like the discriminant", () => {
    const Box = defineRecord("Box", { docs: "Box", fields: { kind: P.Double } });

    expect(() => check({ Box, Shape: union("Shape", { box: Box }) })).toThrow(
      `The generated type "Shape_v1Box" would have two properties named "kind".`
        + ` Rename the field in record "Box" or the discriminant of union "Shape".`,
    );
  });

  it("rejects the discriminant \"value\" when a variant is another union", () => {
    const Inner = union("Inner", { bar: Bar });
    const Outer = defineUnion("Outer", {
      discriminant: "value",
      docs: "Outer",
      variants: { inner: Inner },
    });

    expect(() => check({ Bar, Inner, Outer })).toThrow(
      `The generated type "Outer_v1Inner" would have two properties named "value".`
        + ` Rename the discriminant of union "Outer".`,
    );
  });
});
