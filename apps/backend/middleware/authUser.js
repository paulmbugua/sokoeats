import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ekazi-dev-secret';

const authUser = (req, res, next) => {

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {

    return res.status(401).json({ success: false, message: 'Not authorized' });

  }

  try {

    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

    const subject = String(decoded?.id ?? '').trim();

    if (!/^\d+$/.test(subject) && !subject.startsWith('admin:')) {
      return res.status(401).json({ success: false, message: 'Session must be renewed' });
    }

    req.user = { id: subject };

    next();

  } catch (err) {

    console.error('[auth] JWT error:', err?.message || err);

    return res.status(401).json({ success: false, message: 'Invalid or expired token' });

  }

};

export default authUser;

