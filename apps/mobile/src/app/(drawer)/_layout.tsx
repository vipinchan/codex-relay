import { useTheme } from "@/hooks/use-theme";
import { Tabs } from "expo-router";
import { Bot, MessageSquare, Settings } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";

const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
const zh = locale.toLowerCase().startsWith("zh");

export default function MainTabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
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
}

const styles = StyleSheet.create({
  tabBar: {
    paddingTop: 6,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
