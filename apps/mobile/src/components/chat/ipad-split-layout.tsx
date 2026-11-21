import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWindowDimensions } from "react-native";
import {
  BREAKPOINT_WIDE,
  BREAKPOINT_DESKTOP,
  DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth as clampWidth,
} from "./workspace-layout";

export const EXPANDED_DRAWER_BREAKPOINT = BREAKPOINT_WIDE;
export const THREE_PANE_LAYOUT_BREAKPOINT = BREAKPOINT_DESKTOP;

type IpadSplitLayoutContextValue = {
  beginSidebarResize: () => void;
  isSidebarVisible: boolean;
  resizeSidebar: (translationX: number) => void;
  setSidebarVisible: (visible: boolean) => void;
  sidebarWidth: number;
  toggleSidebar: () => void;
};

const IpadSplitLayoutContext = createContext<IpadSplitLayoutContextValue | undefined>(undefined);

export function IpadSplitLayoutProvider({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const [isSidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const sidebarResizeStartWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);

  const clampSidebarWidthForScreen = useCallback(
    (value: number) => clampSidebarWidth(value, width),
    [width],
  );

  useEffect(() => {
    setSidebarWidth((current) => clampSidebarWidthForScreen(current));
  }, [clampSidebarWidthForScreen]);

  const beginSidebarResize = useCallback(() => {
    sidebarResizeStartWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const resizeSidebar = useCallback(
    (translationX: number) => {
      setSidebarWidth(
        clampSidebarWidthForScreen(sidebarResizeStartWidthRef.current + translationX),
      );
    },
    [clampSidebarWidthForScreen],
  );

  const toggleSidebar = useCallback(() => {
    setSidebarVisible((current) => !current);
  }, []);

  const value = useMemo(
    () => ({
      beginSidebarResize,
      isSidebarVisible,
      resizeSidebar,
      setSidebarVisible,
      sidebarWidth,
      toggleSidebar,
    }),
    [
      beginSidebarResize,
      isSidebarVisible,
      resizeSidebar,
      setSidebarVisible,
      sidebarWidth,
      toggleSidebar,
    ],
  );

  return (
    <IpadSplitLayoutContext.Provider value={value}>{children}</IpadSplitLayoutContext.Provider>
  );
}

export function useIpadSplitLayout() {
  const value = useContext(IpadSplitLayoutContext);
  if (!value) {
    throw new Error("useIpadSplitLayout must be used within IpadSplitLayoutProvider.");
  }
  return value;
}

function clampSidebarWidth(value: number, screenWidth: number) {
  return clampWidth(value, screenWidth);
}
