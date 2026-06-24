import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface OrderRow {
  id: string;
  customer_name: string | null;
  total_amount: number;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'Nouvelle', bg: '#F1F5F9', text: '#64748B' },
  confirmed: { label: 'Confirmée', bg: '#DBEAFE', text: '#2563EB' },
  preparing: { label: 'En préparation', bg: '#FFEDD5', text: '#EA580C' },
  shipped: { label: 'Expédiée', bg: '#EDE9FE', text: '#7C3AED' },
  delivered: { label: 'Livrée', bg: '#D1FAE5', text: '#059669' },
  cancelled: { label: 'Annulée', bg: '#FEE2E2', text: '#DC2626' },
};

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
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

  const fetchOrders = useCallback(async () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session) return;
    const res = await fetch(`${apiUrl}/orders`, {
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

  if (isLoading) {
    return (
      <View style={styles.listContent}>
        <Text style={styles.title}>Commandes</Text>
        {[0, 1, 2, 3, 4].map((index) => (
          <SkeletonRow key={index} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={orders}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={
        <View style={styles.headerRow}>
          <Text style={styles.title}>Commandes</Text>
          <Pressable style={styles.addButton} onPress={() => router.push('/order/new')}>
            <Feather name="plus" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="shopping-cart" size={28} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Aucune commande</Text>
          <Text style={styles.emptySubtitle}>Les commandes de vos clients apparaîtront ici.</Text>
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
              <Text style={styles.amount}>{formatAmount(item.total_amount)}</Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  addButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
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
  rowBody: { flex: 1 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  orderNumber: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  customerName: { fontSize: 13, color: '#334155', marginBottom: 2 },
  amount: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  skeletonBlock: { backgroundColor: '#E2E8F0', borderRadius: 8 },
  skeletonLineWide: { height: 14, width: '50%', marginBottom: 8 },
  skeletonLineNarrow: { height: 12, width: '70%' },
});
