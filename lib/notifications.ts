import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Requests permission, obtains an Expo push token, and registers it
// against the current session in push_tokens. tenant_id/user_id are
// never sent here — the 010_push_tokens.sql trigger stamps them
// server-side from auth.uid()/current_tenant_id(), so this call can't
// register a token under the wrong tenant even if it tried to.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }

  if (!granted) {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    return null;
  }

  let token: string;

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch {
    return null;
  }

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return token;
  }

  // Ne pas enregistrer le token si l'utilisateur n'a pas encore de tenant
  // (compte tout juste créé, profile-setup pas encore complété).
  // Le token sera enregistré après refreshSession() dans profile-setup.tsx
  // via l'événement TOKEN_REFRESHED.
  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!userRow?.tenant_id) {
    return token;
  }

  // tenant_id and user_id are stamped by the 010_push_tokens.sql trigger
  // (auth.uid() / current_tenant_id()) — intentionally omitted here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ token, platform: Platform.OS } as any, { onConflict: 'token' });

  if (__DEV__ && error) {
    console.warn('[Push] upsert failed:', error.message);
  }

  return token;
}
