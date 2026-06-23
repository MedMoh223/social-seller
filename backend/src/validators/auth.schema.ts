import { z } from 'zod';

// E.164-ish: leading +, 8-15 digits — matches COUNTRY_CODE/PHONE_DIGITS_LENGTH
// composition on the mobile side (lib/constants.ts in the Expo app).
export const whatsappActivationSchema = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, 'Numéro de téléphone invalide.'),
});
