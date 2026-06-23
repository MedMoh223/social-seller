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
    // Push tokens aren't issued on simulators/emulators.
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
    // No EAS project configured yet (no extra.eas.projectId in
    // app.json / no eas.json) — getExpoPushTokenAsync needs one. This
    // is a deployment prerequisite (run `eas init`), not a runtime bug:
    // skip quietly rather than throwing.
    return null;
  }

  let token: string;

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return token;
  }

  try {
    await supabase.from('push_tokens').upsert({ token, platform: Platform.OS }, { onConflict: 'token' });
  } catch {
    // Best-effort: e.g. a device previously registered under a
    // different account on this tenant's "own tokens only" RLS policy.
    // Push registration must never block app usage.
  }

  return token;
}
