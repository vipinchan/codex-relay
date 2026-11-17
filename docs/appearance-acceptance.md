# Appearance settings and acceptance

The mobile app offers **System**, **Light**, and **Dark** under Settings →
Appearance → Theme. System is the default. The preference is stored independently
of computer profiles and survives app restarts. Explicit Light or Dark choices
override the device appearance; System resumes following it.

## Color ownership

- `apps/mobile/src/constants/appearance.ts` owns native semantic palettes,
  Markdown syntax colors, editor/terminal colors, and the user-selectable BOT
  identity palette. Saved BOT identity colors remain user data across themes.
- `apps/mobile/src/constants/appearance-config.json` shares native build
  configuration colors with the app palettes.
- `apps/mobile/src/global.css` owns light/dark utility-class theme variables.
- `useTheme()` supplies reactive colors for component props and inline styles.
  Use `StyleSheet.create((theme) => ({ ... }))` for shared native styles.
  Avoid reading active colors once at module initialization.
- Markdown style factories receive the complete active palette. Code highlighting
  chooses the matching GitHub syntax theme.
- Embedded code editors and SSH terminals receive colors through their existing
  bridges. A theme update preserves the editor model and terminal session.
  An external website displayed in the web preview retains its own styling.

The image viewer keeps a dark image backdrop in both modes so photographs and
transparent image content remain legible. Its navigation controls use the image
foreground token. Branding images and saved BOT colors keep their intended colors.

## Automated acceptance

Run the workspace's pinned pnpm version:

```sh
pnpm --filter @codex-relay/mobile exec vitest run
pnpm lint
pnpm format:check
pnpm test:markdown
pnpm typecheck
pnpm test
pnpm --filter codex-relay build
pnpm --filter @codex-relay/mobile build:workspace-code-editor
pnpm --filter @codex-relay/mobile build:workspace-ssh-terminal
pnpm --filter @codex-relay/mobile exec expo export --platform ios --output-dir /tmp/codex-relay-appearance-export
```

Coverage includes setting selection, persistence and subscription, system
appearance resolution, palette completeness, contrast for primary surfaces,
Markdown colors, WebView bridge updates, terminal repainting, and a source scan
that rejects hardcoded display colors outside the theme definitions.

On hosts with old Git or a global ignore rule for `.gitignore`, run server
tests with a modern Git on PATH and process-local `core.excludesFile=/dev/null`.
This isolates temporary test repositories without changing user Git settings.

## Native device acceptance

Record the device, build, and screenshots for each completed scenario:

1. Select Light, Dark, and System. Verify the current label, selected option,
   bottom sheet, tab bar, status bar, and keyboard appearance.
2. Change the system appearance while System is selected, including backgrounding
   and returning to the app. Repeat while an explicit appearance is selected.
3. Restart the app after each choice. Verify the setting and resolved appearance
   remain correct without losing pairing, history, or drafts.
4. Inspect conversations, search and grouping, the thread drawer, pairing, saved
   computers, new chat, and all settings sections.
5. Inspect chat messages, Markdown tables/quotes/code/tasks, goal and plan
   progress, approvals, model/permission sheets, jump controls, and image viewing.
6. Inspect BOT and group lists, details, editors, memory, history, preview, and
   active conversations.
7. Inspect file/Markdown/Git/web previews, file editing, and SSH. Switch while
   there are unsaved edits or an active terminal and verify content, selection,
   scroll position, and session continuity.

The available host has Xcode 14.1 and iOS 16.1 simulators; the app targets iOS
16.4 or later. A successful JavaScript/Hermes export is not native visual
acceptance. Full native acceptance requires a compatible simulator or device.

This client-only change does not require updating the running Mac Relay.
Committing, pushing, and publishing a Beta remain separate delivery steps;
the current Beta branch's push workflow publishes release assets.
