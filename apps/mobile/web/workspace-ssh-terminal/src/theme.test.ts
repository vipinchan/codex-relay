import { readFileSync } from "node:fs";
import { Ghostty, type CanvasRenderer } from "ghostty-web";
import { expect, it, vi } from "vitest";

import { appearanceDark, appearanceLight } from "../../../src/constants/appearance";
import { createWorkspaceWebTheme } from "../../workspace-code-editor/src/theme";
import { installTerminalTheme } from "./theme";

it("recolors visible and scrollback text without changing the terminal buffer or scroll position", async () => {
  const wasmPath = import.meta.resolve("ghostty-web/ghostty-vt.wasm");
  const { instance } = await WebAssembly.instantiate(readFileSync(new URL(wasmPath)), {
    env: { log: () => {} },
  });
  const ghostty = new Ghostty(instance);
  const dark = createWorkspaceWebTheme(appearanceDark, "dark", "terminal");
  const light = createWorkspaceWebTheme(appearanceLight, "light", "terminal");
  const wasmTerm = ghostty.createTerminal(80, 24, {
    fgColor: Number.parseInt(dark.foreground.slice(1), 16),
    bgColor: Number.parseInt(dark.background.slice(1), 16),
  });
  wasmTerm.write("retained text");
  const originalLine = wasmTerm.getLine(0);
  const originalCursor = wasmTerm.getCursor();
  const render = vi.fn<CanvasRenderer["render"]>();
  const setTheme = vi.fn<CanvasRenderer["setTheme"]>();
  const terminal = {
    wasmTerm,
    renderer: { render, setTheme },
    viewportY: 7,
    getScrollbackLine: () => wasmTerm.getLine(0),
    getScrollbackLength: () => 12,
  };
  try {
    const updateTheme = installTerminalTheme(terminal, dark);
    updateTheme(dark);
    expect(render.mock.lastCall![0] === wasmTerm).toBe(true);
    updateTheme(light);
    expect(setTheme).toHaveBeenLastCalledWith(
      expect.objectContaining({ background: light.background }),
    );
    const [buffer, force, viewportY, scrollback] = render.mock.lastCall!;
    expect(force).toBe(true);
    expect(viewportY).toBe(7);
    for (const line of [buffer.getLine(0), scrollback!.getScrollbackLine(0)]) {
      expect(line![0]).toMatchObject({ codepoint: 114, fg_r: 31, fg_g: 35, fg_b: 40 });
    }
    expect(wasmTerm.getLine(0)).toEqual(originalLine);
    expect(wasmTerm.getCursor()).toEqual(originalCursor);
    expect(terminal.viewportY).toBe(7);
    updateTheme(dark);
    expect(render.mock.lastCall![0].getLine(0)).toEqual(originalLine);
    expect(render.mock.lastCall![0] === wasmTerm).toBe(true);
    const renderCount = render.mock.calls.length;
    updateTheme({ ...dark });
    updateTheme({ ...dark, foreground: dark.foreground.toLowerCase() });
    expect(render).toHaveBeenCalledTimes(renderCount);
  } finally {
    wasmTerm.free();
  }
});

it("roundtrips a light presentation through dark with all ANSI colors and non-palette truecolor", async () => {
  const { instance } = await WebAssembly.instantiate(
    readFileSync(new URL(import.meta.resolve("ghostty-web/ghostty-vt.wasm"))),
    { env: { log: () => {} } },
  );
  const dark = createWorkspaceWebTheme(appearanceDark, "dark", "terminal");
  const light = createWorkspaceWebTheme(appearanceLight, "light", "terminal");
  const rgb = (color: string) => Number.parseInt(color.slice(1), 16);
  const sourceColors = [dark.foreground, dark.background, ...Object.values(dark.ansi)].map(rgb);
  expect(new Set(sourceColors).size).toBe(sourceColors.length);
  const wasmTerm = new Ghostty(instance).createTerminal(80, 24, {
    fgColor: rgb(dark.foreground),
    bgColor: rgb(dark.background),
    palette: Object.values(dark.ansi).map(rgb),
  });
  const render = vi.fn<CanvasRenderer["render"]>();
  const terminal = {
    wasmTerm,
    renderer: { render, setTheme: vi.fn<CanvasRenderer["setTheme"]>() },
    viewportY: 0,
    getScrollbackLine: () => null,
    getScrollbackLength: () => 0,
  };
  try {
    const updateTheme = installTerminalTheme(terminal, dark);
    updateTheme(light);
    const codes = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
    wasmTerm.write(
      "D" + codes.map((code) => `\x1b[${code}mA`).join("") + "\x1b[38;2;18;52;86mT\x1b[0m",
    );
    const originalLine = wasmTerm.getLine(0);
    for (const theme of [light, dark, light]) {
      updateTheme(theme);
      terminal.renderer.render(wasmTerm, true, terminal.viewportY, terminal);
      const line = render.mock.lastCall![0].getLine(0)!;
      const expected = [theme.foreground, ...Object.values(theme.ansi)];
      for (const [index, color] of expected.entries()) {
        const cell = line[index];
        expect((cell.fg_r << 16) | (cell.fg_g << 8) | cell.fg_b).toBe(rgb(color));
      }
      expect(line[17]).toMatchObject({ codepoint: 84, fg_r: 18, fg_g: 52, fg_b: 86 });
      expect(wasmTerm.getLine(0)).toEqual(originalLine);
    }
  } finally {
    wasmTerm.free();
  }
});
