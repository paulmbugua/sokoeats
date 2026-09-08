import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Orders and SokoEats updates',
    description: 'Order progress, delivery alerts, account and marketplace updates.',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#ff8a00',
    sound: 'default',
  });
}

export async function registerForPushNotifications() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  await configureNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    console.warn('[SokoEats][Push] permission-denied', { canAskAgain: permission.canAskAgain });
    return null;
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS project ID is unavailable for push registration.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  console.info('[SokoEats][Push] token-ready', { platform: Platform.OS, suffix: token.slice(-8) });
  return token;
}

export const notificationResponseListener = Notifications.addNotificationResponseReceivedListener;
export const notificationReceivedListener = Notifications.addNotificationReceivedListener;
export const getLastNotificationResponse = Notifications.getLastNotificationResponseAsync;
