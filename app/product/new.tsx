import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const MAX_IMAGES = 4;

async function uploadImage(uri: string, tenantId: string): Promise<string> {
  const filename = `${tenantId}/${Date.now()}.jpg`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage.from('products').upload(filename, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from('products').getPublicUrl(filename);
  return data.publicUrl;
}

export default function NewProductScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('0');
  const [alertThreshold, setAlertThreshold] = useState('0');
  const [images, setImages] = useState<string[]>([]); // local URIs
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pickImage = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert('Maximum atteint', `Vous ne pouvez ajouter que ${MAX_IMAGES} photos.`);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Autorisez l\'accès à la galerie pour ajouter des photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.7,
      exif: false,
    });

    if (!result.canceled && result.assets[0]) {
      setImages((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    setErrorMessage(null);

    const trimmedName = name.trim();
    const parsedPrice = Number(price);
    const parsedCostPrice = costPrice.trim() ? Number(costPrice) : null;
    const parsedStock = Number(stockQuantity || '0');
    const parsedThreshold = Number(alertThreshold || '0');

    if (!trimmedName) { setErrorMessage('Le nom du produit est requis.'); return; }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) { setErrorMessage('Le prix doit être un nombre positif.'); return; }
    if (parsedCostPrice !== null && (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0)) { setErrorMessage('Le prix de revient doit être un nombre positif.'); return; }
    if (!Number.isInteger(parsedStock) || parsedStock < 0) { setErrorMessage('La quantité en stock doit être un nombre entier positif.'); return; }
    if (!Number.isInteger(parsedThreshold) || parsedThreshold < 0) { setErrorMessage("Le seuil d'alerte doit être un nombre entier positif."); return; }

    setIsSaving(true);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!apiUrl || !session) throw new Error('not_ready');

      // Upload images to Supabase Storage
      const imageUrls: string[] = [];
      for (const uri of images) {
        const { data: userData } = await supabase.auth.getUser();
        // Use session user id as folder name (tenant-isolated via RLS at storage level)
        const url = await uploadImage(uri, userData.user?.id ?? 'unknown');
        imageUrls.push(url);
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
          costPrice: parsedCostPrice,
          stockQuantity: parsedStock,
          alertThreshold: parsedThreshold,
          imageUrls,
        }),
      });

      if (!response.ok) throw new Error('create_failed');

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

      {/* Images */}
      <View style={styles.card}>
        <Text style={styles.label}>PHOTOS ({images.length}/{MAX_IMAGES})</Text>
        <View style={styles.imagesRow}>
          {images.map((uri, index) => (
            <View key={uri} style={styles.imageThumbWrapper}>
              <Image source={{ uri }} style={styles.imageThumb} />
              <Pressable style={styles.imageRemoveBtn} onPress={() => removeImage(index)}>
                <Feather name="x" size={10} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
          {images.length < MAX_IMAGES ? (
            <Pressable style={styles.addImageBtn} onPress={pickImage}>
              <Feather name="plus" size={22} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>
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

        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
            <Text style={styles.label}>PRIX DE VENTE (FCFA) *</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.label}>PRIX DE REVIENT</Text>
            <TextInput
              style={styles.input}
              value={costPrice}
              onChangeText={setCostPrice}
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />
          </View>
        </View>

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
  priceRow: { flexDirection: 'row', gap: 12 },
  priceBlock: { flex: 1 },
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  imageThumbWrapper: { position: 'relative' },
  imageThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#F1F5F9' },
  imageRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImageBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
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
