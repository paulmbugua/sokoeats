// apps/backend/middleware/optionalAuth.js
import jwt from 'jsonwebtoken';

export default function optionalAuth(req, _res, next) {
  const h = String(req.get('authorization') || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return next();

  try {
    const token = m[1].trim();
    if (!token) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
    // ignore invalid token on public endpoints
  }
  next();
}
