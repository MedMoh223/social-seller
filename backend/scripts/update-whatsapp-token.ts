/**
 * Script : mettre à jour le token WhatsApp en base
 * Usage : npx tsx scripts/update-whatsapp-token.ts <NOUVEAU_TOKEN>
 *
 * 1. Va sur Meta Developers → WhatsApp → API Setup
 * 2. Copie le token temporaire
 * 3. Lance ce script avec le token en argument
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { encryptToken } from '../src/lib/tokenCrypto';
import { supabaseAdmin } from '../src/lib/supabaseAdmin';

config({ path: resolve(__dirname, '../.env') });

const PHONE_NUMBER_ID = '1181055695091430';

async function main() {
  const newToken = process.argv[2];
  if (!newToken) {
    console.error('Usage: npx tsx scripts/update-whatsapp-token.ts <TOKEN>');
    process.exit(1);
  }

  const encrypted = encryptToken(newToken);

  const { data, error } = await supabaseAdmin
    .from('social_connections')
    .update({ access_token_enc: encrypted })
    .eq('platform', 'whatsapp')
    .eq('external_account_id', PHONE_NUMBER_ID)
    .is('disconnected_at', null)
    .select('id, display_name')
    .single();

  if (error) {
    console.error('Erreur DB :', error.message);
    process.exit(1);
  }

  console.log(`✅ Token mis à jour pour : ${data.display_name} (id: ${data.id})`);
}

main();
