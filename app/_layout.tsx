import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  useEffect(() => {
    // Trigger push-token registration whenever a session is confirmed.
    // Using onAuthStateChange (instead of a one-shot call in tabs layout)
    // guarantees the Supabase client JWT is propagated before the upsert.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        registerForPushNotificationsAsync();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
