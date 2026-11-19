import type { MessageFileRequest } from "codex-relay/api-schema";
import { useMemo, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { hapticSelection } from "@/lib/haptics";
import {
  cancelMessageFile,
  downloadMessageFile,
  getActiveMessageFile,
  getMessageFileState,
  messageFileKey,
  shareMessageFile,
  subscribeMessageFiles,
} from "@/lib/message-file-downloads";

import { externalFileLinks, localFileLinks } from "./message-markdown-content";

const zh = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("zh");
const text = (chinese: string, english: string) => (zh ? chinese : english);

export function MessageFileCards({
  content,
  message,
}: {
  content: string;
  message: Omit<MessageFileRequest, "path">;
}) {
  const files = useMemo(
    () => ({ local: localFileLinks(content), external: externalFileLinks(content) }),
    [content],
  );
  if (!files.local.length && !files.external.length) return null;
  return (
    <View style={styles.stack}>
      {files.local.map((file) => (
        <LocalFileCard key={file.path} request={{ ...message, path: file.path }} file={file} />
      ))}
      {files.external.map((file) => (
        <FileCard
          key={file.url}
          name={file.name}
          detail={`${file.extension} · ${text("外部链接", "External link")}`}
          action={text("打开", "Open")}
          onPress={() => {
            void Linking.openURL(file.url).catch(() =>
              Alert.alert(text("无法打开链接", "Couldn't open link")),
            );
          }}
        />
      ))}
    </View>
  );
}

function LocalFileCard({
  request,
  file,
}: {
  request: MessageFileRequest;
  file: { name: string; extension?: string };
}) {
  const key = messageFileKey(request);
  const state = useSyncExternalStore(subscribeMessageFiles, () => getMessageFileState(key));
  const busy = useSyncExternalStore(subscribeMessageFiles, () => Boolean(getActiveMessageFile()));
  const status = state?.status;
  const working = status === "preparing" || status === "downloading" || status === "verifying";
  const percent =
    state?.status === "downloading" || state?.status === "verifying"
      ? state.size
        ? Math.floor((state.written / state.size) * 100)
        : 100
      : undefined;
  let detail = file.extension ?? text("文件", "File");
  if (state?.status === "preparing") detail = text("正在准备文件…", "Preparing file…");
  if (state?.status === "downloading")
    detail = `${formatBytes(state.written)} / ${formatBytes(state.size)} · ${percent}%`;
  if (state?.status === "verifying") detail = text("正在校验文件…", "Verifying file…");
  if (state?.status === "ready")
    detail = `${formatBytes(state.size)} · ${text("已校验", "Verified")}`;
  if (state?.status === "error") detail = downloadError(state.code);
  const action = working
    ? text("取消", "Cancel")
    : status === "ready"
      ? text("保存…", "Save…")
      : status === "error"
        ? text("重试", "Retry")
        : text("下载", "Download");

  return (
    <FileCard
      name={file.name}
      action={action}
      detail={detail}
      disabled={busy && !working && status !== "ready"}
      indeterminate={status === "preparing" || status === "verifying"}
      percent={percent}
      onPress={() => {
        if (working) cancelMessageFile(key);
        else if (status === "ready") {
          void shareMessageFile(key).catch(() =>
            Alert.alert(text("无法打开保存面板", "Couldn't open the share sheet")),
          );
        } else void downloadMessageFile(request);
      }}
    />
  );
}

function FileCard({
  name,
  detail,
  action,
  onPress,
  disabled,
  indeterminate,
  percent,
}: {
  name: string;
  detail: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
  indeterminate?: boolean;
  percent?: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          {indeterminate ? (
            <ActivityIndicator size="small" color={theme.accentBright} />
          ) : (
            <Icon name="file" size={18} tintColor={theme.text} />
          )}
        </View>
        <View style={styles.description}>
          <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="middle">
            {name}
          </ThemedText>
          <ThemedText style={styles.detail}>{detail}</ThemedText>
        </View>
        <Pressable
          accessibilityLabel={`${action} ${name}`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => {
            hapticSelection();
            onPress();
          }}
          style={({ pressed }) => [styles.action, (disabled || pressed) && styles.dimmed]}
        >
          <ThemedText type="smallBold" style={styles.actionText}>
            {action}
          </ThemedText>
        </Pressable>
      </View>
      {percent === undefined ? null : (
        <View
          accessible
          accessibilityLabel={text("下载进度", "Download progress")}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      )}
    </View>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadError(code?: string) {
  switch (code) {
    case "file_download_unsupported":
      return text("请更新电脑端 Relay", "Update Relay on your computer");
    case "file_unavailable":
      return text("原文件不可用", "Original file unavailable");
    case "file_changed":
      return text("原文件已变更", "Original file changed");
    case "file_too_large":
      return text("文件超过 200 MB", "File exceeds 200 MB");
    case "download_network":
      return text("连接中断，请重试", "Connection interrupted. Try again.");
    case "cache_missing":
      return text("本地缓存已清理", "Local copy was cleared");
    default:
      return text("下载失败，请重试", "Download failed. Try again.");
  }
}

const styles = StyleSheet.create((theme) => ({
  stack: { gap: 6, marginTop: 9, marginBottom: 3 },
  card: {
    backgroundColor: theme.tintMuted,
    borderColor: theme.borderSubtle,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  description: { flex: 1, minWidth: 0 },
  detail: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  actionText: { color: theme.accentBright, fontSize: 12 },
  dimmed: { opacity: 0.5 },
  track: {
    height: 4,
    borderRadius: 2,
    marginTop: 5,
    overflow: "hidden",
    backgroundColor: theme.borderSubtle,
  },
  fill: { height: "100%", backgroundColor: theme.accentBright, borderRadius: 2 },
}));
