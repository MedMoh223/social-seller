import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string;
  external_id: string | null;
  updated_at: string;
}

const SOURCE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  whatsapp: 'message-circle',
  facebook: 'facebook',
  tiktok: 'music',
  manual: 'user',
};

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: '#10B981',
  facebook: '#1877F2',
  tiktok: '#000000',
  manual: '#6366F1',
};

export default function ClientsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

  const fetchCustomers = useCallback(async (q?: string) => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session) return;

    const url = q ? `${apiUrl}/customers?q=${encodeURIComponent(q)}` : `${apiUrl}/customers`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!res.ok) return;
    const body = await res.json();
    setCustomers(body.customers ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      fetchCustomers().finally(() => setIsLoading(false));
    }, [fetchCustomers]),
  );

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    fetchCustomers(text.trim() || undefined);
  }, [fetchCustomers]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchCustomers(searchQuery.trim() || undefined);
    setIsRefreshing(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('Le nom est obligatoire.');
      return;
    }
    setFormError(null);
    setIsSaving(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!apiUrl || !session) throw new Error('not_ready');

      const res = await fetch(`${apiUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          notes: form.notes.trim() || null,
          source: 'manual',
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message ?? 'Erreur serveur');
      }

      setShowModal(false);
      setForm({ name: '', phone: '', email: '', notes: '' });
      await fetchCustomers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Impossible de créer le client.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.title}>Clients</Text>
        <Pressable style={styles.addButton} onPress={() => { setFormError(null); setShowModal(true); }}>
          <Feather name="plus" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un client…"
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
      </View>

      {/* List */}
      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="users" size={28} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>Aucun client</Text>
            <Text style={styles.emptySubtitle}>
              Ajoutez un client manuellement ou enregistrez-le depuis une conversation.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const source = item.source in SOURCE_ICONS ? item.source : 'manual';
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/customer/${item.id}`)}>
              <View style={[styles.avatar, { backgroundColor: `${SOURCE_COLORS[source]}18` }]}>
                <Feather name={SOURCE_ICONS[source]} size={20} color={SOURCE_COLORS[source]} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {item.phone ?? item.email ?? item.external_id ?? '—'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#CBD5E1" />
            </Pressable>
          );
        }}
      />

      {/* Modal création */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau client</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <Feather name="x" size={22} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {formError ? <Text style={styles.formError}>{formError}</Text> : null}

              <Text style={styles.label}>Nom *</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Nom complet" placeholderTextColor="#94A3B8" />

              <Text style={styles.label}>Téléphone</Text>
              <TextInput style={styles.input} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+223 XX XX XX XX" placeholderTextColor="#94A3B8" keyboardType="phone-pad" />

              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="email@exemple.com" placeholderTextColor="#94A3B8" keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.label}>Notes</Text>
              <TextInput style={[styles.input, styles.inputMultiline]} value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="Informations complémentaires…" placeholderTextColor="#94A3B8" multiline numberOfLines={3} />
            </ScrollView>

            <Pressable style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={handleSave} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.saveButtonText}>Enregistrer</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }, // paddingTop base — override dynamique via [styles.header, { paddingTop: insets.top + 14 }]
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  addButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingHorizontal: 16, paddingVertical: 10 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  list: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', paddingHorizontal: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalBody: { paddingHorizontal: 20, paddingTop: 16, maxHeight: 380 },
  formError: { color: '#DC2626', fontSize: 13, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A' },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  saveButton: { marginHorizontal: 20, marginTop: 20, backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#A5B4FC' },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
