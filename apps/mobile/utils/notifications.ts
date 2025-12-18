// apps/mobile/utils/notifications.ts
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

type Listener = Notifications.Subscription | undefined;

/**
 * Foreground behavior (alert even if app is open).
 * Add shouldShowBanner/shouldShowList for newer iOS types.
 */
Notifications.setNotificationHandler({
  handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    // iOS-specific newer fields (ignored on Android)
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Ensure Android channel exists (required for visibility & importance). */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B00',
    sound: 'default',
  });
}

/** Ask for notification permission and return Expo push token (or null). */
export async function registerForPushToken(): Promise<string | null> {
  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  // EAS project id (set EXPO_PUBLIC_EAS_PROJECT_ID in app.config.js -> extra)
  const projectId =
    (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_EAS_PROJECT_ID ||
    (Constants as any).easConfig?.projectId;

  if (!projectId) {
    console.warn('⚠️ Missing EXPO_PUBLIC_EAS_PROJECT_ID / easConfig.projectId');
    return null;
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data ?? null;
}

/** Fire a local notification immediately (or pass trigger to schedule). */
export async function notifyNow(
  title: string,
  body: string,
  data?: Record<string, any>,
) {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null, // change to { seconds: 5 } to delay
  });
}

/**
 * Attach minimal listeners.
 * - onReceive: called when a notification arrives in foreground
 * - onRespond: called when user taps a notification in tray
 * Returns a cleanup function to remove listeners.
 */
export function initNotificationListeners(opts: {
  onReceive?: (n: Notifications.Notification) => void;
  onRespond?: (r: Notifications.NotificationResponse) => void;
}) {
  let subReceive: Listener;
  let subRespond: Listener;

  if (opts.onReceive) {
    subReceive = Notifications.addNotificationReceivedListener(opts.onReceive);
  }
  if (opts.onRespond) {
    subRespond = Notifications.addNotificationResponseReceivedListener(opts.onRespond);
  }

  // Cleanup compatible with current & older SDKs
  return () => {
    // Preferred: instance remover (SDK 48+)
    subReceive?.remove?.();
    subRespond?.remove?.();

    // Defensive fallback for older SDKs (no-op on newer ones)
    (Notifications as any).removeNotificationSubscription?.(subReceive);
    (Notifications as any).removeNotificationSubscription?.(subRespond);
  };
}
