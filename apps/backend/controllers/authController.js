// apps/backend/src/controllers/authController.js

import { db, createId, createSession } from '../db/memoryDb.js';

export const register = async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !phone) return res.status(400).json({ message: 'name and phone are required' });

  const s = db();
  const exists = s.users.find((u) => u.phone === phone || (email && u.email === email));
  if (exists) return res.status(409).json({ message: 'User already exists' });

  const user = {
    id: createId('user'),
    name: String(name).trim(),
    email: email ? String(email).trim() : null,
    phone: String(phone).trim(),
    // password hashing intentionally skipped (demo backend)
    createdAt: new Date().toISOString(),
  };

  s.users.push(user);
  const token = createSession(user.id);
  return res.status(201).json({ token, user });
};

export const login = async (req, res) => {
  const { phone, email, password } = req.body || {};
  const s = db();
  const user = s.users.find((u) => (phone && u.phone === phone) || (email && u.email === email)) || null;
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const token = createSession(user.id);
  return res.status(200).json({ token, user });
};

export const requestOtp = async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ message: 'phone is required' });

  // DEV: return OTP directly
  const otp = '123456';
  return res.status(200).json({ ok: true, phone: String(phone), otp });
};

export const verifyOtp = async (req, res) => {
  const { phone, code } = req.body || {};
  if (!phone || !code) return res.status(400).json({ message: 'phone and code are required' });

  // DEV: accept 123456
  if (String(code) !== '123456') return res.status(400).json({ message: 'Invalid OTP' });

  const s = db();
  let user = s.users.find((u) => u.phone === phone) || null;
  if (!user) {
    user = {
      id: createId('user'),
      name: 'Ekazi User',
      email: null,
      phone: String(phone).trim(),
      createdAt: new Date().toISOString(),
    };
    s.users.push(user);
  }

  const token = createSession(user.id);
  return res.status(200).json({ token, user });
};

export const me = async (req, res) => {
  return res.status(200).json({ user: req.user });
};
