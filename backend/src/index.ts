import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

// Catch unhandled rejections/exceptions so the process doesn't crash
// silently — log the error and keep running.
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection — process kept alive');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException — process kept alive');
});

const app = createApp();

app.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, `social-seller-backend listening on port ${env.PORT}`);
});
