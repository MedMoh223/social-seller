import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export default function Index() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => setSession(session ?? null))
      .catch(() => setSession(null));
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white', fontSize: 18 }}>Chargement...</Text>
      </View>
    );
  }

  return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />;
}
