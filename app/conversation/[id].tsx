import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface MessageRow {
  id: string;
  direction: string;
  content: string;
  created_at: string;
}

export default function ConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    supabase
      .from('messages')
      .select('id, direction, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setMessages(data ?? []);
        setIsLoading(false);
      });
  }, [id]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Conversation</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Chargement...</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Aucun message pour le moment.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.direction === 'outbound' ? styles.outboundBubble : styles.inboundBubble]}>
              <Text style={item.direction === 'outbound' ? styles.outboundText : styles.inboundText}>
                {item.content}
              </Text>
            </View>
          )}
        />
      )}
    </View>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#64748B' },
  listContent: { flexGrow: 1, padding: 16 },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 12, marginBottom: 8 },
  inboundBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignSelf: 'flex-start' },
  outboundBubble: { backgroundColor: '#6366F1', alignSelf: 'flex-end' },
  inboundText: { color: '#0F172A', fontSize: 14 },
  outboundText: { color: '#FFFFFF', fontSize: 14 },
});
