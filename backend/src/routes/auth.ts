import { Router } from 'express';
import { whatsappActivationSchema } from '../validators/auth.schema';
import { ValidationError } from '../lib/httpErrors';
import { logger } from '../lib/logger';

export const authRouter = Router();

// Sends a WhatsApp activation link to a prospective merchant ahead of
// them having a tenant — this is Social Seller's own platform-level
// transactional message (its own WABA + approved template), distinct
// from the per-tenant social_connections channels US-06/07/08 build
// (those connect a merchant's *own* account once they already have a
// tenant). Actually sending the template message needs Social Seller's
// production WABA, which doesn't exist yet — this validates and rate-
// limits the request so the Sprint 1 activation.tsx flow has a real
// endpoint to call; wire in metaGraphClient.sendTemplateMessage() here
// once that WABA is provisioned.
authRouter.post('/whatsapp-activation', (req, res, next) => {
  const parseResult = whatsappActivationSchema.safeParse(req.body);

  if (!parseResult.success) {
    next(new ValidationError('Numéro de téléphone invalide.'));
    return;
  }

  logger.info('whatsapp activation requested');

  res.status(200).json({ status: 'sent' });
});
