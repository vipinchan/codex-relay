import { mkdir, mkdtemp, open, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deliveredFileMetadata, readDeliveredFileChunk } from "../src/delivered-file.js";

describe("delivered file authorization and download", () => {
  it("only exposes a file explicitly linked by the selected assistant message", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "relay-delivery-"));
    const path = join(workspace, "report.pdf");
    await writeFile(path, "content");
    const message = { id: "answer", role: "assistant" as const, content: `[report](<${path}>)` };

    const metadata = await deliveredFileMetadata({ workspace, message, path });
    expect(metadata.name).toBe("report.pdf");
    expect(metadata.size).toBe(7);
    const chunk = await readDeliveredFileChunk({ workspace, message, path, metadata, offset: 0 });
    expect(Buffer.from(chunk.data, "base64").toString()).toBe("content");

    await expect(
      deliveredFileMetadata({ workspace, message: { ...message, role: "user" }, path }),
    ).rejects.toThrow("File was not explicitly delivered");
    await expect(
      deliveredFileMetadata({ workspace, message, path: join(workspace, "other.pdf") }),
    ).rejects.toThrow("File was not explicitly delivered");
    await expect(
      deliveredFileMetadata({
        workspace,
        message: { ...message, content: `\`\`\`\n[report](<${path}>)\n\`\`\`` },
        path,
      }),
    ).rejects.toThrow("File was not explicitly delivered");
  });

  it("rejects changed files and symlink substitutions", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "relay-delivery-"));
    const path = join(workspace, "report.pdf");
    const link = join(workspace, "link.pdf");
    await writeFile(path, "content");
    await symlink(path, link);
    const message = { id: "answer", role: "assistant" as const, content: `[report](${path})` };
    const metadata = await deliveredFileMetadata({ workspace, message, path });
    await writeFile(path, "changed content");
    await expect(
      readDeliveredFileChunk({ workspace, message, path, metadata, offset: 0 }),
    ).rejects.toThrow("File changed");
    await expect(
      deliveredFileMetadata({
        workspace,
        message: { ...message, content: `[link](${link})` },
        path: link,
      }),
    ).rejects.toThrow("Symbolic links cannot be downloaded");
  });

  it("streams bounded chunks and rejects relative traversal and oversized files", async () => {
    const parent = await mkdtemp(join(tmpdir(), "relay-delivery-"));
    const workspace = join(parent, "workspace");
    await mkdir(workspace);
    const path = join(workspace, "large.zip");
    await writeFile(path, Buffer.alloc(600 * 1024, 7));
    const message = {
      id: "answer",
      role: "assistant" as const,
      content: "[download](large.zip) [outside](../outside.zip)",
    };
    const metadata = await deliveredFileMetadata({ workspace, message, path: "large.zip" });
    const first = await readDeliveredFileChunk({
      workspace,
      message,
      path: "large.zip",
      metadata,
      offset: 0,
    });
    const last = await readDeliveredFileChunk({
      workspace,
      message,
      path: "large.zip",
      metadata,
      offset: first.nextOffset,
    });
    expect(Buffer.from(first.data, "base64")).toHaveLength(512 * 1024);
    expect(last.nextOffset).toBe(metadata.size);
    await writeFile(join(parent, "outside.zip"), "secret");
    await expect(
      deliveredFileMetadata({ workspace, message, path: "../outside.zip" }),
    ).rejects.toThrow("inside the workspace");

    const handle = await open(path, "w");
    await handle.truncate(200 * 1024 * 1024 + 1);
    await handle.close();
    await expect(deliveredFileMetadata({ workspace, message, path: "large.zip" })).rejects.toThrow(
      "exceeds the 200 MB limit",
    );
  });

  it("allows outside files only after explicit staging and blocks nested symlink escapes", async () => {
    const parent = await mkdtemp(join(tmpdir(), "relay-delivery-"));
    const workspace = join(parent, "workspace");
    const staging = join(parent, "deliveries");
    const delivery = "12345678-1234-4123-8123-123456789abc";
    await mkdir(workspace);
    await mkdir(join(staging, delivery), { recursive: true });
    const outside = join(parent, "outside.ipa");
    await writeFile(outside, "outside");
    await writeFile(join(staging, delivery, "build.ipa"), "snapshot");
    await symlink(parent, join(workspace, "escape"));
    const staged = `relay-file:${delivery}/build.ipa`;
    const message = {
      id: "answer",
      role: "assistant",
      content: `[outside](${outside}) [escape](escape/outside.ipa) [build](${staged})`,
    };
    await expect(
      deliveredFileMetadata({ workspace, staging, message, path: outside }),
    ).rejects.toThrow("inside the workspace");
    await expect(
      deliveredFileMetadata({ workspace, staging, message, path: "escape/outside.ipa" }),
    ).rejects.toThrow("inside the workspace");
    await expect(
      deliveredFileMetadata({ workspace, staging, message, path: staged }),
    ).resolves.toMatchObject({
      name: "build.ipa",
      size: 8,
    });
  });
});
