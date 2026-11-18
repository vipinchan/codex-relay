import {
  messageFileLinkPath,
  messageMarkdownLinks,
  stagedMessageFilePath,
} from "codex-relay/api-schema";

export type MessageLinkAction =
  | { kind: "external"; url: string }
  | { kind: "ignore" }
  | { kind: "workspace-markdown"; path: string };

const downloadableExtensions = new Set([
  "7z",
  "csv",
  "doc",
  "docx",
  "dmg",
  "epub",
  "gz",
  "ipa",
  "jpeg",
  "jpg",
  "mov",
  "mp3",
  "mp4",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "tar",
  "txt",
  "webp",
  "xls",
  "xlsx",
  "zip",
]);

export function externalFileLinks(content: string) {
  const results: { url: string; name: string; extension: string }[] = [];
  for (const url of messageMarkdownLinks(content)) {
    if (!url.startsWith("https://")) continue;
    try {
      const parsed = new URL(url);
      const name = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
      const extension = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
      if (!extension || !downloadableExtensions.has(extension)) continue;
      results.push({ url, name, extension: extension.toUpperCase() });
    } catch {
      continue;
    }
  }
  return results;
}

export function localFileLinks(content: string) {
  const files = new Map<string, { path: string; name: string; extension?: string }>();
  for (const destination of messageMarkdownLinks(content)) {
    const path = messageFileLinkPath(destination);
    if (!path) continue;
    const staged = stagedMessageFilePath(path);
    if (path.startsWith("relay-file:") && !staged) continue;
    if (!staged && (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path))) continue;
    const name = (staged ?? path).split("/").at(-1);
    if (!name) continue;
    const extension = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    if (!staged && (!extension || !downloadableExtensions.has(extension))) continue;
    files.set(path, { path, name, extension: extension?.toUpperCase() });
  }
  return [...files.values()];
}

export function messageLinkAction(url: string): MessageLinkAction {
  const normalized = unwrapMarkdownUrl(url);
  if (
    !normalized ||
    normalized.startsWith("https://codex.local/skills/") ||
    /^relay-file:/i.test(normalized)
  ) {
    return { kind: "ignore" };
  }

  if (isWorkspaceMarkdownLink(normalized)) {
    return { kind: "workspace-markdown", path: stripLocalLinkSuffix(normalized) };
  }

  if (isLocalPath(normalized)) {
    return { kind: "ignore" };
  }

  return { kind: "external", url: normalized };
}

export function messageMarkdownContentForRender(content: string) {
  return content || " ";
}

export function messageCodeContentForRender(content: string) {
  return content;
}

function unwrapMarkdownUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
}

function isWorkspaceMarkdownLink(value: string) {
  if (!isLocalPath(value)) {
    return false;
  }
  const path = decodeLinkPath(stripLocalLinkSuffix(value));
  return /\.(?:markdown|md|mdx)$/i.test(path);
}

function isLocalPath(value: string) {
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return true;
  }
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme) {
    return scheme === "file";
  }
  return !value.startsWith("//");
}

function stripLocalLinkSuffix(value: string) {
  const indexes = [value.indexOf("?"), value.indexOf("#")].filter((index) => index >= 0);
  return indexes.length === 0 ? value : value.slice(0, Math.min(...indexes));
}

function decodeLinkPath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
