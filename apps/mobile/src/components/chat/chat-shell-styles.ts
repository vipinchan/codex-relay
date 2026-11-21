import { StyleSheet } from "react-native-unistyles";

export const chatShellStyles = StyleSheet.create((theme) => ({
  chatBody: {
    flex: 1,
    minHeight: 0,
  },
  composerDock: {
    elevation: 12,
    flexShrink: 0,
    position: "relative",
    width: "100%",
    zIndex: 8,
  },
  container: {
    backgroundColor: theme.background,
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    width: "100%",
  },
  shell: {
    backgroundColor: theme.background,
    flex: 1,
    gap: 0,
    paddingTop: 0,
  },
  timeline: {
    flex: 1,
    minHeight: 0,
  },
}));
