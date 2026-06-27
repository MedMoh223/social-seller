/**
 * Script autonome — ne charge aucune config du projet.
 * Usage : TOKEN_ENCRYPTION_KEY=<clé> npx tsx scripts/encrypt-token.ts <TOKEN>
 */

import { createCipheriv, randomBytes } from 'node:crypto';

const keyB64 = process.env.TOKEN_ENCRYPTION_KEY;
const token  = process.argv[2];

if (!keyB64) { console.error('Manque TOKEN_ENCRYPTION_KEY=... devant la commande'); process.exit(1); }
if (!token)  { console.error('Usage: TOKEN_ENCRYPTION_KEY=xxx npx tsx scripts/encrypt-token.ts <TOKEN>'); process.exit(1); }

const key        = Buffer.from(keyB64, 'base64');
const iv         = randomBytes(12);
const cipher     = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
const authTag    = cipher.getAuthTag();
const result     = `\\x${Buffer.concat([iv, authTag, ciphertext]).toString('hex')}`;

console.log('\nToken chiffré :\n');
console.log(result);
