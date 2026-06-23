import pino from 'pino';
import { env } from '../config/env';

// Redact anything that could carry a secret/token, however it's nested,
// so a stray `logger.info({ req, connection })` can't leak a credential —
// satisfies "pas de console.log avec des données sensibles en production".
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      '*.access_token',
      '*.access_token_enc',
      '*.refresh_token',
      '*.refresh_token_enc',
      '*.authorization',
      '*.Authorization',
      '*.app_secret',
      '*.client_secret',
      '*.token',
      'req.headers.authorization',
    ],
    censor: '[redacted]',
  },
});
