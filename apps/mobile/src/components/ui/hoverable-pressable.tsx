import React, { useState, useCallback, type ReactNode } from "react";
import {
  Pressable,
  Platform,
  type GestureResponderEvent,
  type Insets,
  type StyleProp,
  type ViewStyle,
  type AccessibilityRole,
} from "react-native";

export type HoverablePressableState = {
  pressed: boolean;
  hovered: boolean;
};

export type HoverablePressableProps = {
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  children?: ReactNode | ((state: HoverablePressableState) => ReactNode);
  delayLongPress?: number;
  disabled?: boolean;
  hitSlop?: Insets | number;
  hoverStyle?: StyleProp<ViewStyle>;
  onHoverIn?: (event: unknown) => void;
  onHoverOut?: (event: unknown) => void;
  onPress?: (event: GestureResponderEvent) => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle> | ((state: HoverablePressableState) => StyleProp<ViewStyle>);
  testID?: string;
};

export function HoverablePressable({
  accessibilityLabel,
  accessibilityRole = "button",
  children,
  delayLongPress,
  disabled = false,
  hitSlop,
  hoverStyle,
  onHoverIn,
  onHoverOut,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  style,
  testID,
}: HoverablePressableProps) {
  const [hovered, setHovered] = useState(false);

  const handleHoverIn = useCallback(
    (event: unknown) => {
      if (disabled) return;
      setHovered(true);
      onHoverIn?.(event);
    },
    [disabled, onHoverIn],
  );

  const handleHoverOut = useCallback(
    (event: unknown) => {
      setHovered(false);
      onHoverOut?.(event);
    },
    [onHoverOut],
  );

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      delayLongPress={delayLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLongPress={onLongPress}
      testID={testID}
      style={(pressableState) => {
        const state: HoverablePressableState = {
          pressed: pressableState.pressed,
          hovered,
        };
        const baseStyle = typeof style === "function" ? style(state) : style;
        const isMac =
          Platform.OS === "ios" && Boolean((Platform as { isMacCatalyst?: boolean }).isMacCatalyst);
        const pointerCursor =
          Platform.OS === "web" || isMac
            ? ({ cursor: disabled ? "default" : "pointer" } as ViewStyle)
            : undefined;

        return [pointerCursor, baseStyle, hovered && !disabled && hoverStyle];
      }}
    >
      {(pressableState) => {
        const state: HoverablePressableState = {
          pressed: pressableState.pressed,
          hovered,
        };
        return typeof children === "function" ? children(state) : children;
      }}
    </Pressable>
  );
}
