import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon, type AppIconName } from "@/components/ui/icon";
import { Colors } from "@/constants/theme";
import { hapticSelection } from "@/lib/haptics";

const accent = "#6EA8FF";

export default function SettingsHomeScreen() {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
  const zh = locale.toLowerCase().startsWith("zh");

  function goBack() {
    hapticSelection();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  function openDetailedSettings() {
    hapticSelection();
    router.push("/settings");
  }

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={8}
          style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
        >
          <Icon name="back" size={24} tintColor={accent} strokeWidth={1.8} />
        </Pressable>
        <ThemedText style={styles.title}>{zh ? "设置" : "Settings"}</ThemedText>
        <View style={styles.circleButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionTitle>Codex Relay</SectionTitle>
        <SettingsCard>
          <SettingsRow
            icon="workspace"
            title={zh ? "已连接电脑" : "Connected Computer"}
            subtitle={zh ? "Mac、Relay 地址与配对" : "Mac, relay address and pairing"}
            onPress={openDetailedSettings}
          />
          <Divider />
          <SettingsRow
            icon="terminal"
            title={zh ? "Codex 运行环境" : "Codex Runtime"}
            subtitle={zh ? "模型、权限与工作区" : "Model, permissions and workspace"}
            onPress={openDetailedSettings}
          />
        </SettingsCard>

        <SectionTitle>{zh ? "通知与状态" : "Notifications & Status"}</SectionTitle>
        <SettingsCard>
          <SettingsRow
            icon="running"
            title={zh ? "通知" : "Notifications"}
            subtitle={
              zh ? "任务完成与需要操作时提醒" : "Turn completion and action-required alerts"
            }
            onPress={openDetailedSettings}
          />
          <Divider />
          <SettingsRow
            icon="goal"
            title={zh ? "用量限制" : "Usage Limits"}
            subtitle={zh ? "查看当前 Codex 使用额度" : "View current Codex usage"}
            onPress={openDetailedSettings}
          />
        </SettingsCard>

        <SectionTitle>{zh ? "应用" : "App"}</SectionTitle>
        <SettingsCard>
          <SettingsRow
            icon="refresh"
            title={zh ? "更新" : "Updates"}
            subtitle={zh ? "检查应用与热更新" : "Check app and hot updates"}
            onPress={openDetailedSettings}
          />
          <Divider />
          <SettingsRow
            icon="controls"
            title={zh ? "高级设置" : "Advanced Settings"}
            subtitle={zh ? "服务器、调试与完整设置" : "Server, diagnostics and full settings"}
            onPress={openDetailedSettings}
          />
        </SettingsCard>

        <ThemedText style={styles.footer}>Codex Relay · OpenMinis-style personal build</ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <ThemedText style={styles.sectionTitle}>{children}</ThemedText>;
}

function SettingsCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: AppIconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Icon name={icon} size={21} tintColor={accent} strokeWidth={1.8} />
      </View>
      <View style={styles.rowCopy}>
        <ThemedText style={styles.rowTitle}>{title}</ThemedText>
        <ThemedText numberOfLines={1} style={styles.rowSubtitle}>
          {subtitle}
        </ThemedText>
      </View>
      <Icon name="chevronRight" size={18} tintColor={Colors.dark.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  header: {
    height: 72,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#FFFFFF", fontSize: 23, lineHeight: 29, fontWeight: "700" },
  circleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 22, paddingBottom: 40 },
  sectionTitle: {
    color: "#8E8E93",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    marginTop: 22,
    marginBottom: 9,
    marginLeft: 4,
  },
  card: { backgroundColor: "#1C1C1E", borderRadius: 18, overflow: "hidden" },
  row: {
    minHeight: 68,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#252529",
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#FFFFFF", fontSize: 17, lineHeight: 22, fontWeight: "600" },
  rowSubtitle: { color: "#8E8E93", fontSize: 13, lineHeight: 18, marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.09)",
    marginLeft: 63,
  },
  footer: { color: "#5F5F64", fontSize: 12, textAlign: "center", marginTop: 28 },
  pressed: { opacity: 0.6 },
});
