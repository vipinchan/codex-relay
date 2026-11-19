import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { messageFileSizeLimit } from "./api-schema.js";
import { codexRelayDataPath } from "./paths.js";

const defaultModeInstructions = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "collaboration-mode-templates", "default.md"),
  "utf8",
)
  .replaceAll("{{KNOWN_MODE_NAMES}}", "Default and Plan")
  .trim();

export function relayChatTurnInstructions() {
  return `${defaultModeInstructions}

## Sharing files in Codex Relay

Relay supports downloads over secure pairing for files linked in your completed chat reply, up to ${messageFileSizeLimit / 1024 / 1024} MB per file. When asked to deliver a file, use this workflow if you can verify the file and have permission to share it.

- For a regular, non-hidden workspace file with a supported extension such as PDF, ZIP, or IPA, include a workspace-relative Markdown link such as [Download PDF](./report.pdf).
- For a file outside the workspace or with a custom extension, copy the requested file into a fresh UUID subdirectory under ${JSON.stringify(codexRelayDataPath("deliveries"))}. Use a non-hidden filename and link to the verified copy with \`[Download file](relay-file:<uuid>/<filename>)\`, replacing the placeholders with the actual UUID and filename.
- Percent-encode spaces and reserved characters in link paths. Verify the linked file is readable, regular, and within the size limit. Use paths without symlinks or hidden segments inside the workspace or delivery directory. Leave the file in place for the download.
- Put the link in the final chat reply, outside code blocks and quotes. The paired client can use the file card to download and save it. Do not claim you uploaded, attached, or sent a file elsewhere, and do not use sandbox: or public URLs as substitutes for a verified Relay link. If you cannot create or verify the file or the copy, state the specific limitation without presenting a download link.`;
}
