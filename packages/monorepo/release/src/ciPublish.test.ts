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

import { describe, expect, it } from "vitest";
import {
  checkBumpAllowedOnBranch,
  determineReleaseBump,
  determineTag,
  findGreatestVersion,
  highestVersionBelow,
} from "./ciPublish.js";

describe("findGreatestVersion", () => {
  it("should find the highest semver version from release branch names", () => {
    const branches = [
      "release/1.0.x",
      "release/2.0.x",
      "release/1.5.x",
      "release/2.1.x",
    ];

    const result = findGreatestVersion(branches);

    expect(result).toBe("release/2.1.x");
  });

  it("should handle empty array input", () => {
    const branches: string[] = [];

    const result = findGreatestVersion(branches);

    expect(result).toBeNull();
  });
});

describe("determineTag", () => {
  it("should return 'latest' when current branch is main", () => {
    const currentBranch = "main";
    const greatestVersion = "release/2.1.x";
    const defaultTag = "latest";

    const result = determineTag(currentBranch, greatestVersion, defaultTag);

    expect(result).toBe("latest");
  });

  it("should return 'latest' when current release branch is the greatest version", () => {
    const currentBranch = "release/2.1.x";
    const greatestVersion = "release/2.1.x";
    const defaultTag = "latest";

    const result = determineTag(currentBranch, greatestVersion, defaultTag);

    expect(result).toBe("latest");
  });

  it("should return 'tag-version' when current release branch is not the greatest version", () => {
    const currentBranch = "release/2.0.x";
    const greatestVersion = "2.1.x";
    const defaultTag = "latest";

    const result = determineTag(currentBranch, greatestVersion, defaultTag);

    expect(result).toBe("latest-2.0.x");
  });
});

describe("highestVersionBelow", () => {
  it("returns the highest published version strictly below local", () => {
    const published = new Set(["0.23.3", "0.23.4", "0.24.0"]);
    expect(highestVersionBelow("0.24.0", published)).toBe("0.23.4");
  });

  it("ignores versions greater than or equal to local", () => {
    const published = new Set(["0.23.4", "0.24.0", "0.25.0"]);
    expect(highestVersionBelow("0.23.5", published)).toBe("0.23.4");
  });

  it("returns null when nothing is below local (new package or first in line)", () => {
    expect(highestVersionBelow("0.1.0", new Set())).toBeNull();
    expect(highestVersionBelow("0.23.0", new Set(["0.23.0", "0.24.0"]))).toBeNull();
  });

  it("orders prerelease versions correctly", () => {
    const published = new Set(["0.23.5", "0.24.0-rc.0"]);
    expect(highestVersionBelow("0.24.0-rc.1", published)).toBe("0.24.0-rc.0");
    expect(highestVersionBelow("0.24.0", published)).toBe("0.24.0-rc.0");
  });
});

describe("determineReleaseBump", () => {
  it("treats a missing previous version as an initial release", () => {
    expect(determineReleaseBump(null, "0.1.0")).toBe("initial");
  });

  it("derives major/minor/patch from the version core", () => {
    expect(determineReleaseBump("0.23.5", "1.0.0")).toBe("major");
    expect(determineReleaseBump("0.23.5", "0.24.0")).toBe("minor");
    expect(determineReleaseBump("0.23.5", "0.23.6")).toBe("patch");
  });

  it("treats RC transitions by their core change", () => {
    expect(determineReleaseBump("0.23.5", "0.24.0-rc.0")).toBe("minor");
    expect(determineReleaseBump("0.23.5", "0.23.6-rc.0")).toBe("patch");
  });

  it("reports prerelease when only the prerelease identifier changes", () => {
    expect(determineReleaseBump("0.24.0-rc.0", "0.24.0-rc.1")).toBe("prerelease");
    expect(determineReleaseBump("0.24.0-rc.0", "0.24.0")).toBe("prerelease");
  });
});

describe("checkBumpAllowedOnBranch", () => {
  it("main rejects patch releases", () => {
    expect(checkBumpAllowedOnBranch("main", "patch").ok).toBe(false);
  });

  it("main allows minor, major, initial, and prerelease", () => {
    expect(checkBumpAllowedOnBranch("main", "minor").ok).toBe(true);
    expect(checkBumpAllowedOnBranch("main", "major").ok).toBe(true);
    expect(checkBumpAllowedOnBranch("main", "initial").ok).toBe(true);
    expect(checkBumpAllowedOnBranch("main", "prerelease").ok).toBe(true);
  });

  it("release branches reject minor and major releases", () => {
    expect(checkBumpAllowedOnBranch("release/0.23", "minor").ok).toBe(false);
    expect(checkBumpAllowedOnBranch("release/0.23", "major").ok).toBe(false);
  });

  it("release branches allow patch, initial, and prerelease", () => {
    expect(checkBumpAllowedOnBranch("release/0.23", "patch").ok).toBe(true);
    expect(checkBumpAllowedOnBranch("release/0.23", "initial").ok).toBe(true);
    expect(checkBumpAllowedOnBranch("release/0.23", "prerelease").ok).toBe(true);
  });

  it("does not gate branches that are neither main nor release/*", () => {
    expect(checkBumpAllowedOnBranch("some-topic-branch", "patch").ok).toBe(true);
    expect(checkBumpAllowedOnBranch("some-topic-branch", "minor").ok).toBe(true);
  });
});
