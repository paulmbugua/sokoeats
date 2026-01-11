// apps/backend/middleware/anyAuthOptional.js
import anyAuth from './anyAuth.js';

function hasAnyAuthSignal(req) {
  const h = req.headers || {};
  return Boolean(h.authorization || h.Authorization) || Boolean(req.query?.token);
}

function anyAuthOptional(req, res, next) {
  if (!hasAnyAuthSignal(req)) return next(); // public access
  return anyAuth(req, res, next);            // validate token and set req.user
}

export default anyAuthOptional;
export { anyAuthOptional };
