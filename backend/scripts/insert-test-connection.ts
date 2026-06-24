/**
 * Script de test — insère manuellement la connexion WhatsApp de test dans Supabase.
 * Usage : TOKEN_ENCRYPTION_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/insert-test-connection.ts <ACCESS_TOKEN>
 *
 * ACCESS_TOKEN : le token temporaire 24h depuis Meta Developers → WhatsApp → API Setup
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptToken(plaintext: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `\\x${Buffer.concat([iv, authTag, ciphertext]).toString('hex')}`;
}

async function main() {
  const accessToken = process.argv[2];
  if (!accessToken) {
    console.error('Usage: npx tsx scripts/insert-test-connection.ts <ACCESS_TOKEN>');
    process.exit(1);
  }

  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!encKey || !supabaseUrl || !serviceRoleKey) {
    console.error('Variables manquantes : TOKEN_ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const encrypted = encryptToken(accessToken, encKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // tenant_id et user_id du compte de test
  const TENANT_ID = '924974ee-5b36-4d12-8623-2257276f2659';
  const USER_ID   = '1c3f1d5e-cce4-486e-b8f1-3e3d3db6c83d';
  const WABA_ID   = '1902185230458376';
  const PHONE_ID  = '1181055695091430';

  // Supprime une éventuelle connexion existante (non déconnectée) pour éviter le conflit d'unicité
  await supabase
    .from('social_connections')
    .update({ disconnected_at: new Date().toISOString() })
    .eq('tenant_id', TENANT_ID)
    .eq('platform', 'whatsapp')
    .is('disconnected_at', null);

  const { data, error } = await supabase
    .from('social_connections')
    .insert({
      tenant_id: TENANT_ID,
      connected_by: USER_ID,
      platform: 'whatsapp',
      status: 'active',
      external_account_id: PHONE_ID,
      waba_id: WABA_ID,
      display_name: 'WhatsApp Test (+1 555 671 3431)',
      access_token_enc: encrypted,
      metadata: {
        phone_number_id: PHONE_ID,
        display_phone_number: '+1 555 671 3431',
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('❌ Erreur insertion :', error.message);
    process.exit(1);
  }

  console.log('✅ Connexion WhatsApp insérée — id:', data.id);
}

main();
