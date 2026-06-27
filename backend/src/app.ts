import express from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { publicLimiter, webhookLimiter } from './middleware/rateLimiter';
import { rawBodyParser } from './middleware/rawBody';
import { agentsRouter } from './routes/agents';
import { authRouter } from './routes/auth';
import { connectionsRouter } from './routes/connections';
import { messagesRouter } from './routes/messages';
import { ordersRouter } from './routes/orders';
import { productsRouter } from './routes/products';
import { statsRouter } from './routes/stats';
import { customersRouter } from './routes/customers';
import { tenantRouter } from './routes/tenant';
import { facebookOAuthRouter } from './routes/oauth/facebook';
import { tiktokOAuthRouter } from './routes/oauth/tiktok';
import { whatsappOAuthRouter } from './routes/oauth/whatsapp';
import { facebookWebhookRouter } from './routes/webhooks/facebook';
import { tiktokWebhookRouter } from './routes/webhooks/tiktok';
import { whatsappWebhookRouter } from './routes/webhooks/whatsapp';
import { tokenRefreshRouter } from './routes/internal/tokenRefresh';

export function createApp() {
  const app = express();

  // Railway (and most PaaS) sit behind a reverse proxy that adds
  // X-Forwarded-For. Without this, express-rate-limit throws
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and rate limiting breaks.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(corsMiddleware);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // OAuth bridge page — served after the OAuth provider's callback.
  //
  // Root cause of the Android gray screen: Chrome Custom Tab has no reliable
  // programmatic close API (confirmed by Chrome docs and Steamclock, May 2025).
  // The permanent fix is Android App Links on socialseller.app (domain purchase
  // planned). In the meantime, this page attempts an automatic redirect and
  // provides a visible button so the user is never stuck on a blank screen.
  //
  // Redirect priority:
  //   Android → intent:// via JS (Chrome fires Intent + may close the tab)
  //   iOS     → socialseller:// (ASWebAuthenticationSession intercepts it)
  //   Fallback → visible "Retour" button the user can tap if auto-redirect fails
  app.get('/oauth/redirect', (req, res) => {
    const status   = ['success', 'error'].includes(req.query.status as string) ? req.query.status as string : 'error';
    const platform = String(req.query.platform ?? '');
    const reason   = String(req.query.reason   ?? '');

    const qs = new URLSearchParams({ platform });
    if (reason) qs.set('reason', reason);
    const qsStr = qs.toString();

    const isSuccess = status === 'success';

    // JSON-encoded so values are safely embedded in the inline <script>.
    const customSchemeUrl = JSON.stringify(`socialseller://oauth-${status}?${qsStr}`);
    const intentUri       = JSON.stringify(
      `intent://oauth-${status}?${qsStr}#Intent;scheme=socialseller;package=com.djiguitech.socialseller;end;`,
    );

    const title   = isSuccess ? 'Connexion réussie ✓' : 'Connexion échouée';
    const message = isSuccess
      ? 'Votre canal a été connecté. L\'application va s\'ouvrir automatiquement.'
      : 'La connexion a échoué. Retournez dans l\'application et réessayez.';
    const btnLabel  = isSuccess ? 'Retour à l\'application' : 'Retour à l\'application';
    const accentColor = isSuccess ? '#6366F1' : '#DC2626';
    const iconChar    = isSuccess ? '✓' : '✕';

    res
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .setHeader('Cache-Control', 'no-store')
      .send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
      max-width: 360px;
      width: 100%;
    }
    .icon {
      width: 64px; height: 64px; border-radius: 50%;
      background: ${accentColor}1A;
      color: ${accentColor};
      font-size: 28px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 20px;
    }
    h1 { font-size: 20px; font-weight: 700; color: #0F172A; margin-bottom: 12px; }
    p  { font-size: 14px; color: #64748B; line-height: 1.6; margin-bottom: 28px; }
    a.btn {
      display: block;
      background: ${accentColor};
      color: #fff;
      text-decoration: none;
      padding: 14px 24px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
    }
    .hint { font-size: 12px; color: #94A3B8; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${iconChar}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a class="btn" href="socialseller://oauth-${status}?${qsStr}">${btnLabel}</a>
    <p class="hint">Si l'application ne s'ouvre pas, appuyez sur le bouton ci-dessus.</p>
  </div>
  <script>
    // Attempt automatic redirect. If Chrome Custom Tab handles intent://
    // natively the tab closes. If not, the user sees the button above.
    var isAndroid = /Android/i.test(navigator.userAgent);
    var target = isAndroid ? ${intentUri} : ${customSchemeUrl};
    // Small delay so the page renders before navigation (improves perceived UX
    // on devices where the automatic redirect does work and the page flashes).
    setTimeout(function () { window.location.replace(target); }, 300);
  </script>
</body>
</html>`);
  });

  // TikTok domain verification files
  app.get('/tiktokBOBsOsmw9286ObJVbqEnky2uVsM59vBw.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('tiktok-developers-site-verification=BOBsOsmw9286ObJVbqEnky2uVsM59vBw');
  });
  app.get('/tiktok4yECuhBiz6XKkTnxVZRrV3InZHmxDpr0.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('tiktok-developers-site-verification=4yECuhBiz6XKkTnxVZRrV3InZHmxDpr0');
  });

  // Webhook routes: raw-body parsing + a generous rate limit, mounted
  // BEFORE express.json() below — signature verification needs the
  // exact bytes Meta signed, which express.json() would not preserve.
  app.use('/webhooks/whatsapp', rawBodyParser, webhookLimiter, whatsappWebhookRouter);
  app.use('/webhooks/facebook', rawBodyParser, webhookLimiter, facebookWebhookRouter);
  app.use('/webhooks/tiktok', rawBodyParser, webhookLimiter, tiktokWebhookRouter);

  app.use(express.json());

  app.use('/auth', publicLimiter, authRouter);
  app.use('/agents', agentsRouter);
  app.use('/connections', connectionsRouter);
  app.use('/conversations', messagesRouter);
  app.use('/orders', ordersRouter);
  app.use('/products', productsRouter);
  app.use('/stats', statsRouter);
  app.use('/customers', customersRouter);
  app.use('/tenant', tenantRouter);
  app.use('/oauth/facebook', facebookOAuthRouter);
  app.use('/oauth/whatsapp', whatsappOAuthRouter);
  app.use('/oauth/tiktok', tiktokOAuthRouter);
  app.use('/internal/token-refresh', tokenRefreshRouter);

  app.use(errorHandler);

  return app;
}
