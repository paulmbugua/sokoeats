const ROLE_ORDER = { student: 0, tutor: 1, admin: 2, superadmin: 3 };

export function requireRole(minRole = 'admin') {
  return (req, res, next) => {
    const role = String(req.adminRole || req.user?.role || '').toLowerCase();
    if (!(minRole in ROLE_ORDER) || !(role in ROLE_ORDER)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (ROLE_ORDER[role] < ROLE_ORDER[minRole]) {
      return res
        .status(403)
        .json({ success: false, message: 'Insufficient role' });
    }
    next();
  };
}
