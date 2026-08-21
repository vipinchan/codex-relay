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

// OpenMinis' dark appearance is based on native iOS system surfaces. Keep Codex
// Relay dark-only for this personal build, but move the palette to the same
// black / system-gray hierarchy so every existing themed component benefits.
write(
  "apps/mobile/src/constants/theme.ts",
  `/**
 * OpenMinis-inspired native iOS palette for the personal Codex Relay client.
 * The app intentionally stays dark-only; semantic surfaces mirror iOS system
 * background/fill hierarchy so chat content remains the visual focus.
 */

import { Platform } from "react-native";

const nativeDark = {
  text: "#F5F5F7",
  background: "#000000",
  backgroundElement: "#1C1C1E",
  backgroundSelected: "#2C2C2E",
  textSecondary: "#8E8E93",
  textSecondaryStrong: "#AEAEB2",
  powerTrack: "#3A3A3C",
  powerBlue: "#5E9EFF",
  powerViolet: "#8B7BFF",
  powerMagenta: "#C77DFF",
  agentGreen: "#70C769",
  agentViolet: "#A68BDD",
  agentCyan: "#55C2DE",
  agentTeal: "#59BDB5",
} as const;

export const Colors = {
  light: nativeDark,
  dark: nativeDark,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  default: {
    sans: "System",
    sansBold: "System",
    sansMedium: "System",
    sansSemiBold: "System",
    serif: "serif",
    rounded: "System",
    mono: "monospace",
    monoMedium: "monospace",
  },
  android: {
    sans: "sans-serif",
    sansBold: "sans-serif",
    sansMedium: "sans-serif-medium",
    sansSemiBold: "sans-serif-medium",
    serif: "serif",
    rounded: "sans-serif",
    mono: "monospace",
    monoMedium: "monospace",
  },
  ios: {
    sans: "System",
    sansBold: "System",
    sansMedium: "System",
    sansSemiBold: "System",
    serif: "serif",
    rounded: "System",
    mono: "Menlo",
    monoMedium: "Menlo",
  },
  web: {
    sans: "var(--font-display)",
    sansBold: "var(--font-display-bold)",
    sansMedium: "var(--font-display-medium)",
    sansSemiBold: "var(--font-display-semibold)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
    monoMedium: "var(--font-mono-medium)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
`,
);

write(
  "apps/mobile/src/global.css",
  `@import "tailwindcss";
@import "uniwind";
@plugin "tailwindcss-animate";

@custom-variant dark (&:is(.dark *));

@theme {
  --color-border: hsl(240 2% 23%);
  --color-input: hsl(240 3% 11%);
  --color-ring: hsl(240 2% 56%);
  --color-background: hsl(0 0% 0%);
  --color-foreground: hsl(240 5% 96%);
  --color-primary: hsl(240 5% 96%);
  --color-primary-foreground: hsl(0 0% 5%);
  --color-secondary: hsl(240 3% 11%);
  --color-secondary-foreground: hsl(240 5% 96%);
  --color-destructive: hsl(0 74% 59%);
  --color-destructive-foreground: hsl(0 0% 100%);
  --color-muted: hsl(240 3% 15%);
  --color-muted-foreground: hsl(240 2% 56%);
  --color-accent: hsl(240 3% 17%);
  --color-accent-foreground: hsl(240 5% 96%);
  --color-popover: hsl(240 3% 11%);
  --color-popover-foreground: hsl(240 5% 96%);
  --color-card: hsl(240 3% 11%);
  --color-card-foreground: hsl(240 5% 96%);
  --radius-lg: 0.875rem;
  --radius-md: calc(0.875rem - 2px);
  --radius-sm: calc(0.875rem - 4px);
  --font-sans: Geist;
  --font-mono: GeistMono;
}

:root {
  --font-display:
    Geist, Inter, ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji,
    Segoe UI Symbol, Noto Color Emoji;
  --font-display-medium:
    Geist-Medium, Geist, Inter, ui-sans-serif, system-ui, sans-serif, Apple Color Emoji,
    Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
  --font-display-semibold:
    Geist-SemiBold, Geist, Inter, ui-sans-serif, system-ui, sans-serif, Apple Color Emoji,
    Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
  --font-display-bold:
    Geist-Bold, Geist, Inter, ui-sans-serif, system-ui, sans-serif, Apple Color Emoji,
    Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
  --font-mono:
    GeistMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New,
    monospace;
  --font-mono-medium:
    GeistMono-Medium, GeistMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    Liberation Mono, Courier New, monospace;
  --font-rounded: Geist, Inter, ui-sans-serif, system-ui, sans-serif;
  --font-serif: Geist, Inter, ui-sans-serif, system-ui, sans-serif;

  --radius: 0.875rem;
}
`,
);

edit("apps/mobile/src/app/_layout.tsx", (source) =>
  source.replaceAll("#191919", "#000000").replaceAll("#202222", "#0C0C0D"),
);

edit("apps/mobile/src/app/(drawer)/_layout.tsx", (source) =>
  source
    .replaceAll("#191919", "#000000")
    .replaceAll("#202222", "#0C0C0D")
    .replace('overlayColor: usesExpandedDrawer ? "transparent" : "rgba(0, 0, 0, 0.28)"', 'overlayColor: usesExpandedDrawer ? "transparent" : "rgba(0, 0, 0, 0.44)"'),
);

edit("apps/mobile/src/components/chat/ChatShellHeader.tsx", (source) => {
  let next = replaceOnce(
    source,
    'type="code"\n          themeColor="textSecondary"',
    'type="small"\n          themeColor="textSecondary"',
    "header subtitle typography",
  );
  next = replaceOnce(
    next,
    `  header: {
    alignItems: "center",
    elevation: 4,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 8,
    paddingHorizontal: 18,
    paddingTop: 6,
    zIndex: 4,
  },`,
    `  header: {
    alignItems: "center",
    elevation: 4,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingBottom: 5,
    paddingHorizontal: 14,
    paddingTop: 3,
    zIndex: 4,
  },`,
    "chat header layout",
  );
  next = replaceOnce(
    next,
    `  headerButton: {
    alignItems: "center",
    backgroundColor: "rgba(42, 42, 42, 0.8)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    position: "relative",
    width: 36,
    zIndex: 7,
  },`,
    `  headerButton: {
    alignItems: "center",
    backgroundColor: "rgba(28, 28, 30, 0.82)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: "center",
    position: "relative",
    width: 34,
    zIndex: 7,
  },`,
    "header action buttons",
  );
  next = next
    .replace('    fontSize: 10,\n    lineHeight: 14,', '    fontSize: 11,\n    lineHeight: 14,')
    .replace('    opacity: 0.84,', '    opacity: 0.62,')
    .replace('    fontSize: 17,\n    lineHeight: 22,', '    fontSize: 16,\n    lineHeight: 20,');
  return next;
});

edit("apps/mobile/src/components/chat/chat-shell-styles.ts", (source) => {
  let next = replaceOnce(
    source,
    `  shell: {
    backgroundColor: Colors.dark.background,
    flex: 1,
    gap: 0,
    paddingTop: Spacing.one,
  },`,
    `  shell: {
    backgroundColor: Colors.dark.background,
    flex: 1,
    gap: 0,
    paddingTop: 0,
  },`,
    "chat shell spacing",
  );
  next = next.replace('    elevation: 8,', '    elevation: 12,');
  return next;
});

edit("apps/mobile/src/components/chat/ThreadDrawerContent.tsx", (source) => {
  let next = source
    .replace('    paddingHorizontal: 12,\n  },\n  list:', '    paddingHorizontal: 10,\n  },\n  list:')
    .replace('    gap: 8,\n    paddingBottom: 8,\n    paddingTop: 12,', '    gap: 10,\n    paddingBottom: 10,\n    paddingTop: 10,')
    .replace('    fontSize: 14,\n    fontWeight: "600",\n    lineHeight: 18,', '    fontSize: 16,\n    fontWeight: "700",\n    lineHeight: 21,')
    .replace('    borderRadius: 8,\n    borderWidth: StyleSheet.hairlineWidth,\n    flexDirection: "row",\n    height: 32,\n    marginHorizontal: 4,', '    borderRadius: 12,\n    borderWidth: StyleSheet.hairlineWidth,\n    flexDirection: "row",\n    height: 36,\n    marginHorizontal: 0,')
    .replace('  newChatRow: {\n    alignItems: "center",\n    borderRadius: 7,\n    flexDirection: "row",\n    minHeight: 36,\n    paddingHorizontal: 8,\n  },', '  newChatRow: {\n    alignItems: "center",\n    backgroundColor: "rgba(255, 255, 255, 0.055)",\n    borderRadius: 12,\n    flexDirection: "row",\n    minHeight: 40,\n    paddingHorizontal: 8,\n  },')
    .replace('  thread: {\n    alignItems: "center",\n    borderRadius: 6,\n    flexDirection: "row",\n    minHeight: 44,', '  thread: {\n    alignItems: "center",\n    borderRadius: 10,\n    flexDirection: "row",\n    minHeight: 46,')
    .replace('  threadSelected: {\n    backgroundColor: "rgba(255, 255, 255, 0.075)",\n  },', '  threadSelected: {\n    backgroundColor: "rgba(255, 255, 255, 0.09)",\n  },')
    .replace('    backgroundColor: "#8CC7FF",', '    backgroundColor: "#F5F5F7",')
    .replace('    backgroundColor: "#191919",\n    borderTopColor:', '    backgroundColor: "#0C0C0D",\n    borderTopColor:')
    .replace('  drawerRoot: {\n    flex: 1,', '  drawerRoot: {\n    backgroundColor: "#0C0C0D",\n    flex: 1,');
  return next;
});

edit("apps/mobile/src/components/chat/ChatComposer.tsx", (source) => {
  let next = source
    .replace('const DEFAULT_COMPOSER_PLACEHOLDER = "Ask Codex anything. Try $skills or @files.";', 'const DEFAULT_COMPOSER_PLACEHOLDER = "Message Codex";')
    .replace('const PLAN_COMPOSER_PLACEHOLDER = "Ask Codex for a plan. Try $skills or @files.";', 'const PLAN_COMPOSER_PLACEHOLDER = "Plan with Codex";')
    .replace('            borderColor: "rgba(255, 255, 255, 0.1)",', '            borderColor: "rgba(255, 255, 255, 0.12)",');
  next = replaceOnce(
    next,
    `  container: {
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 18,
    gap: 5,
    marginHorizontal: 18,
    marginBottom: 6,
    marginTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },`,
    `  container: {
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    gap: 4,
    marginHorizontal: 12,
    marginBottom: 8,
    marginTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },`,
    "composer container",
  );
  next = replaceOnce(
    next,
    `  input: {
    backgroundColor: "transparent",
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
    maxHeight: 84,
    minHeight: 42,
    paddingHorizontal: 2,
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: "top",
  },`,
    `  input: {
    backgroundColor: "transparent",
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: 2,
    paddingTop: 1,
    paddingBottom: 0,
    textAlignVertical: "top",
  },`,
    "composer input",
  );
  next = next
    .replace('  actionRow: {\n    alignItems: "center",\n    flexDirection: "row",\n    gap: 8,\n    height: 40,', '  actionRow: {\n    alignItems: "center",\n    flexDirection: "row",\n    gap: 7,\n    height: 40,')
    .replace('    backgroundColor: "rgba(255, 255, 255, 0.09)",\n    borderColor: "rgba(255, 255, 255, 0.18)",', '    backgroundColor: "rgba(118, 118, 128, 0.18)",\n    borderColor: "rgba(255, 255, 255, 0.12)",')
    .replace('    backgroundColor: "#F3F4F6",', '    backgroundColor: "#F5F5F7",')
    .replace('    backgroundColor: "rgba(243, 244, 246, 0.14)",', '    backgroundColor: "rgba(245, 245, 247, 0.16)",');
  return next;
});

edit("apps/mobile/src/components/chat/MessageBubble.tsx", (source) => {
  let next = replaceOnce(
    source,
    `            <ThemedText type="code" themeColor="textSecondary" style={styles.assistantLabel}>
              Codex
            </ThemedText>
`,
    "",
    "assistant identity label",
  );
  next = replaceOnce(
    next,
    `  row: {
    marginVertical: Spacing.two,
  },`,
    `  row: {
    marginVertical: 6,
  },`,
    "message row rhythm",
  );
  next = replaceOnce(
    next,
    `  userBubble: {
    backgroundColor: "rgba(56, 56, 56, 0.8)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderWidth: 1,
    maxWidth: "82%",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },`,
    `  userBubble: {
    backgroundColor: "rgba(118, 118, 128, 0.24)",
    borderWidth: 0,
    maxWidth: "84%",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },`,
    "user bubble",
  );
  next = next
    .replace('  assistantLabel: {\n    marginBottom: Spacing.one,\n    opacity: 0.7,\n  },\n', "")
    .replace('  timestamp: {\n    opacity: 0.55,\n  },', '  timestamp: {\n    display: "none",\n  },')
    .replace('  goalValueBubble: {\n    backgroundColor: "rgba(56, 56, 56, 0.8)",\n    borderColor: "rgba(255, 255, 255, 0.09)",\n    borderRadius: 16,\n    borderWidth: 1,', '  goalValueBubble: {\n    backgroundColor: "rgba(118, 118, 128, 0.24)",\n    borderRadius: 16,\n    borderWidth: 0,');
  return next;
});

edit("apps/mobile/src/components/chat/MessageTimeline.tsx", (source) =>
  source
    .replace('    paddingHorizontal: Spacing.four,\n    paddingTop: Spacing.two,', '    paddingHorizontal: 18,\n    paddingTop: 6,')
    .replace('    paddingBottom: Spacing.two,', '    paddingBottom: 6,'),
);

edit("apps/mobile/src/components/chat/ProtocolActivityCard.tsx", (source) =>
  source
    .replace('  planCard: {\n    alignSelf: "stretch",\n    borderRadius: 10,', '  planCard: {\n    alignSelf: "stretch",\n    borderRadius: 14,')
    .replace('  inputRequestCard: {\n    borderRadius: 9,', '  inputRequestCard: {\n    borderRadius: 14,')
    .replace('    borderRadius: 9,\n    borderWidth: StyleSheet.hairlineWidth,', '    borderRadius: 12,\n    borderWidth: StyleSheet.hairlineWidth,')
    .replace('  fileChangeCard: {\n    alignSelf: "stretch",\n    borderRadius: 10,', '  fileChangeCard: {\n    alignSelf: "stretch",\n    borderRadius: 14,'),
);

edit("apps/mobile/src/components/chat/RunningFooter.tsx", (source) =>
  source
    .replace('    justifyContent: "center",\n    paddingBottom: Spacing.four,\n    paddingTop: Spacing.two,', '    justifyContent: "flex-start",\n    paddingBottom: Spacing.three,\n    paddingTop: Spacing.one,'),
);

console.log("OpenMinis-inspired UI pass complete");
