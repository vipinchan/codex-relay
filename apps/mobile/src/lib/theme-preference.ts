import { createMMKV } from "react-native-mmkv";

import { normalizeThemeMode, type ThemeMode } from "@/constants/theme";

const storage = createMMKV({ id: "codex-relay-appearance" });
const themeModeKey = "theme-mode";

export function readThemeMode(): ThemeMode {
  return normalizeThemeMode(storage.getString(themeModeKey));
}

export function setThemeMode(mode: ThemeMode) {
  storage.set(themeModeKey, mode);
}

export function subscribeThemeMode(onChange: () => void) {
  const subscription = storage.addOnValueChangedListener((key) => {
    if (key === themeModeKey) onChange();
  });
  return () => subscription.remove();
}
