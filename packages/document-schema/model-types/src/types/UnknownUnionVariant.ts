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

/** The discriminant value of a union variant this SDK doesn't know. Reserved: no real variant can use it. */
export const UNKNOWN_UNION_VARIANT = "unknown";

/**
 * A union value whose variant this SDK doesn't know, e.g. one added by a newer version of the app.
 * Every generated union includes this case. `rawValue` is the stored value, kept as-is: saving a
 * record or list that contains it writes it back unchanged.
 */
export type UnknownUnionVariant<D extends string> =
  & { readonly [K in D]: typeof UNKNOWN_UNION_VARIANT }
  & { readonly rawValue?: unknown };
