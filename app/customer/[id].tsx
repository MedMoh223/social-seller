import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

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

    // Fetch linked conversations (match by external_id or customer_fk_id)
    if (c.external_id) {
      const { data } = await supabase
        .from('conversations')
        .select('id, platform, customer_name, updated_at')
        .eq('customer_id', c.external_id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(20);
      setConversations((data as ConversationRow[]) ?? []);
    } else {
      // Fall back to customer_fk_id link
      const { data } = await supabase
        .from('conversations')
        .select('id, platform, customer_name, updated_at')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(20);
      setConversations((data as ConversationRow[]) ?? []);
    }

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
    Alert.alert(
      'Supprimer ce client ?',
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            const apiUrl = process.env.EXPO_PUBLIC_API_URL;
            const { data: { session } } = await supabase.auth.getSession();
            if (!apiUrl || !session || !customer) return;

            const res = await fetch(`${apiUrl}/customers/${customer.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (res.status === 204) {
              router.back();
            } else {
              Alert.alert('Erreur', 'Impossible de supprimer le client.');
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
      <View style={styles.header}>
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
    paddingHorizontal: 12, paddingTop: 56, paddingBottom: 14,
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
});
