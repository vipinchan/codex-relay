import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { WorkspaceMarkdownPreview } from "@/components/chat/workspace-preview/WorkspaceMarkdownPreview";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { getCodexRelayServerUrl, listBotPlugins, listSkills } from "@/lib/codex-relay-api";

import { botText } from "./bot-ui";

export function BotConfigurationRow({ label, value }: { label: string; value?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.configurationRow}>
      <Text style={[styles.configurationLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text selectable style={[styles.configurationValue, { color: theme.text }]}>
        {value || "—"}
      </Text>
    </View>
  );
}

export function BotRolePreview({ instructions }: { instructions: string }) {
  const theme = useTheme();
  return instructions.trim() ? (
    <WorkspaceMarkdownPreview markdown={instructions} />
  ) : (
    <Text style={{ color: theme.textSecondary }}>
      {botText("尚未设置角色说明。", "No role instructions yet.")}
    </Text>
  );
}

export function BotPreviewDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.heading}
      >
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Icon
          name={expanded ? "expand" : "chevronRight"}
          size={16}
          tintColor={theme.textSecondary}
        />
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

export function BotPreferredCapabilities({
  skills,
  plugins,
  focused,
}: {
  skills: string[];
  plugins: string[];
  focused: boolean;
}) {
  const theme = useTheme();
  const serverUrl = getCodexRelayServerUrl();
  const skillsQuery = useQuery({
    queryKey: ["bot-available-skills", serverUrl],
    queryFn: () => listSkills(),
    enabled: focused && skills.length > 0,
    staleTime: 30_000,
  });
  const pluginsQuery = useQuery({
    queryKey: ["bot-available-plugins", serverUrl],
    queryFn: listBotPlugins,
    enabled: focused && plugins.length > 0,
    staleTime: 30_000,
  });
  const groups = [
    {
      title: botText("技能", "Skills"),
      ids: skills,
      names: new Map(skillsQuery.data?.skills.map((skill) => [skill.id, skill.displayName])),
    },
    {
      title: botText("插件", "Plugins"),
      ids: plugins,
      names: new Map(pluginsQuery.data?.plugins.map((plugin) => [plugin.id, plugin.name])),
    },
  ];
  return (
    <View style={styles.disclosure}>
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>{group.title}</Text>
          {group.ids.length ? (
            group.ids.map((id) => (
              <BotPreviewDisclosure key={id} title={group.names.get(id) ?? capabilityName(id)}>
                <Text selectable style={[styles.identifier, { color: theme.textSecondary }]}>
                  {id}
                </Text>
              </BotPreviewDisclosure>
            ))
          ) : (
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {botText("未指定", "None selected")}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function capabilityName(id: string) {
  const skillName = id.match(/^[^:]+:([^:]+):\//)?.[1];
  return skillName || id;
}

const styles = StyleSheet.create({
  configurationRow: { flexDirection: "row", alignItems: "flex-start", gap: 16, paddingVertical: 4 },
  configurationLabel: { flex: 1, fontSize: 13, lineHeight: 19 },
  configurationValue: { flex: 1.4, fontSize: 13, lineHeight: 19, textAlign: "right" },
  disclosure: { gap: 10 },
  heading: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 },
  title: { flex: 1, flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  group: { gap: 4 },
  label: { fontSize: 13, lineHeight: 19 },
  identifier: { fontSize: 12, lineHeight: 18, paddingBottom: 8 },
});
