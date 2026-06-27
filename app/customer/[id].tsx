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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  source: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ConversationRow {
  id: string;
  platform: string;
  customer_name: string | null;
  updated_at: string;
  unread_count: number;
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  manual: 'Manuel',
};

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: '#10B981',
  facebook: '#1877F2',
  tiktok: '#000000',
  manual: '#6366F1',
};

const PLATFORM_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  whatsapp: 'message-circle',
  facebook: 'facebook',
  tiktok: 'music',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function CustomerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;

    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session) return;

    const headers = { Authorization: `Bearer ${session.access_token}` };

    // Fetch customer
    const res = await fetch(`${apiUrl}/customers/${id}`, { headers });
    if (!res.ok) { setIsLoading(false); return; }
    const { customer: c } = await res.json() as { customer: Customer };
    setCustomer(c);
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '' });

    // Fetch linked conversations:
    // - by customer UUID (set after merchant links a customer from order form)
    // - by external_id (platform sender ID: phone for WhatsApp, PSID for Facebook)
    // Both can coexist; merge and deduplicate.
    const byUuid = await supabase
      .from('conversations')
      .select('id, platform, customer_name, updated_at')
      .eq('customer_id', id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(20);

    const byExternalId = c.external_id
      ? await supabase
          .from('conversations')
          .select('id, platform, customer_name, updated_at')
          .eq('customer_id', c.external_id)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(20)
      : { data: [] };

    const seen = new Set<string>();
    const merged: ConversationRow[] = [];
    for (const row of [...(byUuid.data ?? []), ...(byExternalId.data ?? [])]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row as ConversationRow);
      }
    }
    merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setConversations(merged);

    setIsLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim() || !customer) return;
    setIsSaving(true);

    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session) { setIsSaving(false); return; }

    const res = await fetch(`${apiUrl}/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      }),
    });

    if (res.ok) {
      const { customer: updated } = await res.json();
      setCustomer((prev) => prev ? { ...prev, ...updated } : prev);
      setIsEditing(false);
    } else {
      Alert.alert('Erreur', 'Impossible de mettre à jour le client.');
    }
    setIsSaving(false);
  };

  const handleDelete = () => {
    setDeleteReason('');
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteReason.trim()) {
      setDeleteError('Un motif est requis.');
      return;
    }
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiUrl || !session || !customer) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/customers/${customer.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: deleteReason.trim() }),
      });

      if (res.status === 204) {
        setShowDeleteModal(false);
        router.back();
      } else {
        setDeleteError('Impossible de supprimer le client.');
      }
    } catch {
      setDeleteError('Erreur réseau.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Client introuvable.</Text>
      </View>
    );
  }

  const sourceColor = SOURCE_COLORS[customer.source] ?? '#6366F1';
  const sourceLabel = SOURCE_LABELS[customer.source] ?? customer.source;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {customer.name}
        </Text>
        <View style={styles.headerActions}>
          {isEditing ? (
            <>
              <Pressable style={styles.headerBtn} onPress={() => setIsEditing(false)}>
                <Feather name="x" size={20} color="#64748B" />
              </Pressable>
              <Pressable
                style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.saveBtnText}>Enregistrer</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={styles.headerBtn} onPress={() => setIsEditing(true)}>
                <Feather name="edit-2" size={18} color="#6366F1" />
              </Pressable>
              <Pressable style={styles.headerBtn} onPress={handleDelete}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Source badge */}
        <View style={[styles.sourceBadge, { backgroundColor: `${sourceColor}18` }]}>
          <View style={[styles.sourceDot, { backgroundColor: sourceColor }]} />
          <Text style={[styles.sourceLabel, { color: sourceColor }]}>{sourceLabel}</Text>
        </View>

        {/* Info card */}
        <View style={styles.card}>
          <Field
            icon="user"
            label="Nom"
            value={form.name}
            editing={isEditing}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="Nom complet"
          />
          <Divider />
          <Field
            icon="phone"
            label="Téléphone"
            value={form.phone}
            editing={isEditing}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="—"
            keyboardType="phone-pad"
          />
          <Divider />
          <Field
            icon="mail"
            label="Email"
            value={form.email}
            editing={isEditing}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            placeholder="—"
            keyboardType="email-address"
          />
          <Divider />
          <Field
            icon="file-text"
            label="Notes"
            value={form.notes}
            editing={isEditing}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            placeholder="—"
            multiline
          />
        </View>

        <Text style={styles.metaText}>
          Client depuis le {formatDate(customer.created_at)}
        </Text>

        {/* Conversations */}
        <Text style={styles.sectionTitle}>
          Conversations ({conversations.length})
        </Text>

        {conversations.length === 0 ? (
          <View style={styles.emptyConvs}>
            <Feather name="message-square" size={24} color="#CBD5E1" />
            <Text style={styles.emptyConvsText}>Aucune conversation liée</Text>
          </View>
        ) : (
          conversations.map((conv) => {
            const icon = PLATFORM_ICONS[conv.platform] ?? 'message-square';
            const pColor = SOURCE_COLORS[conv.platform] ?? '#6366F1';
            return (
              <Pressable
                key={conv.id}
                style={styles.convCard}
                onPress={() => router.push(`/conversation/${conv.id}`)}
              >
                <View style={[styles.convIcon, { backgroundColor: `${pColor}18` }]}>
                  <Feather name={icon} size={16} color={pColor} />
                </View>
                <View style={styles.convBody}>
                  <Text style={styles.convPlatform}>
                    {SOURCE_LABELS[conv.platform] ?? conv.platform}
                  </Text>
                  <Text style={styles.convDate}>{formatRelative(conv.updated_at)}</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#CBD5E1" />
              </Pressable>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Modal suppression avec motif */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Supprimer ce client ?</Text>
            <Text style={styles.modalSubtitle}>Cette action est irréversible. Précisez le motif.</Text>
            <TextInput
              style={[styles.modalInput, deleteError ? styles.inputError : null]}
              placeholder="Motif de suppression…"
              placeholderTextColor="#94A3B8"
              value={deleteReason}
              onChangeText={(t) => { setDeleteReason(t); setDeleteError(null); }}
              multiline
              numberOfLines={3}
            />
            {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowDeleteModal(false)}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </Pressable>
              <Pressable style={styles.deleteBtn} onPress={confirmDelete} disabled={isDeleting}>
                {isDeleting
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.deleteBtnText}>Supprimer</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Divider() {
  return <View style={styles.divider} />;
}

interface FieldProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  multiline?: boolean;
}

function Field({ icon, label, value, editing, onChange, placeholder = '—', keyboardType = 'default', multiline = false }: FieldProps) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIconWrap}>
        <Feather name={icon} size={16} color="#94A3B8" />
      </View>
      <View style={styles.fieldContent}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {editing ? (
          <TextInput
            style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor="#CBD5E1"
            keyboardType={keyboardType}
            autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
            multiline={multiline}
            numberOfLines={multiline ? 3 : 1}
          />
        ) : (
          <Text style={[styles.fieldValue, !value && styles.fieldValueEmpty]}>
            {value || placeholder}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#64748B' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 14, paddingBottom: 14,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  headerBtn:     { padding: 8 },
  headerTitle:   { flex: 1, fontSize: 17, fontWeight: '700', color: '#0F172A', marginHorizontal: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveBtn:       { backgroundColor: '#6366F1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 4 },
  saveBtnDisabled: { backgroundColor: '#A5B4FC' },
  saveBtnText:   { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  body: { paddingHorizontal: 16, paddingTop: 16 },

  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 14,
  },
  sourceDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  sourceLabel: { fontSize: 13, fontWeight: '600' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
    marginBottom: 10, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 48 },

  fieldRow:     { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14 },
  fieldIconWrap:{ width: 24, marginRight: 12, marginTop: 2 },
  fieldContent: { flex: 1 },
  fieldLabel:   { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue:   { fontSize: 15, color: '#0F172A' },
  fieldValueEmpty: { color: '#CBD5E1' },
  fieldInput:   { fontSize: 15, color: '#0F172A', padding: 0, borderBottomWidth: 1, borderBottomColor: '#6366F1' },
  fieldInputMulti: { minHeight: 60, textAlignVertical: 'top' },

  metaText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginBottom: 20 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  emptyConvs:     { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyConvsText: { fontSize: 13, color: '#94A3B8' },

  convCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    padding: 14, marginBottom: 8,
  },
  convIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  convBody: { flex: 1 },
  convPlatform: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  convDate:     { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // Modal suppression
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: '#64748B', marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 14, color: '#0F172A', minHeight: 80, textAlignVertical: 'top', marginBottom: 8 },
  inputError: { borderColor: '#DC2626' },
  errorText: { fontSize: 13, color: '#DC2626', marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  deleteBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center' },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});
