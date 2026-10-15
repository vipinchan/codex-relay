# BOT and group chat acceptance

Feature branch: `feat/bot-groups-beta`. Target mobile release: `1.5.0-beta.14`.
BOT data lives in the relay data directory. Installing the IPA alone does not update the relay.

History visibility is enforced by the application APIs and BOT history tools.
Codex filesystem permissions remain a separate boundary: a BOT granted access to
local files can read those files directly. These personas do not run in separate
operating-system accounts or containers.

## Automated acceptance

Record the command and result before publication:

- BOT and conversation CRUD validation, encrypted transport and authentication.
- Private history isolation, group history before joining, and departure cutoff.
- Default BOT selection, explicit mentions in member order and invalid member IDs.
- Request identity deduplication and interrupted work after restart.
- Independent Codex threads, shared workspace serialization and latest memory recall.
- User-sourced memory creation, editing and deletion without deleting original chat.
- Persistent records after closing and reopening the store.
- Completed plan visibility and existing history, model and Markdown regressions.
- Repository typecheck, lint, formatting, Markdown tests and relay build.

## Device acceptance

Record screenshots and results on an iOS simulator or compatible physical device.
A successful IPA build does not complete this section.

1. Open all three tabs. Open a normal conversation and return to Sessions. Check time/project groups, search, pinning and history paging.
2. Create two BOTs with different names, instructions and models. Edit one BOT; verify other BOTs and existing conversations retain their settings.
3. Start a private conversation. Send a message, reopen it and load earlier history. Check Markdown, multiline input and keyboard safe areas.
4. Create a group with both BOTs and a shared workspace. Send without a mention, mention one BOT, then both. Check the configured order and visible progress.
5. Change the default BOT and membership. Check old history remains available and a removed BOT cannot retrieve messages sent after departure.
6. Save an explicit preference, inspect its source, edit it and ask a later turn about it. Delete the memory; verify the original message remains.
7. Search older private and group messages. Verify other BOT private chats and groups never joined are excluded.
8. Interrupt a network request and retry the same message. Verify no duplicate run. Restart the relay during a run; verify it is interrupted rather than replayed.
9. Open a completed long plan, scroll to its end, copy it, reconnect and reopen it. Verify the full plan stays visible.
10. Check pairing, notifications, Settings and workspace previews on the updated relay. Existing pairing data must remain intact.

## Release acceptance

Verify branch HEAD, workflow run and published tag target the intended commit.
Read the Release record and verify IPA name, size and SHA-256 against CI.
Record any device checks still pending in the release handoff.
