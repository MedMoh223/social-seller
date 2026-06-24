import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { ValidationError, NotFoundError, NotImplementedError } from '../lib/httpErrors';
import { createOAuthState } from '../services/oauthStateService';
import { listConnections, disconnectConnection } from '../services/connectionsService';
import { buildFacebookAuthorizationUrl, buildWhatsAppAuthorizationUrl } from '../services/metaGraphClient';
import { buildTikTokAuthorizationUrl } from '../services/tiktokClient';
import { recordAuditLog } from '../services/auditLogService';

export const connectionsRouter = Router();

connectionsRouter.use(requireAuth, authenticatedLimiter);

const platformParamSchema = z.enum(['whatsapp', 'facebook', 'tiktok']);

connectionsRouter.get('/', async (req, res, next) => {
  try {
    const connections = await listConnections(req.user!.tenantId);
    res.status(200).json({ connections });
  } catch (err) {
    next(err);
  }
});

connectionsRouter.post('/:platform/start', async (req, res, next) => {
  const parsedPlatform = platformParamSchema.safeParse(req.params.platform);

  if (!parsedPlatform.success) {
    next(new ValidationError('Plateforme inconnue.'));
    return;
  }

  const platform = parsedPlatform.data;

  // Fail fast with a clear 501 if the channel isn't configured on this
  // deployment, rather than letting the missing-env throw bubble up as
  // an opaque internal_error.
  if ((platform === 'whatsapp' || platform === 'facebook') && !env.META_APP_ID) {
    next(new NotImplementedError('Canal Meta non configuré sur ce serveur.'));
    return;
  }
  if (platform === 'tiktok' && !env.TIKTOK_CLIENT_KEY) {
    next(new NotImplementedError('Canal TikTok non configuré sur ce serveur.'));
    return;
  }

  try {
    const state = await createOAuthState({ tenantId: req.user!.tenantId, userId: req.user!.id, platform });

    let authorizationUrl: string;
    switch (platform) {
      case 'facebook':
        authorizationUrl = buildFacebookAuthorizationUrl(state, `${env.BACKEND_PUBLIC_URL}/oauth/facebook/callback`);
        break;
      case 'whatsapp':
        authorizationUrl = buildWhatsAppAuthorizationUrl(state, `${env.BACKEND_PUBLIC_URL}/oauth/whatsapp/callback`);
        break;
      case 'tiktok':
        authorizationUrl = buildTikTokAuthorizationUrl(state, `${env.BACKEND_PUBLIC_URL}/oauth/tiktok/callback`);
        break;
    }

    res.status(200).json({ authorizationUrl });
  } catch (err) {
    next(err);
  }
});

connectionsRouter.delete('/:id', async (req, res, next) => {
  try {
    const disconnected = await disconnectConnection(req.params.id, req.user!.tenantId);

    if (!disconnected) {
      next(new NotFoundError());
      return;
    }

    await recordAuditLog({
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      action: 'channel_disconnected',
      tableName: 'social_connections',
      recordId: disconnected.id,
      oldValue: { platform: disconnected.platform },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
