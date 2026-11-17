# Main branch release implementation plan

**Goal:** Keep `main` as the product mainline, build an independent iOS Beta for relevant pushes, and publish stable iOS packages only from explicit `vX.Y.Z` tags.

**Architecture:** Reuse CI checks and one iOS build/publish workflow. PRs produce artifacts without releases. Main pushes produce uniquely versioned prereleases. Stable tags must match the configured native app version and point to a commit reachable from `main`. Preserve npm Changesets automation; remove automatic mobile release PRs and production OTA deployment from main pushes. Existing explicit local OTA tools remain available. Mac Catalyst continues to use the existing local build script.

## Tasks

- [x] Add and test release metadata validation for Beta run identity, stable version matching, and invalid inputs.
- [x] Make CI reusable; consolidate iOS artifact building and verified GitHub publication.
- [x] Route main Beta and stable tags through checks before building; retain PR artifact builds.
- [x] Preserve npm release automation while removing automatic mobile OTA and ship release PRs.
- [x] Document branch, version, tag, OTA, and artifact behavior.
- [x] Run focused tests, workflow validation, and repository checks; obtain an independent review.

## Validation

Run Node release policy tests, parse and lint all changed GitHub workflows, run `pnpm test`, `pnpm typecheck`, and `pnpm lint`. Record existing failures without changing unrelated code. Do not push, publish, create tags, or run native builds during workflow validation.

## Results

- Release tests: 14 Node tests and 6 mobile Vitest tests passed.
- Complete mobile Vitest suite: 41 files, 157 tests passed.
- Actual Expo configuration resolved the expected beta and production update channels.
- All 7 workflow YAML files parsed; all 31 workflow Shell steps passed `bash -n`.
- Repository lint and formatting passed with 0 errors and 6 existing warnings.
- Independent workflow review found no blocking issue; its request to retain the full mobile test gate was incorporated.
- Workspace typechecking passed. Server tests: 47 files and 446 tests passed; 1 file and 4 tests skipped.
- Markdown parsing: 20 tests passed after reinstalling the patched dependency.
- Actionlint v1.7.12 passed for all workflow files.
- Local dependency reinstall completed without lifecycle scripts; restoring the Markdown package's native assets failed because GitHub downloads were unavailable. Native builds need those assets restored and were not verified.
- No remote actions, native rebuilds, commits, tags, branch deletions, or publication were performed.
