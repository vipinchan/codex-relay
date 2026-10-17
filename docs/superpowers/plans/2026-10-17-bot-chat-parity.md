# BOT Chat Parity Implementation Plan

> **For agentic workers:** Execute the independent backend, definition storage, and preview tasks with native subagents; integrate and review in the primary thread. Steps use checkbox syntax for tracking.

**Goal:** Give private BOT conversations the ordinary chat composer, images, conversation-specific model settings, and a preview of editable BOT definitions and actual execution configuration.

**Architecture:** Reuse `ChatComposer`, `ChatControls`, `MessageBubble`, and the existing workspace explorer. Store conversation overrides and execution snapshots with BOT history. Store validated BOT definitions in Relay-owned JSON files, shared by the mobile editor and Mac file edits.

**Tech Stack:** TypeScript, React Native, Expo Router, TanStack Query, Hono, Zod, libSQL, Vitest.

## Global Constraints

- Target `vipinchan/codex-relay`; baseline `acbe2c4e330268678369dd81fab4f0972a4b77b8`; local branch `feat/bot-chat-parity`.
- This implementation does not authorize publication or Mac Relay deployment.
- Preserve the running Relay's generated executable, pairing data, settings, and identity.
- Skills and plugins remain shared; BOT selections express preferred capabilities.
- Preserve BOT identity, messages, and memories when changing models or resetting execution context.
- Reuse ordinary chat UI primitives; use `AppBottomSheet` for sheets.
- Use fixed BOT-associated definition paths; do not expand workspace file access.
- Existing ordinary conversations and BOT groups retain their current configuration scope.

---

### Task 1: Conversation inputs and execution configuration

**Files:** `packages/codex-relay/src/api-schema.ts`, `bot-store.ts`, `bot-runtime.ts`, `app.ts`; focused BOT API/store tests.

**Interfaces:** Image inputs use `PromptAttachmentSchema`; skill inputs use `PromptSkillSchema`. A direct conversation has optional `preferences` for `model`, `reasoningEffort`, `serviceTier`, and `runtimeMode`. Nullable PATCH values clear an override, except `serviceTier: null`, which explicitly selects standard service; the reset endpoint removes every override. Runtime responses distinguish the execution snapshot from the configuration for the next task.

- [x] Persist attachments and skill references with the idempotent user request.
- [x] Pass validated images and skill inputs to the actual Codex turn.
- [x] Add direct-conversation preferences, restore defaults, runtime inspection, and idle-only context reset endpoints.
- [x] Capture role/configuration revision at execution start; changes affect subsequent tasks.
- [x] Keep original history queryable without injecting all history into every new context.
- [x] Verify image-only input, retry identity, preference isolation, reset preservation, and in-flight configuration behavior in temporary test stores.

### Task 2: Shared editable BOT definitions

**Files:** New `packages/codex-relay/src/bot-definitions.ts`; shared API contracts and routes integrated by Task 1.

**Interfaces:** `GET /v1/bots/:botId/definition`; `PUT` with `{content, expectedRevision}`. Form PATCH accepts `expectedRevision`. Definitions contain role, display settings, model defaults, and preferred shared skills/plugins.

- [x] Materialize canonical definitions for existing BOT profiles without changing stable identities.
- [x] Validate external edits and synchronize valid changes before reads/execution.
- [x] Retain last valid configuration when a file is malformed and expose an actionable status.
- [x] Serialize writes, use atomic replacement, and reject stale revisions with HTTP 409.
- [x] Expose installed plugin metadata for selecting shared capabilities.
- [x] Verify conflict detection, malformed external edits, path constraints, and concurrent writes using temporary directories.

### Task 3: Ordinary composer and message rendering

**Files:** `apps/mobile/src/components/bots/BotChatScreen.tsx`; new direct composer/helper files; existing `ChatComposer.tsx`, `MessageBubble.tsx`, shared image attachment helper; mobile API wrappers.

**Interfaces:** Private BOT drafts use a namespaced composer key; requests include uploaded image references and selected skills. Group composer remains supported.

- [x] Reuse `ChatComposer` and `ChatControls` for direct chats.
- [x] Share gallery/upload behavior with ordinary chats.
- [x] Keep drafts, images, selected skills, and the same request ID during retry.
- [x] Persist model/effort/tier/runtime choices only to the current conversation.
- [x] Reuse ordinary `MessageBubble` for private messages and existing protocol activity cards.
- [x] Open the BOT preview from the upper-right toolbar.
- [x] Display actual context usage only when reported by the execution runtime.

### Task 4: Definition and execution preview

**Files:** New BOT preview and definition editor screens/routes; `BotEditorScreen.tsx`, `bot-editor-config.ts`, `app/_layout.tsx`.

**Interfaces:** Consume the definition and runtime endpoints from Tasks 1–2; reuse `FileWorkspacePreviewTab`.

- [x] Show definition source path/content and a raw editor with conflict-aware saves.
- [x] Show current execution configuration separately from the next-task configuration.
- [x] Support preferred skill/plugin selection from the shared library.
- [x] Provide restore defaults, set BOT defaults, and idle-only reset context actions.
- [x] Preserve unsaved form and raw edits on validation failures or conflicts.

### Task 5: Integration and acceptance

**Files:** `docs/bot-chat-parity-acceptance.md`.

- [x] Review the complete diff for configuration scope, attachment path validation, and data preservation.
- [x] Run focused regressions, lint, formatting, typecheck, Markdown checks, and the applicable full test suites.
- [x] Build the server into an isolated temporary output directory.
- [x] Attempt simulator verification if the environment supports this React Native application; record visual acceptance separately from automated checks.
- [x] Record the exact source baseline, local branch, checks, limitations, and remaining publishing/deployment stages.
