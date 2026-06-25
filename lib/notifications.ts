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
  console.log('[Push] step 1 — isDevice:', Device.isDevice);
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
  console.log('[Push] step 2 — permission existante:', granted);

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
    console.log('[Push] step 2b — après demande:', granted);
  }

  if (!granted) {
    console.log('[Push] step 2 STOP — permission refusée');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  console.log('[Push] step 3 — projectId:', projectId);

  if (!projectId) {
    console.log('[Push] step 3 STOP — projectId introuvable dans Constants');
    return null;
  }

  let token: string;

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
    console.log('[Push] step 4 — token obtenu:', token.slice(0, 40) + '...');
  } catch (e) {
    console.warn('[Push] step 4 STOP — getExpoPushTokenAsync a échoué:', e);
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.log('[Push] step 5 — session user:', session?.user?.id ?? 'AUCUNE SESSION');

  if (!session) {
    console.log('[Push] step 5 STOP — pas de session, token non enregistré');
    return token;
  }

  // Supabase JS never throws — errors live in { error }, not as exceptions.
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ token, platform: Platform.OS }, { onConflict: 'token' });

  if (error) {
    console.warn('[Push] step 6 STOP — upsert failed:', error.message, error.details ?? error.hint);
  } else {
    console.log('[Push] step 6 ✅ — token enregistré en base');
  }

  return token;
}
