import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  alert_threshold: number;
}

async function authorizedFetch(path: string, init: RequestInit = {}) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!apiUrl || !session) {
    throw new Error('not_ready');
  }

  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers ?? {}),
    },
  });
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [isStockModalVisible, setIsStockModalVisible] = useState(false);
  const [stockDelta, setStockDelta] = useState('');
  const [stockReason, setStockReason] = useState('');
  const [isAdjustingStock, setIsAdjustingStock] = useState(false);
  const [stockModalError, setStockModalError] = useState<string | null>(null);

  const [isArchiving, setIsArchiving] = useState(false);

  const fetchProduct = useCallback(async () => {
    setErrorMessage(null);

    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, price, stock_quantity, alert_threshold')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) {
      setErrorMessage('Impossible de charger ce produit.');
      return;
    }

    setProduct(data);
    setName(data.name);
    setDescription(data.description ?? '');
    setPrice(String(data.price));
    setAlertThreshold(String(data.alert_threshold));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchProduct().finally(() => setIsLoading(false));
  }, [id, fetchProduct]);

  const handleSave = async () => {
    setErrorMessage(null);

    const trimmedName = name.trim();
    const parsedPrice = Number(price);
    const parsedThreshold = Number(alertThreshold);

    if (!trimmedName) {
      setErrorMessage('Le nom du produit est requis.');
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setErrorMessage('Le prix doit être un nombre positif.');
      return;
    }

    if (!Number.isInteger(parsedThreshold) || parsedThreshold < 0) {
      setErrorMessage("Le seuil d'alerte doit être un nombre entier positif.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await authorizedFetch(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || null,
          price: parsedPrice,
          alertThreshold: parsedThreshold,
        }),
      });

      if (!response.ok) {
        throw new Error('save_failed');
      }

      const body = await response.json();
      setProduct(body.product);
    } catch {
      setErrorMessage('Impossible de sauvegarder les modifications.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjustStock = async () => {
    setStockModalError(null);

    const delta = Number.parseInt(stockDelta, 10);
    const reason = stockReason.trim();

    if (!Number.isInteger(delta) || delta === 0) {
      setStockModalError('Entrez une quantité (ex : +10 ou -5).');
      return;
    }

    if (!reason) {
      setStockModalError('Le motif est requis.');
      return;
    }

    setIsAdjustingStock(true);

    try {
      const response = await authorizedFetch(`/products/${id}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ delta, reason }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'adjust_failed');
      }

      const body = await response.json();
      setProduct(body.product);
      setIsStockModalVisible(false);
      setStockDelta('');
      setStockReason('');
    } catch (err) {
      setStockModalError(err instanceof Error ? err.message : "Impossible d'ajuster le stock.");
    } finally {
      setIsAdjustingStock(false);
    }
  };

  const handleArchive = () => {
    Alert.alert(
      'Archiver ce produit ?',
      'Il ne sera plus visible dans votre catalogue.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Archiver',
          style: 'destructive',
          onPress: async () => {
            setIsArchiving(true);
            setErrorMessage(null);

            try {
              const response = await authorizedFetch(`/products/${id}`, { method: 'DELETE' });

              if (!response.ok) {
                throw new Error('archive_failed');
              }

              router.back();
            } catch {
              setErrorMessage("Impossible d'archiver ce produit.");
              setIsArchiving(false);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{errorMessage ?? 'Produit introuvable.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Modifier le produit</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>NOM *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Nom du produit"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.label}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Description (optionnel)"
          placeholderTextColor="#94A3B8"
          multiline
        />

        <Text style={styles.label}>PRIX (FCFA) *</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          placeholder="0"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
        />

        <Text style={styles.label}>SEUIL D&apos;ALERTE STOCK</Text>
        <TextInput
          style={styles.input}
          value={alertThreshold}
          onChangeText={setAlertThreshold}
          placeholder="0"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
        />

        <View style={styles.stockRow}>
          <View>
            <Text style={styles.label}>STOCK ACTUEL</Text>
            <Text style={styles.stockValue}>{product.stock_quantity}</Text>
          </View>
          <Pressable style={styles.adjustButton} onPress={() => setIsStockModalVisible(true)}>
            <Feather name="sliders" size={14} color="#6366F1" />
            <Text style={styles.adjustButtonText}>Ajuster le stock</Text>
          </Pressable>
        </View>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable
        style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={isSaving}
      >
        {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Sauvegarder</Text>}
      </Pressable>

      <Pressable style={styles.dangerButton} onPress={handleArchive} disabled={isArchiving}>
        {isArchiving ? (
          <ActivityIndicator color="#DC2626" />
        ) : (
          <Text style={styles.dangerButtonText}>Archiver ce produit</Text>
        )}
      </Pressable>

      <Modal
        visible={isStockModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsStockModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ajuster le stock</Text>

            <Text style={styles.label}>QUANTITÉ (+ OU -)</Text>
            <TextInput
              style={styles.input}
              value={stockDelta}
              onChangeText={setStockDelta}
              placeholder="ex : +10 ou -5"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>MOTIF *</Text>
            <TextInput
              style={styles.input}
              value={stockReason}
              onChangeText={setStockReason}
              placeholder="ex : Réception fournisseur"
              placeholderTextColor="#94A3B8"
            />

            {stockModalError ? <Text style={styles.errorText}>{stockModalError}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalSecondaryButton}
                onPress={() => {
                  setIsStockModalVisible(false);
                  setStockModalError(null);
                }}
                disabled={isAdjustingStock}
              >
                <Text style={styles.modalSecondaryButtonText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.modalPrimaryButton, isAdjustingStock && styles.buttonDisabled]}
                onPress={handleAdjustStock}
                disabled={isAdjustingStock}
              >
                {isAdjustingStock ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>Confirmer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  emptyText: { fontSize: 14, color: '#64748B' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingTop: 8 },
  backLink: { marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  stockValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  adjustButtonText: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  modalSecondaryButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  modalSecondaryButtonText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  modalPrimaryButton: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
