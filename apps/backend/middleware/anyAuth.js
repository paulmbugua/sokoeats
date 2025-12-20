// apps/backend/middleware/anyAuth.js
import authUser from './authUser.js';
import requireAuth from './auth.js';

// Run an Express middleware "silently"
function runSilently(mw, req) {
  return new Promise((resolve) => {
    let nextCalled = false;
    let errored = false;
    let wrote = false;

    const mockRes = {
      statusCode: 200,
      headers: {},
      locals: {},

      status(code) {
        this.statusCode = code;
        return this;
      },
      set(field, value) {
        this.headers[field] = value;
        return this;
      },
      json(_body) {
        wrote = true;
        return this;
      },
      send(_body) {
        wrote = true;
        return this;
      },
      end(_body) {
        wrote = true;
        return this;
      },
    };

    const next = (err) => {
      if (err) {
        errored = true;
      }
      nextCalled = !err;
      resolve(nextCalled && !errored && !wrote);
    };

    try {
      mw(req, mockRes, next);
    } catch (_e) {
      resolve(false);
    }
  });
}

// helper to normalise query token
function normalizeQueryToken(qVal) {
  if (!qVal) return null;
  if (Array.isArray(qVal)) return String(qVal[0]);
  return String(qVal);
}

export default async function anyAuth(req, res, next) {
  // 🔐 If there is no Authorization header, allow ?token=<jwt> to stand in
  if (!req.headers.authorization && !req.headers.Authorization) {
    const tokenFromQuery = normalizeQueryToken(req.query?.token);
    if (tokenFromQuery) {
      req.headers.authorization = `Bearer ${tokenFromQuery}`;
    }
  }

  // Try regular user auth first
  if (await runSilently(authUser, req)) return next();

  // Then try org auth
  if (await runSilently(requireAuth, req)) return next();

  // Neither accepted → deny
  return res.status(401).json({ message: 'Unauthorized' });
}
