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

import { UNKNOWN_UNION_VARIANT } from "@palantir/pack.document-schema.model-types";
import { formatVariantName } from "@palantir/pack.schema";

/** Name suffix for a union's Unknown case, e.g. `NodeShapeUnknown`. */
export const UNKNOWN_VARIANT_SUFFIX: string = formatVariantName(UNKNOWN_UNION_VARIANT);
