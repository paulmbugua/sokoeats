import pool from '../config/db.js';
import { ensureMarketplaceSchema } from '../services/marketplaceStore.js';

function userId(req) {
  const id = Number(req.user?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function messageJson(row, currentUserId) {
  const mine = Number(row.sender_user_id) === Number(currentUserId);
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    sender: mine ? 'user' : 'pro',
    senderUserId: String(row.sender_user_id),
    body: row.body,
    readAt: row.read_at || null,
    createdAt: row.created_at,
  };
}

function conversationJson(row, currentUserId) {
  const current = Number(currentUserId);
  const otherIsHandyman = current === Number(row.client_user_id);
  const otherId = otherIsHandyman ? row.handyman_user_id : row.client_user_id;
  const otherName = otherIsHandyman
    ? row.handyman_business_name || row.handyman_name || 'Ekazi Handyman'
    : row.client_name || 'Client';
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    jobId: String(row.job_id),
    status: row.status,
    participantRole: otherIsHandyman ? 'client' : 'handyman',
    pro: {
      id: String(otherId),
      name: otherName,
      phone: otherIsHandyman ? row.handyman_phone || null : row.client_phone || null,
      role: otherIsHandyman ? 'handyman' : 'client',
    },
    job: {
      serviceName: row.service_name || row.category_name || 'Ekazi job',
      estate: row.estate,
      city: row.city,
      address: row.address,
      status: row.job_status,
    },
    lastMessage: row.last_message || '',
    lastAt: row.last_message_at || row.created_at,
    unreadCount: Number(row.unread_count || 0),
  };
}

async function findConversation(db, conversationId, currentUserId) {
  const { rows } = await db.query(
    `SELECT c.*, j.service_name, j.category_name, j.estate, j.city, j.address, j.status AS job_status,
            cu.name AS client_name, cu.phone AS client_phone,
            hu.name AS handyman_name, hu.phone AS handyman_phone,
            hp.business_name AS handyman_business_name
       FROM ekazi_conversations c
       JOIN ekazi_jobs j ON j.id = c.job_id
       JOIN users cu ON cu.id = c.client_user_id
       JOIN users hu ON hu.id = c.handyman_user_id
       LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = c.handyman_user_id
      WHERE c.id = $1
        AND (c.client_user_id = $2 OR c.handyman_user_id = $2)`,
    [conversationId, currentUserId],
  );
  return rows[0] || null;
}

async function ensureConversationForBooking(db, bookingId, currentUserId) {
  const bookingResult = await db.query(
    `SELECT b.id, b.job_id, b.client_user_id, b.handyman_user_id, b.status
       FROM ekazi_bookings b
      WHERE b.id = $1
        AND (b.client_user_id = $2 OR b.handyman_user_id = $2)`,
    [bookingId, currentUserId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) return null;
  const { rows } = await db.query(
    `INSERT INTO ekazi_conversations (booking_id, job_id, client_user_id, handyman_user_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (booking_id) DO UPDATE SET updated_at = ekazi_conversations.updated_at
     RETURNING id`,
    [booking.id, booking.job_id, booking.client_user_id, booking.handyman_user_id],
  );
  return rows[0];
}

export const listConversations = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const currentUserId = userId(req);
    const { rows } = await pool.query(
      `SELECT c.*, j.service_name, j.category_name, j.estate, j.city, j.address, j.status AS job_status,
              cu.name AS client_name, cu.phone AS client_phone,
              hu.name AS handyman_name, hu.phone AS handyman_phone,
              hp.business_name AS handyman_business_name,
              COUNT(m.id) FILTER (WHERE m.sender_user_id <> $1 AND m.read_at IS NULL) AS unread_count
         FROM ekazi_conversations c
         JOIN ekazi_jobs j ON j.id = c.job_id
         JOIN users cu ON cu.id = c.client_user_id
         JOIN users hu ON hu.id = c.handyman_user_id
         LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = c.handyman_user_id
         LEFT JOIN ekazi_messages m ON m.conversation_id = c.id
        WHERE c.client_user_id = $1 OR c.handyman_user_id = $1
        GROUP BY c.id, j.id, cu.id, hu.id, hp.user_id
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [currentUserId],
    );
    return res.status(200).json({ conversations: rows.map((row) => conversationJson(row, currentUserId)) });
  } catch (error) {
    console.error('listConversations error:', error);
    return res.status(500).json({ message: 'Could not load conversations' });
  }
};

export const getMessages = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const currentUserId = userId(req);
    const conversation = await findConversation(pool, req.params.id, currentUserId);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const { rows } = await pool.query(
      `SELECT id, conversation_id, sender_user_id, body, read_at, created_at
         FROM ekazi_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC, id ASC`,
      [conversation.id],
    );
    await pool.query(
      `UPDATE ekazi_messages SET read_at = NOW()
        WHERE conversation_id = $1 AND sender_user_id <> $2 AND read_at IS NULL`,
      [conversation.id, currentUserId],
    );
    return res.status(200).json({
      conversation: conversationJson(conversation, currentUserId),
      messages: rows.map((row) => messageJson(row, currentUserId)),
    });
  } catch (error) {
    console.error('getMessages error:', error);
    return res.status(500).json({ message: 'Could not load messages' });
  }
};

export const sendMessage = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const currentUserId = userId(req);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Message is required' });
    if (body.length > 1200) return res.status(400).json({ message: 'Message is too long' });

    await client.query('BEGIN');
    const conversation = await findConversation(client, req.params.id, currentUserId);
    if (!conversation) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Conversation not found' });
    }
    if (conversation.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This conversation is closed' });
    }
    const insert = await client.query(
      `INSERT INTO ekazi_messages (conversation_id, sender_user_id, body)
       VALUES ($1,$2,$3)
       RETURNING id, conversation_id, sender_user_id, body, read_at, created_at`,
      [conversation.id, currentUserId, body],
    );
    await client.query(
      `UPDATE ekazi_conversations
          SET last_message = $2, last_message_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [conversation.id, body],
    );
    await client.query('COMMIT');
    return res.status(201).json({ message: messageJson(insert.rows[0], currentUserId) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('sendMessage error:', error);
    return res.status(500).json({ message: 'Message not sent' });
  } finally {
    client.release();
  }
};

export const startConversation = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const currentUserId = userId(req);
    const bookingId = req.body?.bookingId || req.params?.bookingId;
    if (!bookingId) return res.status(400).json({ message: 'bookingId is required' });
    const conversation = await ensureConversationForBooking(pool, bookingId, currentUserId);
    if (!conversation) return res.status(404).json({ message: 'Booking not found' });
    return res.status(201).json({ conversationId: String(conversation.id) });
  } catch (error) {
    console.error('startConversation error:', error);
    return res.status(500).json({ message: 'Could not start conversation' });
  }
};
