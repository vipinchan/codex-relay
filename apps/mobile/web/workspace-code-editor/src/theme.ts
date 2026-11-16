import type { AppearanceColors } from "../../../src/constants/appearance";

export function createWorkspaceWebTheme(
  colors: AppearanceColors,
  scheme: "light" | "dark",
  surface: "code" | "terminal",
) {
  return {
    scheme,
    background: surface === "code" ? colors.codeBackground : colors.terminalBackground,
    foreground: surface === "code" ? colors.codeText : colors.terminalText,
    muted: colors.textSecondary,
    selection: colors.terminalSelection,
    ansi: {
      black: scheme === "dark" ? colors.backgroundAlt : colors.text,
      red: colors.dangerStrong,
      green: colors.successStrong,
      yellow: colors.warning,
      blue: colors.accentStrong,
      magenta: colors.syntaxFunction,
      cyan: colors.agentCyan,
      white: colors.textSecondaryStrong,
      brightBlack: colors.textMuted,
      brightRed: colors.danger,
      brightGreen: colors.success,
      brightYellow: colors.warningStrong,
      brightBlue: colors.accent,
      brightMagenta: colors.powerMagenta,
      brightCyan: colors.info,
      brightWhite: colors.text,
    },
  };
}

export type WorkspaceWebTheme = ReturnType<typeof createWorkspaceWebTheme>;

export function applyWorkspaceWebTheme(theme: WorkspaceWebTheme) {
  const style = document.documentElement.style;
  style.colorScheme = theme.scheme;
  style.setProperty("--workspace-background", theme.background);
  style.setProperty("--workspace-foreground", theme.foreground);
  style.setProperty("--workspace-muted", theme.muted);
  style.setProperty("--workspace-selection", theme.selection);
}
