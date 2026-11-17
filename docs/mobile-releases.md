# Mobile releases

`main` is the only long-lived product branch. Develop completed features in
short-lived `feat/*` or `fix/*` branches and merge them into `main` through PRs.
Existing branches are preserved; this workflow change does not delete them.

## Automatic Beta

Relevant mobile, package, dependency, and iOS workflow changes pushed to `main`
run CI checks and then build one iOS IPA. Documentation-only changes do not
build an IPA. The `iOS Beta` workflow can also be run manually on `main`.
Feature branches no longer publish Beta releases automatically.

The native app version in `apps/mobile/app.config.ts` is the version source.
For example, app version `1.5.0`, workflow run `42`, attempt `1` produces:

- Version: `1.5.0-beta.42.1`
- Tag: `v1.5.0-beta.42.1`
- IPA: `CodexRelay-1.5.0-beta.42.1.ipa`

Rerunning the full workflow increments the attempt component. Rerun all jobs
when a new Beta is needed. Published packages are never overwritten.
The release is marked as a prerelease and does not become the latest stable
release. New main pushes may cancel an obsolete Beta build; not every commit
is guaranteed to produce a finished package.

PRs targeting `main` can build downloadable IPA artifacts, but cannot publish
a GitHub Release. Artifacts expire after 30 days. Releases include the IPA,
SHA-256 file, and build information identifying the source commit.

## Stable release

Choose the exact commit that passed Beta device testing. Its configured native
app version must match the requested stable tag. For example, tag `v1.6.0`
requires `version: "1.6.0"` in `apps/mobile/app.config.ts`.
Prepare the version and `apps/mobile/CHANGELOG.md` entry on `main` before
testing the release candidate. Do not change the app version after testing
without validating the resulting package again.

Once that commit and the workflows are pushed to the fork, release it explicitly:

```sh
git tag -a v1.6.0 <tested-commit-sha> -m "Codex Relay iOS 1.6.0"
git push origin v1.6.0
```

The stable workflow checks the tagged source, validates the tag/version match
and requires the commit to be reachable from `origin/main`. It builds a fresh
IPA from that exact commit, publishes a stable GitHub Release, and downloads
the assets to verify their checksum and build metadata. Later commits on `main`
are not included. Smoke-test the final IPA after installation.

Native `CFBundleShortVersionString` remains the numeric Expo version.
Beta identifiers are recorded in the release name, IPA filename and
`build-info.txt`; `apps/mobile/package.json` is not rewritten by CI.
Do not move an already published tag or overwrite its assets. If a build fails
before publication, rerun all jobs for that tag. If a release already exists,
the publish step stops; use a new patch version for corrected packages.

These are ad-hoc signed sideload packages. A stable GitHub Release does not
submit to App Store Connect or change the signing method.

## OTA and npm

Main pushes and stable tags do not deploy OTA updates. The old automatic mobile
`*-ship.N` Changesets release PR and production OTA deployment have been removed
from GitHub Actions. Mobile changesets are not automatically consumed; use the
app version and changelog process above for native releases.
Existing explicit OTA deployment tools remain separate operations.

CI Beta and PR packages use the `beta` Hot Updater channel. Stable packages use
`production`. The workflows do not restore production mobile environment
secrets or signing keys, and do not invoke Hot Updater deployment.
Do not promote a Beta OTA bundle into production as part of merging a feature.
Both packages retain the same bundle identifier, so installing Beta replaces
the stable app on a device. Install a stable IPA again to return to its
production update channel.

The npm package `codex-relay` retains its own Changesets release PR and publish
process after checks pass on `main`. Mobile `vX.Y.Z` tags do not publish npm.
`changeset-release/npm-main` and `automation/update-codex-sdk` are automation
branches, not additional product mainlines.

## macOS

Mac Catalyst builds continue to use `pnpm build:macos` locally. These iOS
workflows do not build or publish Mac packages.
