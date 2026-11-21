import React from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Bot, MessageSquare, Settings } from "lucide-react-native";
import { useTheme } from "@/hooks/use-theme";
import { HoverablePressable } from "@/components/ui/hoverable-pressable";
import { MAC_ICON_RAIL_WIDTH } from "./workspace-layout";

export type DesktopTab = "index" | "bots" | "settings-tab";

const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
const zh = locale.toLowerCase().startsWith("zh");

export function DesktopNavigationRail({
  activeTab,
  onSelectTab,
}: {
  activeTab: DesktopTab;
  onSelectTab: (tab: DesktopTab) => void;
}) {
  const theme = useTheme();

  const items: { id: DesktopTab; label: string; icon: typeof MessageSquare }[] = [
    {
      id: "index",
      label: zh ? "会话" : "Sessions",
      icon: MessageSquare,
    },
    {
      id: "bots",
      label: "BOT",
      icon: Bot,
    },
    {
      id: "settings-tab",
      label: zh ? "设置" : "Settings",
      icon: Settings,
    },
  ];

  return (
    <View style={styles.rail}>
      <View style={styles.itemsContainer}>
        {items.map((item) => {
          const isActive = activeTab === item.id;
          const IconComponent = item.icon;
          const color = isActive ? theme.accent : theme.textSecondary;

          return (
            <HoverablePressable
              key={item.id}
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              onPress={() => onSelectTab(item.id)}
              style={({ pressed, hovered }) => [
                styles.itemButton,
                isActive && { backgroundColor: theme.backgroundElement },
                hovered && !isActive && { backgroundColor: theme.tintSoft },
                pressed && { opacity: 0.75 },
              ]}
            >
              {isActive ? (
                <View style={[styles.activeIndicator, { backgroundColor: theme.accent }]} />
              ) : null}
              <IconComponent color={color} size={22} />
            </HoverablePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  rail: {
    width: MAC_ICON_RAIL_WIDTH,
    backgroundColor: theme.backgroundAlt,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.borderSubtle,
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 16,
    zIndex: 10,
  },
  itemsContainer: {
    width: "100%",
    alignItems: "center",
    gap: 12,
  },
  itemButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    left: -8,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
}));
