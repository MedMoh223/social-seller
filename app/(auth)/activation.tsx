import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COUNTRY_CODE, PHONE_DIGITS_LENGTH } from '../../lib/constants';

const RESEND_DELAY_SECONDS = 58;

const ACTIVATION_STEPS = [
  'Ouvrez WhatsApp sur votre téléphone',
  'Trouvez le message de Social Seller',
  "Appuyez sur le lien d'activation",
];

const formatPhoneDigits = (digits: string) => digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();

export default function ActivationScreen() {
  const router = useRouter();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_DELAY_SECONDS);

  useEffect(() => {
    if (!isSent) return;

    const timer = setInterval(() => {
      setSecondsLeft((value) => (value > 0 ? value - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isSent]);

  const handlePhoneChange = (value: string) => {
    setPhoneDigits(value.replace(/[^0-9]/g, '').slice(0, PHONE_DIGITS_LENGTH));
  };

  const handleSendLink = async () => {
    setErrorMessage(null);

    if (phoneDigits.length !== PHONE_DIGITS_LENGTH) {
      setErrorMessage('Veuillez renseigner un numéro valide.');
      return;
    }

    const apiUrl = process.env.EXPO_PUBLIC_API_URL;

    if (!apiUrl) {
      setErrorMessage('Service temporairement indisponible.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/auth/whatsapp-activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `${COUNTRY_CODE}${phoneDigits}` }),
      });

      if (!response.ok) {
        throw new Error('send_failed');
      }

      setIsSent(true);
      setSecondsLeft(RESEND_DELAY_SECONDS);
    } catch {
      setErrorMessage("Impossible d'envoyer le lien. Réessayez plus tard.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>← Retour</Text>
        </Pressable>

        <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={styles.icon}>
          <Text style={styles.iconEmoji}>📲</Text>
        </LinearGradient>

        <Text style={styles.title}>Vérifiez WhatsApp</Text>
        <Text style={styles.subtitle}>
          Entrez votre numéro pour recevoir votre lien d&apos;activation sur WhatsApp
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>NUMÉRO DE TÉLÉPHONE</Text>
          <View style={styles.phoneRow}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>{COUNTRY_CODE} 🇲🇱</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              value={phoneDigits}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              placeholder="76123456"
              placeholderTextColor="#94A3B8"
              maxLength={PHONE_DIGITS_LENGTH}
            />
          </View>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
          onPress={handleSendLink}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Envoyer le lien</Text>
          )}
        </Pressable>

        {isSent ? (
          <>
            <Text style={styles.sentConfirmation}>
              Lien envoyé au{' '}
              <Text style={styles.sentConfirmationBold}>
                {COUNTRY_CODE} {formatPhoneDigits(phoneDigits)}
              </Text>
            </Text>

            <View style={styles.stepsCard}>
              {ACTIVATION_STEPS.map((step, index) => (
                <View key={step} style={styles.stepRow}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            <View style={styles.resendRow}>
              {secondsLeft > 0 ? (
                <Text style={styles.resendText}>Pas reçu ? Renvoyer dans {secondsLeft}s</Text>
              ) : (
                <Pressable onPress={handleSendLink} disabled={isLoading}>
                  <Text style={styles.resendLink}>Pas reçu ? Renvoyer</Text>
                </Pressable>
              )}
            </View>
          </>
        ) : null}

        <Pressable
          style={styles.skipButton}
          onPress={() => router.push('/(auth)/profile-setup')}
        >
          <Text style={styles.skipButtonText}>Configurer WhatsApp plus tard →</Text>
          <Text style={styles.skipButtonHint}>Vous pourrez le connecter depuis l'onglet Canaux</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    padding: 24,
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
    marginBottom: 32,
  },
  field: { marginBottom: 20 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  countryCode: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  countryCodeText: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  sentConfirmation: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 20,
  },
  sentConfirmationBold: { fontWeight: '700', color: '#0F172A' },
  stepsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    padding: 18,
    marginTop: 20,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 14, color: '#0F172A' },
  resendRow: { alignItems: 'center', marginTop: 20 },
  resendText: { fontSize: 13, color: '#64748B' },
  resendLink: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  skipButton: { alignSelf: 'center', marginTop: 24, alignItems: 'center' },
  skipButtonText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  skipButtonHint: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
});
