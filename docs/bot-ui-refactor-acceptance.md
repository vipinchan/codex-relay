# BOT interface refactor acceptance

Branch: `feat/bot-ui-refactor`. Base: `ee65d733000d2b76bed1ac27fed19166d37b5119`.

## Automated checks

- PATCH can clear a BOT model, effort and service tier without changing omitted fields.
- Queued replies read the latest saved BOT configuration when execution starts.
- New and resumed runtime threads receive the selected configuration independently.
- Clearing model and reasoning settings on a reused thread sends explicit catalog
  defaults on the next turn, rather than inheriting the previous thread override.
- Reply runtime metadata uses protocol evidence; generated text cannot confirm a model.
- Thread creation/resumption preserves runtime settings from the response envelope;
  a stale resumed model is not presented as confirmation for a different requested model.
- Existing message databases migrate without losing history or existing records.
- Mention selection preserves member order and request identity survives retries.
- History navigation reaches the requested source or reports that it is unavailable.
- Repository lint, formatting, typecheck, Markdown tests, tests and relay build pass.

## Verification results

Local verification completed on 2026-10-16:

- Server suite: 405 passed, 4 skipped; 43 files passed, 1 skipped.
- Mobile suite: 74 passed across 18 files.
- Markdown suite: 20 passed.
- Workspace typecheck, relay build and formatting: passed.
- Workspace lint: 0 errors, 8 existing warnings.
- Git diff whitespace check: passed.
- iOS JavaScript/Hermes export: passed; output is a bundle, not an installable IPA.
- Native visual, keyboard, gesture and physical-device acceptance: pending.

Checks used the pinned pnpm 12.4.2. Server tests used the system Git with a
process-local empty excludes file because the host's older default Git and global
ignore configuration interfere with temporary test repositories. User Git settings
were not changed.

## Device acceptance

Record the device, build and screenshots for each completed scenario.

1. Search BOTs and groups on the compact home list. Open BOT details and a group conversation.
2. Create a BOT, edit its name and role, cancel changes and test the unsaved-changes prompt.
3. Select a model from the catalog, change supported effort/speed, restore defaults and reopen.
4. Change one BOT while another is running. Verify the active reply stays stable and the next reply uses the saved settings.
5. Read and copy a long Markdown reply. Scroll upward while replies arrive; verify the viewport stays put and Latest returns to the end.
6. Load earlier history and open a memory or search result older than the first page. Verify the exact source is highlighted.
7. Type @ in a group, pick members, remove a chip and send. Check default BOT, member order, progress and stop.
8. Interrupt connectivity and retry. Verify no duplicate user message or run, and that the draft remains recoverable.
9. Edit and delete a memory while preserving its source message. Verify old BOT and group records remain readable.
10. Check English/Chinese, the existing dark theme, small-screen layouts, keyboard safe areas and accessibility labels.

The existing application exposes one dark palette for both theme settings. This change
uses its semantic colors and does not introduce a separate application theme.

## Local device limitation

The available host has Xcode 14.1 and an iOS 16.1 simulator. The current application
targets iOS 16.4 or later and uses Expo 57 / React Native 0.86.3. This host cannot
provide a representative native build or device screenshots. Device acceptance
remains pending until tested with a compatible toolchain or physical-device build.

Source navigation uses the existing paginated history endpoint. Reaching a distant
source may require multiple sequential page requests; the screen shows lookup
progress and cancels further requests when it is closed. It does not silently
substitute a different message when a lookup fails.

## Delivery

This branch does not trigger the Beta publication workflow. A new Beta release and
an update to the running Mac relay require their respective deployment authorization.
