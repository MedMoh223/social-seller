import { Feather } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const SECTORS = [
  'Textile & Mode',
  'Alimentation',
  'Électronique',
  'Beauté & Cosmétiques',
  'Artisanat',
  'Autre',
];

const COUNTRY_CURRENCY: Record<string, string> = {
  Mali: 'FCFA',
  Sénégal: 'FCFA',
  "Côte d'Ivoire": 'FCFA',
  'Burkina Faso': 'FCFA',
  Guinée: 'FCFA',
  Niger: 'FCFA',
  Bénin: 'FCFA',
  Togo: 'FCFA',
};

const COUNTRIES = Object.keys(COUNTRY_CURRENCY);

type SelectFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function SelectField({ label, placeholder, value, options, onChange }: SelectFieldProps) {
  const openActionSheet = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...options, 'Annuler'], cancelButtonIndex: options.length },
      (buttonIndex) => {
        if (buttonIndex < options.length) {
          onChange(options[buttonIndex]);
        }
      },
    );
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <Pressable style={styles.selectField} onPress={openActionSheet}>
          <Text style={value ? styles.selectValue : styles.selectPlaceholder}>
            {value || placeholder}
          </Text>
          <Feather name="chevron-down" size={18} color="#64748B" />
        </Pressable>
      ) : (
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={value}
            onValueChange={(itemValue) => onChange(itemValue)}
            style={styles.picker}
            mode="dropdown"
            dropdownIconColor="#64748B"
          >
            <Picker.Item label={placeholder} value="" color="#94A3B8" />
            {options.map((option) => (
              <Picker.Item key={option} label={option} value={option} />
            ))}
          </Picker>
        </View>
      )}
    </View>
  );
}

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [sector, setSector] = useState('');
  const [country, setCountry] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currency = country ? COUNTRY_CURRENCY[country] : '';

  const handlePickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Autorisez l’accès à vos photos pour choisir un logo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setLogoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!shopName.trim()) {
      setErrorMessage('Veuillez renseigner le nom de la boutique.');
      return;
    }

    if (!sector) {
      setErrorMessage('Veuillez sélectionner un secteur d’activité.');
      return;
    }

    if (!country) {
      setErrorMessage('Veuillez sélectionner un pays.');
      return;
    }

    setIsLoading(true);

    await supabase.auth.getSession();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      setIsLoading(false);
      setErrorMessage('Impossible de récupérer votre compte. Reconnectez-vous.');
      return;
    }

    let tenant: { id: string };

    try {
      const { data: tenantId, error: insertError } = await supabase.rpc('create_initial_tenant', {
        p_name: shopName.trim(),
        p_country: country,
        p_currency: COUNTRY_CURRENCY[country],
        p_sector: sector,
      });

      if (insertError) throw insertError;

      tenant = { id: tenantId };
    } catch (error) {
      setIsLoading(false);
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer la boutique.');
      return;
    }

    if (logoUri) {
      try {
        const path = `tenants/${tenant.id}/logo.jpg`;
        const response = await fetch(logoUri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('logos')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(path);
          await supabase
            .from('tenants')
            .update({ logo_url: publicUrlData.publicUrl })
            .eq('id', tenant.id);
        }
      } catch {
        // Best-effort: a failed logo upload must not block onboarding.
      }
    }

    // Rafraîchir le JWT pour que le nouveau tenant_id soit propagé
    // dans les requêtes Supabase dès l'entrée dans les onglets.
    await supabase.auth.refreshSession();

    setIsLoading(false);
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.progressTrack}>
          <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.progressFill} />
        </View>

        <Text style={styles.title}>Votre boutique</Text>
        <Text style={styles.subtitle}>Étape 1 de 3 · Configuration du profil</Text>

        <View style={styles.logoSection}>
          <Pressable style={styles.logoUpload} onPress={handlePickLogo}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} />
            ) : (
              <Text style={styles.logoEmoji}>📷</Text>
            )}
          </Pressable>
          <Text style={styles.logoLabel}>LOGO</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informations générales</Text>

          <View style={styles.field}>
            <Text style={styles.label}>NOM DE LA BOUTIQUE *</Text>
            <TextInput
              style={styles.textInput}
              value={shopName}
              onChangeText={setShopName}
              placeholder="Ex : Boutique Aminata"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <SelectField
            label="SECTEUR D'ACTIVITÉ"
            placeholder="Sélectionner..."
            value={sector}
            options={SECTORS}
            onChange={setSector}
          />

          <SelectField
            label="PAYS"
            placeholder="Sélectionner..."
            value={country}
            options={COUNTRIES}
            onChange={setCountry}
          />

          <View style={styles.field}>
            <Text style={styles.label}>DEVISE</Text>
            <View style={[styles.selectField, styles.selectFieldDisabled]}>
              <Text style={currency ? styles.selectValue : styles.selectPlaceholder}>
                {currency || 'Sélectionnez un pays'}
              </Text>
            </View>
          </View>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable onPress={handleSubmit} disabled={isLoading}>
          <LinearGradient
            colors={['#6366F1', '#8B5CF6']}
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Continuer →</Text>
            )}
          </LinearGradient>
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
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    marginBottom: 24,
  },
  progressFill: {
    width: '33%',
    height: '100%',
    borderRadius: 2,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 24 },
  logoSection: { alignItems: 'center', marginBottom: 24 },
  logoUpload: {
    width: 86,
    height: 86,
    borderRadius: 26,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoEmoji: { fontSize: 28 },
  logoImage: { width: '100%', height: '100%' },
  logoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  field: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
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
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectFieldDisabled: { backgroundColor: '#F1F5F9' },
  selectValue: { fontSize: 15, color: '#0F172A' },
  selectPlaceholder: { fontSize: 15, color: '#94A3B8' },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  picker: { color: '#0F172A' },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  submitButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
