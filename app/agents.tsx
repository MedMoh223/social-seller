import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { supabase } from '../lib/supabase';

interface Agent {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function AgentsScreen() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // Modal invitation
  const [showInvite, setShowInvite] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'agent' | 'owner'>('agent');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!apiUrl || !session) return;

      setCurrentUserId(session.user.id);

      const res = await fetch(`${apiUrl}/agents`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const body = await res.json();
        setAgents(body.agents ?? []);
        const me = (body.agents ?? []).find((a: Agent) => a.id === session.user.id);
        if (me) setCurrentUserRole(me.role);
      }
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => {
    fetchAgents().finally(() => setIsLoading(false));
  }, [fetchAgents]);

  const handleInvite = async () => {
    if (!invitePhone.trim() || !inviteName.trim()) {
      setInviteError('Numéro et nom sont obligatoires.');
      return;
    }
    setInviteError(null);
    setIsInviting(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!apiUrl || !session) throw new Error('not_ready');

      const res = await fetch(`${apiUrl}/agents/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ phone: invitePhone.trim(), fullName: inviteName.trim(), role: inviteRole }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Erreur serveur');

      setTempPassword(body.temp_password);
      setInvitePhone('');
      setInviteName('');
      await fetchAgents();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erreur lors de l\'invitation.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleToggleActive = async (agent: Agent) => {
    const action = agent.is_active ? 'désactiver' : 'réactiver';
    Alert.alert(
      `${agent.is_active ? 'Désactiver' : 'Réactiver'} l'agent`,
      `Voulez-vous ${action} ${agent.full_name ?? agent.phone} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: agent.is_active ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const apiUrl = process.env.EXPO_PUBLIC_API_URL;
              const { data: { session } } = await supabase.auth.getSession();
              if (!apiUrl || !session) return;
              await fetch(`${apiUrl}/agents/${agent.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ is_active: !agent.is_active }),
              });
              await fetchAgents();
            } catch { /* silencieux */ }
          },
        },
      ],
    );
  };

  const handleDelete = async (agent: Agent) => {
    Alert.alert(
      'Supprimer l\'agent',
      `Supprimer définitivement ${agent.full_name ?? agent.phone} ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const apiUrl = process.env.EXPO_PUBLIC_API_URL;
              const { data: { session } } = await supabase.auth.getSession();
              if (!apiUrl || !session) return;
              await fetch(`${apiUrl}/agents/${agent.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              await fetchAgents();
            } catch { /* silencieux */ }
          },
        },
      ],
    );
  };

  const isOwner = currentUserRole === 'owner';

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Mon équipe</Text>
        {isOwner && (
          <Pressable style={styles.inviteBtn} onPress={() => { setShowInvite(true); setTempPassword(null); }}>
            <Feather name="user-plus" size={18} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {agents.map((agent) => {
          const isMe = agent.id === currentUserId;
          return (
            <View key={agent.id} style={[styles.agentCard, !agent.is_active && styles.agentCardInactive]}>
              <View style={[styles.avatar, { backgroundColor: agent.role === 'owner' ? '#6366F1' : '#94A3B8' }]}>
                <Feather name={agent.role === 'owner' ? 'shield' : 'user'} size={18} color="#FFFFFF" />
              </View>
              <View style={styles.agentInfo}>
                <View style={styles.agentTopRow}>
                  <Text style={styles.agentName}>{agent.full_name ?? 'Sans nom'}</Text>
                  {isMe && <View style={styles.meBadge}><Text style={styles.meBadgeText}>Moi</Text></View>}
                  <View style={[styles.roleBadge, { backgroundColor: agent.role === 'owner' ? '#EEF2FF' : '#F1F5F9' }]}>
                    <Text style={[styles.roleBadgeText, { color: agent.role === 'owner' ? '#6366F1' : '#64748B' }]}>
                      {agent.role === 'owner' ? 'Propriétaire' : 'Agent'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.agentPhone}>{agent.phone ?? '—'}</Text>
                {!agent.is_active && <Text style={styles.inactiveLabel}>Désactivé</Text>}
              </View>
              {isOwner && !isMe && (
                <View style={styles.actions}>
                  <Pressable onPress={() => handleToggleActive(agent)} style={styles.actionBtn}>
                    <Feather name={agent.is_active ? 'user-x' : 'user-check'} size={16} color={agent.is_active ? '#F59E0B' : '#059669'} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(agent)} style={styles.actionBtn}>
                    <Feather name="trash-2" size={16} color="#DC2626" />
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {agents.length === 0 && (
          <View style={styles.empty}>
            <Feather name="users" size={40} color="#CBD5E1" />
            <Text style={styles.emptyText}>Aucun agent pour l'instant.</Text>
            {isOwner && <Text style={styles.emptySubtext}>Appuyez sur + pour inviter un agent.</Text>}
          </View>
        )}
      </ScrollView>

      {/* Modal invitation */}
      <Modal visible={showInvite} transparent animationType="slide" onRequestClose={() => setShowInvite(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {tempPassword ? 'Agent créé ✅' : 'Inviter un agent'}
              </Text>
              <Pressable onPress={() => setShowInvite(false)}>
                <Feather name="x" size={22} color="#64748B" />
              </Pressable>
            </View>

            {tempPassword ? (
              <View style={styles.passwordBox}>
                <Text style={styles.passwordLabel}>Communiquez ces identifiants à l'agent :</Text>
                <View style={styles.passwordCard}>
                  <Text style={styles.passwordText}>Mot de passe temporaire :</Text>
                  <Text style={styles.passwordValue}>{tempPassword}</Text>
                </View>
                <Text style={styles.passwordHint}>
                  L'agent se connecte avec son numéro de téléphone et ce mot de passe. Il pourra le changer depuis son profil.
                </Text>
                <Pressable style={styles.doneBtn} onPress={() => setShowInvite(false)}>
                  <Text style={styles.doneBtnText}>Terminé</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView>
                <Text style={styles.inputLabel}>Numéro de téléphone *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 76123456"
                  placeholderTextColor="#94A3B8"
                  value={invitePhone}
                  onChangeText={setInvitePhone}
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>Nom complet *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Prénom Nom"
                  placeholderTextColor="#94A3B8"
                  value={inviteName}
                  onChangeText={setInviteName}
                />

                <Text style={styles.inputLabel}>Rôle</Text>
                <View style={styles.roleRow}>
                  {(['agent', 'owner'] as const).map((r) => (
                    <Pressable
                      key={r}
                      style={[styles.roleChip, inviteRole === r && styles.roleChipActive]}
                      onPress={() => setInviteRole(r)}
                    >
                      <Text style={[styles.roleChipText, inviteRole === r && styles.roleChipTextActive]}>
                        {r === 'owner' ? 'Propriétaire' : 'Agent'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {inviteError && <Text style={styles.errorText}>{inviteError}</Text>}

                <Pressable
                  style={[styles.submitBtn, isInviting && styles.submitBtnDisabled]}
                  onPress={handleInvite}
                  disabled={isInviting}
                >
                  {isInviting
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.submitBtnText}>Créer l'agent</Text>
                  }
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#0F172A' },
  inviteBtn: {
    backgroundColor: '#6366F1',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { padding: 16, gap: 10 },

  agentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  agentCardInactive: { opacity: 0.55 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentInfo: { flex: 1, gap: 3 },
  agentTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  agentName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  meBadge: { backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  meBadgeText: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  roleBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeText: { fontSize: 10, fontWeight: '600' },
  agentPhone: { fontSize: 13, color: '#64748B' },
  inactiveLabel: { fontSize: 11, color: '#DC2626', fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 8 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  emptySubtext: { fontSize: 13, color: '#94A3B8' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },

  inputLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  roleChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  roleChipText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  roleChipTextActive: { color: '#FFFFFF' },

  errorText: { color: '#DC2626', fontSize: 13, marginTop: 10 },
  submitBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  // Mot de passe temporaire
  passwordBox: { gap: 14 },
  passwordLabel: { fontSize: 14, color: '#475569' },
  passwordCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  passwordText: { fontSize: 13, color: '#64748B' },
  passwordValue: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: 1 },
  passwordHint: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },
  doneBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  doneBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
