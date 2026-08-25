import type { ChatMessage } from "codex-relay/api-schema";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Spacing } from "@/constants/theme";
import { hapticSelection } from "@/lib/haptics";

import { ProtocolActivityCard } from "./ProtocolActivityCard";

export function ActivityGroupCard({ messages }: { messages: ChatMessage[] }) {
  const [isExpanded, setExpanded] = useState(false);
  const summary = useMemo(() => activitySummary(messages), [messages]);
  const isActive = messages.some((message) => message.state === "streaming");

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={`${isExpanded ? "Collapse" : "Expand"} ${summary.label}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => {
          hapticSelection();
          setExpanded((current) => !current);
        }}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={[styles.statusDot, isActive && styles.statusDotActive]} />
        <ThemedText type="code" style={[styles.label, isActive && styles.labelActive]}>
          {isActive ? "Working" : "Worked"}
        </ThemedText>
        <ThemedText type="code" themeColor="textSecondary" numberOfLines={1} style={styles.detail}>
          {summary.detail}
        </ThemedText>
        <Icon
          name={isExpanded ? "expand" : "chevronRight"}
          size={13}
          tintColor="rgba(176, 180, 186, 0.72)"
          strokeWidth={2.2}
        />
      </Pressable>
      {isExpanded ? (
        <View style={styles.activityList}>
          {messages.map((message) => (
            <ProtocolActivityCard key={message.id} message={message} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function activitySummary(messages: ChatMessage[]) {
  const commands = messages.filter((message) => message.kind === "commandExecution").length;
  const edits = messages.filter((message) => message.kind === "fileChange").length;
  const searches = messages.filter((message) => message.kind === "webSearch").length;
  const subagents = messages.filter((message) => message.kind === "subagentAction").length;
  const parts = [
    countLabel(commands, "command"),
    countLabel(edits, "edit"),
    countLabel(searches, "search"),
    countLabel(subagents, "subagent step"),
  ].filter((value): value is string => Boolean(value));
  const stepLabel = countLabel(messages.length, "step") ?? "Activity";
  return {
    detail: parts.length > 0 ? `${stepLabel} · ${parts.join(" · ")}` : stepLabel,
    label: `${messages.length} runtime steps`,
  };
}

function countLabel(count: number, label: string) {
  return count > 0 ? `${count} ${label}${count === 1 ? "" : "s"}` : undefined;
}

const styles = StyleSheet.create({
  activityList: {
    borderLeftColor: "rgba(255, 255, 255, 0.1)",
    borderLeftWidth: StyleSheet.hairlineWidth,
    gap: 2,
    marginLeft: 8,
    marginTop: 3,
    paddingLeft: Spacing.two,
  },
  container: {
    alignSelf: "stretch",
    marginVertical: 2,
  },
  detail: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  header: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 7,
    maxWidth: "100%",
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    color: "#9B8BD4",
    fontSize: 11,
    lineHeight: 16,
  },
  labelActive: {
    color: "#8BC8A0",
  },
  pressed: {
    opacity: 0.7,
  },
  statusDot: {
    backgroundColor: "rgba(155, 139, 212, 0.78)",
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  statusDotActive: {
    backgroundColor: "#78B88B",
  },
});
