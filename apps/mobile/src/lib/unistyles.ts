import { Appearance } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Uniwind } from "uniwind";

import { Colors, resolveThemeScheme } from "@/constants/theme";

import { readThemeMode } from "./theme-preference";

const systemColorScheme = Appearance.getColorScheme();
const initialThemeMode = readThemeMode();
Appearance.setColorScheme(initialThemeMode === "system" ? "unspecified" : initialThemeMode);

StyleSheet.configure({
  settings: {
    initialTheme: resolveThemeScheme(
      initialThemeMode,
      systemColorScheme === "light" || systemColorScheme === "dark" ? systemColorScheme : null,
    ),
  },
  themes: Colors,
});

Uniwind.setTheme(initialThemeMode);
