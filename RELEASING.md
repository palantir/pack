# Releasing

We use changesets for version management in this repository, however we manually decide when to ship new versions.

The release Github Actions workflow is run automatically on `main` and `release/.*`. This will publish any package that is:
a. public
b. has not been published to NPM at the version in its current `package.json` version field.

In `packages/monorepo/release` is code that is adapted from changesets/action that will let you create the PR branch for releasing. There is a utility script at `./scripts/createReleasePr.sh` that ensures you are compiled and does some sanity checks prior to creating the release PR.

## Releasing

Releases are cut by bumping versions and letting the Release GitHub Actions workflow publish on merge. The branching model is enforced automatically (see [Branching model enforcement](#branching-model-enforcement)): **`main` cuts minor/major releases, `release/*` branches cut patches.**

There are two equivalent ways to prepare a release; both are gated identically:

- `./scripts/createReleasePr.sh` — run on `main` or a `release/*` branch. Creates a `changeset-release/<branch>` "Version Packages" PR; merge it to publish.
- `./scripts/createReleaseCommit.sh` — run on a topic branch forked from `main` or a `release/*` branch. Bumps versions and commits them; open a PR yourself and merge to publish. (Add an empty changeset with `pnpm exec changeset add --empty` so CI checks pass.)

### Cutting a minor/major release (from `main`)

1. Ensure the relevant changesets are on `main`.
2. Prepare the release with either script above, then merge the PR. All publishable packages are versioned together (see [Uni-versioning](#uni-versioning)) and published to the `latest` tag.

### Starting a patch line (`release/*` branch)

1. Create a `release/X.Y` branch from the `main` commit you want to stabilize.
2. Because `main` only ever publishes new minors and a `release/*` branch only publishes patches within its line, their versions never collide — there is no longer any need to pre-bump `main` when cutting a branch.

### Cutting a patch release (from a `release/*` branch)

1. Open PRs against `release/X.Y` containing **patch-only** changesets.
2. Prepare the release with either script above, then merge. A `minor`/`major` changeset on a release branch is rejected by the gate.

> **Note:** `./scripts/simulateMinorBump.sh` belonged to the old prerelease/beta flow (it requires `.changeset/pre.json` and produces `-beta` versions) and is obsolete under uni-versioning.

## Branching model enforcement

To keep release lines coherent under uni-versioning, we only cut **minor/major** releases from `main` and **patch** releases from `release/*` branches.

This is enforced authoritatively in CI, in `ciPublish.ts`, **before** anything is published: it compares each package's version against what is already on npm, derives the release-level bump, and refuses to publish (exits non-empty) if the bump is not allowed for the current branch. Because this runs on the protected destination branch after merge, it cannot be bypassed by how the release commit or PR was prepared.

`./scripts/createReleaseCommit.sh` also runs the same check locally (via `mutateReleasePlan`) for early feedback, detecting whether your topic branch was forked from `main` or a `release/*` branch. Set `VERSION_COMMIT_BRANCH_TYPE` (`main` or `release branch`) to override the detected base.

## Uni-versioning

All publishable `@palantir/pack.*` packages share a single version. This is configured via the `fixed` group in `.changeset/config.json` (private packages such as `@palantir/pack.monorepo.*`, `@palantir/pack.docs`, and `@palantir/pack.sdkgen.demo-template` are excluded).

Because the group is `fixed`, a changeset touching any one package bumps and publishes **all** of them together at the same version. This keeps every published package on the same version line, so a single `release/` branch backports patches for a given minor across the whole set.