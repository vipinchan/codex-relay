import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { select: (values: Record<string, unknown>) => values.ios ?? values.default },
}));

describe("appearance palettes", () => {
  it("provides distinct light and dark surfaces and readable text", async () => {
    const { Colors } = await import("./theme");

    expect(Colors.light.background).not.toBe(Colors.dark.background);
    expect(Colors.light.text).not.toBe(Colors.dark.text);
    expect(Colors.light.backgroundElement).not.toBe(Colors.dark.backgroundElement);
    expect(Object.keys(Colors.light).sort()).toEqual(Object.keys(Colors.dark).sort());
  });

  it("uses the system appearance by default and validates persisted settings", async () => {
    const theme = await import("./theme");

    expect(theme.normalizeThemeMode(undefined)).toBe("system");
    expect(theme.normalizeThemeMode("invalid")).toBe("system");
    expect(theme.normalizeThemeMode("light")).toBe("light");
    expect(theme.normalizeThemeMode("dark")).toBe("dark");
    expect(theme.normalizeThemeMode("system")).toBe("system");
  });

  it("resolves system appearance and keeps explicit choices independent", async () => {
    const theme = await import("./theme");

    expect(theme.resolveThemeScheme("system", "dark")).toBe("dark");
    expect(theme.resolveThemeScheme("system", "light")).toBe("light");
    expect(theme.resolveThemeScheme("system", null)).toBe("light");
    expect(theme.resolveThemeScheme("light", "dark")).toBe("light");
    expect(theme.resolveThemeScheme("dark", "light")).toBe("dark");
  });

  it("keeps text readable on page, code, terminal, and primary action surfaces", async () => {
    const { Colors } = await import("./theme");

    for (const palette of Object.values(Colors)) {
      for (const [foreground, background] of [
        [palette.text, palette.background],
        [palette.textSecondary, palette.backgroundElement],
        [palette.codeText, palette.codeBackground],
        [palette.terminalText, palette.terminalBackground],
        [palette.onAccent, palette.accent],
        [palette.botActionForeground, palette.botPrimaryBackground],
        [palette.botActionForeground, palette.botUserBubbleBackground],
      ]) {
        expect(foreground).toMatch(/^#[0-9a-f]{6}$/iu);
        expect(background).toMatch(/^#[0-9a-f]{6}$/iu);
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/.{2}/gu)!
      .map((channel) => {
        const value = Number.parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}
