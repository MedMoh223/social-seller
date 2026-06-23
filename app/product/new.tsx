import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function NewProductScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('0');
  const [alertThreshold, setAlertThreshold] = useState('0');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    setErrorMessage(null);

    const trimmedName = name.trim();
    const parsedPrice = Number(price);
    const parsedStock = Number(stockQuantity || '0');
    const parsedThreshold = Number(alertThreshold || '0');

    if (!trimmedName) {
      setErrorMessage('Le nom du produit est requis.');
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setErrorMessage('Le prix doit être un nombre positif.');
      return;
    }

    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      setErrorMessage('La quantité en stock doit être un nombre entier positif.');
      return;
    }

    if (!Number.isInteger(parsedThreshold) || parsedThreshold < 0) {
      setErrorMessage("Le seuil d'alerte doit être un nombre entier positif.");
      return;
    }

    setIsSaving(true);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!apiUrl || !session) {
        throw new Error('not_ready');
      }

      const response = await fetch(`${apiUrl}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || undefined,
          price: parsedPrice,
          stockQuantity: parsedStock,
          alertThreshold: parsedThreshold,
        }),
      });

      if (!response.ok) {
        throw new Error('create_failed');
      }

      router.back();
    } catch {
      setErrorMessage('Impossible de créer ce produit. Réessayez.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Nouveau produit</Text>
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

        <Text style={styles.label}>QUANTITÉ EN STOCK</Text>
        <TextInput
          style={styles.input}
          value={stockQuantity}
          onChangeText={setStockQuantity}
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
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable
        style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>Créer le produit</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
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
  errorText: { color: '#DC2626', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  primaryButton: {
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
