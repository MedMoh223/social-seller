import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { isOwner } from '../../lib/userRole';

interface OrderRow {
  id: string;
  customer_name: string | null;
  total_amount: number;
  status: string;
  created_at: string;
}

type StatusFilter = 'all' | string;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'Nouvelle', bg: '#F1F5F9', text: '#64748B' },
  confirmed: { label: 'Confirmée', bg: '#DBEAFE', text: '#2563EB' },
  preparing: { label: 'En préparation', bg: '#FFEDD5', text: '#EA580C' },
  shipped: { label: 'Expédiée', bg: '#EDE9FE', text: '#7C3AED' },
  delivered: { label: 'Livrée', bg: '#D1FAE5', text: '#059669' },
  cancelled: { label: 'Annulée', bg: '#FEE2E2', text: '#DC2626' },
};

const STATUS_ORDER = ['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function generateCSV(orders: OrderRow[]): string {
  const header = 'ID,Client,Montant (FCFA),Statut,Date';
  const rows = orders.map((o) => {
    const id = o.id.slice(0, 8).toUpperCase();
    const name = (o.customer_name || 'Client').replace(/"/g, '""');
    const amount = o.total_amount;
    const status = STATUS_CONFIG[o.status]?.label ?? o.status;
    const date = formatDate(o.created_at);
    return `"${id}","${name}",${amount},"${status}","${date}"`;
  });
  return [header, ...rows].join('\n');
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
      <View style={styles.rowBody}>
        <View style={[styles.skeletonBlock, styles.skeletonLineWide]} />
        <View style={[styles.skeletonBlock, styles.skeletonLineNarrow]} />
      </View>
    </Animated.View>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchOrders = useCallback(async () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!apiUrl || !session) return;
    const res = await fetch(`${apiUrl}/orders?limit=100`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const body = await res.json();
      setOrders(body.orders ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      fetchOrders().finally(() => setIsLoading(false));
    }, [fetchOrders]),
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchOrders();
    setIsRefreshing(false);
  };

  // Statuts présents dans les données chargées (chips dynamiques)
  const activeStatuses = useMemo(() => {
    const present = new Set(orders.map((o) => o.status));
    return STATUS_ORDER.filter((s) => present.has(s));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const handleExportCSV = async () => {
    if (isExporting || filteredOrders.length === 0) return;
    setIsExporting(true);
    try {
      const csv = generateCSV(filteredOrders);
      await Share.share({ message: csv, title: 'Export commandes' });
    } catch {
      // Annulation par l'utilisateur — silencieux
    } finally {
      setIsExporting(false);
    }
  };

  const ListHeader = (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Commandes</Text>
        <View style={styles.headerActions}>
          {isOwner() && (
            <Pressable
              style={[styles.exportButton, (isExporting || filteredOrders.length === 0) && styles.buttonDisabled]}
              onPress={handleExportCSV}
              disabled={isExporting || filteredOrders.length === 0}
            >
              <Feather name="download" size={14} color="#6366F1" />
              <Text style={styles.exportButtonText}>CSV</Text>
            </Pressable>
          )}
          <Pressable style={styles.addButton} onPress={() => router.push('/order/new')}>
            <Feather name="plus" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Chips filtre statut — affichés uniquement si plusieurs statuts présents */}
      {activeStatuses.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersRow}
          contentContainerStyle={styles.filtersContent}
        >
          <Pressable
            style={[styles.chip, statusFilter === 'all' && styles.chipActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.chipText, statusFilter === 'all' && styles.chipTextActive]}>
              Tous ({orders.length})
            </Text>
          </Pressable>
          {activeStatuses.map((s) => {
            const cfg = STATUS_CONFIG[s];
            const isActive = statusFilter === s;
            return (
              <Pressable
                key={s}
                style={[styles.chip, isActive && { backgroundColor: cfg.text }]}
                onPress={() => setStatusFilter(isActive ? 'all' : s)}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {cfg.label} ({orders.filter((o) => o.status === s).length})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.listContent}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Commandes</Text>
        </View>
        {[0, 1, 2, 3, 4].map((index) => (
          <SkeletonRow key={index} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={filteredOrders}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="shopping-cart" size={28} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>
            {statusFilter !== 'all' ? 'Aucune commande ici' : 'Aucune commande'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {statusFilter !== 'all'
              ? 'Essayez un autre filtre.'
              : 'Les commandes de vos clients apparaîtront ici.'}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const statusConfig = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.new;

        return (
          <Pressable style={styles.row} onPress={() => router.push(`/order/${item.id}`)}>
            <View style={styles.rowBody}>
              <View style={styles.rowTopLine}>
                <Text style={styles.orderNumber}>#{item.id.slice(0, 8).toUpperCase()}</Text>
                <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
                  <Text style={[styles.badgeText, { color: statusConfig.text }]}>{statusConfig.label}</Text>
                </View>
              </View>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customer_name || 'Client'}
              </Text>
              <View style={styles.rowBottomLine}>
                <Text style={styles.amount}>{formatAmount(item.total_amount)}</Text>
                <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { flexGrow: 1, backgroundColor: '#F8FAFC', padding: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#6366F1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  exportButtonText: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },

  // Chips
  filtersRow: { marginBottom: 14 },
  filtersContent: { gap: 8, paddingRight: 4 },
  chip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: '#6366F1' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#FFFFFF' },

  // Empty
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
  rowBody: { flex: 1 },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  rowBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  orderNumber: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  customerName: { fontSize: 13, color: '#334155', marginBottom: 2 },
  amount: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  dateText: { fontSize: 11, color: '#94A3B8' },
  skeletonBlock: { backgroundColor: '#E2E8F0', borderRadius: 8 },
  skeletonLineWide: { height: 14, width: '50%', marginBottom: 8 },
  skeletonLineNarrow: { height: 12, width: '70%' },
});
