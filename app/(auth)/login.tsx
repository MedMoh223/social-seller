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

export default function LoginScreen() {
  const router = useRouter();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePhoneChange = (value: string) => {
    setPhoneDigits(value.replace(/[^0-9]/g, '').slice(0, PHONE_DIGITS_LENGTH));
  };

  const handleLogin = async () => {
    setErrorMessage(null);

    if (phoneDigits.length !== PHONE_DIGITS_LENGTH || !password) {
      setErrorMessage('Veuillez renseigner un numéro et un mot de passe valides.');
      return;
    }

    setIsLoading(true);

    const phone = `${COUNTRY_CODE}${phoneDigits}`;

    const { error } = await supabase.auth.signInWithPassword({
      email: `${phone}${EMAIL_DOMAIN}`,
      password,
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.logo}>
          <Text style={styles.logoIcon}>⚡</Text>
        </LinearGradient>

        <Text style={styles.title}>Bon retour 👋</Text>
        <Text style={styles.subtitle}>Connectez-vous pour gérer vos ventes</Text>

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
            <Pressable
              onPress={() => setIsPasswordVisible((visible) => !visible)}
              hitSlop={8}
            >
              <Feather
                name={isPasswordVisible ? 'eye-off' : 'eye'}
                size={20}
                color="#64748B"
              />
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.forgotPasswordLink}>
          <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
        </Pressable>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Se connecter</Text>
          )}
        </Pressable>

        <View style={styles.separatorRow}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>OU</Text>
          <View style={styles.separatorLine} />
        </View>

        <Pressable
          style={styles.whatsappButton}
          onPress={() => router.push('/(auth)/activation')}
        >
          <View style={styles.whatsappCircle}>
            <Text style={styles.whatsappCircleText}>W</Text>
          </View>
          <Text style={styles.whatsappButtonText}>Activer via WhatsApp</Text>
        </Pressable>

        <Pressable style={styles.bottomLink} onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.bottomLinkText}>
            Pas encore de compte ? <Text style={styles.bottomLinkAccent}>S&apos;inscrire</Text>
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
  forgotPasswordLink: { alignSelf: 'flex-end', marginBottom: 24 },
  forgotPasswordText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
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
  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  separatorText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
  },
  whatsappCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  whatsappCircleText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  whatsappButtonText: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  bottomLink: { alignSelf: 'center', marginTop: 24 },
  bottomLinkText: { fontSize: 13, color: '#64748B' },
  bottomLinkAccent: { fontWeight: '600', color: '#6366F1' },
});
