import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const RESEND_DELAY_SECONDS = 58;

type Channel = 'whatsapp' | 'email';

const STEPS: Record<Channel, string[]> = {
  whatsapp: [
    'Ouvrez WhatsApp sur votre téléphone',
    'Trouvez le message de Social Seller',
    "Appuyez sur le lien d'activation",
  ],
  email: [
    'Ouvrez votre boîte mail',
    'Trouvez le message de Social Seller',
    "Appuyez sur le lien d'activation",
  ],
};

export default function ActivationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phone, userEmail } = useLocalSearchParams<{ phone?: string; userEmail?: string }>();
  const email = userEmail;

  const hasEmail = Boolean(email?.trim());
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [isSent, setIsSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_DELAY_SECONDS);
  const [resendTick, setResendTick] = useState(0);

  // Countdown — redémarre à chaque envoi
  useEffect(() => {
    if (!isSent) return;
    setSecondsLeft(RESEND_DELAY_SECONDS);
    const timer = setInterval(() => {
      setSecondsLeft((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isSent, resendTick]);

  const handleSend = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      if (channel === 'whatsapp') {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!apiUrl) throw new Error('api_unavailable');

        const response = await fetch(`${apiUrl}/auth/whatsapp-activation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });

        if (!response.ok) throw new Error('send_failed');
      }
      if (channel === 'email') {
        // L'envoi email nécessite Resend (disponible après achat socialseller.app).
        // Le compte est déjà activé automatiquement — l'email est informatif uniquement.
        setErrorMessage("L'envoi par email sera disponible prochainement. Votre compte est déjà actif, connectez-vous directement.");
        setIsLoading(false);
        return;
      }

      setIsSent(true);
      setResendTick((t) => t + 1);
    } catch {
      setErrorMessage("Impossible d'envoyer le lien. Réessayez plus tard.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = () => {
    setResendTick((t) => t + 1);
    handleSend();
  };

  const steps = STEPS[channel];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>← Retour</Text>
        </Pressable>

        <LinearGradient
          colors={channel === 'whatsapp' ? ['#ECFDF5', '#D1FAE5'] : ['#EEF2FF', '#E0E7FF']}
          style={styles.icon}
        >
          <Text style={styles.iconEmoji}>{channel === 'whatsapp' ? '📲' : '✉️'}</Text>
        </LinearGradient>

        <Text style={styles.title}>Activer mon compte</Text>
        <Text style={styles.subtitle}>
          Choisissez comment recevoir votre lien d&apos;activation
        </Text>

        {/* Sélecteur de canal */}
        <View style={styles.channelRow}>
          <Pressable
            style={[styles.channelTab, channel === 'whatsapp' && styles.channelTabActive]}
            onPress={() => { setChannel('whatsapp'); setIsSent(false); setErrorMessage(null); }}
          >
            <Text style={[styles.channelTabText, channel === 'whatsapp' && styles.channelTabTextActive]}>
              💬 WhatsApp
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.channelTab,
              channel === 'email' && styles.channelTabActive,
              !hasEmail && styles.channelTabDisabled,
            ]}
            onPress={() => {
              if (!hasEmail) return;
              setChannel('email');
              setIsSent(false);
              setErrorMessage(null);
            }}
            disabled={!hasEmail}
          >
            <Text style={[
              styles.channelTabText,
              channel === 'email' && styles.channelTabTextActive,
              !hasEmail && styles.channelTabTextDisabled,
            ]}>
              📧 Email
            </Text>
          </Pressable>
        </View>

        {!hasEmail && (
          <Text style={styles.emailHint}>
            Ajoutez un email à l&apos;inscription pour activer cette option
          </Text>
        )}

        {/* Destination */}
        <View style={styles.destinationCard}>
          <Text style={styles.destinationLabel}>
            {channel === 'whatsapp' ? 'Numéro WhatsApp' : 'Adresse email'}
          </Text>
          <Text style={styles.destinationValue}>
            {channel === 'whatsapp' ? (phone ?? '—') : (email ?? '—')}
          </Text>
        </View>

        {/* Bouton d'envoi */}
        {!isSent ? (
          <Pressable
            style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>Envoyer le lien</Text>
            )}
          </Pressable>
        ) : (
          <>
            {/* Étapes */}
            <View style={styles.stepsCard}>
              {steps.map((step, index) => (
                <View
                  key={step}
                  style={[styles.stepRow, index < steps.length - 1 && styles.stepRowBorder]}
                >
                  <View style={[styles.stepBadge, channel === 'email' && styles.stepBadgeEmail]}>
                    <Text style={styles.stepBadgeText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Renvoi */}
            <View style={styles.resendRow}>
              {secondsLeft > 0 ? (
                <Text style={styles.resendText}>Pas reçu ? Renvoyer dans {secondsLeft}s</Text>
              ) : isLoading ? (
                <ActivityIndicator color="#6366F1" />
              ) : (
                <Pressable onPress={handleResend}>
                  <Text style={styles.resendLink}>Pas reçu ? Renvoyer</Text>
                </Pressable>
              )}
            </View>
          </>
        )}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {/* Passer + Se connecter */}
        <View style={styles.footer}>
          <Pressable
            style={styles.skipButton}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.skipButtonText}>Activer plus tard →</Text>
            <Text style={styles.skipButtonHint}>Vous pourrez le faire depuis les Paramètres</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 24, // base — override dynamique via contentContainerStyle
    backgroundColor: '#F8FAFC',
  },
  backLink: { alignSelf: 'flex-start', marginBottom: 24 },
  backLinkText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  icon: {
    width: 86,
    height: 86,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  iconEmoji: { fontSize: 38 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  channelRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  channelTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  channelTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  channelTabDisabled: { opacity: 0.4 },
  channelTabText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  channelTabTextActive: { color: '#0F172A' },
  channelTabTextDisabled: { color: '#94A3B8' },
  emailHint: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  destinationCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    marginTop: 8,
  },
  destinationLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 4 },
  destinationValue: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  sendButton: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  sendButtonDisabled: { opacity: 0.7 },
  sendButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  stepsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    padding: 4,
    marginBottom: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  stepRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepBadgeEmail: { backgroundColor: '#6366F1' },
  stepBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 14, color: '#0F172A' },
  resendRow: { alignItems: 'center', marginBottom: 20, minHeight: 20 },
  resendText: { fontSize: 13, color: '#94A3B8' },
  resendLink: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  footer: { marginTop: 8 },
  skipButton: { alignSelf: 'center', alignItems: 'center' },
  skipButtonText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  skipButtonHint: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
});
