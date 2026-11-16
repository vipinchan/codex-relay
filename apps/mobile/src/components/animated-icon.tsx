import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated, { Easing, Keyframe } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const DURATION = 600;

export function AnimatedSplashOverlay() {
  const { height } = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const splashKeyframe = useMemo(
    () =>
      new Keyframe({
        0: {
          transform: [{ scale: height / 90 }],
          opacity: 1,
        },
        20: {
          opacity: 1,
        },
        70: {
          opacity: 0,
          easing: Easing.elastic(0.7),
        },
        100: {
          opacity: 0,
          transform: [{ scale: 1 }],
          easing: Easing.elastic(0.7),
        },
      }),
    [height],
  );

  if (!visible) return null;

  return (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        "worklet";
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.backgroundSolidColor}
    />
  );
}

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: "0deg" }],
  },
  100: {
    transform: [{ rotateZ: "7200deg" }],
  },
});

export function AnimatedIcon() {
  const { height } = useWindowDimensions();
  const keyframe = useMemo(
    () =>
      new Keyframe({
        0: {
          transform: [{ scale: height / 90 }],
        },
        100: {
          transform: [{ scale: 1 }],
          easing: Easing.elastic(0.7),
        },
      }),
    [height],
  );

  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require("@/assets/images/logo-glow.png")} />
      </Animated.View>

      <Animated.View entering={keyframe.duration(DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require("@/assets/images/relay-logo.png")} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  imageContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  glow: {
    width: 201,
    height: 201,
    position: "absolute",
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 128,
    height: 128,
    zIndex: 10,
  },
  image: {
    position: "absolute",
    width: 82,
    height: 82,
  },
  background: {
    borderRadius: 40,
    backgroundColor: theme.backgroundElevated,
    width: 128,
    height: 128,
    position: "absolute",
  },
  backgroundSolidColor: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.backgroundElevated,
    zIndex: 40,
  },
}));
