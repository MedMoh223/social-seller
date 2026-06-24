import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const CHUNK_SIZE = 1800; // Sous la limite de 2048 bytes SecureStore

async function setItemChunked(key: string, value: string): Promise<void> {
  const chunks = Math.ceil(value.length / CHUNK_SIZE);
  await SecureStore.setItemAsync(`${key}__chunks`, String(chunks));
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(`${key}__chunk_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
}

async function getItemChunked(key: string): Promise<string | null> {
  const chunksStr = await SecureStore.getItemAsync(`${key}__chunks`);
  if (!chunksStr) return null;
  const chunks = parseInt(chunksStr, 10);
  const parts: string[] = [];
  for (let i = 0; i < chunks; i++) {
    const part = await SecureStore.getItemAsync(`${key}__chunk_${i}`);
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function removeItemChunked(key: string): Promise<void> {
  const chunksStr = await SecureStore.getItemAsync(`${key}__chunks`);
  if (chunksStr) {
    const chunks = parseInt(chunksStr, 10);
    for (let i = 0; i < chunks; i++) {
      await SecureStore.deleteItemAsync(`${key}__chunk_${i}`);
    }
    await SecureStore.deleteItemAsync(`${key}__chunks`);
  }
}

const storage = {
  getItem: (key: string) =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(key))
      : getItemChunked(key),
  setItem: (key: string, value: string) =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(key, value))
      : setItemChunked(key, value),
  removeItem: (key: string) =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.removeItem(key))
      : removeItemChunked(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
