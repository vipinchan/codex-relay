import type { RuntimeMode } from "codex-relay/api-schema";

import { AppBottomSheet, SheetActionRow, SheetSelectedDot } from "@/components/ui/bottom-sheet";
import type { AppIconName } from "@/components/ui/icon";
import type { ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type RuntimePickerOption = {
  compactLabel: string;
  icon: AppIconName;
  iconBackgroundColor: string;
  iconTintColor: string;
  label: string;
  selectedTitleColor: string;
  subtitle: string;
  value: RuntimeMode;
};

export function RuntimeModeSheet({
  onClose,
  onSelect,
  runtimeMode,
  visible,
}: {
  onClose: () => void;
  onSelect: (mode: RuntimeMode) => void;
  runtimeMode: RuntimeMode;
  visible: boolean;
}) {
  const theme = useTheme();
  const selectedMode = normalizeRuntimeMode(runtimeMode);

  return (
    <AppBottomSheet
      title="Permissions"
      subtitle="Set how much permission Codex can use."
      onClose={onClose}
      visible={visible}
    >
      {runtimeDisplayOptions(theme).map((option) => {
        const selected = option.value === selectedMode;
        return (
          <SheetActionRow
            key={option.value}
            accessibilityLabel={option.label}
            icon={option.icon}
            iconBackgroundColor={option.iconBackgroundColor}
            iconTintColor={option.iconTintColor}
            onPress={() => onSelect(option.value)}
            selected={selected}
            selectedTitleColor={option.selectedTitleColor}
            subtitle={option.subtitle}
            title={option.label}
            trailing={<SheetSelectedDot selected={selected} />}
          />
        );
      })}
    </AppBottomSheet>
  );
}

export function runtimeOptionForMode(runtimeMode: RuntimeMode, theme: ThemeColors) {
  const normalized = normalizeRuntimeMode(runtimeMode);
  const options = runtimeDisplayOptions(theme);
  return options.find((option) => option.value === normalized) ?? options[0];
}

export function normalizeRuntimeMode(runtimeMode: RuntimeMode): RuntimeMode {
  return runtimeMode === "on-request" ? "default" : runtimeMode;
}

function runtimeDisplayOptions(theme: ThemeColors): RuntimePickerOption[] {
  return [
    {
      compactLabel: "Default",
      icon: "permissionsDefault",
      iconBackgroundColor: theme.tintSoft,
      iconTintColor: theme.controlForeground,
      label: "Default permissions",
      selectedTitleColor: theme.controlSelectedForeground,
      subtitle: "Ask before sensitive actions",
      value: "default",
    },
    {
      compactLabel: "Auto",
      icon: "permissionsAuto",
      iconBackgroundColor: theme.runtimeAutoBackground,
      iconTintColor: theme.runtimeAutoForeground,
      label: "Auto",
      selectedTitleColor: theme.runtimeAutoSelectedForeground,
      subtitle: "Run in workspace, ask after sandbox failures",
      value: "auto",
    },
    {
      compactLabel: "Full access",
      icon: "permissionsFull",
      iconBackgroundColor: theme.permissionWarningBackground,
      iconTintColor: theme.runtimeFullForeground,
      label: "Full access",
      selectedTitleColor: theme.runtimeFullSelectedForeground,
      subtitle: "Run without permission prompts",
      value: "full-access",
    },
  ];
}
