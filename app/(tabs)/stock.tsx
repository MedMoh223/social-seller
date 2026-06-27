import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { isOwner } from '../../lib/userRole';

interface ProductRow {
  id: string;
  name: string;
  price: number;
  cost_price: number | null;
  stock_quantity: number;
  alert_threshold: number;
}

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

export default function StockScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, price, cost_price, stock_quantity, alert_threshold')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    setProducts(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      fetchProducts().finally(() => setIsLoading(false));
    }, [fetchProducts]),
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchProducts();
    setIsRefreshing(false);
  };

  const totalMarket = products.reduce((sum, p) => sum + p.price * p.stock_quantity, 0);
  const totalCost = products.reduce((sum, p) => sum + (p.cost_price ?? 0) * p.stock_quantity, 0);

  const header = (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Stock</Text>
        {isOwner() && (
          <Pressable style={styles.addButton} onPress={() => router.push('/product/new')}>
            <Feather name="plus" size={20} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
      {products.length > 0 ? (
        <View style={styles.totalsCard}>
          <View style={styles.totalBlock}>
            <Text style={styles.totalLabel}>Valeur marché</Text>
            <Text style={styles.totalValue}>{formatAmount(totalMarket)}</Text>
          </View>
          {isOwner() && totalCost > 0 ? (
            <View style={styles.totalBlock}>
              <Text style={styles.totalLabel}>Valeur coût</Text>
              <Text style={[styles.totalValue, styles.totalValueMuted]}>{formatAmount(totalCost)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.listContent}>
        {header}
        {[0, 1, 2, 3, 4].map((index) => (
          <SkeletonRow key={index} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={products}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="package" size={28} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Aucun produit</Text>
          <Text style={styles.emptySubtitle}>Ajoutez votre premier produit avec le bouton +.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const isLowStock = item.stock_quantity <= item.alert_threshold;

        return (
          <Pressable style={styles.row} onPress={() => router.push(`/product/${item.id}`)}>
            <View style={styles.rowBody}>
              <View style={styles.rowTopLine}>
                <Text style={styles.productName} numberOfLines={1}>
                  {item.name}
                </Text>
                {isLowStock ? (
                  <View style={styles.lowStockBadge}>
                    <Text style={styles.lowStockBadgeText}>Stock bas</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.rowBottomLine}>
                <Text style={styles.price}>{formatAmount(item.price)}</Text>
                <Text style={styles.stockText}>{item.stock_quantity} en stock</Text>
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
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  productName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A', marginRight: 8 },
  lowStockBadge: { backgroundColor: '#FFEDD5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  lowStockBadgeText: { fontSize: 11, fontWeight: '700', color: '#EA580C' },
  rowBottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 13, color: '#334155' },
  stockText: { fontSize: 12, color: '#64748B' },
  skeletonBlock: { backgroundColor: '#E2E8F0', borderRadius: 8 },
  skeletonLineWide: { height: 14, width: '50%', marginBottom: 8 },
  skeletonLineNarrow: { height: 12, width: '70%' },
  totalsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 16,
  },
  totalBlock: { flex: 1 },
  totalLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 4 },
  totalValue: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  totalValueMuted: { color: '#6366F1' },
});
