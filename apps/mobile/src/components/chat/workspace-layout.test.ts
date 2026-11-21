import { vi } from "vitest";
vi.mock("react-native", () => ({
  Platform: { OS: "ios", isPad: true, constants: {} },
}));

import { describe, expect, it } from "vitest";
import {
  clampPreviewWidth,
  clampSidebarWidth,
  resolveBreakpoint,
  shouldShowDesktopWorkspace,
  shouldShowThreeColumnDesktop,
} from "./workspace-layout";

describe("workspace-layout", () => {
  it("resolves breakpoints correctly based on screen width", () => {
    expect(resolveBreakpoint(375)).toBe("compact");
    expect(resolveBreakpoint(767)).toBe("compact");
    expect(resolveBreakpoint(768)).toBe("regular");
    expect(resolveBreakpoint(1023)).toBe("regular");
    expect(resolveBreakpoint(1024)).toBe("wide");
    expect(resolveBreakpoint(1199)).toBe("wide");
    expect(resolveBreakpoint(1200)).toBe("desktop");
    expect(resolveBreakpoint(1920)).toBe("desktop");
  });

  it("determines when to show desktop workspace", () => {
    expect(shouldShowDesktopWorkspace(1024, true)).toBe(true);
    expect(shouldShowDesktopWorkspace(1200, true)).toBe(true);
    expect(shouldShowDesktopWorkspace(800, true)).toBe(false);
    expect(shouldShowDesktopWorkspace(1200, false, false)).toBe(false);
    expect(shouldShowDesktopWorkspace(1200, false, true)).toBe(true);
  });

  it("determines 3-column desktop layout", () => {
    expect(shouldShowThreeColumnDesktop(1200, true)).toBe(true);
    expect(shouldShowThreeColumnDesktop(1440, true)).toBe(true);
    expect(shouldShowThreeColumnDesktop(1199, true)).toBe(false);
    expect(shouldShowThreeColumnDesktop(1440, false)).toBe(false);
  });

  it("clamps sidebar width within constraints", () => {
    expect(clampSidebarWidth(200, 1400)).toBe(260);
    expect(clampSidebarWidth(300, 1400)).toBe(300);
    expect(clampSidebarWidth(500, 1400)).toBe(380);
    expect(clampSidebarWidth(300, 700)).toBe(260);
  });

  it("clamps preview width within constraints", () => {
    expect(clampPreviewWidth(200, 1600)).toBe(320);
    expect(clampPreviewWidth(420, 1600)).toBe(420);
    expect(clampPreviewWidth(900, 1600)).toBe(720);
  });
});
