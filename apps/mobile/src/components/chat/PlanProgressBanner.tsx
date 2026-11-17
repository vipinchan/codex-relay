import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Spacing, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hapticSelection } from "@/lib/haptics";

import {
  activePlanProgressStep,
  type TimelinePlanProgress,
  type TimelinePlanProgressStepStatus,
  type TimelineSubagent,
  type TimelineSubagentStatus,
  type TimelineSubagentSummary,
} from "./plan-progress";

const MAX_VISIBLE_SUBAGENT_GLYPHS = 4;
export function PlanProgressBanner({
  progress,
  subagents,
}: {
  progress?: TimelinePlanProgress;
  subagents?: TimelineSubagentSummary;
}) {
  const theme = useTheme();
  const [isExpanded, setExpanded] = useState(false);

  if (!progress) {
    return null;
  }

  const completedStepCount = progress.steps.filter((step) => step.status === "completed").length;
  const stepCount = progress.steps.length;
  const activeStep = activePlanProgressStep(progress);
  const subagentCount = subagents?.agents.length ?? 0;
  const subagentText = subagents ? subagentStatusText(subagents.agents) : undefined;
  const subagentAccessibilityText = subagentText
    ? `, ${subagentCount} subagents, ${subagentText}`
    : "";

  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.bannerHost}>
      <Pressable
        accessibilityLabel={`Plan progress: ${completedStepCount} of ${stepCount} steps completed${subagentAccessibilityText}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityValue={{ max: stepCount, min: 0, now: completedStepCount }}
        onPress={() => {
          hapticSelection();
          setExpanded((current) => !current);
        }}
        style={() => [styles.banner]}
      >
        <View style={styles.summaryContent}>
          <ThemedText type="code" style={styles.label}>
            Plan
          </ThemedText>
          <View style={styles.summaryRow}>
            {activeStep ? <PlanProgressMarker status={activeStep.status} /> : null}
            <ThemedText type="small" numberOfLines={1} style={styles.summaryText}>
              {activeStep ? activeStep.text : "Updating plan"}
            </ThemedText>
            <View style={styles.trailingGroup}>
              {subagents ? (
                <Animated.View entering={FadeIn.duration(120)} style={styles.compactSubagents}>
                  <SubagentGlyphs agents={subagents.agents} />
                  <ThemedText type="code" style={styles.subagentCountText}>
                    ×{subagentCount}
                  </ThemedText>
                </Animated.View>
              ) : null}
              <ThemedText type="code" style={styles.countText}>
                {completedStepCount}/{stepCount}
              </ThemedText>
              <Icon
                name={isExpanded ? "expand" : "chevronRight"}
                size={16}
                tintColor={theme.textSecondary}
              />
            </View>
          </View>
        </View>
      </Pressable>

      {isExpanded ? (
        <Animated.View entering={FadeIn.duration(120)} style={styles.expandedPanel}>
          {progress.steps.map((step) => (
            <View
              key={step.id}
              accessible
              accessibilityLabel={`${planProgressStatusLabel(step.status)}: ${step.text}`}
              style={styles.stepRow}
            >
              <View style={styles.stepMarkerSlot}>
                <PlanProgressMarker status={step.status} />
              </View>
              <ThemedText
                numberOfLines={2}
                type="small"
                style={[styles.stepText, step.status === "pending" && styles.stepTextPending]}
              >
                {step.text}
              </ThemedText>
            </View>
          ))}
          {subagents ? (
            <Animated.View
              accessible
              accessibilityLabel={`${subagentCount} subagents, ${subagentText}`}
              entering={FadeIn.duration(120)}
              style={styles.subagentSection}
            >
              <View style={styles.subagentSectionHeader}>
                <Icon name="branch" size={12} tintColor={theme.textSecondary} />
                <ThemedText type="code" style={styles.subagentLabel}>
                  Subagents
                </ThemedText>
              </View>
              <View style={styles.subagentSummaryRow}>
                <SubagentGlyphs agents={subagents.agents} />
                <ThemedText type="code" numberOfLines={2} style={styles.subagentStatusText}>
                  {subagentText}
                </ThemedText>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function SubagentGlyphs({ agents }: { agents: readonly TimelineSubagent[] }) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.subagentGlyphs}
    >
      {agents.slice(0, MAX_VISIBLE_SUBAGENT_GLYPHS).map((agent, index) => {
        const glyph = subagentGlyphStyle(index, theme);
        return (
          <Animated.View
            entering={FadeIn.delay(index * 35).duration(120)}
            key={agent.id}
            style={styles.subagentGlyph}
          >
            <Icon name={glyph.name} size={12} strokeWidth={2.2} tintColor={glyph.color} />
          </Animated.View>
        );
      })}
    </View>
  );
}

function subagentGlyphStyle(index: number, theme: ThemeColors) {
  const styles = [
    { color: theme.agentGreen, name: "agentAsterisk" },
    { color: theme.agentViolet, name: "agentGem" },
    { color: theme.agentCyan, name: "agentAtom" },
    { color: theme.agentTeal, name: "agentShell" },
  ] as const;
  switch (index % styles.length) {
    case 0:
      return styles[0];
    case 1:
      return styles[1];
    case 2:
      return styles[2];
    default:
      return styles[3];
  }
}

function subagentStatusText(agents: readonly TimelineSubagent[]) {
  const counts = subagentStatusCounts(agents);
  const segments = [
    counts.running > 0 ? `${counts.running} active` : undefined,
    counts.completed > 0 ? `${counts.completed} done` : undefined,
    counts.interrupted > 0 ? `${counts.interrupted} stopped` : undefined,
    counts.failed > 0 ? `${counts.failed} failed` : undefined,
  ];

  return segments.filter((segment): segment is string => Boolean(segment)).join(" · ");
}

function subagentStatusCounts(agents: readonly TimelineSubagent[]) {
  const counts: Record<TimelineSubagentStatus, number> = {
    completed: 0,
    failed: 0,
    interrupted: 0,
    running: 0,
  };
  for (const agent of agents) {
    counts[agent.status] += 1;
  }
  return counts;
}

function planProgressStatusLabel(status: TimelinePlanProgressStepStatus) {
  switch (status) {
    case "completed":
      return "Completed";
    case "inProgress":
      return "In progress";
    case "pending":
      return "Pending";
  }
}

function PlanProgressMarker({ status }: { status: TimelinePlanProgressStepStatus }) {
  const theme = useTheme();
  const rotation = useSharedValue(0);
  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  useEffect(() => {
    if (status !== "inProgress") {
      rotation.value = 0;
      return;
    }
    rotation.value = withRepeat(withTiming(360, { duration: 900 }), -1, false);
  }, [rotation, status]);

  if (status === "completed") {
    return (
      <View style={[styles.marker, styles.markerCompleted]}>
        <Icon name="check" size={8} tintColor={theme.planMarkerForeground} strokeWidth={3} />
      </View>
    );
  }

  if (status === "inProgress") {
    return (
      <View style={[styles.marker, styles.markerActive]}>
        <Animated.View style={spinnerStyle}>
          <Icon name="running" size={9} tintColor={theme.planMarkerForeground} strokeWidth={2.8} />
        </Animated.View>
      </View>
    );
  }

  return <View style={[styles.marker, styles.markerPending]} />;
}

const styles = StyleSheet.create((theme) => ({
  banner: {
    backgroundColor: theme.planBannerBackground,
    borderColor: theme.inputBorder,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  bannerHost: {
    elevation: 20,
    left: Spacing.four,
    position: "absolute",
    right: Spacing.four,
    top: 58,
    zIndex: 20,
  },
  bannerPressed: {
    opacity: 0.78,
  },
  countText: {
    color: theme.textSecondary,
    fontSize: 11,
  },
  compactSubagents: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.half,
    marginRight: Spacing.half,
  },
  expandedPanel: {
    backgroundColor: theme.planBannerExpandedBackground,
    borderColor: theme.inputBorder,
    borderRadius: 10,
    borderWidth: 1,
    elevation: 20,
    gap: Spacing.one,
    left: 0,
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    position: "absolute",
    right: 0,
    top: "100%",
    zIndex: 20,
  },
  label: {
    color: theme.planAccent,
    fontSize: 12,
    lineHeight: 16,
  },
  marker: {
    alignItems: "center",
    borderRadius: 7,
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  markerActive: {
    backgroundColor: theme.planAccent,
  },
  markerCompleted: {
    backgroundColor: theme.planCompleted,
  },
  markerPending: {
    borderColor: theme.planPendingBorder,
    borderWidth: 1,
  },
  stepRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: 22,
  },
  stepMarkerSlot: {
    paddingTop: 2,
  },
  stepText: {
    color: theme.text,
    flex: 1,
    lineHeight: 18,
  },
  stepTextPending: {
    color: theme.textSecondary,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  summaryContent: {
    gap: 2,
  },
  summaryText: {
    color: theme.text,
    flex: 1,
    lineHeight: 20,
    minWidth: 0,
  },
  trailingGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.one,
  },
  subagentCountText: {
    color: theme.textSecondary,
    fontSize: 10,
  },
  subagentGlyph: {
    alignItems: "center",
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  subagentGlyphs: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.half,
  },
  subagentLabel: {
    color: theme.textSecondaryStrong,
    fontSize: 11,
    lineHeight: 15,
  },
  subagentSection: {
    borderTopColor: theme.borderSubtle,
    borderTopWidth: 1,
    gap: Spacing.one,
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
  },
  subagentSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.one,
  },
  subagentStatusText: {
    color: theme.textSecondary,
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
  },
  subagentSummaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    minHeight: 16,
    paddingLeft: Spacing.three,
  },
}));
