import { Drawer } from "expo-router/drawer";
import { Pressable, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ConversationHistoryScreen } from "@/components/chat/ConversationHistoryScreen";
import {
  EXPANDED_DRAWER_BREAKPOINT,
  IpadSplitLayoutProvider,
  useIpadSplitLayout,
} from "@/components/chat/ipad-split-layout";
import { Icon, type AppIconName } from "@/components/ui/icon";
import { Colors } from "@/constants/theme";
import { hapticMediumImpact } from "@/lib/haptics";

const COLLAPSED_DRAWER_WIDTH = 52;

export default function DrawerLayout() {
  return (
    <IpadSplitLayoutProvider>
      <DrawerLayoutContent />
    </IpadSplitLayoutProvider>
  );
}

function DrawerLayoutContent() {
  const { width } = useWindowDimensions();
  const { isSidebarVisible, setSidebarVisible, sidebarWidth } = useIpadSplitLayout();
  const usesExpandedDrawer = width >= EXPANDED_DRAWER_BREAKPOINT;
  const showsExpandedDrawer = usesExpandedDrawer && isSidebarVisible;
  const showsCollapsedRail = usesExpandedDrawer && !isSidebarVisible;
  const compactDrawerWidth = Math.min(width * 0.92, 420);

  function expandSidebar() {
    setSidebarVisible(true);
    hapticMediumImpact();
  }

  return (
    <Drawer
      drawerContent={(props) =>
        showsExpandedDrawer || !usesExpandedDrawer ? (
          <ConversationHistoryScreen
            mode="drawer"
            onClose={() => {
              if (!showsExpandedDrawer) {
                props.navigation.closeDrawer();
              }
            }}
          />
        ) : showsCollapsedRail ? (
          <CollapsedThreadSidebarRail onExpand={expandSidebar} />
        ) : null
      }
      screenOptions={{
        drawerType: usesExpandedDrawer ? "permanent" : "front",
        headerShown: false,
        swipeEnabled: !usesExpandedDrawer,
        swipeEdgeWidth: 76,
        swipeMinDistance: 22,
        sceneStyle: {
          backgroundColor: "#000000",
        },
        drawerStyle: {
          backgroundColor: "#000000",
          borderRightColor: "rgba(255, 255, 255, 0.06)",
          borderRightWidth: usesExpandedDrawer ? 1 : 0,
          overflow: showsExpandedDrawer ? "visible" : "hidden",
          width: usesExpandedDrawer
            ? showsExpandedDrawer
              ? sidebarWidth
              : COLLAPSED_DRAWER_WIDTH
            : compactDrawerWidth,
        },
        overlayColor: usesExpandedDrawer ? "transparent" : "rgba(0, 0, 0, 0.58)",
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          drawerLabel: "Conversations",
          title: "Codex Relay",
        }}
      />
      {__DEV__ ? (
        <Drawer.Screen
          name="preview"
          options={{
            drawerItemStyle: { display: "none" },
            title: "Chat Preview",
          }}
        />
      ) : null}
    </Drawer>
  );
}

function CollapsedThreadSidebarRail({ onExpand }: { onExpand: () => void }) {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.collapsedRail}>
      <View style={styles.collapsedRailTop}>
        <CollapsedRailButton icon="sidebarShow" label="Show conversations" onPress={onExpand} />
        <CollapsedRailButton icon="search" label="Search conversations" onPress={onExpand} />
        <CollapsedRailButton icon="newChat" label="New chat" onPress={onExpand} />
      </View>
      <CollapsedRailButton icon="settings" label="Open settings" onPress={onExpand} />
    </SafeAreaView>
  );
}

function CollapsedRailButton({
  icon,
  label,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.collapsedRailButton, pressed && styles.pressed]}
    >
      <Icon name={icon} size={17} tintColor={Colors.dark.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  collapsedRail: {
    alignItems: "center",
    backgroundColor: "#000000",
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingTop: 10,
    width: COLLAPSED_DRAWER_WIDTH,
  },
  collapsedRailButton: {
    alignItems: "center",
    borderRadius: 9,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  collapsedRailTop: {
    gap: 8,
  },
  pressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    opacity: 0.72,
  },
});
