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

import { getPackages } from "@manypkg/get-packages";
import consola from "consola";
import { execa } from "execa";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import semver from "semver";
import { packageVersionsOrEmptySet } from "./publishPackages.js";

async function ciPublish(): Promise<void> {
  let tag = "latest";
  const repoRoot = process.cwd();
  const preJsonPath = join(repoRoot, ".changeset", "pre.json");
  const currentBranch = await getCurrentBranch();

  if (existsSync(preJsonPath)) {
    try {
      const preJson = JSON.parse(await readFile(preJsonPath, "utf-8"));
      if (preJson.mode === "pre") {
        tag = preJson.tag;
      } else {
        consola.error(`Invalid mode for releasing: ${preJson.mode}`);
        process.exit(100);
      }
    } catch (error) {
      consola.error(`Error reading pre.json: ${error}`);
      process.exit(1);
    }
  } else {
    const remoteBranches = await getRemoteBranches();
    const greatestVersion = findGreatestVersion(remoteBranches);
    tag = determineTag(currentBranch, greatestVersion, tag);
  }

  // Enforce the branching model (main = minor/major, release/* = patch) against the
  // concrete versions about to be published. This is the authoritative gate: it runs
  // on the protected destination branch and cannot be bypassed by how the release
  // commit/PR was prepared.
  await assertReleaseAllowedOnBranch(repoRoot, currentBranch);

  consola.info(`Publishing with tag: ${tag}`);

  try {
    const repoRoot = process.cwd();
    await execa("pnpm", ["run", "prePublish"], {
      stdio: "inherit",
      cwd: repoRoot,
    });
    await execa(
      "pnpm",
      ["publish", "--no-git-checks", "-r", "--report-summary", "--tag", tag],
      {
        stdio: "inherit",
        cwd: repoRoot,
      },
    );
  } catch (error) {
    consola.error(`Error during publish: ${error}`);
    process.exit(1);
  }
}

async function getRemoteBranches(): Promise<string[]> {
  const repoRoot = process.cwd();
  const { stdout } = await execa("git", [
    "ls-remote",
    "--heads",
    "origin",
    "release/*",
  ], { cwd: repoRoot });
  return stdout.split("\n").filter(line => !!line).map(line => {
    const match = line.match(/release\/(.*)/);
    if (!match) {
      consola.log(match);
      throw new Error(`Invalid branch name: ${line}`);
    }
    return match[0];
  });
}

async function getCurrentBranch(): Promise<string> {
  const repoRoot = process.cwd();
  const { stdout } = await execa("git", [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ], { cwd: repoRoot });
  return stdout;
}

export type ReleaseBump = "initial" | "major" | "minor" | "patch" | "prerelease";

// Higher rank = more significant. Used to reduce a set of per-package bumps down to a
// single release-level bump (safe under fixed uni-versioning, where all published
// packages move together).
const BUMP_RANK: Record<ReleaseBump, number> = {
  major: 4,
  minor: 3,
  patch: 2,
  prerelease: 1,
  initial: 0,
};

/**
 * Returns the highest published version strictly below `local`, or null if there is
 * none. Using "highest below local" (rather than the `latest` dist-tag) keeps the
 * comparison correct per release line even when main is ahead of a release branch.
 */
export function highestVersionBelow(
  local: string,
  published: Set<string>,
): string | null {
  let highest: string | null = null;
  for (const candidate of published) {
    if (!semver.valid(candidate) || semver.gte(candidate, local)) {
      continue;
    }
    if (highest == null || semver.gt(candidate, highest)) {
      highest = candidate;
    }
  }
  return highest;
}

/**
 * Derives the bump type from the numeric major.minor.patch core, so RC/beta prerelease
 * versions are handled naturally (e.g. `0.23.5 -> 0.24.0-rc.0` is a minor). A null
 * `prev` (package not yet published) is an `initial` release. Equal cores (only the
 * prerelease identifier differs) are reported as `prerelease`.
 */
export function determineReleaseBump(
  prev: string | null,
  local: string,
): ReleaseBump {
  if (prev == null) {
    return "initial";
  }
  const prevParsed = semver.parse(prev);
  const localParsed = semver.parse(local);
  if (!prevParsed || !localParsed) {
    throw new Error(`Unable to parse versions for bump: ${prev} -> ${local}`);
  }
  if (localParsed.major > prevParsed.major) {
    return "major";
  }
  if (
    localParsed.major === prevParsed.major
    && localParsed.minor > prevParsed.minor
  ) {
    return "minor";
  }
  if (
    localParsed.major === prevParsed.major
    && localParsed.minor === prevParsed.minor
    && localParsed.patch > prevParsed.patch
  ) {
    return "patch";
  }
  return "prerelease";
}

/**
 * Enforces the branching model: main only cuts minor/major releases, release/* only
 * cuts patch releases. `initial` (brand-new package) and `prerelease` (core unchanged)
 * do not move the constrained core and are allowed anywhere. Branches that are neither
 * main nor release/* are not gated.
 */
export function checkBumpAllowedOnBranch(
  branch: string,
  bump: ReleaseBump,
): { ok: true } | { ok: false; reason: string } {
  if (bump === "initial" || bump === "prerelease") {
    return { ok: true };
  }

  if (branch === "main") {
    if (bump === "patch") {
      return {
        ok: false,
        reason: "Refusing to publish a patch release from main. Our branching model only "
          + "cuts minor/major releases from main; patches must come from a release/* branch.",
      };
    }
    return { ok: true };
  }

  if (branch.startsWith("release/")) {
    if (bump === "minor" || bump === "major") {
      return {
        ok: false,
        reason: `Refusing to publish a ${bump} release from a release branch (${branch}). `
          + "Our branching model only cuts patch releases from release/* branches; "
          + "minor/major releases must come from main.",
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

/**
 * Computes the release-level bump for the packages that will actually be published
 * (public, and whose local version is not already on npm), or null if none will
 * publish.
 */
export async function computeReleaseBump(
  cwd: string,
): Promise<ReleaseBump | null> {
  const { packages } = await getPackages(cwd);
  const publicPackages = packages.filter(pkg => !pkg.packageJson.private);

  let releaseBump: ReleaseBump | null = null;
  for (const pkg of publicPackages) {
    const { name, version } = pkg.packageJson;
    const published = await packageVersionsOrEmptySet(name);
    if (published.has(version)) {
      // Already on npm; `pnpm publish` will skip it, so it isn't part of this release.
      continue;
    }
    const bump = determineReleaseBump(
      highestVersionBelow(version, published),
      version,
    );
    if (releaseBump == null || BUMP_RANK[bump] > BUMP_RANK[releaseBump]) {
      releaseBump = bump;
    }
  }
  return releaseBump;
}

async function assertReleaseAllowedOnBranch(
  cwd: string,
  branch: string,
): Promise<void> {
  const releaseBump = await computeReleaseBump(cwd);
  if (releaseBump == null) {
    consola.info("No unpublished packages found; skipping branch/bump gate.");
    return;
  }

  consola.info(`Release bump for branch "${branch}": ${releaseBump}`);
  const result = checkBumpAllowedOnBranch(branch, releaseBump);
  if (!result.ok) {
    consola.error(result.reason);
    process.exit(1);
  }
}

export function findGreatestVersion(releaseBranches: string[]): string | null {
  if (releaseBranches.length === 0) return null;
  return releaseBranches.reduce((maxBranch, branch) => {
    let version = branch.replace(/^.*?release\//, "");
    let maxVersion = maxBranch.replace(/^.*?release\//, "");
    version = version.replace(/\.x$/, ".0");
    maxVersion = maxVersion.replace(/\.x$/, ".0");

    if (!semver.valid(version)) {
      return maxBranch;
    }

    return semver.gt(version, maxVersion) ? branch : maxBranch;
  }, releaseBranches[0]!);
}

export function determineTag(
  currentBranch: string,
  greatestVersion: string | null,
  defaultTag: string,
): string {
  if (currentBranch === "main") {
    return "latest";
  } else if (currentBranch.startsWith("release/")) {
    if (greatestVersion && currentBranch === greatestVersion) {
      return "latest";
    } else {
      return `${defaultTag}-${currentBranch.substring(8)}`;
    }
  }
  return defaultTag;
}

(async () => {
  await ciPublish();
})().catch((err: unknown) => {
  consola.error(err);
  process.exit(1);
});
