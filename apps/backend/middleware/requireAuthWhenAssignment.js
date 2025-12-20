// requireAuthWhenAssignment.js
import requireAuth from './auth.js';

export default function requireAuthWhenAssignment(req, res, next) {
  // accept in body, query, or header for safety
  const a =
    req.body?.assignmentId ||
    req.query?.assignmentId ||
    req.get('x-assignment-id');

  if (!a) return next(); // self-serve flow → no auth required here
  return requireAuth(req, res, next);
}
