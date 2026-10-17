export function botPreviewMarkdownPath(path: string, workspacePath: string | undefined) {
  const decoded = decodeAttachmentPath(path)
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
  const workspace = workspacePath?.replace(/\\/g, "/").replace(/\/+$/, "");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(decoded)) return undefined;
  const relative = decoded.startsWith("/")
    ? workspace && decoded.startsWith(`${workspace}/`)
      ? decoded.slice(workspace.length + 1)
      : undefined
    : decoded;
  if (!relative || relative.split("/").some((part) => part === ".." || part === ""))
    return undefined;
  return /\.mdx?$/i.test(relative) ? relative : undefined;
}

function decodeAttachmentPath(path: string) {
  if (!path.startsWith("file://")) return path;
  try {
    return decodeURIComponent(new URL(path).pathname);
  } catch {
    return path;
  }
}
