import { Tabs } from "expo-router";
import { Bot, MessageSquare, Settings } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";

const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
const zh = locale.toLowerCase().startsWith("zh");

export default function MainTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#6EA8FF",
        tabBarInactiveTintColor: "#8E8E93",
        tabBarHideOnKeyboard: true,
        tabBarStyle: styles.tabBar,
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
    backgroundColor: "#0C0C0D",
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: 6,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
