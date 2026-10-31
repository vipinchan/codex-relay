import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ListWorkspaceDirectoriesResponse } from "codex-relay/api-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Action = { disabled?: boolean; onPress: () => void };
type Input = {
  value: string;
  editable?: boolean;
  onChangeText: (value: string) => void;
  onSubmitEditing: () => void;
};

const ui = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  actions: {} as Record<string, Action>,
  input: undefined as Input | undefined,
  pending: false,
  statusFetched: true,
  load: vi.fn<(client: unknown, path?: string) => Promise<ListWorkspaceDirectoriesResponse>>(),
  create: vi.fn<(client: unknown, body: unknown) => Promise<unknown>>(),
  setConnection: vi.fn<(state: string, message?: string) => void>(),
  alert: vi.fn<() => void>(),
  dismissKeyboard: vi.fn<() => void>(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: unknown) => {
    const index = ui.cursor++;
    if (!(index in ui.slots)) ui.slots[index] = initial;
    return [ui.slots[index], (value: unknown) => (ui.slots[index] = value)];
  },
  useRef: (initial: unknown) => {
    const index = ui.cursor++;
    if (!(index in ui.slots)) ui.slots[index] = { current: initial };
    return ui.slots[index];
  },
  useEffect: (effect: () => void) => ui.effects.push(effect),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: () => undefined,
    invalidateQueries: async () => undefined,
  }),
  useQuery: () => ({ isFetched: ui.statusFetched, data: { workspacePath: "/start" } }),
  useMutation: (options: {
    mutationFn: (path: string) => Promise<unknown>;
    onSuccess: (response: unknown) => Promise<void>;
    onError: (error: unknown) => void;
    onSettled?: () => void;
  }) => ({
    isPending: ui.pending,
    mutate: (path: string) => {
      ui.pending = true;
      void options
        .mutationFn(path)
        .then(options.onSuccess, options.onError)
        .finally(() => {
          ui.pending = false;
          options.onSettled?.();
        });
    },
  }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: ui.alert },
  Keyboard: { dismiss: ui.dismissKeyboard },
  KeyboardAvoidingView: ({ children }: { children: React.ReactNode }) => children,
  Platform: { OS: "ios" },
  View: ({ children }: { children: React.ReactNode }) => children,
  Pressable: ({
    children,
    accessibilityLabel,
    ...action
  }: Action & { children: React.ReactNode; accessibilityLabel: string }) => {
    ui.actions[accessibilityLabel] = action;
    return children;
  },
  TextInput: (input: Input) => {
    ui.input = input;
    return null;
  },
  FlatList: ({
    data,
    renderItem,
    ListEmptyComponent,
  }: {
    data: { id: string }[];
    renderItem: (info: { item: unknown }) => React.ReactNode;
    ListEmptyComponent: React.ReactNode;
  }) =>
    data.length
      ? data.map((item) => <React.Fragment key={item.id}>{renderItem({ item })}</React.Fragment>)
      : ListEmptyComponent,
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("react-native-unistyles", () => ({ StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("expo-router", () => ({ router: { back: vi.fn<() => void>() } }));
vi.mock("@/components/themed-text", () => ({
  ThemedText: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/lib/codex-relay-api", () => ({ hasCodexRelaySession: () => true }));
vi.mock("@/lib/haptics", () => ({
  hapticSelection: vi.fn<() => void>(),
  hapticSuccess: vi.fn<() => void>(),
}));
vi.mock("@/lib/server-state", () => ({
  createThreadServerState: ui.create,
  fetchWorkspaceDirectoriesState: ui.load,
  serverStateKeys: { status: () => ["status"], threads: () => ["threads"] },
  serverStateQueryFns: { status: vi.fn<() => void>() },
}));
vi.mock("@/state/chat-store", () => ({
  setActiveThread: vi.fn<() => void>(),
  setConnection: ui.setConnection,
  setHasPairedSession: vi.fn<() => void>(),
}));

import { NewChatWorkspaceScreen } from "./NewChatWorkspaceScreen";

function directory(path: string): ListWorkspaceDirectoriesResponse {
  return {
    path,
    rootPath: "/start",
    parentPath: "/",
    directories: [{ name: "child", path: `${path}/child` }],
  };
}

function renderScreen() {
  ui.cursor = 0;
  ui.actions = {};
  ui.input = undefined;
  ui.effects = [];
  const markup = renderToStaticMarkup(<NewChatWorkspaceScreen />);
  for (const effect of ui.effects) effect();
  return markup;
}

async function openScreen() {
  renderScreen();
  await vi.waitFor(() => expect(ui.load).toHaveBeenCalledTimes(1));
  renderScreen();
}

function enterPath(path: string) {
  expect(ui.input).toBeDefined();
  ui.input!.onChangeText(path);
  renderScreen();
}

const createAction = () => ui.actions["Create chat in current folder"];
const goAction = () => ui.actions["Go to entered folder"];

describe("new chat custom workspace path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    ui.slots = [];
    ui.pending = false;
    ui.statusFetched = true;
    ui.load.mockImplementation(async (_client, path) => directory(path ?? "/start"));
    ui.create.mockResolvedValue({ thread: { id: "created" } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("requires opening the draft path before creating and uses the server-normalized path", async () => {
    await openScreen();
    expect(ui.input?.value).toBe("/start");
    enterPath(" /Users/test/中文 #1/../My Projects ");
    expect(createAction().disabled).toBe(true);
    createAction().onPress();
    expect(ui.create).not.toHaveBeenCalled();
    ui.load.mockResolvedValueOnce(directory("/Users/test/My Projects"));
    ui.input!.onSubmitEditing();
    await vi.waitFor(() => expect(ui.load).toHaveBeenCalledTimes(2));
    renderScreen();
    expect(ui.load.mock.lastCall?.[1]).toBe("/Users/test/中文 #1/../My Projects");
    expect(ui.input?.value).toBe("/Users/test/My Projects");
    expect(ui.dismissKeyboard).toHaveBeenCalled();
    expect(createAction().disabled).toBe(false);
    createAction().onPress();
    await vi.waitFor(() =>
      expect(ui.create).toHaveBeenCalledWith(expect.anything(), {
        title: "New chat",
        workspacePath: "/Users/test/My Projects",
      }),
    );
  });

  it("rejects empty and relative paths locally", async () => {
    await openScreen();
    for (const path of ["", "  ", "../project", "~/Projects"]) {
      enterPath(path);
      goAction().onPress();
      expect(renderScreen()).toMatch(/Enter (a folder path|an absolute path)/);
    }
    expect(ui.load).toHaveBeenCalledTimes(1);
  });

  it("preserves a typed path when the initial status arrives late", () => {
    ui.statusFetched = false;
    renderScreen();
    enterPath("/manual");
    ui.statusFetched = true;
    renderScreen();
    expect(ui.load).not.toHaveBeenCalled();
    expect(ui.input?.value).toBe("/manual");
  });

  it.each(["invalid_workspace_path", "workspace_unavailable"])(
    "keeps the draft and previous folder without going offline on %s",
    async (code) => {
      await openScreen();
      enterPath("/missing");
      ui.load.mockRejectedValueOnce(Object.assign(new Error("Folder is unavailable"), { code }));
      ui.setConnection.mockClear();
      goAction().onPress();
      await vi.waitFor(() => expect(ui.load).toHaveBeenCalledTimes(2));
      expect(renderScreen()).toContain("Folder is unavailable");
      expect(ui.input?.value).toBe("/missing");
      expect(createAction().disabled).toBe(true);
      expect(ui.setConnection).not.toHaveBeenCalledWith("offline", expect.anything());
      expect(ui.alert).not.toHaveBeenCalled();
      ui.actions["Open folder child"].onPress();
      await vi.waitFor(() => expect(ui.load).toHaveBeenCalledTimes(3));
      renderScreen();
      expect(ui.input?.value).toBe("/start/child");
      expect(createAction().disabled).toBe(false);
    },
  );

  it("retains network error handling and lets manual entry recover an initial load failure", async () => {
    ui.load.mockRejectedValueOnce(new Error("Connection lost"));
    await openScreen();
    expect(createAction().disabled).toBe(true);
    expect(ui.setConnection).toHaveBeenCalledWith("offline", "Connection lost");
    expect(ui.input?.editable).not.toBe(false);
    enterPath("/recovered");
    goAction().onPress();
    await vi.waitFor(() => expect(ui.load).toHaveBeenCalledTimes(2));
    renderScreen();
    expect(ui.input?.value).toBe("/recovered");
    expect(createAction().disabled).toBe(false);
  });

  it("blocks repeated requests and creation while a folder is loading", async () => {
    await openScreen();
    enterPath("/next");
    let finish!: (value: ListWorkspaceDirectoriesResponse) => void;
    ui.load.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const go = goAction();
    go.onPress();
    go.onPress();
    createAction().onPress();
    renderScreen();
    expect(ui.load).toHaveBeenCalledTimes(2);
    expect(ui.input?.editable).toBe(false);
    expect(createAction().disabled).toBe(true);
    expect(ui.actions["Open folder child"].disabled).toBe(true);
    expect(ui.create).not.toHaveBeenCalled();
    finish(directory("/next"));
    await vi.waitFor(() => {
      renderScreen();
      expect(createAction().disabled).toBe(false);
    });
  });

  it("blocks duplicate creation and folder changes while creating", async () => {
    await openScreen();
    let finish!: (value: unknown) => void;
    ui.create.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const create = createAction();
    create.onPress();
    create.onPress();
    ui.actions["Open folder child"].onPress();
    renderScreen();
    expect(ui.create).toHaveBeenCalledTimes(1);
    expect(ui.load).toHaveBeenCalledTimes(1);
    expect(ui.input?.editable).toBe(false);
    expect(goAction().disabled).toBe(true);
    finish({ thread: { id: "created" } });
    await vi.waitFor(() => expect(ui.pending).toBe(false));
  });
});
