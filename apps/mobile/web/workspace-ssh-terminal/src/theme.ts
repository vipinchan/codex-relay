import type { CanvasRenderer, GhosttyCell, IRenderable, Terminal } from "ghostty-web";

import type { WorkspaceWebTheme } from "../../workspace-code-editor/src/theme";

export function terminalTheme(theme: WorkspaceWebTheme) {
  return {
    ...theme.ansi,
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.foreground,
    cursorAccent: theme.background,
    selectionBackground: theme.selection,
    selectionForeground: theme.foreground,
  };
}

type Scrollback = NonNullable<Parameters<CanvasRenderer["render"]>[3]>;
type TerminalThemeTarget = Pick<Terminal, "wasmTerm" | "viewportY"> &
  Scrollback & { renderer?: Pick<CanvasRenderer, "render" | "setTheme"> };

export function installTerminalTheme(terminal: TerminalThemeTarget, initial: WorkspaceWebTheme) {
  const renderer = terminal.renderer;
  if (!renderer) {
    throw new Error("Terminal renderer is missing.");
  }
  const render = renderer.render.bind(renderer);
  const buffers = new WeakMap<IRenderable, IRenderable>();
  const scrollbacks = new WeakMap<Scrollback, Scrollback>();
  let colorMap = new Map<number, number>();
  let activeTheme = "";

  const recolorLine = (line: GhosttyCell[] | null) =>
    line?.map((cell) => {
      const foreground = colorMap.get((cell.fg_r << 16) | (cell.fg_g << 8) | cell.fg_b);
      const background = colorMap.get((cell.bg_r << 16) | (cell.bg_g << 8) | cell.bg_b);
      if (foreground === undefined && background === undefined) {
        return cell;
      }
      return {
        ...cell,
        fg_r: foreground === undefined ? cell.fg_r : (foreground >> 16) & 255,
        fg_g: foreground === undefined ? cell.fg_g : (foreground >> 8) & 255,
        fg_b: foreground === undefined ? cell.fg_b : foreground & 255,
        bg_r: background === undefined ? cell.bg_r : (background >> 16) & 255,
        bg_g: background === undefined ? cell.bg_g : (background >> 8) & 255,
        bg_b: background === undefined ? cell.bg_b : background & 255,
      };
    }) ?? null;

  const themedBuffer = (buffer: IRenderable) => {
    let themed = buffers.get(buffer);
    if (!themed) {
      themed = {
        getLine: (row) => recolorLine(buffer.getLine(row)),
        getCursor: () => buffer.getCursor(),
        getDimensions: () => buffer.getDimensions(),
        isRowDirty: (row) => buffer.isRowDirty(row),
        needsFullRedraw: () => buffer.needsFullRedraw?.() ?? false,
        clearDirty: () => buffer.clearDirty(),
        getGraphemeString: buffer.getGraphemeString?.bind(buffer),
      };
      buffers.set(buffer, themed);
    }
    return themed;
  };

  const themedScrollback = (scrollback: Scrollback) => {
    let themed = scrollbacks.get(scrollback);
    if (!themed) {
      themed = {
        getScrollbackLength: () => scrollback.getScrollbackLength(),
        getScrollbackLine: (row) => recolorLine(scrollback.getScrollbackLine(row)),
      };
      scrollbacks.set(scrollback, themed);
    }
    return themed;
  };

  renderer.render = (buffer, forceAll, viewportY, scrollback, opacity) => {
    if (colorMap.size === 0) {
      render(buffer, forceAll, viewportY, scrollback, opacity);
      return;
    }
    render(
      themedBuffer(buffer),
      forceAll,
      viewportY,
      scrollback ? themedScrollback(scrollback) : undefined,
      opacity,
    );
  };

  return (theme: WorkspaceWebTheme) => {
    const target = terminalTheme(theme);
    const nextTheme = JSON.stringify(target).toLowerCase();
    if (nextTheme === activeTheme) {
      return;
    }
    activeTheme = nextTheme;
    const sourceColors = {
      foreground: initial.foreground,
      background: initial.background,
      ...initial.ansi,
    };
    const targetColors = {
      foreground: theme.foreground,
      background: theme.background,
      ...theme.ansi,
    };
    colorMap = new Map(
      Object.entries(sourceColors)
        .map(
          ([key, color]) =>
            [
              Number.parseInt(color.slice(1), 16),
              Number.parseInt(targetColors[key as keyof typeof targetColors].slice(1), 16),
            ] as const,
        )
        .filter(([sourceColor, targetColor]) => sourceColor !== targetColor),
    );
    renderer.setTheme(target);
    if (terminal.wasmTerm) {
      renderer.render(terminal.wasmTerm, true, terminal.viewportY, terminal);
    }
  };
}
