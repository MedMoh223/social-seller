import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface Product {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
}

interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
}

interface OrderItem {
  product: Product;
  quantity: number;
}

function formatAmount(n: number) {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

export default function NewOrderScreen() {
  const router = useRouter();
  const { conversationId, customerName: prefilledName, customerId: prefilledCustomerId } = useLocalSearchParams<{
    conversationId?: string;
    customerName?: string;
    customerId?: string;
  }>();

  const [customerName, setCustomerName] = useState(prefilledName ?? '');
  const [customerId, setCustomerId] = useState(prefilledCustomerId ?? '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [discount, setDiscount] = useState('0');

  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Customer picker modal
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  const fetchProducts = useCallback(async () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session) return;
    const res = await fetch(`${apiUrl}/products`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const body = await res.json();
      setProducts(body.products ?? []);
    }
    setIsLoadingProducts(false);
  }, []);

  const fetchCustomers = useCallback(async () => {
    setIsLoadingCustomers(true);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session) { setIsLoadingCustomers(false); return; }
    const res = await fetch(`${apiUrl}/customers?limit=100`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const body = await res.json();
      setCustomers(body.customers ?? []);
    }
    setIsLoadingCustomers(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const addItem = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: Math.min(i.quantity + 1, product.stock_quantity) }
            : i,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const setQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) => i.product.id === productId ? { ...i, quantity: qty } : i),
      );
    }
  };

  const parsedDeliveryFee = Math.max(0, Number(deliveryFee) || 0);
  const parsedDiscount = Math.max(0, Number(discount) || 0);
  const itemsTotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const totalAmount = Math.max(0, itemsTotal + parsedDeliveryFee - parsedDiscount);

  const handleSave = async () => {
    if (!customerName.trim()) { setError('Le nom du client est obligatoire.'); return; }
    if (items.length === 0) { setError('Ajoutez au moins un produit.'); return; }
    setError(null);
    setIsSaving(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!apiUrl || !session) throw new Error('not_ready');

      const res = await fetch(`${apiUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerId: customerId || null,
          conversationId: conversationId ?? null,
          deliveryAddress: deliveryAddress.trim() || null,
          deliveryFee: parsedDeliveryFee,
          discount: parsedDiscount,
          items: items.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
            unitPrice: i.product.price,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message ?? 'Erreur serveur');
      }

      const { order } = await res.json();
      router.replace(`/order/${order.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible de créer la commande.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredCustomers = customers.filter((c) =>
    c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone ?? '').includes(customerSearch),
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="x" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Nouvelle commande</Text>
        <Pressable
          style={[styles.saveBtn, (isSaving || items.length === 0) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving || items.length === 0}
        >
          {isSaving
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.saveBtnText}>Créer</Text>}
        </Pressable>
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Client */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>CLIENT *</Text>
              <View style={styles.customerRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={customerName}
                  onChangeText={(v) => { setCustomerName(v); setCustomerId(''); }}
                  placeholder="Nom du client"
                  placeholderTextColor="#94A3B8"
                />
                <Pressable
                  style={styles.pickCustomerBtn}
                  onPress={() => {
                    fetchCustomers();
                    setShowCustomerPicker(true);
                  }}
                >
                  <Feather name="users" size={16} color="#6366F1" />
                </Pressable>
              </View>
              {customerId ? (
                <Text style={styles.customerLinkedText}>
                  <Feather name="check-circle" size={11} color="#059669" /> Client lié
                </Text>
              ) : null}
            </View>

            {/* Livraison */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>LIVRAISON (OPTIONNEL)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={deliveryAddress}
                onChangeText={setDeliveryAddress}
                placeholder="Adresse de livraison"
                placeholderTextColor="#94A3B8"
                multiline
              />
              <View style={styles.feesRow}>
                <View style={styles.feeBlock}>
                  <Text style={styles.feeLabel}>FRAIS LIVRAISON</Text>
                  <TextInput
                    style={styles.feeInput}
                    value={deliveryFee}
                    onChangeText={setDeliveryFee}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={styles.feeBlock}>
                  <Text style={styles.feeLabel}>REMISE</Text>
                  <TextInput
                    style={styles.feeInput}
                    value={discount}
                    onChangeText={setDiscount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>

            {/* Panier */}
            {items.length > 0 && (
              <View style={styles.cartSection}>
                <Text style={styles.sectionLabel}>PANIER ({items.length})</Text>
                {items.map((item) => (
                  <View key={item.product.id} style={styles.cartRow}>
                    <View style={styles.cartBody}>
                      <Text style={styles.cartName} numberOfLines={1}>{item.product.name}</Text>
                      <Text style={styles.cartPrice}>{formatAmount(item.product.price * item.quantity)}</Text>
                    </View>
                    <View style={styles.qtyRow}>
                      <Pressable style={styles.qtyBtn} onPress={() => setQty(item.product.id, item.quantity - 1)}>
                        <Feather name="minus" size={14} color="#6366F1" />
                      </Pressable>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                      <Pressable
                        style={styles.qtyBtn}
                        onPress={() => setQty(item.product.id, Math.min(item.quantity + 1, item.product.stock_quantity))}
                      >
                        <Feather name="plus" size={14} color="#6366F1" />
                      </Pressable>
                    </View>
                  </View>
                ))}
                {(parsedDeliveryFee > 0 || parsedDiscount > 0) ? (
                  <View style={styles.subtotalSection}>
                    <View style={styles.subtotalRow}>
                      <Text style={styles.subtotalLabel}>Articles</Text>
                      <Text style={styles.subtotalValue}>{formatAmount(itemsTotal)}</Text>
                    </View>
                    {parsedDeliveryFee > 0 ? (
                      <View style={styles.subtotalRow}>
                        <Text style={styles.subtotalLabel}>Livraison</Text>
                        <Text style={styles.subtotalValue}>+ {formatAmount(parsedDeliveryFee)}</Text>
                      </View>
                    ) : null}
                    {parsedDiscount > 0 ? (
                      <View style={styles.subtotalRow}>
                        <Text style={styles.subtotalLabel}>Remise</Text>
                        <Text style={[styles.subtotalValue, styles.discountText]}>- {formatAmount(parsedDiscount)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalAmount}>{formatAmount(totalAmount)}</Text>
                </View>
              </View>
            )}

            {/* Recherche produits */}
            <Text style={styles.sectionLabel}>AJOUTER DES PRODUITS</Text>
            <View style={styles.searchRow}>
              <Feather name="search" size={15} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher un produit…"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {isLoadingProducts && (
              <ActivityIndicator color="#6366F1" style={{ marginTop: 20 }} />
            )}
          </View>
        }
        renderItem={({ item }) => {
          const inCart = items.find((i) => i.product.id === item.id);
          const outOfStock = item.stock_quantity === 0;
          return (
            <Pressable
              style={[styles.productRow, outOfStock && styles.productRowDisabled]}
              onPress={() => !outOfStock && addItem(item)}
              disabled={outOfStock}
            >
              <View style={styles.productBody}>
                <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.productMeta}>
                  {formatAmount(item.price)} · {item.stock_quantity} en stock
                </Text>
              </View>
              {inCart ? (
                <View style={styles.inCartBadge}>
                  <Text style={styles.inCartText}>×{inCart.quantity}</Text>
                </View>
              ) : outOfStock ? (
                <Text style={styles.outOfStockText}>Épuisé</Text>
              ) : (
                <Feather name="plus-circle" size={22} color="#6366F1" />
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !isLoadingProducts ? (
            <Text style={styles.emptyText}>Aucun produit trouvé.</Text>
          ) : null
        }
        contentContainerStyle={styles.list}
      />

      {/* Customer picker modal */}
      <Modal visible={showCustomerPicker} animationType="slide" onRequestClose={() => setShowCustomerPicker(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choisir un client</Text>
            <Pressable onPress={() => setShowCustomerPicker(false)}>
              <Feather name="x" size={22} color="#0F172A" />
            </Pressable>
          </View>
          <View style={styles.searchRow}>
            <Feather name="search" size={15} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Rechercher…"
              placeholderTextColor="#94A3B8"
              autoFocus
            />
          </View>
          {isLoadingCustomers ? (
            <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView>
              {filteredCustomers.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.customerPickerRow}
                  onPress={() => {
                    setCustomerName(c.full_name);
                    setCustomerId(c.id);
                    setShowCustomerPicker(false);
                    setCustomerSearch('');
                  }}
                >
                  <Text style={styles.customerPickerName}>{c.full_name}</Text>
                  {c.phone ? <Text style={styles.customerPickerPhone}>{c.phone}</Text> : null}
                </Pressable>
              ))}
              {filteredCustomers.length === 0 ? (
                <Text style={styles.emptyText}>Aucun client trouvé.</Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F8FAFC' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerBtn:    { padding: 8 },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  saveBtn:      { backgroundColor: '#6366F1', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnDisabled: { backgroundColor: '#A5B4FC' },
  saveBtnText:  { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  list:         { padding: 16 },
  errorText:    { color: '#DC2626', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  card:         { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12, padding: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  customerRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickCustomerBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  customerLinkedText: { fontSize: 11, color: '#059669', marginTop: 6 },
  input:        { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC' },
  textArea:     { minHeight: 60, textAlignVertical: 'top', marginBottom: 12 },
  feesRow:      { flexDirection: 'row', gap: 12 },
  feeBlock:     { flex: 1 },
  feeLabel:     { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, marginBottom: 4 },
  feeInput:     { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC' },
  cartSection:  { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16, overflow: 'hidden', padding: 14 },
  cartRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  cartBody:     { flex: 1 },
  cartName:     { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  cartPrice:    { fontSize: 12, color: '#64748B', marginTop: 2 },
  qtyRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn:       { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  qtyText:      { fontSize: 14, fontWeight: '700', color: '#0F172A', minWidth: 20, textAlign: 'center' },
  subtotalSection: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 8, paddingTop: 8 },
  subtotalRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  subtotalLabel: { fontSize: 12, color: '#64748B' },
  subtotalValue: { fontSize: 12, color: '#334155', fontWeight: '600' },
  discountText: { color: '#059669' },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  totalLabel:   { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  totalAmount:  { fontSize: 15, fontWeight: '800', color: '#6366F1' },
  searchRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput:  { flex: 1, fontSize: 14, color: '#0F172A' },
  productRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 8 },
  productRowDisabled: { opacity: 0.4 },
  productBody:  { flex: 1 },
  productName:  { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  productMeta:  { fontSize: 12, color: '#64748B', marginTop: 2 },
  inCartBadge:  { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  inCartText:   { fontSize: 13, fontWeight: '700', color: '#6366F1' },
  outOfStockText: { fontSize: 12, color: '#94A3B8' },
  emptyText:    { textAlign: 'center', color: '#94A3B8', fontSize: 13, marginTop: 20 },
  // Customer picker modal
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 60, paddingHorizontal: 16 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  customerPickerRow: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 8 },
  customerPickerName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  customerPickerPhone: { fontSize: 12, color: '#64748B', marginTop: 2 },
});
