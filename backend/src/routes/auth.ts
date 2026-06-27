import { Router } from 'express';
import { z } from 'zod';
import { whatsappActivationSchema } from '../validators/auth.schema';
import { ValidationError, ForbiddenError } from '../lib/httpErrors';
import { logger } from '../lib/logger';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const authRouter = Router();

// ---------------------------------------------------------------------------
// POST /auth/whatsapp-activation
// Sends a WhatsApp activation link to a prospective merchant.
// Stub — wire in metaGraphClient.sendTemplateMessage() once Social Seller's
// own WABA is provisioned.
// ---------------------------------------------------------------------------
authRouter.post('/whatsapp-activation', (req, res, next) => {
  const parseResult = whatsappActivationSchema.safeParse(req.body);

  if (!parseResult.success) {
    next(new ValidationError('Numéro de téléphone invalide.'));
    return;
  }

  logger.info('whatsapp activation requested');

  res.status(200).json({ status: 'sent' });
});

// ---------------------------------------------------------------------------
// POST /auth/confirm
// Auto-confirms a freshly created Supabase Auth account so the user can
// log in immediately without email verification.
//
// Why: Supabase removed the "Confirm email" toggle from the dashboard UI.
// Our users identify with a phone number (encoded as a fake email), so a
// real confirmation email is never deliverable. This endpoint is called by
// register.tsx right after supabase.auth.signUp() and uses the admin API
// to mark the account as confirmed.
//
// Security: protected by INTERNAL_CONFIRM_SECRET — a shared secret that is
// only known to the Expo app (stored in EXPO_PUBLIC_CONFIRM_SECRET env var
// scoped to non-public builds, or passed as a build-time constant). This
// prevents arbitrary actors from confirming random accounts.
// ---------------------------------------------------------------------------
const confirmSchema = z.object({
  userId: z.string().uuid(),
  secret: z.string().min(1),
});

authRouter.post('/confirm', async (req, res, next) => {
  const parsed = confirmSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ValidationError('Requête invalide.'));
    return;
  }

  const expectedSecret = process.env.INTERNAL_CONFIRM_SECRET;

  if (!expectedSecret || parsed.data.secret !== expectedSecret) {
    next(new ForbiddenError('Non autorisé.'));
    return;
  }

  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(parsed.data.userId, {
      email_confirm: true,
    });

    if (error) {
      logger.error({ err: error, userId: parsed.data.userId }, 'auto-confirm failed');
      // Non-bloquant : on renvoie quand même 200 — l'utilisateur pourra
      // s'activer via WhatsApp ou email depuis l'écran d'activation.
      res.status(200).json({ status: 'skipped', reason: error.message });
      return;
    }

    logger.info({ userId: parsed.data.userId }, 'account auto-confirmed');
    res.status(200).json({ status: 'confirmed' });
  } catch (err) {
    logger.error({ err }, 'auto-confirm unexpected error');
    next(err);
  }
});
