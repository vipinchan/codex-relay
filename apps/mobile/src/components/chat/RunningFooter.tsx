import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

const RUNNING_PULSE_HALF_DURATION_MS = 760;
const RUNNING_DOT_STAGGER_MS = RUNNING_PULSE_HALF_DURATION_MS / 3;

export function RunningFooter() {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.runningFooter}>
      <View style={styles.dots}>
        <RunningDot delayMs={0} />
        <RunningDot delayMs={RUNNING_DOT_STAGGER_MS} />
        <RunningDot delayMs={RUNNING_DOT_STAGGER_MS * 2} />
      </View>
      <RunningLabel />
    </Animated.View>
  );
}

function RunningDot({ delayMs }: { delayMs: number }) {
  const motionProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + pulseProgress.value * 0.32,
    transform: [{ translateY: -2 * motionProgress.value }],
  }));

  useEffect(() => {
    motionProgress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: RUNNING_PULSE_HALF_DURATION_MS,
            easing: Easing.inOut(Easing.cubic),
          }),
          withTiming(0, {
            duration: RUNNING_PULSE_HALF_DURATION_MS,
            easing: Easing.inOut(Easing.cubic),
          }),
        ),
        -1,
        false,
      ),
    );
    pulseProgress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: RUNNING_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(0, {
          duration: RUNNING_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
      ),
      -1,
      false,
    );
  }, [delayMs, motionProgress, pulseProgress]);

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

function RunningLabel() {
  const progress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + progress.value * 0.32,
  }));

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: RUNNING_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(0, {
          duration: RUNNING_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
      ),
      -1,
      false,
    );
  }, [progress]);

  return (
    <Animated.View style={animatedStyle}>
      <ThemedText type="code" themeColor="textSecondary">
        Working…
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: "rgba(176, 180, 186, 0.55)",
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  dots: {
    flexDirection: "row",
    gap: 3,
  },
  runningFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "flex-start",
    paddingBottom: Spacing.three,
    paddingTop: Spacing.one,
  },
});
