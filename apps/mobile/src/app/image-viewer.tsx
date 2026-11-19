import { useTheme } from "@/hooks/use-theme";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { RotateCcw } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Fonts, Spacing } from "@/constants/theme";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const RESET_DURATION_MS = 180;

export default function ImageViewerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const params = useLocalSearchParams<{ title?: string; uri?: string }>();
  const uri = normalizedParam(params.uri);
  const title = normalizedParam(params.title) ?? "Image";
  const [failed, setFailed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, resetTiming());
    savedScale.value = 1;
    translateX.value = withTiming(0, resetTiming());
    translateY.value = withTiming(0, resetTiming());
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clampScale(savedScale.value * event.scale);
    })
    .onEnd(() => {
      if (scale.value <= 1.03) {
        scale.value = withTiming(1, resetTiming());
        translateX.value = withTiming(0, resetTiming());
        translateY.value = withTiming(0, resetTiming());
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_event, stateManager) => {
      if (scale.value > 1) {
        stateManager.activate();
        return;
      }
      stateManager.fail();
    })
    .onUpdate((event) => {
      if (scale.value <= 1) {
        return;
      }
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        runOnJS(resetZoom)();
        return;
      }
      scale.value = withTiming(2, resetTiming());
      savedScale.value = 2;
    });

  const imageGesture = Gesture.Simultaneous(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
  );
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          accessibilityLabel="Close image viewer"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Icon name="x" size={21} tintColor={theme.imageForeground} />
        </Pressable>
        <ThemedText numberOfLines={1} style={styles.title}>
          {title}
        </ThemedText>
        <Pressable
          accessibilityLabel="Reset image zoom"
          accessibilityRole="button"
          onPress={resetZoom}
          style={styles.headerButton}
        >
          <RotateCcw color={theme.imageForeground} size={19} strokeWidth={2} />
        </Pressable>
      </View>
      <GestureDetector gesture={imageGesture}>
        <Animated.View style={styles.stage}>
          {uri && !failed ? (
            <Animated.View style={[styles.imageFrame, imageStyle]}>
              <Image
                contentFit="contain"
                onError={() => setFailed(true)}
                source={{ uri }}
                style={[styles.image, { height, width }]}
                transition={120}
              />
            </Animated.View>
          ) : (
            <View style={styles.empty}>
              <ThemedText style={styles.emptyTitle}>Image unavailable</ThemedText>
              <ThemedText type="small" style={styles.emptyText}>
                This attachment could not be opened.
              </ThemedText>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function normalizedParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function clampScale(value: number) {
  "worklet";
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function resetTiming() {
  "worklet";
  return {
    duration: RESET_DURATION_MS,
    easing: Easing.out(Easing.cubic),
  };
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    backgroundColor: theme.imageBackground,
    flex: 1,
  },
  header: {
    alignItems: "center",
    backgroundColor: theme.dimmer,
    flexDirection: "row",
    gap: Spacing.two,
    left: 0,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: theme.tintMedium,
    borderColor: theme.borderSubtle,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  title: {
    color: theme.imageForeground,
    flex: 1,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  stage: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  imageFrame: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    backgroundColor: theme.imageBackground,
  },
  empty: {
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  emptyTitle: {
    color: theme.imageForeground,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  emptyText: {
    color: theme.imageForeground,
    opacity: 0.65,
    maxWidth: 280,
    textAlign: "center",
  },
}));
