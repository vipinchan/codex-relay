import { afterEach, expect, it, vi } from "vitest";

import { appearanceDark, appearanceLight } from "../../../src/constants/appearance";
import { createWorkspaceWebTheme } from "../../workspace-code-editor/src/theme";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (state: unknown) => void>(),
  terminal: {
    cols: 80,
    rows: 24,
    options: { fontSize: 13 },
    renderer: {
      setTheme: vi.fn<(...args: unknown[]) => unknown>(),
      render: vi.fn<(...args: unknown[]) => unknown>(),
    },
    viewportY: 12,
    getScrollbackLength: () => 30,
    getScrollbackLine: () => null,
    loadAddon: vi.fn<(...args: unknown[]) => unknown>(),
    onResize: vi.fn<(...args: unknown[]) => unknown>(),
    open: vi.fn<(...args: unknown[]) => unknown>(),
    write: vi.fn<(...args: unknown[]) => unknown>(),
    writeln: vi.fn<(...args: unknown[]) => unknown>(),
  },
  startSession: vi.fn<() => Promise<{ sessionId: string; workspacePath: string }>>(async () => ({
    sessionId: "retained-session",
    workspacePath: "/workspace",
  })),
  startOutputStream: vi.fn<(...args: unknown[]) => unknown>(),
  fitAddon: {
    fit: vi.fn<(...args: unknown[]) => unknown>(),
    observeResize: vi.fn<(...args: unknown[]) => unknown>(),
  },
  createTerminal: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock("@webview-bridge/web", () => ({
  linkBridge: () => ({
    addEventListener: (name: string, callback: (state: unknown) => void) => {
      mocks.listeners.set(name, callback);
    },
    reportReady: vi.fn<(...args: unknown[]) => unknown>(),
    reportError: vi.fn<(...args: unknown[]) => unknown>(),
    reportSessionStatus: vi.fn<() => Promise<void>>(async () => {}),
    startSession: mocks.startSession,
    startOutputStream: mocks.startOutputStream,
  }),
}));
vi.mock("ghostty-web", () => ({
  Ghostty: { load: async () => ({}) },
  Terminal: mocks.createTerminal,
  FitAddon: vi.fn<() => unknown>(function () {
    return mocks.fitAddon;
  }),
}));

afterEach(() => vi.unstubAllGlobals());

it("applies theme messages to the open terminal without restarting its session or stream", async () => {
  const style = { setProperty: vi.fn<(...args: unknown[]) => unknown>(), colorScheme: "" };
  vi.stubGlobal("window", {
    __workspaceSshTerminalId: "terminal",
    addEventListener: vi.fn<(...args: unknown[]) => unknown>(),
  });
  vi.stubGlobal("document", {
    documentElement: { style },
    getElementById: () => ({ addEventListener: vi.fn<(...args: unknown[]) => unknown>() }),
  });
  mocks.createTerminal.mockImplementation(function () {
    return mocks.terminal;
  });

  await import("./main");
  await vi.waitFor(() => expect(mocks.startOutputStream).toHaveBeenCalledOnce());
  mocks.listeners.get("terminalOutput")?.({
    terminalId: "terminal",
    sessionId: "retained-session",
    response: { chunks: [{ seq: 1, data: "retained output" }], nextSeq: 2 },
  });
  const fitCount = mocks.fitAddon.fit.mock.calls.length;
  for (const scheme of ["dark", "light", "dark"] as const) {
    const palette = scheme === "dark" ? appearanceDark : appearanceLight;
    mocks.listeners.get("terminalState")?.({
      terminalId: "terminal",
      fontSize: 13,
      theme: createWorkspaceWebTheme(palette, scheme, "terminal"),
    });
    expect(mocks.terminal.renderer.setTheme).toHaveBeenLastCalledWith(
      expect.objectContaining({
        background: palette.terminalBackground,
        foreground: palette.terminalText,
      }),
    );
    expect(style.setProperty).toHaveBeenCalledWith(
      "--workspace-background",
      palette.terminalBackground,
    );
  }
  expect(mocks.createTerminal).toHaveBeenCalledOnce();
  expect(mocks.createTerminal).toHaveBeenCalledWith(
    expect.objectContaining({
      theme: expect.objectContaining({ foreground: appearanceDark.terminalText }),
    }),
  );
  expect(mocks.terminal.open).toHaveBeenCalledOnce();
  expect(mocks.startSession).toHaveBeenCalledOnce();
  expect(mocks.startOutputStream).toHaveBeenCalledOnce();
  expect(mocks.terminal.write).toHaveBeenCalledExactlyOnceWith("retained output");
  expect(mocks.terminal.viewportY).toBe(12);
  expect(mocks.fitAddon.fit).toHaveBeenCalledTimes(fitCount);
});
