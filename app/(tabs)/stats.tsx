import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  type DimensionValue,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

interface TopProduct {
  product_id: string;
  name: string;
  total_sold: number;
}

interface Stats {
  messages_today: number;
  messages_this_week: number;
  orders_by_status: Record<OrderStatus, number>;
  revenue_this_month: number;
  revenue_last_month: number;
  top_products: TopProduct[];
  low_stock_count: number;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  new: { label: 'Nouvelle', color: '#94A3B8' },
  confirmed: { label: 'Confirmée', color: '#2563EB' },
  preparing: { label: 'En préparation', color: '#EA580C' },
  shipped: { label: 'Expédiée', color: '#7C3AED' },
  delivered: { label: 'Livrée', color: '#059669' },
  cancelled: { label: 'Annulée', color: '#DC2626' },
};

const ORDER_STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

function SkeletonBlock({ height, width }: { height: number; width: DimensionValue }) {
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

  return <Animated.View style={[styles.skeletonBlock, { height, width, opacity }]} />;
}

export default function StatsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setErrorMessage(null);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!apiUrl || !session) {
        throw new Error('not_ready');
      }

      const response = await fetch(`${apiUrl}/stats`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        throw new Error('fetch_failed');
      }

      setStats(await response.json());
    } catch {
      setErrorMessage('Impossible de charger les statistiques.');
    }
  }, []);

  useEffect(() => {
    fetchStats().finally(() => setIsLoading(false));
  }, [fetchStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Stats</Text>
        <View style={styles.card}>
          <SkeletonBlock height={14} width="40%" />
          <SkeletonBlock height={28} width="60%" />
        </View>
        <View style={styles.card}>
          <SkeletonBlock height={14} width="40%" />
          {[0, 1, 2].map((index) => (
            <SkeletonBlock key={index} height={16} width="100%" />
          ))}
        </View>
      </ScrollView>
    );
  }

  if (!stats) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{errorMessage ?? 'Statistiques indisponibles.'}</Text>
      </View>
    );
  }

  const maxOrderCount = Math.max(1, ...ORDER_STATUSES.map((status) => stats.orders_by_status[status] ?? 0));
  const hasLastMonthRevenue = stats.revenue_last_month > 0;
  const revenueChangePercent = hasLastMonthRevenue
    ? ((stats.revenue_this_month - stats.revenue_last_month) / stats.revenue_last_month) * 100
    : null;
  const isRevenueUp = (revenueChangePercent ?? 0) >= 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <Text style={styles.title}>Stats</Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Aujourd&apos;hui</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{stats.messages_today}</Text>
            <Text style={styles.statLabel}>messages reçus aujourd&apos;hui</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{stats.messages_this_week}</Text>
            <Text style={styles.statLabel}>cette semaine</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Commandes</Text>
        {ORDER_STATUSES.map((status) => {
          const count = stats.orders_by_status[status] ?? 0;
          const config = STATUS_CONFIG[status];
          const widthPercent = (count / maxOrderCount) * 100;

          return (
            <View key={status} style={styles.barRow}>
              <Text style={styles.barLabel}>{config.label}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${widthPercent}%`, backgroundColor: config.color }]} />
              </View>
              <Text style={styles.barCount}>{count}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Revenus (commandes livrées)</Text>
        <View style={styles.revenueRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{formatAmount(stats.revenue_this_month)}</Text>
            <Text style={styles.statLabel}>ce mois-ci</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValueMuted}>{formatAmount(stats.revenue_last_month)}</Text>
            <Text style={styles.statLabel}>mois précédent</Text>
          </View>
        </View>
        {revenueChangePercent !== null ? (
          <View style={[styles.changeBadge, isRevenueUp ? styles.changeBadgeUp : styles.changeBadgeDown]}>
            <Feather name={isRevenueUp ? 'arrow-up' : 'arrow-down'} size={12} color={isRevenueUp ? '#059669' : '#DC2626'} />
            <Text style={[styles.changeBadgeText, { color: isRevenueUp ? '#059669' : '#DC2626' }]}>
              {Math.abs(revenueChangePercent).toFixed(0)}% vs mois précédent
            </Text>
          </View>
        ) : null}
      </View>

      {stats.top_products.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Produits les plus vendus</Text>
          {stats.top_products.map((product, index) => (
            <View key={product.product_id} style={styles.topProductRow}>
              <Text style={styles.topProductRank}>#{index + 1}</Text>
              <Text style={styles.topProductName} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.topProductSold}>{product.total_sold} vendus</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        style={[styles.card, stats.low_stock_count > 0 ? styles.alertCard : null]}
        onPress={() => router.push('/stock')}
      >
        <View style={styles.alertRow}>
          <View style={styles.alertIcon}>
            <Feather name="alert-triangle" size={18} color={stats.low_stock_count > 0 ? '#EA580C' : '#94A3B8'} />
          </View>
          <View style={styles.alertBody}>
            <Text style={styles.alertTitle}>Alertes stock</Text>
            <Text style={styles.statLabel}>
              {stats.low_stock_count} produit{stats.low_stock_count === 1 ? '' : 's'} en stock bas
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </View>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, backgroundColor: '#F8FAFC', padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  emptyText: { fontSize: 14, color: '#64748B' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  errorText: { color: '#DC2626', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 24 },
  revenueRow: { flexDirection: 'row', gap: 24, marginBottom: 12 },
  statBlock: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  statValueMuted: { fontSize: 16, fontWeight: '700', color: '#64748B' },
  statLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  barLabel: { width: 100, fontSize: 12, color: '#334155' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F1F5F9', marginHorizontal: 8 },
  barFill: { height: 8, borderRadius: 4 },
  barCount: { width: 24, fontSize: 12, fontWeight: '700', color: '#0F172A', textAlign: 'right' },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  changeBadgeUp: { backgroundColor: '#D1FAE5' },
  changeBadgeDown: { backgroundColor: '#FEE2E2' },
  changeBadgeText: { fontSize: 11, fontWeight: '700' },
  topProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topProductRank: { width: 28, fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  topProductName: { flex: 1, fontSize: 13, color: '#0F172A', marginRight: 8 },
  topProductSold: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  alertCard: { borderColor: '#FED7AA' },
  alertRow: { flexDirection: 'row', alignItems: 'center' },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertBody: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  skeletonBlock: { backgroundColor: '#E2E8F0', borderRadius: 8, marginBottom: 8 },
});
