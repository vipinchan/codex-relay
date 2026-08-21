import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content);
  console.log(`updated ${path}`);
}

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`Missing replacement target: ${label}`);
  }
  return source.replace(needle, replacement);
}

function edit(path, transform) {
  const before = read(path);
  const after = transform(before);
  if (before === after) {
    throw new Error(`No changes produced for ${path}`);
  }
  write(path, after);
}

// Pass 2: reduce developer-dashboard chrome and make navigation/chat states feel
// like a focused mobile agent. Relay/server behavior remains untouched.
edit("apps/mobile/src/components/chat/ThreadDrawerContent.tsx", (source) => {
  let next = source
    .replace("  Linking,\n", "")
    .replace('import { FaGithub } from "@/assets/icons/fa";\n', "")
    .replace('import { codexRelayRepositoryUrl } from "@/constants/links";\n', "")
    .replace("<Text style={styles.brandText}>Codex Relay</Text>", "<Text style={styles.brandText}>Codex</Text>");

  next = replaceOnce(
    next,
    `    <View style={[styles.footerBlock, { paddingBottom: Math.max(bottomInset, 8) }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open Codex Relay GitHub repository"
        onPress={() => void Linking.openURL(codexRelayRepositoryUrl)}
        style={styles.repositoryFooter}
      >
        {({ pressed }) => (
          <>
            <View style={[styles.rowIconSlot, pressed && styles.drawerPressedContent]}>
              <FaGithub size={16} color={theme.text} />
            </View>
            <View style={[styles.repositoryFooterCopy, pressed && styles.drawerPressedContent]}>
              <Text style={styles.repositoryFooterTitle}>Codex Relay on GitHub</Text>
            </View>
          </>
        )}
      </Pressable>
      <Pressable`,
    `    <View style={[styles.footerBlock, { paddingBottom: Math.max(bottomInset, 8) }]}>
      <Pressable`,
    "drawer repository footer",
  );

  next = replaceOnce(
    next,
    `            {canMutateAppServerThreads ? (
              <SheetActionRow
                accessibilityLabel="Rename chat"
                icon="newChat"
                onPress={openRenameThread}
                title="Rename chat"
              />
            ) : null}
`,
    `            {canMutateAppServerThreads ? (
              <SheetActionRow
                accessibilityLabel="Rename chat"
                icon="newChat"
                onPress={openRenameThread}
                title="Rename chat"
              />
            ) : null}
            <SheetActionRow
              accessibilityLabel="Archive chat"
              icon="archive"
              onPress={() => {
                const thread = threadWithActions;
                closeThreadActions();
                confirmArchiveThread(thread);
              }}
              title="Archive chat"
            />
`,
    "archive action sheet item",
  );

  next = next
    .replace("        archiveThreadPending={archiveThreadMutation.isPending}\n", "")
    .replace("        onArchiveThread={confirmArchiveThread}\n", "")
    .replace("  archiveThreadPending: boolean;\n", "")
    .replace("  onArchiveThread: (thread: ThreadSummary) => void;\n", "")
    .replace("  archiveThreadPending,\n", "")
    .replace("  onArchiveThread,\n", "")
    .replace("    previous.archiveThreadPending !== next.archiveThreadPending ||\n", "")
    .replace("    previous.onArchiveThread !== next.onArchiveThread ||\n", "");

  next = replaceOnce(
    next,
    `      <Button
        accessibilityLabel={\`Archive thread \${item.thread.title}\`}
        disabled={archiveThreadPending}
        onPress={() => onArchiveThread(item.thread)}
        size="icon"
        variant="ghost"
        className="size-8 rounded-md"
      >
        <Icon name="archive" size={14} tintColor={theme.textSecondary} />
      </Button>
`,
    "",
    "inline archive button",
  );

  next = next
    .replace(
      `  footer: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 42,
    paddingHorizontal: 0,
  },`,
      `  footer: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderRadius: 12,
    flexDirection: "row",
    minHeight: 44,
    paddingHorizontal: 8,
  },`,
    )
    .replace(
      `  repositoryFooter: {
    alignItems: "center",
    borderRadius: 7,
    flexDirection: "row",
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  repositoryFooterCopy: {
    flex: 1,
    minWidth: 0,
  },
  repositoryFooterTitle: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
`,
      "",
    )
    .replace("    paddingTop: 8,\n  },\n  footerText:", "    paddingTop: 8,\n  },\n  footerText:");

  return next;
});

edit("apps/mobile/src/components/chat/MessageTimeline.tsx", (source) => {
  let next = replaceOnce(
    source,
    'import { ThemedText } from "@/components/themed-text";\n',
    'import { ThemedText } from "@/components/themed-text";\nimport { Icon } from "@/components/ui/icon";\n',
    "empty state icon import",
  );
  next = replaceOnce(
    next,
    `            <View style={styles.empty}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Send a message to start the conversation.
              </ThemedText>
            </View>`,
    `            <View style={styles.empty}>
              <View style={styles.emptyMark}>
                <Icon name="model" size={20} tintColor="#F5F5F7" />
              </View>
              <ThemedText type="smallBold" style={styles.emptyTitle}>
                What do you want to build?
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Message Codex to start working in this workspace.
              </ThemedText>
            </View>`,
    "empty conversation state",
  );
  next = replaceOnce(
    next,
    `  empty: {
    alignItems: "center",
    flex: 1,
    gap: Spacing.two,
    justifyContent: "center",
    padding: Spacing.four,
  },
  emptyText: {
    maxWidth: 260,
    textAlign: "center",
  },`,
    `  empty: {
    alignItems: "center",
    flex: 1,
    gap: 7,
    justifyContent: "center",
    padding: Spacing.four,
  },
  emptyMark: {
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: "center",
    marginBottom: 3,
    width: 44,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 280,
    textAlign: "center",
  },`,
    "empty state styles",
  );
  return next;
});

edit("apps/mobile/src/components/chat/MessageBubble.tsx", (source) =>
  source
    .replace(
      `  messageFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },`,
      `  messageFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },`,
    )
    .replace(
      `  copyButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 22,
    justifyContent: "center",
    marginLeft: -1,
    width: 22,
  },`,
      `  copyButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 22,
    justifyContent: "center",
    marginLeft: -1,
    opacity: 0.58,
    width: 22,
  },`,
    ),
);

edit("apps/mobile/src/components/chat/ChatComposer.tsx", (source) =>
  source
    .replace(
      `  iconButton: {
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    width: 36,
  },`,
      `  iconButton: {
    backgroundColor: "rgba(118, 118, 128, 0.18)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    width: 36,
  },`,
    )
    .replace(
      `  contextButton: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginLeft: 2,
    width: 36,
  },`,
      `  contextButton: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginLeft: 0,
    opacity: 0.82,
    width: 36,
  },`,
    ),
);

console.log("OpenMinis-inspired UI refinement pass complete");
