import { env } from '../config/env.js';

/**
 * Centralized error handling middleware.
 * Always returns a consistent JSON structure.
 * Hides internal error details in production.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const isDev = env.nodeEnv !== 'production';

  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : (isDev ? err.message : 'An internal server error occurred.');

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} — ${status}: ${err.message}`);
  if (isDev && err.stack) console.error(err.stack);

  return res.status(status).json({
    success: false,
    message,
    ...(isDev && err.stack ? { stack: err.stack } : {}),
  });
}
