import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

// expo-notifications logue une erreur dès son import dans Expo Go sur Android
// (SDK 53+), même quand seules les notifications locales sont utilisées :
// le module n'est donc chargé qu'en dehors de ce cas.
const disponible =
  Platform.OS !== 'web' &&
  !(
    Platform.OS === 'android' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  );

let module: NotificationsModule | null = null;

function charger(): NotificationsModule | null {
  if (!disponible) return null;
  if (!module) {
    module = require('expo-notifications') as NotificationsModule;
    // Sans handler, une notification émise app ouverte n'est pas affichée.
    module.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return module;
}

export async function demanderPermissionNotifications(): Promise<void> {
  await charger()?.requestPermissionsAsync();
}

export async function notifier(titre: string, corps: string): Promise<void> {
  await charger()?.scheduleNotificationAsync({
    content: { title: titre, body: corps },
    trigger: null,
  });
}
