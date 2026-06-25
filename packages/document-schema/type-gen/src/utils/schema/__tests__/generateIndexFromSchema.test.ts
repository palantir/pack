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

import { describe, expect, it } from "vitest";
import { generateIndexFromChain } from "../generateIndexFromSchema.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import { singleVersionSchema, unionTypesSchema } from "./fixtures.js";

describe("generateIndexFromChain", () => {
  it("re-exports union variant type guards as values", () => {
    const result = generateIndexFromChain(resolveSchemaChain(unionTypesSchema));

    // Guards are exported as values (not `export type`) so consumers can narrow
    // a union at runtime without re-deriving the discriminant check.
    expect(result).toContain(
      `export { isShape_v1Circle, isShape_v1Rectangle } from "./types_v1.js";`,
    );
    // The variant *types* remain a separate type-only export.
    expect(result).toMatch(/export type \{[^}]*Shape_v1Circle[^}]*\} from "\.\/types_v1\.js";/);
  });

  it("emits no value guard export when the schema has no unions", () => {
    const result = generateIndexFromChain(resolveSchemaChain(singleVersionSchema));

    // No unions → no `is<Variant>` guards → no value export from types_v1.
    expect(result).not.toMatch(/export \{ is\w+ \} from "\.\/types_v1\.js";/);
  });
});
