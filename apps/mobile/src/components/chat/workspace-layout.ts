import { Platform } from "react-native";
import { isMacLocalBuild } from "@/lib/build-platform";

export type DeviceIdiom = "phone" | "tablet" | "desktop";
export type LayoutBreakpoint = "compact" | "regular" | "wide" | "desktop";

export const BREAKPOINT_REGULAR = 768;
export const BREAKPOINT_WIDE = 1024;
export const BREAKPOINT_DESKTOP = 1200;

export const DEFAULT_SIDEBAR_WIDTH = 300;
export const MIN_SIDEBAR_WIDTH = 260;
export const MAX_SIDEBAR_WIDTH = 380;

export const MIN_CHAT_WIDTH = 500;
export const MAX_READING_WIDTH = 860;
export const MAC_ICON_RAIL_WIDTH = 56;
// The macOS window keeps a traffic-light strip above the app content. Desktop
// panes that sit under it (icon rail, thread sidebar) pad by this much so their
// controls never collide with the window buttons.
export const MAC_TITLEBAR_MIN_INSET = 32;

export const DEFAULT_PREVIEW_WIDTH = 420;
export const MIN_PREVIEW_WIDTH = 320;
export const MAX_PREVIEW_WIDTH = 720;

export function isMacCatalystPlatform(): boolean {
  return Boolean(
    (Platform as { isMacCatalyst?: boolean }).isMacCatalyst ||
    isMacLocalBuild ||
    (Platform.constants as { isMacCatalyst?: boolean })?.isMacCatalyst,
  );
}

export function titlebarInset(topInset: number, isMac = isMacCatalystPlatform()): number {
  return isMac ? Math.max(topInset, MAC_TITLEBAR_MIN_INSET) : topInset;
}

export function resolveBreakpoint(width: number): LayoutBreakpoint {
  if (width < BREAKPOINT_REGULAR) return "compact";
  if (width < BREAKPOINT_WIDE) return "regular";
  if (width < BREAKPOINT_DESKTOP) return "wide";
  return "desktop";
}

export function shouldShowDesktopWorkspace(
  width: number,
  isMac = isMacCatalystPlatform(),
  isPad = Boolean((Platform as { isPad?: boolean }).isPad),
): boolean {
  if (isMac) {
    return width >= BREAKPOINT_WIDE;
  }
  return isPad && width >= BREAKPOINT_WIDE;
}

export function shouldShowThreeColumnDesktop(
  width: number,
  isMac = isMacCatalystPlatform(),
): boolean {
  return isMac && width >= BREAKPOINT_DESKTOP;
}

export function clampSidebarWidth(width: number, availableWidth: number): number {
  const maxPossible = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, availableWidth - MIN_CHAT_WIDTH),
  );
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(width, maxPossible));
}

export function clampPreviewWidth(width: number, availableWidth: number): number {
  const maxPossible = Math.max(
    MIN_PREVIEW_WIDTH,
    Math.min(MAX_PREVIEW_WIDTH, availableWidth - MIN_CHAT_WIDTH - MIN_SIDEBAR_WIDTH),
  );
  return Math.max(MIN_PREVIEW_WIDTH, Math.min(width, maxPossible));
}
