import type { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/httpErrors';
import { logger } from '../lib/logger';

// Single last-mile error handler: maps AppError -> {error:{code,message}},
// logs full detail server-side only, and never leaks a stack trace or raw
// error message to the response for anything that isn't a known AppError.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, 'request failed');
    } else {
      logger.warn({ code: err.code, path: req.path }, 'request rejected');
    }

    res.status(err.statusCode).json({ error: { code: err.code, message: err.publicMessage } });
    return;
  }

  logger.error({ err, path: req.path }, 'unexpected error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Une erreur est survenue.' } });
};
