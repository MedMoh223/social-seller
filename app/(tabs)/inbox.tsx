import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface ConversationRow {
  id: string;
  platform: string;
  customer_name: string | null;
  customer_id: string | null;
  status: string;
  created_at: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  tiktok: 'TikTok',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  in_progress: 'En cours',
  resolved: 'Résolu',
};

export default function InboxScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select('id, platform, customer_name, customer_id, status, created_at')
      .order('created_at', { ascending: false });

    setConversations(data ?? []);
  }, []);

  useEffect(() => {
    fetchConversations().finally(() => setIsLoading(false));
  }, [fetchConversations]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchConversations();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={conversations}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={<Text style={styles.title}>Inbox</Text>}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Aucune conversation pour le moment.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => router.push(`/conversation/${item.id}`)}>
          <View style={styles.rowIcon}>
            <Feather name="message-circle" size={18} color="#6366F1" />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{item.customer_name || item.customer_id || 'Client'}</Text>
            <Text style={styles.rowSubtitle}>
              {PLATFORM_LABELS[item.platform] ?? item.platform} · {STATUS_LABELS[item.status] ?? item.status}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#64748B' },
  listContent: { flexGrow: 1, backgroundColor: '#F8FAFC', padding: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  rowSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
});
