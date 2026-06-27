import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type Platform = 'whatsapp' | 'facebook' | 'tiktok';
type PlatformFilter = 'all' | Platform;

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

const PLATFORM_LABELS: Record<Platform, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  tiktok: 'TikTok',
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
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

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

  // Rafraîchit la liste dès qu'on revient sur cet onglet
  // (ex: après avoir résolu une conversation depuis l'écran de discussion)
  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations]),
  );

  useEffect(() => {
    fetchConversations().finally(() => setIsLoading(false));

    // Nom de canal unique par montage pour éviter l'erreur
    // "cannot add callbacks after subscribe()" quand le composant
    // remonte (ex: retour depuis OAuth Custom Tab ou strict mode dev).
    // removeChannel(channel) dans le cleanup supprime bien le bon canal
    // puisqu'on garde la référence locale.
    const ts = Date.now();
    const channel = supabase
      .channel(`inbox-messages-${ts}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => {
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

  // Filtrage client-side
  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return conversations.filter((item) => {
      if (!showResolved && item.status === 'resolved') return false;
      if (showResolved && item.status !== 'resolved') return false;
      if (platformFilter !== 'all' && item.platform !== platformFilter) return false;
      if (unreadOnly && item.unreadCount === 0) return false;
      if (q) {
        const name = (item.customer_name || item.customer_id || '').toLowerCase();
        const preview = (item.lastMessage || '').toLowerCase();
        if (!name.includes(q) && !preview.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, searchQuery, platformFilter, unreadOnly]);

  const activePlatforms = useMemo(() => {
    const platforms = new Set(conversations.map((c) => c.platform as Platform));
    return Array.from(platforms);
  }, [conversations]);

  const hasActiveFilters = searchQuery.trim() !== '' || platformFilter !== 'all' || unreadOnly || showResolved;

  const ListHeader = (
    <View>
      <Text style={styles.title}>Inbox</Text>

      {/* Barre de recherche */}
      <View style={styles.searchBar}>
        <Feather name="search" size={16} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un client ou message…"
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Feather name="x" size={16} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      {/* Chips filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow} contentContainerStyle={styles.filtersContent}>
        {/* Non lus */}
        <Pressable
          style={[styles.chip, unreadOnly && styles.chipActive]}
          onPress={() => setUnreadOnly((v) => !v)}
        >
          <Feather name="mail" size={12} color={unreadOnly ? '#FFFFFF' : '#64748B'} style={styles.chipIcon} />
          <Text style={[styles.chipText, unreadOnly && styles.chipTextActive]}>Non lus</Text>
        </Pressable>

        {/* Résolues */}
        <Pressable
          style={[styles.chip, showResolved && styles.chipResolvedActive]}
          onPress={() => setShowResolved((v) => !v)}
        >
          <Feather name="check-circle" size={12} color={showResolved ? '#FFFFFF' : '#64748B'} style={styles.chipIcon} />
          <Text style={[styles.chipText, showResolved && styles.chipTextActive]}>Résolues</Text>
        </Pressable>

        {/* Plateforme : Tous */}
        <Pressable
          style={[styles.chip, platformFilter === 'all' && styles.chipActive]}
          onPress={() => setPlatformFilter('all')}
        >
          <Text style={[styles.chipText, platformFilter === 'all' && styles.chipTextActive]}>Tous</Text>
        </Pressable>

        {/* Chips par plateforme détectée */}
        {activePlatforms.map((p) => (
          <Pressable
            key={p}
            style={[styles.chip, platformFilter === p && styles.chipActive, platformFilter === p && { backgroundColor: PLATFORM_COLORS[p] }]}
            onPress={() => setPlatformFilter(platformFilter === p ? 'all' : p)}
          >
            <Feather name={PLATFORM_ICONS[p]} size={12} color={platformFilter === p ? '#FFFFFF' : '#64748B'} style={styles.chipIcon} />
            <Text style={[styles.chipText, platformFilter === p && styles.chipTextActive]}>{PLATFORM_LABELS[p]}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

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
      data={filteredConversations}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={ListHeader}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name={hasActiveFilters ? 'filter' : 'inbox'} size={28} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>
            {hasActiveFilters ? 'Aucun résultat' : 'Aucune conversation'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {hasActiveFilters
              ? 'Essayez de modifier vos filtres.'
              : 'Connectez un canal pour commencer à recevoir des messages de vos clients.'}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const platform = (item.platform in PLATFORM_ICONS ? item.platform : 'whatsapp') as Platform;

        const isResolved = item.status === 'resolved';
        return (
          <Pressable
            style={[styles.row, isResolved && styles.rowResolved]}
            onPress={() => router.push(`/conversation/${item.id}`)}
          >
            <View style={[styles.avatar, { backgroundColor: isResolved ? '#94A3B8' : PLATFORM_COLORS[platform] }]}>
              <Feather name={isResolved ? 'check' : PLATFORM_ICONS[platform]} size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTopLine}>
                <Text style={[styles.rowTitle, isResolved && styles.rowTitleResolved]} numberOfLines={1}>
                  {item.customer_name || item.customer_id || 'Client'}
                </Text>
                <Text style={styles.rowTime}>{formatRelativeTime(item.updated_at)}</Text>
              </View>
              <View style={styles.rowBottomLine}>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.lastMessage ? truncate(item.lastMessage, PREVIEW_MAX_LENGTH) : 'Aucun message'}
                </Text>
                {isResolved ? (
                  <View style={styles.resolvedBadge}>
                    <Text style={styles.resolvedBadgeText}>Résolu</Text>
                  </View>
                ) : item.unreadCount > 0 ? (
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
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 12 },

  // Recherche
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },

  // Chips
  filtersRow: { marginBottom: 14 },
  filtersContent: { gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: '#6366F1' },
  chipResolvedActive: { backgroundColor: '#10B981' },
  chipIcon: { marginRight: 4 },
  chipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#FFFFFF' },

  // Empty state
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

  // Rows
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
  rowResolved: { opacity: 0.7 },
  rowTitleResolved: { color: '#94A3B8' },
  resolvedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  resolvedBadgeText: { fontSize: 10, fontWeight: '600', color: '#10B981' },
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
