import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  product: { id: string; name: string } | null;
}

interface OrderDetail {
  id: string;
  customer_name: string | null;
  total_amount: number;
  delivery_fee: number;
  discount: number;
  delivery_address: string | null;
  status: string;
  cancelled_reason: string | null;
  created_at: string;
  items: OrderItem[];
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'Nouvelle', bg: '#F1F5F9', text: '#64748B' },
  confirmed: { label: 'Confirmée', bg: '#DBEAFE', text: '#2563EB' },
  preparing: { label: 'En préparation', bg: '#FFEDD5', text: '#EA580C' },
  shipped: { label: 'Expédiée', bg: '#EDE9FE', text: '#7C3AED' },
  delivered: { label: 'Livrée', bg: '#D1FAE5', text: '#059669' },
  cancelled: { label: 'Annulée', bg: '#FEE2E2', text: '#DC2626' },
};

const NEXT_ACTION: Record<string, { status: string; label: string } | undefined> = {
  new: { status: 'confirmed', label: 'Confirmer la commande' },
  confirmed: { status: 'preparing', label: 'Démarrer la préparation' },
  preparing: { status: 'shipped', label: 'Marquer comme expédiée' },
  shipped: { status: 'delivered', label: 'Marquer comme livrée' },
};

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const fetchOrder = useCallback(async () => {
    setErrorMessage(null);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!apiUrl || !session) {
        throw new Error('not_ready');
      }

      const response = await fetch(`${apiUrl}/orders/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        throw new Error('fetch_failed');
      }

      const body = await response.json();
      setOrder(body.order);
    } catch {
      setErrorMessage('Impossible de charger la commande.');
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchOrder().finally(() => setIsLoading(false));
  }, [id, fetchOrder]);

  const applyTransition = async (status: string, reason?: string) => {
    setErrorMessage(null);
    setIsUpdating(true);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!apiUrl || !session) {
        throw new Error('not_ready');
      }

      const response = await fetch(`${apiUrl}/orders/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(reason ? { status, cancelledReason: reason } : { status }),
      });

      if (!response.ok) {
        throw new Error('update_failed');
      }

      await fetchOrder();
      setIsCancelling(false);
      setCancelReason('');
    } catch {
      setErrorMessage('Impossible de mettre à jour la commande. Réessayez.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmCancel = () => {
    const reason = cancelReason.trim();
    if (!reason) return;
    applyTransition('cancelled', reason);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{errorMessage ?? 'Commande introuvable.'}</Text>
      </View>
    );
  }

  const statusConfig = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.new;
  const nextAction = NEXT_ACTION[order.status];
  const canCancel = order.status === 'new' || order.status === 'confirmed';
  const itemsTotal = order.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const hasDeliveryFee = (order.delivery_fee ?? 0) > 0;
  const hasDiscount = (order.discount ?? 0) > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>#{order.id.slice(0, 8).toUpperCase()}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTopLine}>
          <Text style={styles.customerName}>{order.customer_name || 'Client'}</Text>
          <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.badgeText, { color: statusConfig.text }]}>{statusConfig.label}</Text>
          </View>
        </View>
        <Text style={styles.dateText}>
          {new Date(order.created_at).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Text>
        {order.status === 'cancelled' && order.cancelled_reason ? (
          <Text style={styles.cancelledReasonText}>Motif d&apos;annulation : {order.cancelled_reason}</Text>
        ) : null}
      </View>

      {order.delivery_address ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Livraison</Text>
          <Text style={styles.deliveryAddress}>{order.delivery_address}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Produits</Text>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.product?.name ?? 'Produit'}</Text>
              <Text style={styles.itemQty}>
                {item.quantity} × {formatAmount(item.unit_price)}
              </Text>
            </View>
            <Text style={styles.itemSubtotal}>{formatAmount(item.quantity * item.unit_price)}</Text>
          </View>
        ))}
        {(hasDeliveryFee || hasDiscount) ? (
          <View style={styles.subtotalSection}>
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Sous-total articles</Text>
              <Text style={styles.subtotalValue}>{formatAmount(itemsTotal)}</Text>
            </View>
            {hasDeliveryFee ? (
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Frais de livraison</Text>
                <Text style={styles.subtotalValue}>+ {formatAmount(order.delivery_fee)}</Text>
              </View>
            ) : null}
            {hasDiscount ? (
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Remise</Text>
                <Text style={[styles.subtotalValue, styles.discountText]}>- {formatAmount(order.discount)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatAmount(order.total_amount)}</Text>
        </View>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {nextAction ? (
        <Pressable
          style={[styles.primaryButton, isUpdating && styles.buttonDisabled]}
          onPress={() => applyTransition(nextAction.status)}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{nextAction.label}</Text>
          )}
        </Pressable>
      ) : null}

      {canCancel ? (
        isCancelling ? (
          <View style={styles.cancelBox}>
            <Text style={styles.cancelLabel}>Motif d&apos;annulation *</Text>
            <TextInput
              style={styles.cancelInput}
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Expliquez la raison de l'annulation"
              placeholderTextColor="#94A3B8"
              multiline
              editable={!isUpdating}
            />
            <View style={styles.cancelActions}>
              <Pressable
                style={styles.cancelSecondaryButton}
                onPress={() => {
                  setIsCancelling(false);
                  setCancelReason('');
                }}
                disabled={isUpdating}
              >
                <Text style={styles.cancelSecondaryButtonText}>Retour</Text>
              </Pressable>
              <Pressable
                style={[styles.cancelConfirmButton, (!cancelReason.trim() || isUpdating) && styles.buttonDisabled]}
                onPress={handleConfirmCancel}
                disabled={!cancelReason.trim() || isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.cancelConfirmButtonText}>Confirmer l&apos;annulation</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.dangerButton} onPress={() => setIsCancelling(true)} disabled={isUpdating}>
            <Text style={styles.dangerButtonText}>Annuler la commande</Text>
          </Pressable>
        )
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  emptyText: { fontSize: 14, color: '#64748B' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backLink: { marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  customerName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 12, color: '#64748B' },
  cancelledReasonText: { fontSize: 12, color: '#DC2626', marginTop: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemInfo: { flex: 1, marginRight: 12 },
  itemName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  itemQty: { fontSize: 12, color: '#64748B', marginTop: 2 },
  itemSubtotal: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12 },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  totalValue: { fontSize: 16, fontWeight: '800', color: '#6366F1' },
  errorText: { color: '#DC2626', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  primaryButton: {
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  dangerButton: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  cancelBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    padding: 14,
  },
  cancelLabel: { fontSize: 12, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  cancelInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    marginBottom: 12,
  },
  cancelActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelSecondaryButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  cancelSecondaryButtonText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  cancelConfirmButton: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelConfirmButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  deliveryAddress: { fontSize: 13, color: '#334155', lineHeight: 20 },
  subtotalSection: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 8, paddingTop: 8 },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  subtotalLabel: { fontSize: 12, color: '#64748B' },
  subtotalValue: { fontSize: 12, color: '#334155', fontWeight: '600' },
  discountText: { color: '#059669' },
});
