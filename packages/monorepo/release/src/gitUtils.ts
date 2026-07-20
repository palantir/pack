/*
 * Copyright 2024 Palantir Technologies, Inc. All rights reserved.
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

/*
 * This code is heavily adapted from https://github.com/changesets/action/ which
 * is licensed under the MIT License according to its package.json. However, it
 * does not have a license file in the repository nor any headers on its source.
 *
 * Below is a modified version of the MIT license.
 */

/*
MIT License

Copyright (c) 2024 authors of https://github.com/changesets/action/

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { exec, getExecOutput } from "@actions/exec";

export const setupUser = async (): Promise<void> => {
  await exec("git", [
    "config",
    "user.name",
    `"github-actions[bot]"`,
  ]);
  await exec("git", [
    "config",
    "user.email",
    `"github-actions[bot]@users.noreply.github.com"`,
  ]);
};

export const pullBranch = async (branch: string): Promise<void> => {
  await exec("git", ["pull", "origin", branch]);
};

export const push = async (
  branch: string,
  { force }: { force?: boolean } = {},
): Promise<void> => {
  await exec(
    "git",
    ["push", "origin", `HEAD:${branch}`, force && "--force"].filter<string>(
      Boolean as any,
    ),
  );
};

export const pushTags = async (): Promise<void> => {
  await exec("git", ["push", "origin", "--tags"]);
};

export const switchToMaybeExistingBranch = async (
  branch: string,
): Promise<void> => {
  const { stderr } = await getExecOutput("git", ["checkout", branch], {
    ignoreReturnCode: true,
  });
  const isCreatingBranch = !stderr.includes(`Switched to a new branch '${branch}'`)
    && !stderr.includes(`Switched to branch '${branch}'`);
  // eslint-disable-next-line no-console
  console.log("stderr: " + stderr);
  if (isCreatingBranch) {
    await exec("git", ["checkout", "-b", branch]);
  }
};

export const reset = async (
  pathSpec: string,
  mode: "hard" | "soft" | "mixed" = "hard",
): Promise<void> => {
  await exec("git", ["reset", `--${mode}`, pathSpec]);
};

export const commitAll = async (message: string): Promise<void> => {
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", message]);
};

export const checkIfClean = async (): Promise<boolean> => {
  const { stdout } = await getExecOutput("git", ["status", "--porcelain"]);
  return !stdout.length;
};

/**
 * Detects whether the current (topic) branch was forked from `main` or a `release/*`
 * branch, by comparing merge-base distances against `origin/main` and each
 * `origin/release/*`. The closest base (fewest commits since the merge-base) wins.
 *
 * Returns "ambiguous" when the closest `main` and `release/*` candidates tie — e.g. HEAD
 * was forked from a commit that is the tip of both `main` and a freshly-cut `release/*`
 * branch (the first patch on a new release line). Topology cannot disambiguate that from
 * the first minor on `main` after cutting the branch, so callers must fall back to an
 * explicit choice. Also "ambiguous" if no candidate refs resolve. Best-effort: refs that
 * cannot be resolved are skipped.
 */
export const detectBaseBranchType = async (): Promise<
  "main" | "release branch" | "ambiguous"
> => {
  // Best-effort refresh of the refs we compare against; tolerate being offline.
  await exec(
    "git",
    [
      "fetch",
      "--quiet",
      "origin",
      "refs/heads/main:refs/remotes/origin/main",
      "refs/heads/release/*:refs/remotes/origin/release/*",
    ],
    { ignoreReturnCode: true },
  );

  const { stdout: refsOut } = await getExecOutput(
    "git",
    [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/remotes/origin/main",
      "refs/remotes/origin/release/*",
    ],
    { ignoreReturnCode: true, silent: true },
  );
  const refs = refsOut.split("\n").map(line => line.trim()).filter(Boolean);

  let minMainDistance = Infinity;
  let minReleaseDistance = Infinity;
  for (const ref of refs) {
    const mergeBase = await getExecOutput("git", ["merge-base", "HEAD", ref], {
      ignoreReturnCode: true,
      silent: true,
    });
    if (mergeBase.exitCode !== 0) {
      continue;
    }
    const distance = await getExecOutput(
      "git",
      ["rev-list", "--count", `${mergeBase.stdout.trim()}..HEAD`],
      { ignoreReturnCode: true, silent: true },
    );
    if (distance.exitCode !== 0) {
      continue;
    }
    const commits = Number.parseInt(distance.stdout.trim(), 10);
    if (Number.isNaN(commits)) {
      continue;
    }
    if (ref.includes("/release/")) {
      minReleaseDistance = Math.min(minReleaseDistance, commits);
    } else {
      minMainDistance = Math.min(minMainDistance, commits);
    }
  }

  if (minReleaseDistance < minMainDistance) {
    return "release branch";
  }
  if (minMainDistance < minReleaseDistance) {
    return "main";
  }
  // Tie (HEAD sits on a commit shared by main and a release branch) or nothing
  // resolved: topology cannot decide, so require the caller to choose explicitly.
  return "ambiguous";
};
