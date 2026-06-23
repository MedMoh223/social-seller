import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type Platform = 'whatsapp' | 'facebook' | 'tiktok';

interface Connection {
  id: string;
  platform: Platform;
  status: string;
  display_name: string | null;
  external_account_id: string | null;
  created_at: string;
}

const PLATFORMS: Platform[] = ['whatsapp', 'facebook', 'tiktok'];

const PLATFORM_LABELS: Record<Platform, string> = {
  whatsapp: 'WhatsApp Business',
  facebook: 'Page Facebook',
  tiktok: 'TikTok',
};

const PLATFORM_ICONS: Record<Platform, keyof typeof Feather.glyphMap> = {
  whatsapp: 'message-circle',
  facebook: 'facebook',
  tiktok: 'music',
};

export default function ChannelsScreen() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingPlatform, setPendingPlatform] = useState<Platform | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    setErrorMessage(null);

    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      setErrorMessage('Service temporairement indisponible.');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setErrorMessage('Reconnectez-vous pour gérer vos canaux.');
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/connections`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        throw new Error('fetch_failed');
      }

      const body = await response.json();
      setConnections(body.connections ?? []);
    } catch {
      setErrorMessage('Impossible de charger vos canaux.');
    }
  }, []);

  useEffect(() => {
    fetchConnections().finally(() => setIsLoading(false));
  }, [fetchConnections]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchConnections();
    setIsRefreshing(false);
  };

  const handleConnect = async (platform: Platform) => {
    setErrorMessage(null);
    setPendingPlatform(platform);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!apiUrl || !session) {
        throw new Error('not_ready');
      }

      const response = await fetch(`${apiUrl}/connections/${platform}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        throw new Error('start_failed');
      }

      const { authorizationUrl } = await response.json();

      // The deep link's own query params are an untrusted client-side
      // hop — refetch /connections afterward instead of trusting them,
      // regardless of how the auth session closed.
      await WebBrowser.openAuthSessionAsync(authorizationUrl, 'socialseller://connections/callback');
      await fetchConnections();
    } catch {
      setErrorMessage('Impossible de lancer la connexion. Réessayez plus tard.');
    } finally {
      setPendingPlatform(null);
    }
  };

  const handleDisconnect = async (connection: Connection) => {
    setErrorMessage(null);
    setPendingPlatform(connection.platform);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!apiUrl || !session) {
        throw new Error('not_ready');
      }

      const response = await fetch(`${apiUrl}/connections/${connection.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok && response.status !== 204) {
        throw new Error('disconnect_failed');
      }

      await fetchConnections();
    } catch {
      setErrorMessage('Impossible de déconnecter ce canal.');
    } finally {
      setPendingPlatform(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <Text style={styles.title}>Canaux</Text>
      <Text style={styles.subtitle}>Connectez vos comptes pour centraliser vos conversations.</Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {PLATFORMS.map((platform) => {
        const connection = connections.find((item) => item.platform === platform);
        const isPending = pendingPlatform === platform;

        return (
          <View key={platform} style={styles.card}>
            <View style={styles.cardIcon}>
              <Feather name={PLATFORM_ICONS[platform]} size={22} color="#6366F1" />
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{PLATFORM_LABELS[platform]}</Text>
              <Text style={styles.cardSubtitle}>
                {connection
                  ? connection.display_name ?? connection.external_account_id ?? 'Connecté'
                  : 'Non connecté'}
              </Text>
            </View>

            <Pressable
              style={[styles.actionButton, connection ? styles.disconnectButton : null]}
              onPress={() => (connection ? handleDisconnect(connection) : handleConnect(platform))}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator color={connection ? '#DC2626' : '#FFFFFF'} size="small" />
              ) : (
                <Text style={[styles.actionButtonText, connection ? styles.disconnectButtonText : null]}>
                  {connection ? 'Déconnecter' : 'Connecter'}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flexGrow: 1, padding: 24, backgroundColor: '#F8FAFC' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 24 },
  errorText: { color: '#DC2626', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  actionButton: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectButton: { backgroundColor: '#FEF2F2' },
  actionButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  disconnectButtonText: { color: '#DC2626' },
});
