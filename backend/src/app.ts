import express from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { publicLimiter, webhookLimiter } from './middleware/rateLimiter';
import { rawBodyParser } from './middleware/rawBody';
import { authRouter } from './routes/auth';
import { connectionsRouter } from './routes/connections';
import { facebookOAuthRouter } from './routes/oauth/facebook';
import { tiktokOAuthRouter } from './routes/oauth/tiktok';
import { whatsappOAuthRouter } from './routes/oauth/whatsapp';
import { facebookWebhookRouter } from './routes/webhooks/facebook';
import { tiktokWebhookRouter } from './routes/webhooks/tiktok';
import { whatsappWebhookRouter } from './routes/webhooks/whatsapp';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(corsMiddleware);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // TikTok domain verification file
  app.get('/tiktokBOBsOsmw9286ObJVbqEnky2uVsM59vBw.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('tiktok-developers-site-verification=BOBsOsmw9286ObJVbqEnky2uVsM59vBw');
  });

  // Webhook routes: raw-body parsing + a generous rate limit, mounted
  // BEFORE express.json() below — signature verification needs the
  // exact bytes Meta signed, which express.json() would not preserve.
  app.use('/webhooks/whatsapp', rawBodyParser, webhookLimiter, whatsappWebhookRouter);
  app.use('/webhooks/facebook', rawBodyParser, webhookLimiter, facebookWebhookRouter);
  app.use('/webhooks/tiktok', rawBodyParser, webhookLimiter, tiktokWebhookRouter);

  app.use(express.json());

  app.use('/auth', publicLimiter, authRouter);
  app.use('/connections', connectionsRouter);
  app.use('/oauth/facebook', facebookOAuthRouter);
  app.use('/oauth/whatsapp', whatsappOAuthRouter);
  app.use('/oauth/tiktok', tiktokOAuthRouter);

  app.use(errorHandler);

  return app;
}
