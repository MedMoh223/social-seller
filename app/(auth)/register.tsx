import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { COUNTRY_CODE, EMAIL_DOMAIN, PHONE_DIGITS_LENGTH } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

const PASSWORD_MIN_LENGTH = 8;

export default function RegisterScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePhoneChange = (value: string) => {
    setPhoneDigits(value.replace(/[^0-9]/g, '').slice(0, PHONE_DIGITS_LENGTH));
  };

  const handleRegister = async () => {
    setErrorMessage(null);

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage('Veuillez renseigner votre prénom et nom.');
      return;
    }

    if (phoneDigits.length !== PHONE_DIGITS_LENGTH) {
      setErrorMessage('Veuillez renseigner un numéro de téléphone valide.');
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setErrorMessage('Adresse email invalide.');
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setErrorMessage('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Les mots de passe ne correspondent pas.');
      return;
    }

    setIsLoading(true);

    const phone = `${COUNTRY_CODE}${phoneDigits}`;
    // Supabase Auth identity = numéro de téléphone encodé en email.
    // Le vrai email (optionnel) est stocké dans user_metadata pour
    // l'activation email et la récupération de compte future.
    const authEmail = `${phone}${EMAIL_DOMAIN}`;

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone,
          ...(emailTrimmed ? { email: emailTrimmed } : {}),
        },
      },
    });

    if (error) {
      setIsLoading(false);
      if (error.message.toLowerCase().includes('already registered')) {
        setErrorMessage('Ce numéro est déjà associé à un compte.');
        return;
      }
      setErrorMessage(error.message);
      return;
    }

    // Auto-confirmation : le faux email phone-based ne peut pas recevoir
    // d'email Supabase. On confirme immédiatement via le backend.
    if (signUpData.user?.id) {
      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        const secret = process.env.EXPO_PUBLIC_CONFIRM_SECRET;
        if (apiUrl && secret) {
          await fetch(`${apiUrl}/auth/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: signUpData.user.id, secret }),
          });
        }
      } catch {
        // Non-bloquant — l'écran d'activation permet de réessayer.
      }
    }

    setIsLoading(false);

    router.replace({
      pathname: '/(auth)/activation',
      params: { phone, userEmail: emailTrimmed },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.logo}>
          <Text style={styles.logoIcon}>⚡</Text>
        </LinearGradient>

        <Text style={styles.title}>Créer mon compte</Text>
        <Text style={styles.subtitle}>Rejoignez Social Seller et centralisez vos ventes</Text>

        <View style={styles.nameRow}>
          <View style={[styles.field, styles.nameField]}>
            <Text style={styles.label}>PRÉNOM</Text>
            <TextInput
              style={styles.textInput}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Aminata"
              placeholderTextColor="#94A3B8"
            />
          </View>
          <View style={[styles.field, styles.nameField]}>
            <Text style={styles.label}>NOM</Text>
            <TextInput
              style={styles.textInput}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Diallo"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>

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

        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>ADRESSE EMAIL</Text>
            <Text style={styles.optional}>optionnel</Text>
          </View>
          <TextInput
            style={styles.textInput}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="aminata@example.com"
            placeholderTextColor="#94A3B8"
          />
          <Text style={styles.fieldHint}>Pour activer votre compte par email si WhatsApp n&apos;est pas disponible</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>MOT DE PASSE</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!isPasswordVisible}
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
            />
            <Pressable onPress={() => setIsPasswordVisible((v) => !v)} hitSlop={8}>
              <Feather name={isPasswordVisible ? 'eye-off' : 'eye'} size={20} color="#64748B" />
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>CONFIRMER LE MOT DE PASSE</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!isConfirmPasswordVisible}
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
            />
            <Pressable onPress={() => setIsConfirmPasswordVisible((v) => !v)} hitSlop={8}>
              <Feather name={isConfirmPasswordVisible ? 'eye-off' : 'eye'} size={20} color="#64748B" />
            </Pressable>
          </View>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Créer mon compte</Text>
          )}
        </Pressable>

        <Pressable style={styles.bottomLink} onPress={() => router.back()}>
          <Text style={styles.bottomLinkText}>
            Déjà un compte ? <Text style={styles.bottomLinkAccent}>Se connecter</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoIcon: { fontSize: 20 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 4, marginBottom: 32 },
  nameRow: { flexDirection: 'row', gap: 12 },
  nameField: { flex: 1 },
  field: { marginBottom: 20 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  optional: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  fieldHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
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
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  bottomLink: { alignSelf: 'center', marginTop: 24 },
  bottomLinkText: { fontSize: 13, color: '#64748B' },
  bottomLinkAccent: { fontWeight: '600', color: '#6366F1' },
});
