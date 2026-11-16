import "@/global.css";
import "expo-dev-client";
import "react-native-gesture-handler";

import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { HotUpdater } from "@hot-updater/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack, usePathname } from "expo-router";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { AppState, Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useComputerConnection } from "@/hooks/use-computer-connection";
import { computerChangeDestination } from "@/lib/computer-navigation";
import {
  initializeComputerSessionState,
  saveCurrentComputerState,
} from "@/lib/computer-session-state";
import { getConnectionGeneration, onConnectionInvalidated } from "@/lib/connection-context";
import {
  getActiveComputer,
  getComputers,
  subscribeComputerProfiles,
  canRouteLegacyNotification,
} from "@/lib/computer-profiles";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { useInitialPushNotificationRegistration } from "@/hooks/use-initial-push-notification-registration";
import { addHotUpdaterLog, formatHotUpdaterProgress } from "@/lib/hot-updater-logs";
import {
  configurePushNotificationPresentation,
  notificationResponseThreadId,
  supportsPushNotifications,
} from "@/lib/push-notifications";
import {
  persistedQueryMaxAgeMs,
  queryClientPersister,
  shouldPersistQuery,
} from "@/lib/query-persistence";
import { restoreChatStoreFromQueryCache } from "@/lib/server-state-hydration";
import { setActiveThread } from "@/state/chat-store";

void SplashScreen.preventAutoHideAsync();
configurePushNotificationPresentation();

const appTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#000000",
    border: "rgba(255, 255, 255, 0.08)",
    card: "#0C0C0D",
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      retry: 1,
      staleTime: 0,
    },
  },
});

initializeComputerSessionState();
onConnectionInvalidated(() => {
  void queryClient.cancelQueries();
});
let savedComputerIds = getComputers().map((computer) => computer.id);
subscribeComputerProfiles(() => {
  const ids = getComputers().map((computer) => computer.id);
  for (const id of savedComputerIds) {
    if (!ids.includes(id))
      queryClient.removeQueries({ predicate: (query) => query.queryKey[1] === id });
  }
  savedComputerIds = ids;
});

const TextWithDefaults = Text as typeof Text & {
  defaultProps?: Partial<React.ComponentProps<typeof Text>>;
};
const TextInputWithDefaults = TextInput as typeof TextInput & {
  defaultProps?: Partial<React.ComponentProps<typeof TextInput>>;
};

TextWithDefaults.defaultProps = {
  ...TextWithDefaults.defaultProps,
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
};

TextInputWithDefaults.defaultProps = {
  ...TextInputWithDefaults.defaultProps,
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
};

async function checkForLaunchUpdate() {
  addHotUpdaterLog(
    "info",
    "OTA launch check started",
    [
      `App version: ${HotUpdater.getAppVersion()}`,
      `Channel: ${HotUpdater.getChannel()}`,
      `Default channel: ${HotUpdater.getDefaultChannel()}`,
      `Cohort: ${HotUpdater.getCohort()}`,
      `Bundle: ${HotUpdater.getBundleId()}`,
      `Min bundle: ${HotUpdater.getMinBundleId()}`,
    ].join("\n"),
  );

  const updateInfo = await HotUpdater.checkForUpdate({
    updateStrategy: "appVersion",
    onError: (error) => {
      addHotUpdaterLog(
        "warning",
        "OTA launch check reported error",
        [`Name: ${error.name}`, `Message: ${error.message}`].join("\n"),
      );
    },
  });

  if (!updateInfo) {
    addHotUpdaterLog("info", "OTA launch check found no update");
    return;
  }

  addHotUpdaterLog(
    "info",
    "OTA launch check found update",
    [`ID: ${updateInfo.id}`, `Status: ${updateInfo.status}`, `Message: ${updateInfo.message}`].join(
      "\n",
    ),
  );

  const didDownload = await updateInfo.updateBundle();
  addHotUpdaterLog(
    didDownload ? "info" : "warning",
    "OTA launch update bundle finished",
    `Downloaded: ${didDownload ? "yes" : "no"}`,
  );
}

function ComputerConnectionLifecycle() {
  useComputerConnection();
  return null;
}

function TabLayout() {
  const connectionGeneration = useSyncExternalStore(
    onConnectionInvalidated,
    getConnectionGeneration,
    getConnectionGeneration,
  );
  const pathname = usePathname();
  const activeComputer = getActiveComputer();
  const previousPairing = useRef(activeComputer?.credentialId);
  useEffect(() => {
    if (previousPairing.current === activeComputer?.credentialId) return;
    previousPairing.current = activeComputer?.credentialId;
    // Routes with thread or bot IDs belong to the previous computer.
    router.replace(computerChangeDestination(pathname, Boolean(activeComputer)));
  }, [activeComputer?.credentialId, pathname, activeComputer]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") saveCurrentComputerState();
    });
    return () => subscription.remove();
  }, []);
  useInitialPushNotificationRegistration();
  const [fontsLoaded] = useFonts({
    GeistMono: require("../../assets/fonts/GeistMono-Regular.ttf"),
    "GeistMono-Medium": require("../../assets/fonts/GeistMono-Medium.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const unsubscribeProgress = HotUpdater.addListener("onProgress", (event) => {
      addHotUpdaterLog("info", "OTA download progress", formatHotUpdaterProgress(event));
    });

    void checkForLaunchUpdate().catch(() => undefined);

    return unsubscribeProgress;
  }, []);

  useEffect(() => {
    if (!supportsPushNotifications()) {
      return;
    }
    const openNotificationThread = (response: Notifications.NotificationResponse) => {
      if (!canRouteLegacyNotification() || !getActiveComputer()) {
        router.replace("/");
        Notifications.clearLastNotificationResponse();
        return;
      }
      const threadId = notificationResponseThreadId(response);
      if (!threadId) {
        return;
      }
      setActiveThread(threadId);
      router.replace("/chat");
      Notifications.clearLastNotificationResponse();
    };

    const mostRecentResponse = Notifications.getLastNotificationResponse();
    if (mostRecentResponse) {
      openNotificationThread(mostRecentResponse);
    }
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openNotificationThread);
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      onSuccess={() => restoreChatStoreFromQueryCache(queryClient)}
      persistOptions={{
        buster: "codex-relay-server-state-v3",
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
        },
        maxAge: persistedQueryMaxAgeMs,
        persister: queryClientPersister,
      }}
    >
      <ComputerConnectionLifecycle />
      <ThemeProvider value={appTheme}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <BottomSheetModalProvider>
              <AnimatedSplashOverlay />
              <Stack
                key={connectionGeneration}
                screenOptions={{
                  contentStyle: {
                    backgroundColor: "#000000",
                  },
                  headerShown: false,
                }}
              >
                <Stack.Screen name="(drawer)" />
                <Stack.Screen
                  name="chat"
                  options={{
                    animation: "slide_from_right",
                    gestureEnabled: true,
                  }}
                />
                <Stack.Screen
                  name="preview"
                  options={{
                    animation: "slide_from_right",
                    gestureEnabled: true,
                  }}
                />
                <Stack.Screen
                  name="bot-chat/[conversationId]"
                  options={{
                    animation: "slide_from_right",
                    gestureEnabled: true,
                  }}
                />
                <Stack.Screen
                  name="bot-preview/[conversationId]"
                  options={{ animation: "slide_from_right", gestureEnabled: true }}
                />
                <Stack.Screen name="bot/[botId]" options={{ animation: "slide_from_right" }} />
                <Stack.Screen name="bot/new" options={{ animation: "slide_from_right" }} />
                <Stack.Screen name="bot/[botId]/edit" options={{ animation: "slide_from_right" }} />
                <Stack.Screen
                  name="bot/[botId]/definition"
                  options={{ animation: "slide_from_right" }}
                />
                <Stack.Screen
                  name="bot/[botId]/memory"
                  options={{ animation: "slide_from_right" }}
                />
                <Stack.Screen
                  name="bot/[botId]/history"
                  options={{ animation: "slide_from_right" }}
                />
                <Stack.Screen name="pair" />
                <Stack.Screen
                  name="image-viewer"
                  options={{
                    contentStyle: {
                      backgroundColor: "#050505",
                    },
                    gestureEnabled: true,
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="settings-home"
                  options={{
                    animation: "slide_from_right",
                    gestureEnabled: true,
                    title: "Settings",
                  }}
                />
                <Stack.Screen
                  name="settings"
                  options={{
                    animation: "slide_from_right",
                    gestureEnabled: true,
                    title: "Settings",
                  }}
                />
                <Stack.Screen
                  name="workspace-file-editor"
                  options={{
                    animation: "slide_from_right",
                    title: "File Editor",
                  }}
                />
              </Stack>
              <PortalHost />
            </BottomSheetModalProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

const hotUpdaterBaseUrl = process.env.EXPO_PUBLIC_HOT_UPDATER_BASE_URL?.trim();
const hotUpdaterApiKey =
  process.env.EXPO_PUBLIC_HOT_UPDATER_API_KEY?.trim() ||
  (typeof Constants.expoConfig?.extra?.hotUpdaterApiKey === "string"
    ? Constants.expoConfig.extra.hotUpdaterApiKey.trim()
    : undefined);

if (hotUpdaterBaseUrl) {
  HotUpdater.init({
    insights: true,
    baseURL: hotUpdaterBaseUrl,
    requestHeaders: hotUpdaterApiKey ? { "x-api-key": hotUpdaterApiKey } : undefined,
  });
}

export default TabLayout;
