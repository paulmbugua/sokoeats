// apps/backend/src/controllers/messagesController.js

import { db, createId, ensureConversation } from '../db/memoryDb.js';

export const listConversations = async (req, res) => {
  const s = db();
  const convs = s.conversations
    .filter((c) => c.userId === req.user.id)
    .map((c) => {
      const p = s.pros.find((x) => x.id === c.proId);
      return {
        id: c.id,
        pro: p
          ? {
              id: p.id,
              name: p.name,
              avatarUrl: p.avatarUrl || null,
              ratingAvg: p.ratingAvg,
              ratingCount: p.ratingCount,
              verifiedId: Boolean(p.verifiedId),
              backgroundChecked: Boolean(p.backgroundChecked),
              topRated: Boolean(p.topRated),
              jobsCompleted: p.jobsCompleted,
            }
          : { id: c.proId, name: 'Pro' },
        lastMessage: c.lastMessage || '',
        lastAt: c.lastAt,
        unreadCount: c.unreadCount || 0,
      };
    });

  return res.status(200).json({ conversations: convs });
};

export const getMessages = async (req, res) => {
  const id = String(req.params.id);
  const s = db();
  const conv = s.conversations.find((c) => c.id === id && c.userId === req.user.id) || null;
  if (!conv) return res.status(404).json({ message: 'Conversation not found' });

  const messages = s.messages.filter((m) => m.conversationId === conv.id);
  conv.unreadCount = 0;

  return res.status(200).json({ messages });
};

export const sendMessage = async (req, res) => {
  const id = String(req.params.id);
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ message: 'body is required' });

  const s = db();
  const conv = s.conversations.find((c) => c.id === id && c.userId === req.user.id) || null;
  if (!conv) return res.status(404).json({ message: 'Conversation not found' });

  const msg = {
    id: createId('msg'),
    conversationId: conv.id,
    sender: 'user',
    body: String(body),
    createdAt: new Date().toISOString(),
  };

  s.messages.push(msg);
  conv.lastMessage = msg.body;
  conv.lastAt = msg.createdAt;

  return res.status(201).json({ message: msg });
};

// Helper endpoint: start conversation with a pro
export const startConversation = async (req, res) => {
  const { proId } = req.body || {};
  if (!proId) return res.status(400).json({ message: 'proId is required' });

  const conv = ensureConversation(req.user.id, String(proId));
  return res.status(201).json({ conversationId: conv.id });
};
