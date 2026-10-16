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

import type { ModelDef, UnionDef } from "./defs.js";
import { ModelDefType } from "./defs.js";
import type { Ref } from "./primitives.js";
import { TypeKind } from "./primitives.js";
import { modelToRef } from "./utils.js";

export type UnionVariantArgExplicit = Ref | ModelDef;
export type UnionVariantArg = UnionVariantArgExplicit | (() => UnionVariantArgExplicit);
export type UnionVariantArgs = Record<string, UnionVariantArg>;

export type ResolvedUnionVariants<T extends UnionVariantArgs> = {
  readonly [K in keyof T]: Ref;
};

export type UnionArgs<T extends UnionVariantArgs> = {
  /**
   * The field name used to discriminate between union variants.
   *
   * @default "type"
   */
  readonly discriminant?: string;
  readonly docs: string;
  readonly variants: T;
};

/**
 * Define a **union**: a discriminated choice between several record variants. A
 * value of the union is exactly one of its variants, tagged by the
 * `discriminant` field (default `"type"`).
 *
 * @example
 * ```ts
 * const NodeShape = defineUnion("NodeShape", {
 *   discriminant: "shapeType",
 *   docs: "The shape of a node.",
 *   variants: { box: ShapeBox, circle: ShapeCircle },
 * });
 * ```
 */
export function defineUnion<const TVariants extends UnionVariantArgs>(
  name: string,
  {
    discriminant = "type",
    docs,
    variants,
  }: UnionArgs<TVariants>,
): UnionDef<ResolvedUnionVariants<TVariants>> {
  assertDiscriminantAllowed(discriminant, name);
  const entries = Object.entries(variants).map(([key, value]) => {
    assertVariantNameAllowed(key, name);
    return [key, resolveUnionVariantArg(value)] as const;
  });

  const resolvedVariants = Object.fromEntries(entries) as ResolvedUnionVariants<TVariants>;

  return {
    type: ModelDefType.UNION,
    discriminant,
    name,
    docs,
    variants: resolvedVariants,
  };
}

export function resolveUnionVariantArg(arg: UnionVariantArg): Ref {
  const resolved = typeof arg === "function" ? arg() : arg;
  return resolved.type === TypeKind.REF ? resolved : modelToRef(resolved);
}

/**
 * Throw if a variant uses a reserved name. Every generated union has an Unknown case for variants
 * an SDK doesn't know: its discriminant is "unknown" and its generated names end in "Unknown", so
 * no variant may produce either (e.g. "unknown", "Unknown", "_unknown").
 */
export function assertVariantNameAllowed(variantName: string, unionName: string): void {
  // Matches type-gen's formatVariantName: the generated type-name suffix for this variant,
  // e.g. "_unknown" -> "Unknown".
  const formattedName = variantName
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  if (formattedName === "Unknown") {
    throw new Error(
      `Variant "${variantName}" in union "${unionName}" uses a reserved name. Every union has a`
        + " generated Unknown case for variants an SDK doesn't know; choose another name.",
    );
  }
}

/** Throw if a discriminant uses `rawValue`, the field the Unknown case keeps the stored value in. */
function assertDiscriminantAllowed(discriminant: string, unionName: string): void {
  if (discriminant === "rawValue") {
    throw new Error(
      `Union "${unionName}" can't use "rawValue" as its discriminant. The generated Unknown case`
        + " stores the original value in rawValue; choose another name.",
    );
  }
}
