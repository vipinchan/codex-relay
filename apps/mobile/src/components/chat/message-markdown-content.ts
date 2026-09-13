export type MessageLinkAction =
  | { kind: "external"; url: string }
  | { kind: "ignore" }
  | { kind: "workspace-markdown"; path: string };

export function messageLinkAction(url: string): MessageLinkAction {
  const normalized = unwrapMarkdownUrl(url);
  if (!normalized || normalized.startsWith("https://codex.local/skills/")) {
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
