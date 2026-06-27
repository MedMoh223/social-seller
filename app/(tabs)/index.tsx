import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { isOwner } from '../../lib/userRole';

type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

interface DashboardStats {
  messages_today: number;
  orders_today: number;
  revenue_today: number | null; // null pour les agents
  active_conversations: number;
  orders_by_status: Record<OrderStatus, number>;
  revenue_this_month: number | null;
  revenue_last_month: number | null;
  top_products: { product_id: string; name: string; total_sold: number }[];
  low_stock_count: number;
}

const PIPELINE: { status: OrderStatus; label: string; color: string }[] = [
  { status: 'new',       label: 'Nouvelles',   color: '#94A3B8' },
  { status: 'confirmed', label: 'Confirmées',   color: '#2563EB' },
  { status: 'preparing', label: 'Préparation',  color: '#EA580C' },
  { status: 'shipped',   label: 'Expédiées',    color: '#7C3AED' },
  { status: 'delivered', label: 'Livrées',      color: '#059669' },
];

function formatAmount(n: number) {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function RevenueChange({ thisMonth, lastMonth }: { thisMonth: number; lastMonth: number }) {
  if (lastMonth === 0) return null;
  const pct = ((thisMonth - lastMonth) / lastMonth) * 100;
  const up = pct >= 0;
  return (
    <View style={[styles.revBadge, { backgroundColor: up ? '#ECFDF5' : '#FEF2F2' }]}>
      <Feather name={up ? 'trending-up' : 'trending-down'} size={12} color={up ? '#059669' : '#DC2626'} />
      <Text style={[styles.revBadgeText, { color: up ? '#059669' : '#DC2626' }]}>
        {' '}{Math.abs(pct).toFixed(0)}% vs mois dernier
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!apiUrl || !session) return;
      const res = await fetch(`${apiUrl}/stats`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setStats(await res.json());

      // Charger le prénom si pas encore disponible
      if (!firstName) {
        const { data } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', session.user.id)
          .maybeSingle();
        if (data?.full_name) {
          setFirstName(data.full_name.split(' ')[0]);
        }
      }
    } catch { /* silencieux */ }
  }, [firstName]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      fetchStats().finally(() => setIsLoading(false));
    }, [fetchStats]),
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  const s = stats;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#6366F1" />}
    >
      <Text style={styles.title}>Bonjour{firstName ? `, ${firstName}` : ''} 👋</Text>

      {/* ── Aujourd'hui ── */}
      <Text style={styles.sectionLabel}>AUJOURD'HUI</Text>
      <View style={styles.row3}>
        <View style={[styles.kpiCard, { flex: 1 }]}>
          <Feather name="message-circle" size={18} color="#6366F1" />
          <Text style={styles.kpiValue}>{s?.messages_today ?? '—'}</Text>
          <Text style={styles.kpiLabel}>Messages</Text>
        </View>
        <View style={[styles.kpiCard, { flex: 1 }]}>
          <Feather name="shopping-cart" size={18} color="#6366F1" />
          <Text style={styles.kpiValue}>{s?.orders_today ?? '—'}</Text>
          <Text style={styles.kpiLabel}>Commandes</Text>
        </View>
        {isOwner() && (
          <View style={[styles.kpiCard, { flex: 1 }]}>
            <Feather name="dollar-sign" size={18} color="#6366F1" />
            <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
              {s ? formatAmount(s.revenue_today ?? 0) : '—'}
            </Text>
            <Text style={styles.kpiLabel}>CA livré</Text>
          </View>
        )}
      </View>

      {/* ── Alertes ── */}
      {s && (s.active_conversations > 0 || s.low_stock_count > 0) ? (
        <>
          <Text style={styles.sectionLabel}>ALERTES</Text>
          <View style={styles.alertsCol}>
            {s.active_conversations > 0 && (
              <Pressable style={styles.alertCard} onPress={() => router.push('/(tabs)/inbox')}>
                <View style={[styles.alertDot, { backgroundColor: '#6366F1' }]} />
                <Text style={styles.alertText}>
                  <Text style={styles.alertBold}>{s.active_conversations}</Text> conversation{s.active_conversations > 1 ? 's' : ''} en cours
                </Text>
                <Feather name="chevron-right" size={16} color="#94A3B8" />
              </Pressable>
            )}
            {s.low_stock_count > 0 && (
              <Pressable style={styles.alertCard} onPress={() => router.push('/(tabs)/stats')}>
                <View style={[styles.alertDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.alertText}>
                  <Text style={styles.alertBold}>{s.low_stock_count}</Text> produit{s.low_stock_count > 1 ? 's' : ''} en alerte stock
                </Text>
                <Feather name="chevron-right" size={16} color="#94A3B8" />
              </Pressable>
            )}
          </View>
        </>
      ) : null}

      {/* ── Pipeline commandes ── */}
      <Text style={styles.sectionLabel}>PIPELINE COMMANDES</Text>
      <View style={styles.card}>
        {PIPELINE.map(({ status, label, color }) => {
          const count = s?.orders_by_status[status] ?? 0;
          const max = Math.max(1, ...PIPELINE.map(p => s?.orders_by_status[p.status] ?? 0));
          const pct = count / max;
          return (
            <Pressable
              key={status}
              style={styles.pipelineRow}
              onPress={() => router.push('/(tabs)/orders')}
            >
              <Text style={styles.pipelineLabel}>{label}</Text>
              <View style={styles.pipelineBarBg}>
                <View style={[styles.pipelineBarFill, { width: `${Math.max(pct * 100, count > 0 ? 4 : 0)}%`, backgroundColor: color }]} />
              </View>
              <Text style={[styles.pipelineCount, { color }]}>{count}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Revenus (owner uniquement) ── */}
      {isOwner() && (
        <>
          <Text style={styles.sectionLabel}>REVENUS</Text>
          <View style={styles.card}>
            <View style={styles.revRow}>
              <View>
                <Text style={styles.revAmount}>{s ? formatAmount(s.revenue_this_month ?? 0) : '—'}</Text>
                <Text style={styles.revSubLabel}>Ce mois</Text>
              </View>
              {s ? <RevenueChange thisMonth={s.revenue_this_month ?? 0} lastMonth={s.revenue_last_month ?? 0} /> : null}
            </View>
            {s && (s.revenue_last_month ?? 0) > 0 && (
              <Text style={styles.revLastMonth}>Mois dernier : {formatAmount(s.revenue_last_month ?? 0)}</Text>
            )}
          </View>
        </>
      )}

      {/* ── Top produits (owner uniquement) ── */}
      {isOwner() && s && s.top_products.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>TOP PRODUITS</Text>
          <View style={styles.card}>
            {s.top_products.map((p, i) => (
              <View key={p.product_id} style={styles.topProductRow}>
                <Text style={styles.topProductRank}>#{i + 1}</Text>
                <Text style={styles.topProductName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.topProductSold}>{p.total_sold} vendus</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 8, marginTop: 16 },

  // KPI cards
  row3: { flexDirection: 'row', gap: 10 },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiValue: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  kpiLabel: { fontSize: 11, color: '#64748B', textAlign: 'center' },

  // Alertes
  alertsCol: { gap: 8 },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  alertDot: { width: 8, height: 8, borderRadius: 4 },
  alertText: { flex: 1, fontSize: 14, color: '#334155' },
  alertBold: { fontWeight: '700', color: '#0F172A' },

  // Card générique
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  // Pipeline
  pipelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pipelineLabel: { width: 90, fontSize: 13, color: '#475569' },
  pipelineBarBg: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  pipelineBarFill: { height: 8, borderRadius: 4 },
  pipelineCount: { width: 28, fontSize: 13, fontWeight: '700', textAlign: 'right' },

  // Revenus
  revRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  revAmount: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  revSubLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },
  revLastMonth: { fontSize: 12, color: '#94A3B8' },
  revBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  revBadgeText: { fontSize: 12, fontWeight: '600' },

  // Top produits
  topProductRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topProductRank: { fontSize: 13, fontWeight: '700', color: '#94A3B8', width: 24 },
  topProductName: { flex: 1, fontSize: 14, color: '#0F172A' },
  topProductSold: { fontSize: 13, color: '#6366F1', fontWeight: '600' },
});
