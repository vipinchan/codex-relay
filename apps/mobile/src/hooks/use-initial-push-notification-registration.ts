import { useSelector } from "@legendapp/state/react";
import { useEffect, useRef } from "react";

import { getPushNotificationSettings, registerPushNotifications } from "@/lib/codex-relay-api";
import {
  defaultPushNotificationPreferences,
  getExpoPushToken,
  hasCompletedInitialPushNotificationRegistration,
  markInitialPushNotificationRegistrationCompleted,
  PushNotificationPermissionDeniedError,
  pushNotificationPlatform,
  supportsPushNotifications,
} from "@/lib/push-notifications";
import { captureConnection } from "@/lib/connection-context";
import { getActiveComputer } from "@/lib/computer-profiles";

import { chatStore$ } from "@/state/chat-store";

export function useInitialPushNotificationRegistration() {
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());
  const registrationStartedRef = useRef(false);

  useEffect(() => {
    if (
      !hasPairedSession ||
      registrationStartedRef.current ||
      !supportsPushNotifications() ||
      hasCompletedInitialPushNotificationRegistration()
    ) {
      return;
    }

    registrationStartedRef.current = true;
    void registerInitialPushNotifications();
  }, [hasPairedSession]);
}

async function registerInitialPushNotifications() {
  const context = captureConnection();
  const computerId = getActiveComputer()?.id;
  try {
    const currentSettings = await getPushNotificationSettings();
    if (currentSettings.registered) {
      markInitialPushNotificationRegistrationCompleted(computerId);
      return;
    }

    const expoPushToken = await getExpoPushToken();
    context.assertCurrent();
    await registerPushNotifications({
      expoPushToken,
      platform: pushNotificationPlatform(),
      preferences: defaultPushNotificationPreferences,
    });
    markInitialPushNotificationRegistrationCompleted(computerId);
  } catch (error) {
    if (error instanceof PushNotificationPermissionDeniedError) {
      markInitialPushNotificationRegistrationCompleted(computerId);
    }
  }
}
