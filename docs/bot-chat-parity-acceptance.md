# Private BOT chat acceptance

## Source and delivery

- Repository: `vipinchan/codex-relay`.
- Baseline: `acbe2c4e330268678369dd81fab4f0972a4b77b8` (Beta 16).
- Implementation branch: `feat/bot-chat-parity`.
- This change requires both the mobile client and the matching Relay server.
- Publishing an IPA and updating the running Mac Relay are separate delivery steps.
- The definition JSON files are managed by Relay. They are editable from a Mac terminal; they do not register an agent with the native Codex terminal client.

## Automated acceptance

| Scenario                                         | Expected result                                                                      | Coverage                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------- |
| Send images without text                         | The uploaded image reaches the Codex turn and remains in message history             | BOT API tests                          |
| Retry an uncertain request                       | The same request ID returns the original message and replies                         | BOT API tests; composer tests          |
| Leave and reopen a chat after an uncertain send  | Original request ID, image references, and submitted text remain available           | Pending submission store tests         |
| Edit a draft while a previous send completes     | Newly typed text, new images, and newly selected skills remain                       | Composer tests                         |
| Select another conversation model                | Only this direct conversation changes; BOT defaults and groups retain their settings | BOT API/store tests                    |
| Turn Fast off when BOT defaults use Fast         | Explicit standard tier persists in this conversation                                 | BOT API tests                          |
| Apply concurrent preference patches              | Independent fields are not lost                                                      | BOT API/store tests                    |
| Restore BOT defaults                             | All conversation overrides are removed                                               | BOT API tests                          |
| Edit BOT configuration during a running task     | Running task retains its snapshot; the next task uses the saved configuration        | BOT runtime tests                      |
| Inspect configuration after many tool activities | The current thread's last execution snapshot is still available                      | BOT API tests                          |
| Restart execution context                        | A new execution thread starts; BOT identity, history, and memories remain            | BOT API tests                          |
| Resume after context reset                       | Old messages are available through history lookup rather than automatically injected | BOT API tests                          |
| Mention multiple BOTs in a group                 | Later BOTs can read earlier completed replies to the same user message               | BOT runtime tests                      |
| Edit a definition in Mac and iOS concurrently    | Stale revision is rejected; both versions remain available for user resolution       | Definition tests; manual UI acceptance |
| Put invalid JSON in a definition file            | Last valid configuration remains usable; raw editor can repair it                    | Definition tests                       |
| Save a definition exceeding the UTF-8 byte limit | Reject before replacing a file or inserting a BOT database row                       | Definition and BOT API tests           |
| Replace the definition directory with a symlink  | Reject access outside the associated definition directory                            | Definition tests                       |
| Open a Markdown link from private BOT output     | Preview only a Markdown document inside that conversation's workspace                | Preview path tests                     |

## Manual iOS acceptance

These checks require a development client or a newly published IPA connected to the matching Relay. A successful JavaScript export or IPA build does not complete these checks.

- [ ] Open a private BOT chat and compare its composer, model picker, permissions picker, and message rendering with an ordinary conversation.
- [ ] Add a photo, preview and remove it, then send both an image-only prompt and a text-plus-image prompt.
- [ ] Switch models and reasoning effort, leave the chat, and return. Verify the selected conversation settings remain.
- [ ] Turn Fast off for a BOT whose default uses Fast. Verify the input controls and actual next execution use standard service.
- [ ] Interrupt a reply using Stop, including after editing the next draft.
- [ ] Simulate an interrupted network response. Confirm Retry original identifies the submitted message and image count; editing the next draft does not alter the retry.
- [ ] Leave and reopen the chat during an uncertain send. Switch between the paired Relay’s saved LAN and Tailscale addresses. Retry without creating duplicate history entries.
- [ ] After an uncertain image send, switch to a text-only model. Retry original must still reach the server with the original request ID.
- [ ] Open the upper-right preview. Inspect definition source path, raw JSON, preferred skills/plugins, current execution snapshot, and next-task configuration.
- [ ] Edit a definition in the Mac terminal while the mobile chat stays open. Verify the mobile defaults refresh and an active reply retains its captured configuration.
- [ ] Create a conflicting Mac/mobile edit. Inspect both versions and explicitly choose which content to keep.
- [ ] Open workspace files and a Markdown link; verify document preview and return navigation.
- [ ] Restart execution context while idle. Verify old messages and memories remain accessible.
- [ ] Repeat keyboard opening/closing, image selection, sheets, and preview navigation on a compact iPhone and an iPad where available.

## Capability and compatibility boundaries

- Preferred skills and plugins are shared capability preferences; saving them does not install, enable, disable, or change global plugin permissions.
- The plugin picker uses the installed Codex plugin catalog. A timeout or unsupported CLI produces an explicit unavailable state with retry; cached plugin directories are not presented as verified installations.
- Model image support is rejected in advance only when the runtime explicitly reports that the selected model does not accept images. Unknown capabilities remain unknown.
- The context ring shows a percentage only when actual usage is available for the underlying execution thread; otherwise it shows an unknown state.
- BOT form updates require a definition revision. Older mobile versions can continue reading and chatting but must be upgraded to edit BOT definitions against this Relay version.
- Existing history visibility is preserved: each BOT can retrieve its own direct chats and accessible groups. Sharing every BOT's private history and ordinary Codex sessions is a separate capability.

## Implementation verification record

The candidate on `feat/bot-chat-parity` was validated against the source baseline above before remote submission. Delivery is tracked by the GitHub branch HEAD and checks; local checks alone do not establish remote delivery. IPA publication and running Mac Relay deployment remain separate delivery stages.

| Check                                          | Actual result                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Workspace typecheck                            | Passed for server, mobile, and native fetch package                                                            |
| `pnpm lint` and repository formatting          | Passed; 0 errors and 6 warnings in existing, unchanged files                                                   |
| Server Vitest                                  | 46 test files passed, 1 file skipped; 431 tests passed, 4 skipped                                              |
| Mobile Vitest                                  | 18 test files passed; 75 tests passed                                                                          |
| Markdown regression checks                     | 20 tests passed                                                                                                |
| Isolated server build                          | Passed using the repository tsdown configuration with temporary output and explicit dependency externalization |
| iOS JavaScript/Hermes export                   | Passed; 4,929 modules, approximately 53 MB bundle                                                              |
| Patch whitespace check                         | Passed                                                                                                         |
| Native IPA build / simulator / physical device | Not verified; this checkout has no generated Xcode project or workspace                                        |
| Live installed plugin catalog                  | Not verified; the local Codex plugin-list command timed out                                                    |

Server tests use `/usr/bin/git` and disable the user's global Git exclude file only inside the test process. This avoids the older PATH Git and the global rule ignoring `.gitignore`; no user Git configuration was modified.

The server build outputs are outside the checkout. The running Relay executable was not rebuilt or restarted. New definition, image-message, runtime-inspection, and conversation-preference endpoints require deployment of the matching server before mobile acceptance.

The automated checks do not establish visual or live end-to-end acceptance. Complete the unchecked manual scenarios above using the matching client and server before claiming device acceptance.
