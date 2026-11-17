import { Check } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/components/ui/text";
import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type AppToastAction = {
  accessibilityLabel: string;
  disabled?: boolean;
  label: string;
  pendingLabel?: string;
  onPress: () => void;
};

type AppToastProps = {
  action?: AppToastAction;
  durationMs?: number;
  message?: string;
  title: string;
  visible: boolean;
  onDismiss: () => void;
};

const defaultToastVisibleMs = 5300;
const toastBottomOffset = 64;
const toastMinBottom = 84;
export function AppToast({
  action,
  durationMs = defaultToastVisibleMs,
  message,
  title,
  visible,
  onDismiss,
}: AppToastProps) {
  const theme = useTheme();
  const [isMounted, setMounted] = useState(visible);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const didDismissRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const visibleRef = useRef(visible);
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(visible ? 1 : 0);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }
  }, []);

  const finishHideToast = useCallback(() => {
    if (!visibleRef.current && !didDismissRef.current) {
      didDismissRef.current = true;
      setMounted(false);
      onDismissRef.current();
    }
  }, []);

  const hideToast = useCallback(() => {
    clearHideTimer();
    if (didDismissRef.current || !visibleRef.current) {
      return;
    }

    visibleRef.current = false;
    progress.value = withSpring(
      0,
      {
        damping: 22,
        mass: 0.85,
        overshootClamping: true,
        stiffness: 260,
      },
      (finished) => {
        if (finished) {
          runOnJS(finishHideToast)();
        }
      },
    );
  }, [clearHideTimer, finishHideToast, progress]);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    clearHideTimer();

    if (visible) {
      didDismissRef.current = false;
      visibleRef.current = true;
      setMounted(true);
      progress.value = withSpring(1, {
        damping: 14,
        mass: 0.8,
        overshootClamping: false,
        stiffness: 230,
      });
      if (durationMs > 0) {
        hideTimerRef.current = setTimeout(hideToast, durationMs);
      }
      return clearHideTimer;
    }

    hideToast();
    return clearHideTimer;
  }, [clearHideTimer, durationMs, hideToast, progress, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progress.value, [0, 0.72, 1], [22, -2, 0]) },
      { scale: interpolate(progress.value, [0, 0.72, 1], [0.94, 1.018, 1]) },
    ],
  }));

  if (!isMounted) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.toastHost,
          {
            bottom: Math.max(insets.bottom + toastBottomOffset, toastMinBottom),
          },
          animatedStyle,
        ]}
      >
        <View style={styles.toast}>
          <View style={styles.iconShell}>
            <Check color={theme.textSecondary} size={15} strokeWidth={2.25} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            {message ? (
              <Text numberOfLines={2} style={styles.message}>
                {message}
              </Text>
            ) : null}
          </View>
          {action ? (
            <Pressable
              accessibilityLabel={action.accessibilityLabel}
              accessibilityRole="button"
              disabled={action.disabled}
              hitSlop={10}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.action,
                pressed && !action.disabled && styles.actionPressed,
                action.disabled && styles.actionDisabled,
              ]}
            >
              <Text style={styles.actionText}>
                {action.disabled && action.pendingLabel ? action.pendingLabel : action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  toastHost: {
    left: Spacing.four,
    position: "absolute",
    right: Spacing.four,
  },
  toast: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: theme.backgroundOverlayStrong,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.two,
    maxWidth: 520,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: 9,
    shadowColor: theme.shadow,
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    width: "100%",
  },
  iconShell: {
    alignItems: "center",
    backgroundColor: theme.tintSoft,
    borderColor: theme.borderSubtle,
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    color: theme.text,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  message: {
    color: theme.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  action: {
    alignItems: "center",
    backgroundColor: theme.tintStrong,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 32,
    minWidth: 82,
    paddingHorizontal: 12,
  },
  actionPressed: {
    opacity: 0.82,
  },
  actionDisabled: {
    opacity: 0.7,
  },
  actionText: {
    color: theme.text,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
}));
