import { useTheme } from "@/hooks/use-theme";
import { HotUpdater } from "@hot-updater/react-native";
import { isMacLocalBuild } from "@/lib/build-platform";
import { useSelector } from "@legendapp/state/react";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Heart } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Switch, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { useComputerOperations } from "@/hooks/use-computer-operations";
import { getActiveComputer, removeComputer } from "@/lib/computer-profiles";

import { ComputerSettings } from "@/components/settings/ComputerSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";

import { FaGithub } from "@/assets/icons/fa";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import {
  codexRelayRepositoryLabel,
  codexRelayRepositoryUrl,
  codexRelaySponsorLabel,
  codexRelaySponsorUrl,
} from "@/constants/links";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import {
  getPushNotificationSettings as rawGetPushNotificationSettings,
  registerPushNotifications as rawRegisterPushNotifications,
  unregisterPushNotifications as rawUnregisterPushNotifications,
} from "@/lib/codex-relay-api";
import { hapticSelection, hapticWarning } from "@/lib/haptics";
import {
  clearHotUpdaterLogs,
  formatHotUpdaterLogTime,
  useHotUpdaterLogs,
} from "@/lib/hot-updater-logs";
import { formatMobileReleaseVersion } from "@/lib/mobile-release-version";
import {
  defaultPushNotificationPreferences,
  getExpoPushToken,
  markInitialPushNotificationRegistrationCompleted,
  pushNotificationPlatform,
  supportsPushNotifications,
} from "@/lib/push-notifications";
import { formatRateLimitRemaining, visibleRateLimitRows } from "@/lib/rate-limits";
import { serverStateKeys, serverStateQueryFns } from "@/lib/server-state";
import { chatStore$ } from "@/state/chat-store";

import mobilePackage from "../../package.json";

const hotUpdaterBaseUrl = process.env.EXPO_PUBLIC_HOT_UPDATER_BASE_URL?.trim();
const hotUpdaterBaseUrlStatus = hotUpdaterBaseUrl ? "configured" : "missing";

type PushNotificationPreference = keyof typeof defaultPushNotificationPreferences;

export default function SettingsScreen({ embedded = false }: { embedded?: boolean }) {
  const theme = useTheme();
  const { getPushNotificationSettings, registerPushNotifications, unregisterPushNotifications } =
    useComputerOperations({
      getPushNotificationSettings: rawGetPushNotificationSettings,
      registerPushNotifications: rawRegisterPushNotifications,
      unregisterPushNotifications: rawUnregisterPushNotifications,
    });
  const connection = useSelector(() => chatStore$.connection.get());
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());
  const serverUrl = useSelector(() => chatStore$.serverUrl.get());
  const rateLimitsQuery = useQuery({
    queryKey: serverStateKeys.rateLimits(),
    queryFn: serverStateQueryFns.rateLimits,
    enabled: connection === "connected",
  });
  const [appVersion] = useState(
    () => HotUpdater.getAppVersion() ?? Constants.expoConfig?.version ?? "1.0.0",
  );
  const releaseVersionLabel = formatMobileReleaseVersion(appVersion, mobilePackage.version);
  const [appliedBundleSuffix] = useState(appliedHotUpdateBundleSuffix);
  const hotUpdaterTapCountRef = useRef(0);
  const [showHotUpdaterLogs, setShowHotUpdaterLogs] = useState(false);
  const hotUpdaterLogs = useHotUpdaterLogs();
  const [appUpdate, setAppUpdate] = useState<AppUpdateState>({
    status: isMacLocalBuild ? "manual" : "checking",
    updateInfo: null,
  });
  const [pushNotificationPreferences, setPushNotificationPreferences] = useState(
    defaultPushNotificationPreferences,
  );
  const [pushNotificationsLoading, setPushNotificationsLoading] = useState(false);
  const [pushNotificationsUpdating, setPushNotificationsUpdating] = useState(false);
  const pushNotificationsSupported = supportsPushNotifications();
  const rateLimitRows = visibleRateLimitRows(rateLimitsQuery.data?.buckets ?? []);
  const isAppUpdatePending =
    appUpdate.status === "downloading" ||
    appUpdate.status === "ready" ||
    appUpdate.status === "updating";
  const isAppUpdateActionDisabled =
    appUpdate.status === "downloading" || appUpdate.status === "updating";
  const appUpdateActionLabel =
    appUpdate.status === "downloading"
      ? "Downloading"
      : appUpdate.status === "updating"
        ? "Restarting"
        : "Restart";

  useEffect(() => {
    let isActive = true;

    async function checkForAppUpdate() {
      if (isMacLocalBuild) return;
      try {
        const updateInfo = await HotUpdater.checkForUpdate({
          updateStrategy: "appVersion",
        });

        if (!isActive) {
          return;
        }

        if (!updateInfo) {
          setAppUpdate({
            status: "current",
            updateInfo: null,
          });
          return;
        }

        setAppUpdate({
          status: "downloading",
          updateInfo,
        });

        const didDownload = await updateInfo.updateBundle();

        if (!isActive) {
          return;
        }

        setAppUpdate({
          status: didDownload ? "ready" : "error",
          updateInfo: didDownload ? updateInfo : null,
        });
      } catch {
        if (isActive) {
          setAppUpdate({ status: "error", updateInfo: null });
        }
      }
    }

    void checkForAppUpdate();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    if (!hasPairedSession || !pushNotificationsSupported) {
      setPushNotificationPreferences(defaultPushNotificationPreferences);
      setPushNotificationsLoading(false);
      return () => {
        isActive = false;
      };
    }

    setPushNotificationsLoading(true);
    void getPushNotificationSettings()
      .then((settings) => {
        if (isActive) {
          setPushNotificationPreferences(settings.preferences);
        }
      })
      .catch(() => {
        if (isActive) {
          setPushNotificationPreferences(defaultPushNotificationPreferences);
        }
      })
      .finally(() => {
        if (isActive) {
          setPushNotificationsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [hasPairedSession, pushNotificationsSupported, serverUrl, getPushNotificationSettings]);

  function closeSettings() {
    hapticSelection();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }

  function signOut() {
    const id = getActiveComputer()?.id;
    hapticWarning();
    Alert.alert(
      "Remove current pairing?",
      "This removes this computer from your phone. Other saved computers and tasks on your Mac are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            if (id) removeComputer(id);
            router.replace("/");
          },
        },
      ],
    );
  }

  async function updatePushNotificationPreference(
    preference: PushNotificationPreference,
    value: boolean,
  ) {
    if (pushNotificationsUpdating || !pushNotificationsSupported) {
      return;
    }

    const previousPreferences = pushNotificationPreferences;
    const nextPreferences = { ...previousPreferences, [preference]: value };
    hapticSelection();
    markInitialPushNotificationRegistrationCompleted();
    setPushNotificationPreferences(nextPreferences);
    setPushNotificationsUpdating(true);

    try {
      const settings = Object.values(nextPreferences).some(Boolean)
        ? await registerPushNotifications({
            expoPushToken: await getExpoPushToken(),
            platform: pushNotificationPlatform(),
            preferences: nextPreferences,
          })
        : await unregisterPushNotifications();
      setPushNotificationPreferences(settings.preferences);
    } catch (caught) {
      setPushNotificationPreferences(previousPreferences);
      hapticWarning();
      Alert.alert("Notifications unavailable", settingsErrorMessage(caught));
    } finally {
      setPushNotificationsUpdating(false);
    }
  }

  async function applyAppUpdate() {
    if (!appUpdate.updateInfo || appUpdate.status !== "ready") {
      return;
    }

    hapticSelection();
    setAppUpdate((current) => ({ ...current, status: "updating" }));

    try {
      await HotUpdater.reload();
    } catch {
      setAppUpdate((current) => ({ ...current, status: "error" }));
      hapticWarning();
    }
  }

  function revealHotUpdaterLogs() {
    if (showHotUpdaterLogs) {
      hotUpdaterTapCountRef.current = 0;
      return;
    }

    hotUpdaterTapCountRef.current += 1;

    if (hotUpdaterTapCountRef.current < 5) {
      return;
    }

    hotUpdaterTapCountRef.current = 0;
    setShowHotUpdaterLogs(true);
  }

  function openProjectLink(url: string) {
    hapticSelection();
    void Linking.openURL(url);
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          {embedded ? (
            <View style={styles.headerButtonPlaceholder} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to threads"
              onPress={closeSettings}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Icon name="back" size={19} tintColor={theme.text} />
            </Pressable>
          )}
          <View style={styles.titleGroup}>
            <ThemedText type="smallBold" style={styles.title}>
              Settings
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary" style={styles.subtitle}>
              Account
            </ThemedText>
          </View>
          <View style={styles.headerButtonPlaceholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <AppearanceSettings />
          <Animated.View layout={settingsLayoutTransition} style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              Project
            </ThemedText>
            <Animated.View layout={settingsLayoutTransition} style={styles.projectLinkList}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Open Codex Relay GitHub repository"
                onPress={() => openProjectLink(codexRelayRepositoryUrl)}
                style={({ pressed }) => [styles.projectLinkRow, pressed && styles.pressed]}
              >
                <View style={styles.projectLinkIcon}>
                  <FaGithub size={17} color={theme.text} />
                </View>
                <View style={styles.projectLinkCopy}>
                  <ThemedText type="smallBold" style={styles.projectLinkTitle}>
                    GitHub
                  </ThemedText>
                  <ThemedText
                    type="code"
                    themeColor="textSecondary"
                    style={styles.projectLinkSubtitle}
                    numberOfLines={1}
                  >
                    {codexRelayRepositoryLabel}
                  </ThemedText>
                </View>
                <Icon name="externalLink" size={15} tintColor={theme.textSecondary} />
              </Pressable>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Open gronxb GitHub Sponsors"
                onPress={() => openProjectLink(codexRelaySponsorUrl)}
                style={({ pressed }) => [styles.projectLinkRow, pressed && styles.pressed]}
              >
                <View style={[styles.projectLinkIcon, styles.projectLinkIconSponsor]}>
                  <Heart size={16} color={theme.sponsor} fill={theme.sponsor} />
                </View>
                <View style={styles.projectLinkCopy}>
                  <ThemedText type="smallBold" style={styles.projectLinkTitle}>
                    Sponsor
                  </ThemedText>
                  <ThemedText
                    type="code"
                    themeColor="textSecondary"
                    style={styles.projectLinkSubtitle}
                    numberOfLines={1}
                  >
                    {codexRelaySponsorLabel}
                  </ThemedText>
                </View>
                <Icon name="externalLink" size={15} tintColor={theme.textSecondary} />
              </Pressable>
            </Animated.View>
          </Animated.View>

          <Animated.View layout={settingsLayoutTransition} style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              Usage Limits
            </ThemedText>
            <Animated.View layout={settingsLayoutTransition} style={styles.usageCard}>
              {rateLimitRows.length > 0 ? (
                rateLimitRows.map((row, index) => (
                  <RateLimitProgressRow
                    key={row.id}
                    label={row.label}
                    remainingText={formatRateLimitRemaining(row.window)}
                    remainingPercent={row.window.remainingPercent}
                    usedPercent={row.window.usedPercent}
                    showDivider={index < rateLimitRows.length - 1}
                  />
                ))
              ) : (
                <Animated.View
                  key="usage-empty"
                  entering={settingsEnterTransition}
                  exiting={settingsExitTransition}
                  layout={settingsLayoutTransition}
                  style={styles.usageRow}
                >
                  <View style={styles.usageCopy}>
                    <ThemedText type="smallBold" style={styles.usageTitle}>
                      Rate limits
                    </ThemedText>
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.usageSubtitle}
                    >
                      {rateLimitsQuery.isFetching
                        ? "Checking current usage"
                        : "Unavailable from this runtime"}
                    </ThemedText>
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          </Animated.View>

          <ComputerSettings />

          {hasPairedSession ? (
            <Animated.View layout={settingsLayoutTransition} style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                Notifications
              </ThemedText>
              <Animated.View layout={settingsLayoutTransition} style={styles.notificationPanel}>
                {pushNotificationsSupported ? (
                  <>
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.notificationIntro}
                    >
                      Generic alerts only. Chat content stays on your paired computer.
                    </ThemedText>
                    <PushNotificationToggle
                      accessibilityLabel="Notify when a Codex turn ends"
                      disabled={pushNotificationsLoading || pushNotificationsUpdating}
                      onValueChange={(value) =>
                        void updatePushNotificationPreference("turnTerminal", value)
                      }
                      subtitle="When Codex completes or fails a turn"
                      title="Turn complete"
                      value={pushNotificationPreferences.turnTerminal}
                    />
                    <PushNotificationToggle
                      accessibilityLabel="Include remaining Codex usage in turn-complete notifications"
                      disabled={pushNotificationsLoading || pushNotificationsUpdating}
                      onValueChange={(value) =>
                        void updatePushNotificationPreference("includeRemainingUsage", value)
                      }
                      subtitle="Show the lowest remaining Codex limit after a turn"
                      title="Remaining usage"
                      value={pushNotificationPreferences.includeRemainingUsage}
                    />
                    <PushNotificationToggle
                      accessibilityLabel="Notify when Codex needs action"
                      disabled={pushNotificationsLoading || pushNotificationsUpdating}
                      onValueChange={(value) =>
                        void updatePushNotificationPreference("actionRequired", value)
                      }
                      showDivider={false}
                      subtitle="When Codex needs approval or input"
                      title="Action required"
                      value={pushNotificationPreferences.actionRequired}
                    />
                  </>
                ) : (
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.notificationIntro}
                  >
                    Push notifications are available in the iOS and Android apps.
                  </ThemedText>
                )}
              </Animated.View>
            </Animated.View>
          ) : null}

          {hasPairedSession ? (
            <Animated.View layout={settingsLayoutTransition} style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                Session
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                onPress={signOut}
                style={({ pressed }) => [styles.signOutRow, pressed && styles.pressed]}
              >
                <View style={styles.signOutContent}>
                  <View style={styles.signOutIconSlot}>
                    <Icon name="signOut" size={17} tintColor={theme.danger} />
                  </View>
                  <View style={styles.signOutCopy}>
                    <ThemedText type="smallBold" style={styles.signOutTitle}>
                      Sign out
                    </ThemedText>
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.signOutSubtitle}
                    >
                      Pair again on this device
                    </ThemedText>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          ) : null}

          <Animated.View layout={settingsLayoutTransition} style={styles.versionFooter}>
            <Animated.View layout={settingsLayoutTransition} style={styles.versionRow}>
              <Pressable
                accessible={false}
                hitSlop={12}
                onPress={revealHotUpdaterLogs}
                style={styles.versionTapTarget}
              >
                <View style={styles.versionIcon}>
                  <Icon
                    name={isAppUpdatePending ? "refresh" : "permissionsAuto"}
                    size={12}
                    tintColor={isAppUpdatePending ? theme.success : theme.textSecondary}
                  />
                </View>
                <ThemedText type="code" themeColor="textSecondary" style={styles.versionText}>
                  Version {releaseVersionLabel}
                  {appUpdate.status === "manual" ? " · local Mac build" : null}
                  {appUpdate.status === "checking" ? " · checking" : null}
                  {appUpdate.status === "current" ? " · current" : null}
                  {appUpdate.status === "downloading" ? " · downloading" : null}
                  {appUpdate.status === "ready" ? " · restart ready" : null}
                  {appUpdate.status === "error" ? " · check failed" : null}
                  {appliedBundleSuffix ? ` · bundle ${appliedBundleSuffix}` : null}
                </ThemedText>
              </Pressable>
              {isAppUpdatePending ? (
                <Animated.View
                  key="app-update-action"
                  entering={settingsEnterTransition}
                  exiting={settingsExitTransition}
                  layout={settingsLayoutTransition}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      appUpdate.status === "ready" ? "Restart app" : "Preparing app update"
                    }
                    disabled={isAppUpdateActionDisabled}
                    onPress={() => void applyAppUpdate()}
                    style={({ pressed }) => [
                      styles.versionButton,
                      isAppUpdateActionDisabled && styles.versionButtonDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText type="code" style={styles.versionButtonText}>
                      {appUpdateActionLabel}
                    </ThemedText>
                  </Pressable>
                </Animated.View>
              ) : null}
            </Animated.View>
            {isAppUpdatePending && appUpdate.updateInfo?.message ? (
              <Animated.View
                key="app-update-message"
                entering={settingsEnterTransition}
                exiting={settingsExitTransition}
                layout={settingsLayoutTransition}
              >
                <ThemedText type="small" themeColor="textSecondary" style={styles.versionMessage}>
                  {appUpdate.updateInfo.message}
                </ThemedText>
              </Animated.View>
            ) : null}
            {showHotUpdaterLogs ? (
              <Animated.View
                key="hot-updater-logs"
                entering={settingsEnterTransition}
                exiting={settingsExitTransition}
                layout={settingsLayoutTransition}
                style={styles.hotUpdaterLogPanel}
              >
                <View style={styles.hotUpdaterLogHeader}>
                  <ThemedText type="smallBold" style={styles.hotUpdaterLogTitle}>
                    Logs ({HotUpdater.getCohort()})
                  </ThemedText>
                  <View style={styles.hotUpdaterLogActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear HotUpdater logs"
                      onPress={clearHotUpdaterLogs}
                      style={({ pressed }) => [
                        styles.hotUpdaterLogButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <ThemedText type="code" style={styles.hotUpdaterLogButtonText}>
                        Clear
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Hide HotUpdater logs"
                      onPress={() => setShowHotUpdaterLogs(false)}
                      style={({ pressed }) => [
                        styles.hotUpdaterLogButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <ThemedText type="code" style={styles.hotUpdaterLogButtonText}>
                        Hide
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.hotUpdaterConfigRow}>
                  <ThemedText type="code" style={styles.hotUpdaterConfigLabel}>
                    Base URL
                  </ThemedText>
                  <ThemedText
                    type="code"
                    style={[
                      styles.hotUpdaterConfigValue,
                      !hotUpdaterBaseUrl && styles.hotUpdaterConfigValueMissing,
                    ]}
                  >
                    {hotUpdaterBaseUrlStatus}
                  </ThemedText>
                </View>
                {hotUpdaterLogs.length > 0 ? (
                  hotUpdaterLogs.map((entry) => (
                    <View key={entry.id} style={styles.hotUpdaterLogRow}>
                      <ThemedText type="code" style={styles.hotUpdaterLogMeta}>
                        {formatHotUpdaterLogTime(entry.timestamp)} · {entry.level.toUpperCase()}
                      </ThemedText>
                      <ThemedText type="small" style={styles.hotUpdaterLogMessage}>
                        {entry.message}
                      </ThemedText>
                      {entry.details ? (
                        <ThemedText
                          type="code"
                          themeColor="textSecondary"
                          style={styles.hotUpdaterLogDetails}
                        >
                          {entry.details}
                        </ThemedText>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.versionMessage}>
                    No OTA download events captured in this session.
                  </ThemedText>
                )}
              </Animated.View>
            ) : null}
          </Animated.View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function PushNotificationToggle({
  accessibilityLabel,
  disabled,
  onValueChange,
  showDivider = true,
  subtitle,
  title,
  value,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
  showDivider?: boolean;
  subtitle: string;
  title: string;
  value: boolean;
}) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={settingsEnterTransition}
      exiting={settingsExitTransition}
      layout={settingsLayoutTransition}
      style={[styles.notificationRow, showDivider && styles.notificationRowDivider]}
    >
      <View style={styles.notificationCopy}>
        <ThemedText type="smallBold" style={styles.notificationTitle}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.notificationSubtitle}>
          {subtitle}
        </ThemedText>
      </View>
      <Switch
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={value ? theme.switchThumbOn : theme.switchThumbOff}
        trackColor={{ false: theme.tintProminent, true: theme.successStrong }}
        value={value}
      />
    </Animated.View>
  );
}

function RateLimitProgressRow({
  label,
  remainingPercent,
  remainingText,
  showDivider,
  usedPercent,
}: {
  label: string;
  remainingPercent: number;
  remainingText: string;
  showDivider: boolean;
  usedPercent: number;
}) {
  const theme = useTheme();
  const clampedUsedPercent = clampPercent(usedPercent);
  const clampedRemainingPercent = clampPercent(remainingPercent);
  const progressColor = rateLimitProgressColor(clampedRemainingPercent, theme);

  return (
    <Animated.View
      entering={settingsEnterTransition}
      exiting={settingsExitTransition}
      layout={settingsLayoutTransition}
      style={[styles.usageRow, showDivider && styles.usageRowDivider]}
    >
      <View style={styles.usageHeader}>
        <View style={styles.usageCopy}>
          <ThemedText type="smallBold" style={styles.usageTitle} numberOfLines={1}>
            {label}
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.usageSubtitle}
            numberOfLines={1}
          >
            {remainingText} left
          </ThemedText>
        </View>
        <View style={[styles.usagePercentBadge, { borderColor: progressColor }]}>
          <ThemedText type="code" style={[styles.usagePercentText, { color: progressColor }]}>
            {clampedRemainingPercent}%
          </ThemedText>
        </View>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{
          max: 100,
          min: 0,
          now: clampedUsedPercent,
          text: `${clampedUsedPercent}% used`,
        }}
        style={styles.usageProgressTrack}
      >
        <View
          style={[
            styles.usageProgressFill,
            { backgroundColor: progressColor, width: `${clampedUsedPercent}%` },
          ]}
        />
      </View>
      <View style={styles.usageMetaRow}>
        <ThemedText type="code" themeColor="textSecondary" style={styles.usageMetaText}>
          Used {clampedUsedPercent}%
        </ThemedText>
        <ThemedText type="code" themeColor="textSecondary" style={styles.usageMetaText}>
          Remaining {clampedRemainingPercent}%
        </ThemedText>
      </View>
    </Animated.View>
  );
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function rateLimitProgressColor(remainingPercent: number, theme: ReturnType<typeof useTheme>) {
  if (remainingPercent <= 10) {
    return theme.danger;
  }
  if (remainingPercent <= 30) {
    return theme.warning;
  }
  return theme.success;
}

function settingsErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not reach the selected server address.";
}

function appliedHotUpdateBundleSuffix() {
  if (isMacLocalBuild) return undefined;
  try {
    const bundleId = HotUpdater.getBundleId();
    if (!bundleId || bundleId === HotUpdater.getMinBundleId()) {
      return undefined;
    }
    return bundleId.slice(-8);
  } catch {
    return undefined;
  }
}

type AppUpdateInfo = Awaited<ReturnType<typeof HotUpdater.checkForUpdate>>;

type AppUpdateState = {
  status: "manual" | "checking" | "current" | "downloading" | "ready" | "updating" | "error";
  updateInfo: AppUpdateInfo;
};

const settingsLayoutTransition = LinearTransition.duration(180);
const settingsEnterTransition = FadeIn.duration(120);
const settingsExitTransition = FadeOut.duration(90);

const styles = StyleSheet.create((theme) => ({
  screen: {
    alignItems: "center",
    backgroundColor: theme.background,
    flex: 1,
  },
  container: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingBottom: 8,
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: theme.tintSoft,
    borderColor: theme.borderSubtle,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  headerButtonPlaceholder: {
    height: 40,
    width: 40,
  },
  titleGroup: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 10,
    lineHeight: 14,
    opacity: 0.84,
    textAlign: "center",
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.five,
    paddingHorizontal: 18,
    paddingTop: Spacing.three,
  },
  scroll: {
    flex: 1,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.68,
  },
  projectLinkList: {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.borderSubtle,
    borderRadius: 8,
    borderWidth: 1,
    gap: 7,
    padding: Spacing.two,
  },
  projectLinkRow: {
    alignItems: "center",
    backgroundColor: theme.tintSubtle,
    borderColor: theme.borderSubtle,
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.two,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  projectLinkIcon: {
    alignItems: "center",
    backgroundColor: theme.tintMuted,
    borderColor: theme.borderSubtle,
    borderRadius: 15,
    borderWidth: 1,
    flexShrink: 0,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  projectLinkIconSponsor: {
    backgroundColor: theme.dangerSoft,
    borderColor: theme.dangerBorder,
  },
  projectLinkCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  projectLinkTitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  projectLinkSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  versionFooter: {
    gap: 3,
    paddingTop: Spacing.two,
  },
  versionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    minHeight: 26,
  },
  versionIcon: {
    alignItems: "center",
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  versionTapTarget: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 26,
    minWidth: 0,
  },
  versionText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    minWidth: 0,
  },
  versionButton: {
    alignItems: "center",
    backgroundColor: theme.successSoft,
    borderColor: theme.successBorder,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: "center",
    minHeight: 26,
    paddingHorizontal: 9,
  },
  versionButtonDisabled: {
    opacity: 0.62,
  },
  versionButtonText: {
    color: theme.success,
    fontFamily: Fonts.monoMedium,
    fontSize: 10,
    lineHeight: 13,
  },
  versionMessage: {
    fontSize: 11,
    lineHeight: 15,
  },
  hotUpdaterLogPanel: {
    backgroundColor: theme.tintMuted,
    borderColor: theme.borderSubtle,
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.two,
    marginTop: Spacing.two,
    padding: Spacing.three,
  },
  hotUpdaterLogHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
  },
  hotUpdaterLogTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  hotUpdaterLogActions: {
    flexDirection: "row",
    gap: Spacing.one,
  },
  hotUpdaterLogButton: {
    borderColor: theme.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  hotUpdaterLogButtonText: {
    color: theme.textSecondary,
    fontFamily: Fonts.monoMedium,
    fontSize: 9,
    lineHeight: 12,
  },
  hotUpdaterConfigRow: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorder,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  hotUpdaterConfigLabel: {
    color: theme.info,
    fontFamily: Fonts.monoMedium,
    fontSize: 9,
    lineHeight: 12,
  },
  hotUpdaterConfigValue: {
    color: theme.text,
    fontFamily: Fonts.monoMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  hotUpdaterConfigValueMissing: {
    color: theme.danger,
  },
  hotUpdaterLogRow: {
    borderTopColor: theme.borderSubtle,
    borderTopWidth: 1,
    gap: 2,
    paddingTop: Spacing.two,
  },
  hotUpdaterLogMeta: {
    color: theme.textSecondary,
    fontFamily: Fonts.monoMedium,
    fontSize: 9,
    lineHeight: 12,
  },
  hotUpdaterLogMessage: {
    color: theme.text,
    fontSize: 12,
    lineHeight: 16,
  },
  hotUpdaterLogDetails: {
    fontSize: 10,
    lineHeight: 14,
  },
  connectionPanel: {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.borderSubtle,
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  notificationPanel: {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.borderSubtle,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  notificationIntro: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  notificationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    minHeight: 70,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  notificationRowDivider: {
    borderBottomColor: theme.borderSubtle,
    borderBottomWidth: 1,
  },
  notificationCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  notificationTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  notificationSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  usageCard: {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.borderSubtle,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  usageRow: {
    gap: Spacing.two,
    minHeight: 84,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  usageRowDivider: {
    borderBottomColor: theme.borderSubtle,
    borderBottomWidth: 1,
  },
  usageHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
  },
  usageCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  usageTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  usageSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  usagePercentBadge: {
    alignItems: "center",
    backgroundColor: theme.tintMuted,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: "center",
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  usagePercentText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  usageProgressTrack: {
    backgroundColor: theme.tintSoft,
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  usageProgressFill: {
    borderRadius: 999,
    height: "100%",
  },
  usageMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 14,
  },
  usageMetaText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 10,
    lineHeight: 13,
  },
  connectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 24,
  },
  connectionDot: {
    backgroundColor: theme.warning,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  connectionDotConnected: {
    backgroundColor: theme.successStrong,
  },
  connectionDotOffline: {
    backgroundColor: theme.danger,
  },
  connectionTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    minWidth: 0,
  },
  unpairedCopy: {
    fontSize: 13,
    lineHeight: 18,
  },
  connectionBadge: {
    backgroundColor: theme.tintMuted,
    borderColor: theme.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  connectionBadgeText: {
    color: theme.textSecondary,
    fontFamily: Fonts.monoMedium,
    fontSize: 9,
    lineHeight: 12,
  },
  infoLine: {
    gap: 2,
    minHeight: 20,
  },
  infoLineLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  infoLineValue: {
    color: theme.text,
    fontSize: 12,
    lineHeight: 16,
  },
  serverAddressList: {
    gap: 7,
    paddingTop: 2,
  },
  serverAddressRow: {
    alignItems: "center",
    backgroundColor: theme.tintSubtle,
    borderColor: theme.borderSubtle,
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.two,
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  serverAddressRowSelected: {
    backgroundColor: theme.successSoft,
    borderColor: theme.successBorder,
  },
  serverAddressCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  serverAddressLabel: {
    fontSize: 13,
    lineHeight: 17,
  },
  serverAddressValue: {
    fontSize: 11,
    lineHeight: 15,
  },
  serverAddressStatus: {
    alignItems: "center",
    backgroundColor: theme.tintMuted,
    borderColor: theme.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: "center",
    minWidth: 62,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  serverAddressStatusSelected: {
    backgroundColor: theme.successSoft,
    borderColor: theme.successBorder,
  },
  serverAddressStatusText: {
    color: theme.textSecondary,
    fontFamily: Fonts.monoMedium,
    fontSize: 9,
    lineHeight: 12,
  },
  serverAddressStatusTextSelected: {
    color: theme.success,
  },
  signOutRow: {
    backgroundColor: theme.dangerSoft,
    borderColor: theme.dangerBorder,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 64,
    paddingHorizontal: Spacing.three,
  },
  signOutContent: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 62,
    width: "100%",
  },
  signOutIconSlot: {
    alignItems: "center",
    backgroundColor: theme.dangerSoft,
    borderRadius: 15,
    flexShrink: 0,
    height: 30,
    justifyContent: "center",
    marginRight: 12,
    width: 30,
  },
  signOutCopy: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  signOutTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  signOutSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
}));
