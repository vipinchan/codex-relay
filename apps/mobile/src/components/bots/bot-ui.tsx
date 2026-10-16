import type { Bot } from "codex-relay/api-schema";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export const botPalette = ["#6EA8FF", "#72DDD5", "#A49CFF", "#FF8DA5", "#78D9A5", "#F3BF72"];
const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");
export const botText = (cn: string, en: string) => (zh ? cn : en);
export const botError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : botText("操作失败，请重试", "Operation failed. Try again.");

export function BotAvatar({ bot, size = 48 }: { bot: Pick<Bot, "name" | "color">; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size * 0.31, backgroundColor: `${bot.color}28` },
      ]}
    >
      <Text style={[styles.avatarText, { color: bot.color, fontSize: size * 0.43 }]}>
        {bot.name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function BotPage({
  children,
  title,
  action,
  backLabel,
  onBack,
}: {
  children: ReactNode;
  title: string;
  action?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={["top", "bottom", "left", "right"]}
      style={[styles.page, { backgroundColor: theme.background }]}
    >
      <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel ?? botText("返回", "Back")}
          onPress={onBack ?? (() => router.back())}
          style={styles.back}
        >
          {backLabel ? (
            <Text style={[styles.backText, { color: theme.powerBlue }]}>{backLabel}</Text>
          ) : (
            <Icon name="back" size={24} tintColor={theme.powerBlue} />
          )}
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.text }]}>
          {title}
        </Text>
        <View style={styles.action}>{action}</View>
      </View>
      {children}
    </SafeAreaView>
  );
}

export function BotRow({
  title,
  subtitle,
  onPress,
  leading,
  trailing,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}
    >
      {leading}
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? <Icon name="chevronRight" size={17} tintColor={theme.textSecondary} />}
    </Pressable>
  );
}

export function BotPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.primary, { backgroundColor: theme.powerBlue, opacity: disabled ? 0.45 : 1 }]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    height: 57,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
  },
  back: { width: 72, height: 44, justifyContent: "center" },
  backText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  action: { width: 72, alignItems: "flex-end" },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: Fonts.sansBold },
  row: {
    minHeight: 74,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  rowSubtitle: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17 },
  primary: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryText: { color: "#fff", fontFamily: Fonts.sansSemiBold, fontSize: 15 },
});
