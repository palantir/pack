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
import { parseMaxVersion } from "../schemaIrHandler.js";

describe("parseMaxVersion", () => {
  it("reads a major version as its .0 version", () => {
    expect(parseMaxVersion("2")).toEqual({ major: 2, minor: 0 });
  });

  it("reads a minor version", () => {
    expect(parseMaxVersion("2.1")).toEqual({ major: 2, minor: 1 });
    expect(parseMaxVersion("2.0")).toEqual({ major: 2, minor: 0 });
  });

  it("returns undefined when unset", () => {
    expect(parseMaxVersion(undefined)).toBeUndefined();
  });

  it.each(["0", "1.", "1.01", "v2", "2.1.1"])("rejects %s", value => {
    expect(() => parseMaxVersion(value)).toThrow("--max-version must be a version like 2 or 2.1");
  });
});
