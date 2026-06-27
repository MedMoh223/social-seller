import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { isOwner } from '../../lib/userRole';

interface Tenant {
  id: string;
  name: string;
  plan: string;
  logo_url: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuit',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const fetchTenant = useCallback(async () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session) return;
    const res = await fetch(`${apiUrl}/tenant`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const body = await res.json();
      setTenant(body.tenant);
      setNameInput(body.tenant.name);
    }
    setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchTenant(); }, [fetchTenant]));

  const handleSaveName = async () => {
    if (!nameInput.trim() || !tenant) return;
    setIsSavingName(true);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session) { setIsSavingName(false); return; }

    const res = await fetch(`${apiUrl}/tenant`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ name: nameInput.trim() }),
    });

    if (res.ok) {
      const body = await res.json();
      setTenant(body.tenant);
      setIsEditingName(false);
    } else {
      Alert.alert('Erreur', 'Impossible de mettre à jour le nom.');
    }
    setIsSavingName(false);
  };

  const handlePickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', "Autorisez l'accès à la galerie pour uploader un logo.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    setIsUploadingLogo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !tenant) throw new Error('not_ready');

      const path = `${tenant.id}/logo.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, blob, { contentType: mime, upsert: true });

      if (uploadError) throw uploadError;

      // Signed URL valide 10 ans
      const { data: signedData, error: signedError } = await supabase.storage
        .from('logos')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);

      if (signedError || !signedData?.signedUrl) throw signedError ?? new Error('signed_url_failed');

      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      await fetch(`${apiUrl}/tenant`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ logo_url: signedData.signedUrl }),
      });

      setTenant((prev) => prev ? { ...prev, logo_url: signedData.signedUrl } : prev);
    } catch {
      Alert.alert('Erreur', "Impossible d'uploader le logo.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator color="#6366F1" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      {/* Logo + Nom boutique */}
      <View style={[styles.heroSection, { paddingTop: insets.top + 14 }]}>
        <Pressable style={styles.logoWrap} onPress={isOwner() ? handlePickLogo : undefined} disabled={isUploadingLogo || !isOwner()}>
          {isUploadingLogo ? (
            <ActivityIndicator color="#6366F1" />
          ) : tenant?.logo_url ? (
            <Image source={{ uri: tenant.logo_url }} style={styles.logoImage} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Feather name="image" size={28} color="#94A3B8" />
            </View>
          )}
          {isOwner() && (
            <View style={styles.logoEditBadge}>
              <Feather name="camera" size={12} color="#FFFFFF" />
            </View>
          )}
        </Pressable>

        {isOwner() && isEditingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <Pressable onPress={handleSaveName} disabled={isSavingName} style={styles.nameConfirmBtn}>
              {isSavingName
                ? <ActivityIndicator color="#6366F1" size="small" />
                : <Feather name="check" size={18} color="#6366F1" />}
            </Pressable>
            <Pressable onPress={() => { setIsEditingName(false); setNameInput(tenant?.name ?? ''); }}>
              <Feather name="x" size={18} color="#94A3B8" />
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.nameRow} onPress={isOwner() ? () => setIsEditingName(true) : undefined}>
            <Text style={styles.shopName}>{tenant?.name ?? 'Ma boutique'}</Text>
            {isOwner() && <Feather name="edit-2" size={14} color="#94A3B8" style={{ marginLeft: 6 }} />}
          </Pressable>
        )}

        <View style={styles.planBadge}>
          <Text style={styles.planText}>{PLAN_LABELS[tenant?.plan ?? 'free'] ?? tenant?.plan}</Text>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.section}>
        {isOwner() && (
          <>
            <MenuItem icon="user-plus" label="Mon équipe" onPress={() => router.push('/agents')} />
            <Divider />
          </>
        )}
        {isOwner() && (
          <>
            <MenuItem icon="link-2" label="Canaux connectés" onPress={() => router.push('/(tabs)/channels')} />
            <Divider />
          </>
        )}
        <MenuItem icon="package" label="Produits & stock" onPress={() => router.push('/(tabs)/stock')} />
        <Divider />
        <MenuItem icon="users" label="Clients" onPress={() => router.push('/(tabs)/clients')} />
      </View>

      <View style={[styles.section, { marginTop: 12 }]}>
        <MenuItem icon="log-out" label="Se déconnecter" onPress={handleLogout} danger />
      </View>

      <Text style={styles.versionText}>Social Seller · Djiguitech</Text>
    </ScrollView>
  );
}

function Divider() { return <View style={styles.divider} />; }

function MenuItem({ icon, label, onPress, danger = false }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuLeft}>
        <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
          <Feather name={icon} size={16} color={danger ? '#DC2626' : '#6366F1'} />
        </View>
        <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      </View>
      <Feather name="chevron-right" size={16} color="#CBD5E1" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F8FAFC' },
  body:            { paddingBottom: 40 },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroSection:     { alignItems: 'center', paddingTop: 14, paddingBottom: 28, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  logoWrap:        { width: 88, height: 88, borderRadius: 44, marginBottom: 14, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  logoImage:       { width: 88, height: 88, borderRadius: 44 },
  logoPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  logoEditBadge:   { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  nameRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  shopName:        { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  nameEditRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  nameInput:       { fontSize: 17, fontWeight: '700', color: '#0F172A', borderBottomWidth: 2, borderBottomColor: '#6366F1', paddingBottom: 2, minWidth: 140 },
  nameConfirmBtn:  { padding: 4 },
  planBadge:       { backgroundColor: '#EEF2FF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  planText:        { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  section:         { backgroundColor: '#FFFFFF', borderRadius: 16, marginHorizontal: 16, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  divider:         { height: 1, backgroundColor: '#F1F5F9', marginLeft: 56 },
  menuItem:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  menuLeft:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIcon:        { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  menuIconDanger:  { backgroundColor: '#FEF2F2' },
  menuLabel:       { fontSize: 15, fontWeight: '500', color: '#0F172A' },
  menuLabelDanger: { color: '#DC2626' },
  versionText:     { textAlign: 'center', fontSize: 12, color: '#CBD5E1', marginTop: 32 },
});
