import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request push permissions, mint an Expo push token, and register it with the
 * workspace so the API worker can deliver notifications to this device.
 * When `prompt` is false (app startup) permission is only reused if already
 * granted; the Settings screen passes prompt=true to actively ask the user.
 */
export async function registerForPushNotifications(workspaceId: string, prompt = false): Promise<{ registered: boolean; reason?: string }> {
  if (!Device.isDevice) return { registered: false, reason: 'Push tokens require a physical device.' };

  type NotifPerms = { granted?: boolean; ios?: { status?: number }; canAskAgain?: boolean };

  const settings = (await Notifications.getPermissionsAsync()) as unknown as NotifPerms;
  const allowed =
    !!settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!allowed) {
    // Only actively prompt when the user asked for it (Settings screen).
    if (!prompt)
      return { registered: false, reason: 'Notification permission is not granted.' };
    const requested = (await Notifications.requestPermissionsAsync()) as unknown as NotifPerms;
    if (
      !requested.granted &&
      requested.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
    )
      return { registered: false, reason: 'Notification permission is not granted.' };
  }

  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
  if (!projectId) return { registered: false, reason: 'EXPO_PUBLIC_PROJECT_ID is not configured.' };

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
    await api(
      `/api/v1/workspaces/${workspaceId}/devices`,
      { method: 'POST', body: JSON.stringify({ token, platform: Platform.OS }) },
      workspaceId,
    );
    return { registered: true };
  } catch (error) {
    return { registered: false, reason: error instanceof Error ? error.message : 'Device registration failed.' };
  }
}