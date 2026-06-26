import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { supabase } from '../lib/supabase';

// Controls how notifications are handled in foreground and background.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function clearNotifications() {
  await Notifications.dismissAllNotificationsAsync();
  await Notifications.setBadgeCountAsync(0);
}

export default function RootLayout() {
  const router = useRouter();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // Effacer les notifs et le badge quand l'app revient au premier plan
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        clearNotifications();
      }
      appState.current = nextState;
    });

    // Effacer aussi au montage initial (ouverture froide)
    clearNotifications();

    // Register push token after sign-in
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        registerForPushNotificationsAsync();
      }
    });

    // Handle tap on notification when app is backgrounded
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      const conversationId = data?.conversationId as string | undefined;
      if (conversationId) {
        router.push(`/conversation/${conversationId}`);
      }
    });

    // Handle tap when app was fully killed
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      const conversationId = data?.conversationId as string | undefined;
      if (conversationId) {
        router.push(`/conversation/${conversationId}`);
      }
    });

    return () => {
      appStateSub.remove();
      subscription.unsubscribe();
      responseSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
