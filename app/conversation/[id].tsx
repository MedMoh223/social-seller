import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface MessageRow {
  id: string;
  direction: string;
  content: string;
  delivery_status: string | null;
  created_at: string;
}

interface ConversationInfo {
  platform: string;
  customer_name: string | null;
  customer_id: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  tiktok: 'TikTok',
};

const DELIVERY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  pending: 'clock',
  sent: 'check',
  delivered: 'check-circle',
  read: 'check-circle',
  failed: 'alert-circle',
};

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function ConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draftText, setDraftText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: '', phone: '' });
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [linkedCustomer, setLinkedCustomer] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    async function load() {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const { data: { session } } = await supabase.auth.getSession();

      const [{ data: conversationData }, { data: messageData }] = await Promise.all([
        supabase.from('conversations').select('platform, customer_name, customer_id').eq('id', id).single(),
        supabase
          .from('messages')
          .select('id, direction, content, delivery_status, created_at')
          .eq('conversation_id', id)
          .order('created_at', { ascending: true }),
      ]);

      if (!isMounted) return;

      setConversation(conversationData ?? null);
      setMessages(messageData ?? []);
      setIsLoading(false);

      // Lookup customer en parallèle du rendu — lancé sans await pour ne pas bloquer l'affichage
      if (conversationData?.customer_id && apiUrl && session) {
        fetch(
          `${apiUrl}/customers?external_id=${encodeURIComponent(conversationData.customer_id)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        )
          .then((res) => res.ok ? res.json() : null)
          .then((body) => {
            if (!isMounted) return;
            const found = body?.customers?.[0] ?? null;
            setLinkedCustomer(found ? { id: found.id, name: found.name } : null);
          })
          .catch(() => {});
      }

      // Best-effort: clear the unread badge for this thread now that the
      // merchant has viewed it. Not awaited by the render path above —
      // a failure here shouldn't block showing the messages.
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', id)
        .eq('direction', 'inbound')
        .eq('is_read', false);
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Scoped to this single open conversation (filter: conversation_id=eq.id)
  // — never a global subscription across all messages — and torn down on
  // unmount/navigation away so no channel lingers once the screen closes.
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`conversation-${id}-messages`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const newMsg = payload.new as MessageRow;

          // Inbound message arrives while conversation is open — append and
          // immediately mark as read so the inbox badge doesn't increment.
          if (newMsg.direction === 'inbound') {
            setMessages((current) => [...current, newMsg]);
            supabase
              .from('messages')
              .update({ is_read: true })
              .eq('id', newMsg.id)
              .then(() => {});
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const updated = payload.new as { id: string; direction: string; delivery_status: string | null };

          if (updated.direction !== 'outbound') return;

          setMessages((current) =>
            current.map((item) =>
              item.id === updated.id ? { ...item, delivery_status: updated.delivery_status } : item,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleSend = async () => {
    const content = draftText.trim();
    if (!content || isSending || !id) return;

    setSendError(null);
    setIsSending(true);
    setDraftText('');

    const tempId = `temp-${Date.now()}`;

    setMessages((current) => [
      ...current,
      { id: tempId, direction: 'outbound', content, delivery_status: 'pending', created_at: new Date().toISOString() },
    ]);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!apiUrl || !session) {
        throw new Error('not_ready');
      }

      const response = await fetch(`${apiUrl}/conversations/${id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error('send_failed');
      }

      const { message } = await response.json();

      setMessages((current) =>
        current.map((item) =>
          item.id === tempId
            ? {
                id: message.id,
                direction: 'outbound',
                content: message.content,
                delivery_status: message.delivery_status,
                created_at: message.created_at,
              }
            : item,
        ),
      );
    } catch {
      setSendError("Échec de l'envoi. Réessayez.");
      setMessages((current) =>
        current.map((item) => (item.id === tempId ? { ...item, delivery_status: 'failed' } : item)),
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenSaveModal = () => {
    setSaveForm({
      name: conversation?.customer_name ?? '',
      phone: conversation?.customer_id ?? '',
    });
    setShowSaveModal(true);
  };

  const handleSaveClient = async () => {
    if (!saveForm.name.trim()) return;
    setIsSavingClient(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!apiUrl || !session) throw new Error('not_ready');

      const res = await fetch(`${apiUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: saveForm.name.trim(),
          phone: saveForm.phone.trim() || null,
          source: conversation?.platform ?? 'manual',
          external_id: conversation?.customer_id ?? null,
        }),
      });

      setShowSaveModal(false);
      if (res.ok) {
        const body = await res.json();
        setLinkedCustomer({ id: body.customer.id, name: body.customer.name });
        Alert.alert('Client enregistré', `${saveForm.name.trim()} a été ajouté à vos clients.`);
      } else {
        const body = await res.json();
        const msg = body?.error?.message ?? 'Erreur serveur';
        Alert.alert('Erreur', msg);
      }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer le client.');
    } finally {
      setIsSavingClient(false);
    }
  };

  const platformLabel = conversation ? PLATFORM_LABELS[conversation.platform] ?? conversation.platform : '';
  const contactName = conversation?.customer_name || conversation?.customer_id || 'Client';
  const canSend = draftText.trim().length > 0 && !isSending;

  // Query is ASC (oldest first) as the data source of truth; the
  // inverted FlatList below needs DESC (newest first) so item 0 lands
  // at the bottom of the screen and the list opens already scrolled
  // there, matching standard chat UI behavior.
  const invertedMessages = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <View style={styles.headerInfo}>
          {linkedCustomer ? (
            <Pressable onPress={() => router.push(`/customer/${linkedCustomer.id}`)}>
              <Text style={[styles.headerTitle, styles.headerTitleLink]}>{contactName}</Text>
            </Pressable>
          ) : (
            <Text style={styles.headerTitle}>{contactName}</Text>
          )}
          {platformLabel ? <Text style={styles.headerSubtitle}>{platformLabel}</Text> : null}
        </View>
        {conversation && (
          linkedCustomer ? (
            <Pressable style={styles.saveClientBtn} onPress={() => router.push(`/customer/${linkedCustomer.id}`)}>
              <Feather name="user-check" size={18} color="#10B981" />
            </Pressable>
          ) : (
            <Pressable style={styles.saveClientBtn} onPress={handleOpenSaveModal}>
              <Feather name="user-plus" size={18} color="#6366F1" />
            </Pressable>
          )
        )}
      </View>

      {/* Modal : enregistrer comme client */}
      <Modal visible={showSaveModal} animationType="slide" transparent onRequestClose={() => setShowSaveModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enregistrer comme client</Text>
              <Pressable onPress={() => setShowSaveModal(false)}>
                <Feather name="x" size={22} color="#64748B" />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.label}>Nom</Text>
              <TextInput
                style={styles.input}
                value={saveForm.name}
                onChangeText={(v) => setSaveForm((f) => ({ ...f, name: v }))}
                placeholder="Nom complet"
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.label}>Téléphone</Text>
              <TextInput
                style={styles.input}
                value={saveForm.phone}
                onChangeText={(v) => setSaveForm((f) => ({ ...f, phone: v }))}
                placeholder="+223 XX XX XX XX"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />
            </View>
            <Pressable
              style={[styles.saveButton, (!saveForm.name.trim() || isSavingClient) && styles.saveButtonDisabled]}
              onPress={handleSaveClient}
              disabled={!saveForm.name.trim() || isSavingClient}
            >
              {isSavingClient
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.saveButtonText}>Enregistrer</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Chargement...</Text>
        </View>
      ) : (
        <FlatList
          inverted
          contentContainerStyle={styles.listContent}
          data={invertedMessages}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Aucun message pour le moment.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isOutbound = item.direction === 'outbound';
            const deliveryIcon = item.delivery_status ? DELIVERY_ICONS[item.delivery_status] : null;

            return (
              <View style={[styles.bubbleRow, isOutbound ? styles.bubbleRowOutbound : null]}>
                <View style={[styles.bubble, isOutbound ? styles.outboundBubble : styles.inboundBubble]}>
                  <Text style={isOutbound ? styles.outboundText : styles.inboundText}>{item.content}</Text>
                  <View style={styles.bubbleFooter}>
                    <Text style={isOutbound ? styles.outboundMeta : styles.inboundMeta}>
                      {formatTime(item.created_at)}
                    </Text>
                    {isOutbound && deliveryIcon ? (
                      <Feather
                        name={deliveryIcon}
                        size={12}
                        color={item.delivery_status === 'failed' ? '#FCA5A5' : '#C7D2FE'}
                        style={styles.deliveryIcon}
                      />
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={styles.composer}>
        {sendError ? <Text style={styles.composerError}>{sendError}</Text> : null}
        <View style={styles.composerRow}>
          <TextInput
            style={styles.composerInput}
            placeholder="Écrire un message..."
            placeholderTextColor="#94A3B8"
            value={draftText}
            onChangeText={setDraftText}
            editable={!isSending}
            multiline
          />
          <Pressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {isSending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Feather name="send" size={16} color={canSend ? '#FFFFFF' : '#94A3B8'} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backLink: { marginRight: 12 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  headerTitleLink: { color: '#6366F1' },
  headerSubtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  saveClientBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalBody: { paddingHorizontal: 20, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A' },
  saveButton: { marginHorizontal: 20, marginTop: 24, backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#A5B4FC' },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#64748B' },
  listContent: { flexGrow: 1, padding: 16 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRowOutbound: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  inboundBubble: { backgroundColor: '#E2E8F0', alignSelf: 'flex-start' },
  outboundBubble: { backgroundColor: '#6366F1', alignSelf: 'flex-end' },
  inboundText: { color: '#0F172A', fontSize: 14 },
  outboundText: { color: '#FFFFFF', fontSize: 14 },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  inboundMeta: { fontSize: 10, color: '#64748B' },
  outboundMeta: { fontSize: 10, color: '#C7D2FE' },
  deliveryIcon: { marginLeft: 4 },
  composer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  composerError: { color: '#DC2626', fontSize: 12, marginBottom: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end' },
  composerInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#E2E8F0' },
});
