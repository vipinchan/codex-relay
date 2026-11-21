import { useTheme } from "@/hooks/use-theme";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Bot, MessageSquare, Settings } from "lucide-react-native";
import { View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DesktopNavigationRail, type DesktopTab } from "@/components/chat/DesktopNavigationRail";
import { BREAKPOINT_WIDE, isMacCatalystPlatform } from "@/components/chat/workspace-layout";

const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
const zh = locale.toLowerCase().startsWith("zh");

export default function MainTabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isMac = isMacCatalystPlatform();
  const isDesktop = isMac && width >= BREAKPOINT_WIDE;

  const activeTab: DesktopTab = pathname.includes("bots")
    ? "bots"
    : pathname.includes("settings")
      ? "settings-tab"
      : "index";

  const handleSelectTab = (tab: DesktopTab) => {
    if (tab === "index") {
      router.navigate("/(drawer)");
    } else {
      router.navigate(`/(drawer)/${tab}`);
    }
  };

  const tabsContent = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarStyle: isDesktop
          ? { display: "none" }
          : {
              ...styles.tabBar,
              backgroundColor: theme.backgroundAlt,
              borderTopColor: theme.borderSubtle,
            },
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: zh ? "会话" : "Sessions",
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bots"
        options={{
          title: "BOT",
          tabBarIcon: ({ color, size }) => <Bot color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings-tab"
        options={{
          title: zh ? "设置" : "Settings",
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopContainer}>
        <DesktopNavigationRail activeTab={activeTab} onSelectTab={handleSelectTab} />
        <View style={styles.desktopContent}>{tabsContent}</View>
      </View>
    );
  }

  return tabsContent;
}

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    flexDirection: "row",
  },
  desktopContent: {
    flex: 1,
  },
  tabBar: {
    paddingTop: 6,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
