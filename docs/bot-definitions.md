# BOT definitions

Each BOT has one Relay-owned JSON definition file at
`<CODEX_RELAY_HOME>/bot-definitions/<bot-id>.json`. If `CODEX_RELAY_HOME` is unset, the Relay
uses its normal platform data directory. The filename is the BOT's stable ID. The file contains
its role instructions, defaults, and preferred skills and plugins. Chat history and memories stay
in the BOT database.

The iOS form and raw file editor update this same file. On a Mac, edit the file with any text
editor or terminal command. The definition endpoint rereads it on the next request; it does not
need a Relay or Codex restart. The Relay also reads it before starting a BOT task. An active task
continues with the configuration captured when that task started. Existing ordinary Codex terminal
sessions are separate sessions and do not automatically adopt BOT definition edits.

Definitions use the Relay's JSON schema. They are not native Codex agent files. Preferences in
`preferredSkills` and `preferredPlugins` identify installed, shared capabilities that the BOT
should favor for its domain. They do not install, enable, disable, or grant access to a global
capability.

Example:

```json
{
  "schemaVersion": 1,
  "botId": "a30f4aaf-5888-44e0-9c25-d2a87229ef95",
  "name": "Research",
  "color": "#6BA6FA",
  "instructions": "Focus on research questions and cite evidence.",
  "runtimeMode": "default",
  "preferredSkills": ["skill-id"],
  "preferredPlugins": ["plugin-id"]
}
```

The file also accepts optional `model`, `reasoningEffort`, and `serviceTier` values supported by
the API. JSON must have the matching `botId`, recognized fields, and valid values. Invalid edits
are shown with a validation error; the Relay keeps the last valid configuration for that BOT. On
restart, the database's last valid profile provides the fallback. Files are limited to 128,000
UTF-8 bytes. For an oversized file, the editor shows a capped preview and a revision that still
allows a valid replacement. Fix the file on the Mac or use the raw editor on iOS to restore a
valid definition.

The API returns a revision for each file. For files within the limit, it is the SHA-256 digest of
the full content. For oversized files, it is an opaque digest of a capped prefix and file metadata;
the Relay does not scan the entire file. Saves must include the revision shown when the editor
opened. If the file changed in the meantime, the API responds with a conflict so the user can
reload and compare changes before saving. The Relay writes files atomically and restricts access
to the file associated with the requested BOT ID.
