import { verifyToken } from '../utils/jwt.js';

/**
 * authMiddleware — verifies the JWT Bearer token.
 * On success, attaches decoded user payload to req.user.
 * On failure, returns 401 with a structured error.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token is required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid or malformed token.', code: 'TOKEN_INVALID' });
  }
}

/**
 * adminMiddleware — must follow authMiddleware.
 * Ensures only users with role 'admin' can access protected routes.
 */
export function adminMiddleware(req, res, next) {
  if (!req.user?.role || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.' });
  }
  next();
}
