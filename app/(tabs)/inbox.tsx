import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type Platform = 'whatsapp' | 'facebook' | 'tiktok';

interface ConversationRow {
  id: string;
  platform: string;
  customer_name: string | null;
  customer_id: string | null;
  status: string;
  updated_at: string;
  messages: { content: string; direction: string; created_at: string }[];
}

interface ConversationItem {
  id: string;
  platform: string;
  customer_name: string | null;
  customer_id: string | null;
  status: string;
  updated_at: string;
  lastMessage: string | null;
  unreadCount: number;
}

const PREVIEW_MAX_LENGTH = 50;

const PLATFORM_ICONS: Record<Platform, keyof typeof Feather.glyphMap> = {
  whatsapp: 'message-circle',
  facebook: 'facebook',
  tiktok: 'music',
};

const PLATFORM_COLORS: Record<Platform, string> = {
  whatsapp: '#10B981',
  facebook: '#1877F2',
  tiktok: '#000000',
};

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "à l'instant";
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `il y a ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `il y a ${diffDays}j`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `il y a ${diffWeeks} sem.`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `il y a ${diffMonths} mois`;

  const diffYears = Math.floor(diffDays / 365);
  return `il y a ${diffYears} an${diffYears > 1 ? 's' : ''}`;
}

function SkeletonRow() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <View style={[styles.avatar, styles.skeletonBlock]} />
      <View style={styles.rowBody}>
        <View style={[styles.skeletonBlock, styles.skeletonLineWide]} />
        <View style={[styles.skeletonBlock, styles.skeletonLineNarrow]} />
      </View>
    </Animated.View>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    const { data: convData } = await supabase
      .from('conversations')
      .select(
        'id, platform, customer_name, customer_id, status, updated_at, messages(content, direction, created_at)',
      )
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false, referencedTable: 'messages' })
      .limit(1, { referencedTable: 'messages' })
      .returns<ConversationRow[]>();

    const { data: unreadRows } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('direction', 'inbound')
      .eq('is_read', false);

    const unreadCounts = new Map<string, number>();
    for (const row of unreadRows ?? []) {
      unreadCounts.set(row.conversation_id, (unreadCounts.get(row.conversation_id) ?? 0) + 1);
    }

    const items: ConversationItem[] = (convData ?? []).map((conversation) => ({
      id: conversation.id,
      platform: conversation.platform,
      customer_name: conversation.customer_name,
      customer_id: conversation.customer_id,
      status: conversation.status,
      updated_at: conversation.updated_at,
      lastMessage: conversation.messages[0]?.content ?? null,
      unreadCount: unreadCounts.get(conversation.id) ?? 0,
    }));

    setConversations(items);
  }, []);

  useEffect(() => {
    fetchConversations().finally(() => setIsLoading(false));

    // Realtime: re-fetch whenever a new message arrives so the inbox
    // updates without requiring an app restart or manual pull-to-refresh.
    const channel = supabase
      .channel('inbox-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchConversations();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={styles.listContent}>
        <Text style={styles.title}>Inbox</Text>
        {[0, 1, 2, 3, 4].map((index) => (
          <SkeletonRow key={index} />
        ))}
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
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="inbox" size={28} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Aucune conversation</Text>
          <Text style={styles.emptySubtitle}>
            Connectez un canal pour commencer à recevoir des messages de vos clients.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const platform = (item.platform in PLATFORM_ICONS ? item.platform : 'whatsapp') as Platform;

        return (
          <Pressable style={styles.row} onPress={() => router.push(`/conversation/${item.id}`)}>
            <View style={[styles.avatar, { backgroundColor: PLATFORM_COLORS[platform] }]}>
              <Feather name={PLATFORM_ICONS[platform]} size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTopLine}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.customer_name || item.customer_id || 'Client'}
                </Text>
                <Text style={styles.rowTime}>{formatRelativeTime(item.updated_at)}</Text>
              </View>
              <View style={styles.rowBottomLine}>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.lastMessage ? truncate(item.lastMessage, PREVIEW_MAX_LENGTH) : 'Aucun message'}
                </Text>
                {item.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {item.unreadCount > 9 ? '9+' : item.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { flexGrow: 1, backgroundColor: '#F8FAFC', padding: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  emptyState: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 18 },
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowBody: { flex: 1 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A', marginRight: 8 },
  rowTime: { fontSize: 11, color: '#94A3B8' },
  rowBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  rowPreview: { flex: 1, fontSize: 12, color: '#64748B', marginRight: 8 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  skeletonBlock: { backgroundColor: '#E2E8F0', borderRadius: 8 },
  skeletonLineWide: { height: 14, width: '60%', marginBottom: 8 },
  skeletonLineNarrow: { height: 12, width: '85%' },
});
