import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
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

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
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
      subscription.unsubscribe();
      responseSub.remove();
    };
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
