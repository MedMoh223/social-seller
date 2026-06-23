import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../lib/supabase';

type Destination = '/(tabs)' | '/(auth)/login' | '/(auth)/profile-setup';

export default function Index() {
  const [destination, setDestination] = useState<Destination | null>(null);

  useEffect(() => {
    async function resolveDestination() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          setDestination('/(auth)/login');
          return;
        }

        const { data: userRow, error } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error) {
          setDestination('/(auth)/login');
          return;
        }

        setDestination(userRow?.tenant_id ? '/(tabs)' : '/(auth)/profile-setup');
      } catch {
        setDestination('/(auth)/login');
      }
    }

    resolveDestination();
  }, []);

  if (destination === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white', fontSize: 18 }}>Chargement...</Text>
      </View>
    );
  }

  return <Redirect href={destination} />;
}
