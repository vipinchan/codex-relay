import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, TextInput, View, Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  getBotDefinition,
  getCodexRelayServerUrl,
  updateBotDefinition,
} from "@/lib/codex-relay-api";

import { BotPage, botError, botText } from "./bot-ui";

export function BotDefinitionEditorScreen({ botId }: { botId: string }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const serverUrl = getCodexRelayServerUrl();
  const definitionKey = ["bot-definition", serverUrl, botId];
  const definitionQuery = useQuery({
    queryKey: definitionKey,
    queryFn: () => getBotDefinition(botId),
    refetchOnWindowFocus: true,
  });
  const [content, setContent] = useState("");
  const [baseline, setBaseline] = useState("");
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowLeave, setAllowLeave] = useState(false);
  const [conflict, setConflict] = useState<Awaited<ReturnType<typeof getBotDefinition>>>();
  const initialized = useRef(false);
  const dirty = content !== baseline;
  const latestDefinition =
    conflict ??
    (revision && definitionQuery.data?.revision !== revision ? definitionQuery.data : undefined);

  useEffect(() => {
    if (!definitionQuery.data || initialized.current) return;
    setContent(definitionQuery.data.content);
    setBaseline(definitionQuery.data.content);
    setRevision(definitionQuery.data.revision);
    initialized.current = true;
  }, [definitionQuery.data]);

  usePreventRemove(dirty && !allowLeave, ({ data }) => {
    Alert.alert(
      botText("放弃修改？", "Discard changes?"),
      botText("未保存的定义文件内容将丢失。", "Unsaved definition changes will be lost."),
      [
        { text: botText("继续编辑", "Keep editing"), style: "cancel" },
        {
          text: botText("放弃", "Discard"),
          style: "destructive",
          onPress: () => {
            setAllowLeave(true);
            requestAnimationFrame(() => navigation.dispatch(data.action));
          },
        },
      ],
    );
  });

  async function save() {
    if (!dirty || busy || !revision || latestDefinition) return;
    try {
      JSON.parse(content);
    } catch {
      Alert.alert(
        botText("JSON 格式错误", "Invalid JSON"),
        botText("请检查括号、逗号和引号。", "Check brackets, commas and quotes."),
      );
      return;
    }
    setBusy(true);
    try {
      const saved = await updateBotDefinition(botId, { content, expectedRevision: revision });
      queryClient.setQueryData(definitionKey, saved);
      await queryClient.invalidateQueries({ queryKey: ["bots", serverUrl] });
      setAllowLeave(true);
      requestAnimationFrame(() => router.back());
    } catch (error) {
      if (isRevisionConflict(error)) {
        try {
          const latest = await getBotDefinition(botId);
          queryClient.setQueryData(definitionKey, latest);
          setConflict(latest);
        } catch (refreshError) {
          Alert.alert(
            botText("无法读取 Mac 最新版本", "Couldn’t load latest version"),
            botError(refreshError),
          );
        }
      } else {
        Alert.alert(botText("无法保存定义文件", "Couldn’t save definition"), botError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BotPage
      title={botText("BOT 定义文件", "BOT definition")}
      backLabel={botText("取消", "Cancel")}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !dirty || busy || !revision || !!latestDefinition }}
          disabled={!dirty || busy || !revision || !!latestDefinition}
          onPress={() => void save()}
        >
          <Text
            style={[
              styles.action,
              { color: theme.powerBlue, opacity: dirty && !busy && !latestDefinition ? 1 : 0.45 },
            ]}
          >
            {busy ? botText("保存中", "Saving") : botText("保存", "Save")}
          </Text>
        </Pressable>
      }
    >
      {definitionQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
      {definitionQuery.error ? (
        <Pressable onPress={() => void definitionQuery.refetch()}>
          <Text style={styles.error}>{botError(definitionQuery.error)}</Text>
        </Pressable>
      ) : null}
      {definitionQuery.data ? (
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content}>
          <Text selectable style={[styles.path, { color: theme.textSecondary }]}>
            {definitionQuery.data.path}
          </Text>
          {definitionQuery.data.status === "invalid" ? (
            <Text style={styles.error}>
              {botText("当前文件无效：", "Current file is invalid: ")}
              {definitionQuery.data.error}
            </Text>
          ) : null}
          {latestDefinition ? (
            <View style={[styles.conflict, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.conflictTitle, { color: theme.text }]}>
                {botText("定义文件已在 Mac 上修改", "Definition changed on Mac")}
              </Text>
              <Text style={[styles.note, { color: theme.textSecondary }]}>
                {botText(
                  "两份内容都保留在下面。请选择 Mac 最新版本，或明确确认用手机草稿替换它。",
                  "Both versions are shown below. Choose the latest Mac version or explicitly replace it with your phone draft.",
                )}
              </Text>
              <Text style={[styles.conflictLabel, { color: theme.text }]}>
                {botText("手机草稿", "Phone draft")}
              </Text>
              <Text selectable style={[styles.conflictSource, { color: theme.textSecondary }]}>
                {content}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void Clipboard.setStringAsync(content)}
              >
                <Text style={[styles.link, { color: theme.powerBlue }]}>
                  {botText("复制手机草稿", "Copy phone draft")}
                </Text>
              </Pressable>
              <Text style={[styles.conflictLabel, { color: theme.text }]}>
                {botText("Mac 最新版本", "Latest Mac version")}
              </Text>
              <Text selectable style={[styles.conflictSource, { color: theme.textSecondary }]}>
                {latestDefinition.content}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void Clipboard.setStringAsync(latestDefinition.content)}
              >
                <Text style={[styles.link, { color: theme.powerBlue }]}>
                  {botText("复制 Mac 版本", "Copy Mac version")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert(
                    botText("使用 Mac 版本？", "Use Mac version?"),
                    botText(
                      "手机草稿将从编辑框移除。你可以先复制它。",
                      "Your phone draft will leave the editor. Copy it first if needed.",
                    ),
                    [
                      { text: botText("取消", "Cancel"), style: "cancel" },
                      {
                        text: botText("使用 Mac 版本", "Use Mac version"),
                        onPress: () => {
                          setContent(latestDefinition.content);
                          setBaseline(latestDefinition.content);
                          setRevision(latestDefinition.revision);
                          setConflict(undefined);
                        },
                      },
                    ],
                  )
                }
              >
                <Text style={[styles.link, { color: theme.powerBlue }]}>
                  {botText("使用 Mac 最新版本", "Use latest Mac version")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert(
                    botText("替换 Mac 版本？", "Replace Mac version?"),
                    botText(
                      "保存时将用当前手机草稿替换显示的 Mac 版本。请先对照两份内容完成合并。",
                      "Saving will replace the displayed Mac version with this phone draft. Compare and merge them first.",
                    ),
                    [
                      { text: botText("取消", "Cancel"), style: "cancel" },
                      {
                        text: botText("继续编辑手机草稿", "Continue phone draft"),
                        onPress: () => {
                          setRevision(latestDefinition.revision);
                          setConflict(undefined);
                        },
                      },
                    ],
                  )
                }
              >
                <Text style={[styles.link, { color: theme.powerBlue }]}>
                  {botText("保留手机草稿，随后保存", "Keep phone draft, then save")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.editorWrap, { backgroundColor: theme.backgroundElement }]}>
            <TextInput
              accessibilityLabel={botText("BOT 定义 JSON", "BOT definition JSON")}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setContent}
              placeholderTextColor={theme.textSecondary}
              scrollEnabled={false}
              style={[styles.editor, { color: theme.text }]}
              textAlignVertical="top"
              value={content}
            />
          </View>
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            {botText(
              "手机和 Mac 编辑同一份定义文件。保存前会检查文件版本与字段。",
              "iPhone and Mac edit the same file. Save checks its revision and fields.",
            )}
          </Text>
        </ScrollView>
      ) : null}
    </BotPage>
  );
}

const styles = StyleSheet.create({
  action: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 50, gap: 12 },
  path: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 17 },
  editorWrap: { borderRadius: 12, padding: 12 },
  editor: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 20, minHeight: 420 },
  note: { fontSize: 12, lineHeight: 18 },
  error: { color: "#FF8DA5", fontSize: 13, lineHeight: 19, padding: 16 },
  conflict: { borderRadius: 12, padding: 14, gap: 10 },
  conflictTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  conflictLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  conflictSource: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 17 },
  link: { fontFamily: Fonts.sansMedium, fontSize: 13 },
});

function isRevisionConflict(error: unknown) {
  return !!error && typeof error === "object" && "status" in error && error.status === 409;
}
