import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

type Input = { autoFocus?: boolean; value: string; onChangeText: (value: string) => void };
type Action = { accessibilityLabel?: string; onPress: () => void; children: React.ReactNode };

const ui = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  actions: {} as Record<string, () => void>,
  input: undefined as Input | undefined,
  dismiss: vi.fn<() => void>(),
  push: vi.fn<(route: unknown) => void>(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: unknown) => {
    const index = ui.cursor++;
    if (!(index in ui.state)) ui.state[index] = initial;
    return [
      ui.state[index],
      (value: unknown) =>
        (ui.state[index] = typeof value === "function" ? value(ui.state[index]) : value),
    ];
  },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Alert: {},
  Keyboard: { dismiss: ui.dismiss },
  Platform: { select: (values: { default: unknown }) => values.default },
  Pressable: ({ accessibilityLabel, onPress, children }: Action) => {
    if (accessibilityLabel) ui.actions[accessibilityLabel] = onPress;
    return children;
  },
  ScrollView: ({ children }: { children: React.ReactNode }) => children,
  TextInput: (input: Input) => {
    ui.input = input;
    return null;
  },
  View: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("react-native-unistyles", async () => {
  const { appearanceDark } = await import("@/constants/appearance");
  return {
    StyleSheet: { create: (styles: (theme: unknown) => unknown) => styles(appearanceDark) },
  };
});
vi.mock("@/hooks/use-theme", async () => {
  const { appearanceDark } = await import("@/constants/appearance");
  return { useTheme: () => appearanceDark };
});
vi.mock("expo-router", () => ({ router: { push: ui.push }, useFocusEffect: () => undefined }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === "bots"
        ? [{ id: "muse", name: "Muse", instructions: "内容编辑" }]
        : queryKey[0] === "bot-conversations"
          ? [
              { id: "editors", kind: "group", name: "编辑组", botIds: ["muse"] },
              { id: "other", kind: "group", name: "其他组", botIds: [] },
            ]
          : undefined,
  }),
}));
vi.mock("@/hooks/use-computer-operations", () => ({ useComputerOperations: () => ({}) }));
vi.mock("@/lib/codex-relay-api", () => ({
  getCodexRelayCacheIdentity: () => "test",
  hasCodexRelaySession: () => true,
  createBotConversation: () => undefined,
  listBotConversations: () => undefined,
  listBots: () => undefined,
  listThreads: () => undefined,
}));
vi.mock("@/lib/haptics", () => ({ hapticSelection: () => undefined }));
vi.mock("@/components/ui/bottom-sheet", () => ({
  AppBottomSheet: () => null,
  AppBottomSheetTextInput: () => null,
  SheetActionRow: () => null,
  SheetSelectedDot: () => null,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./bot-ui", () => ({
  BotAvatar: () => null,
  BotPrimaryButton: () => null,
  BotRow: ({ title, onPress }: { title: string; onPress: () => void }) => {
    ui.actions[title] = onPress;
    return title;
  },
  botText: (_zh: string, en: string) => en,
}));

import { BotsHome } from "./BotsHome";

function renderHome() {
  ui.cursor = 0;
  ui.actions = {};
  ui.input = undefined;
  return renderToStaticMarkup(<BotsHome />);
}

afterEach(() => vi.unstubAllGlobals());

it("opens search on demand, retains the filter after selecting a result, and clears on close", () => {
  vi.stubGlobal("React", React);
  expect(renderHome()).toContain("其他组");
  expect(ui.input).toBeUndefined();
  expect(ui.actions["Create a BOT or group"]).toBeTypeOf("function");

  ui.actions["Search BOTs and groups"]();
  renderHome();
  expect(ui.input?.autoFocus).toBe(true);
  ui.input!.onChangeText("MUSE");
  const results = renderHome();
  expect(results).toContain("Muse");
  expect(results).toContain("编辑组");
  expect(results).not.toContain("其他组");

  ui.actions["编辑组"]();
  expect(ui.dismiss).toHaveBeenCalledTimes(1);
  expect(ui.push).toHaveBeenCalledWith({
    pathname: "/bot-chat/[conversationId]",
    params: { conversationId: "editors" },
  });
  expect(renderHome()).not.toContain("其他组");
  expect(ui.input?.value).toBe("MUSE");

  ui.actions["Clear search"]();
  expect(renderHome()).toContain("其他组");
  expect(ui.input?.value).toBe("");
  ui.input!.onChangeText("no match");
  renderHome();
  ui.actions["Close search"]();
  expect(ui.dismiss).toHaveBeenCalledTimes(2);
  expect(renderHome()).toContain("其他组");
  expect(ui.input).toBeUndefined();

  ui.actions["Search BOTs and groups"]();
  renderHome();
  expect(ui.input?.value).toBe("");
});
