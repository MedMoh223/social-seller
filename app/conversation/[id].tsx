import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
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

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    async function load() {
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

  const platformLabel = conversation ? PLATFORM_LABELS[conversation.platform] ?? conversation.platform : '';
  const contactName = conversation?.customer_name || conversation?.customer_id || 'Client';

  // Query is ASC (oldest first) as the data source of truth; the
  // inverted FlatList below needs DESC (newest first) so item 0 lands
  // at the bottom of the screen and the list opens already scrolled
  // there, matching standard chat UI behavior.
  const invertedMessages = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>{contactName}</Text>
          {platformLabel ? <Text style={styles.headerSubtitle}>{platformLabel}</Text> : null}
        </View>
      </View>

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
        <TextInput
          style={styles.composerInput}
          placeholder="Envoi de messages — bientôt disponible"
          placeholderTextColor="#94A3B8"
          editable={false}
        />
        <View style={styles.sendButtonDisabled}>
          <Feather name="send" size={16} color="#94A3B8" />
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  headerSubtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginRight: 10,
  },
  sendButtonDisabled: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
