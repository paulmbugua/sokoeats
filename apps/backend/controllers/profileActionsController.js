import pool from '../config/db.js';
import { notifyEvent } from '../services/notificationEvents.js';
import {
  canChatUnlocked,
  getRoles,
  resolveStudentTutor,
  syncConversationLock,
} from '../services/chatGatingService.js';
import { emitToProfile } from '../services/socketService.js';

// Add to Favorites
export const addToFavorites = async (req, res) => {
  try {
    const { profileId } = req.body;
    const userId = req.user.id; // using user_id for favorites here

    // Check if profile exists (profileId is already a profile id)
    const profile = await pool.query('SELECT * FROM profiles WHERE id = $1', [
      profileId,
    ]);
    if (profile.rows.length === 0) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    // Insert into favorites (assumes a separate favorites table with appropriate constraints)
    await pool.query(
      'INSERT INTO favorites (user_id, profile_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, profileId],
    );

    res.status(200).json({ message: 'Profile added to favorites' });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).json({ message: 'Failed to add to favorites', error });
  }
};

// Send Message (no socket emits here)
// Send Message (with push)
export const sendMessage = async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    const authSenderId = req.user.id;

    if (!authSenderId || !recipientId || !content) {
      return res
        .status(400)
        .json({ message: 'Sender ID, recipient ID, and content are required' });
    }

    // Lookup sender profile id + name (we’ll use name for notification title)
    const senderProfileResult = await pool.query(
      'SELECT id, name FROM profiles WHERE user_id = $1',
      [authSenderId],
    );
    if (senderProfileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sender profile not found.' });
    }

    const senderProfileId = senderProfileResult.rows[0].id;
    const senderName = senderProfileResult.rows[0].name || 'New message';

    // recipientId is already a profile id
    const recipientProfileId = recipientId;

    const rolesMap = await getRoles(senderProfileId, recipientProfileId);
    const { studentProfileId, tutorProfileId } = resolveStudentTutor(
      senderProfileId,
      recipientProfileId,
      rolesMap,
      recipientProfileId,
    );
    const senderIsStudent =
      String(senderProfileId) === String(studentProfileId);

    const unlocked = await canChatUnlocked(
      studentProfileId,
      tutorProfileId,
    );
    if (!unlocked && senderIsStudent) {
      return res.status(403).json({
        error: 'CHAT_LOCKED',
        message: 'Book a session to message this tutor.',
      });
    }

    // Upsert conversation
    let conversation = await pool.query(
      `SELECT id FROM conversations 
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)`,
      [senderProfileId, recipientProfileId],
    );

    let conversationId;
    if (conversation.rows.length === 0) {
      const newConv = await pool.query(
        `INSERT INTO conversations (sender_id, recipient_id, unread_count, chat_status) 
         VALUES ($1, $2, 1, $3) 
         RETURNING id`,
        [senderProfileId, recipientProfileId, unlocked ? 'unlocked' : 'locked'],
      );
      conversationId = newConv.rows[0].id;
    } else {
      conversationId = conversation.rows[0].id;
      await pool.query(
        `UPDATE conversations 
         SET unread_count = unread_count + 1, updated_at = NOW() 
         WHERE id = $1 AND recipient_id = $2`,
        [conversationId, recipientProfileId],
      );
    }

    await syncConversationLock(
      conversationId,
      studentProfileId,
      tutorProfileId,
    );

    // Insert message
    const messageResult = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [conversationId, senderProfileId, content],
    );

    // Touch updated_at
    await pool.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId],
    );

    // ✅ PUSH (chat throttling + presence aware)
    void notifyEvent(
      'CHAT_MESSAGE',
      String(recipientProfileId),
      {
        senderName,
        preview: String(content).slice(0, 140),
        senderProfileId,
        recipientProfileId,
        conversationId,
      },
      { recipientProfileId: String(recipientProfileId) },
    ).catch((e) => console.error('[push] chat notify failed', e));

    res.status(201).json({
      message: 'Message sent successfully',
      data: messageResult.rows[0],
    });
  } catch (error) {
    console.error('Failed to send message:', error);
    res.status(500).json({ message: 'Failed to send message', error });
  }
};

export const prebookingInquiry = async (req, res) => {
  try {
    const authSenderId = req.user.id;
    const { tutorProfileId, topic, level, availability, note } = req.body;

    if (!authSenderId || !tutorProfileId || !topic || !level || !availability) {
      return res.status(400).json({
        message:
          'Tutor profile ID, topic, level, and availability are required.',
      });
    }

    const senderProfileResult = await pool.query(
      'SELECT id, name FROM profiles WHERE user_id = $1',
      [authSenderId],
    );
    if (senderProfileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sender profile not found.' });
    }
    const senderProfileId = senderProfileResult.rows[0].id;
    const senderName = senderProfileResult.rows[0].name || 'Student';

    const tutorProfileResult = await pool.query(
      'SELECT id FROM profiles WHERE id = $1',
      [tutorProfileId],
    );
    if (tutorProfileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tutor profile not found.' });
    }

    const rolesMap = await getRoles(senderProfileId, tutorProfileId);
    const senderRole = rolesMap[String(senderProfileId)]?.role ?? null;
    if (senderRole && senderRole !== 'student') {
      return res.status(403).json({
        message: 'Only students can send prebooking inquiries.',
      });
    }

    const { studentProfileId, tutorProfileId: resolvedTutorProfileId } =
      resolveStudentTutor(
        senderProfileId,
        tutorProfileId,
        rolesMap,
        tutorProfileId,
      );

    const unlocked = await canChatUnlocked(
      studentProfileId,
      resolvedTutorProfileId,
    );
    if (unlocked) {
      return res.status(400).json({ message: 'Already unlocked.' });
    }

    const conversationResult = await pool.query(
      `SELECT id, prebooking_used FROM conversations
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)
       LIMIT 1`,
      [senderProfileId, resolvedTutorProfileId],
    );

    let conversationId = conversationResult.rows[0]?.id;
    const prebookingUsed = conversationResult.rows[0]?.prebooking_used;

    if (prebookingUsed) {
      return res.status(400).json({ message: 'Inquiry already used.' });
    }

    if (!conversationId) {
      const newConversation = await pool.query(
        `INSERT INTO conversations 
          (sender_id, recipient_id, unread_count, chat_status, prebooking_used, prebooking_at)
         VALUES ($1, $2, 1, 'locked', true, NOW())
         RETURNING id`,
        [senderProfileId, resolvedTutorProfileId],
      );
      conversationId = newConversation.rows[0].id;
    } else {
      await pool.query(
        `UPDATE conversations
         SET prebooking_used = true,
             prebooking_at = NOW(),
             chat_status = 'locked',
             unread_count = unread_count + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [conversationId],
      );
    }

    const contentParts = [
      `Inquiry: ${topic}`,
      `Level: ${level}`,
      `Availability: ${availability}`,
    ];
    if (note) contentParts.push(`Note: ${note}`);
    const content = contentParts.join(' | ');

    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, meta)
       VALUES ($1, $2, $3, $4)`,
      [
        conversationId,
        senderProfileId,
        content,
        {
          type: 'prebooking_inquiry',
          topic,
          level,
          availability,
          note: note ?? '',
        },
      ],
    );

    emitToProfile(resolvedTutorProfileId, 'messageReceived', {
      recipientId: String(resolvedTutorProfileId),
      content,
      senderId: String(senderProfileId),
      senderName: null,
      unread: true,
      conversationId: String(conversationId),
      meta: {
        type: 'prebooking_inquiry',
        topic,
        level,
        availability,
        note: note ?? '',
      },
    });

    emitToProfile(senderProfileId, 'messageReceived', {
      recipientId: String(resolvedTutorProfileId),
      content,
      senderId: String(senderProfileId),
      senderName: 'You',
      unread: false,
      conversationId: String(conversationId),
      meta: {
        type: 'prebooking_inquiry',
        topic,
        level,
        availability,
        note: note ?? '',
      },
    });

    void notifyEvent(
      'INQUIRY_SENT',
      String(resolvedTutorProfileId),
      {
        studentProfileId: senderProfileId,
        studentName: senderName,
        topic,
        level,
        conversationId,
      },
      { recipientProfileId: String(resolvedTutorProfileId) },
    ).catch((e) => console.error('[push] inquiry notify failed', e));

    res.status(200).json({ ok: true, conversationId });
  } catch (error) {
    console.error('Failed to send prebooking inquiry:', error);
    res.status(500).json({ message: 'Failed to send prebooking inquiry.' });
  }
};

// Get Conversations with Pagination
export const getConversations = async (req, res) => {
  const authUserId = req.user.id;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = parseInt(req.query.offset, 10) || 0;

  try {
    // Convert authenticated user_id to profile id
    const profileResult = await pool.query(
      'SELECT id FROM profiles WHERE user_id = $1',
      [authUserId],
    );
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profile not found.' });
    }
    const profileId = profileResult.rows[0].id;

    // Fetch conversations for this profile id
    const conversations = await pool.query(
      `SELECT 
          c.id, 
          c.sender_id,
          c.recipient_id,
          c.chat_status,
          c.prebooking_used,
          p1.name AS sender_name,
          p1.gallery[1] AS sender_avatar,
          p2.name AS recipient_name,
          p2.gallery[1] AS recipient_avatar,
          COALESCE(
            (SELECT json_agg(m ORDER BY m.created_at ASC) 
             FROM messages m 
             WHERE m.conversation_id = c.id), 
            '[]'::json
          ) AS messages,
          (SELECT content FROM messages WHERE conversation_id = c.id 
           ORDER BY created_at DESC LIMIT 1) AS last_message,
          (SELECT COUNT(*) FROM messages 
           WHERE conversation_id = c.id 
             AND unread = TRUE 
             AND sender_id != $1) AS unread_count
       FROM conversations c
       JOIN profiles p1 ON c.sender_id = p1.id
       JOIN profiles p2 ON c.recipient_id = p2.id
       WHERE c.sender_id = $1 OR c.recipient_id = $1
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [profileId, limit, offset],
    );

    console.log('Fetched conversations:', conversations.rows);
    res.status(200).json({ conversations: conversations.rows });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ message: 'Failed to load conversations.' });
  }
};

// Get Messages within a Conversation
export const getMessages = async (req, res) => {
  const { recipientId } = req.params; // recipient's profile id is provided now
  const authUserId = req.user.id; // sender's user_id
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = parseInt(req.query.offset, 10) || 0;

  try {
    // Convert sender's user_id to sender's profile id
    const senderProfileResult = await pool.query(
      'SELECT id FROM profiles WHERE user_id = $1',
      [authUserId],
    );
    if (senderProfileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sender profile not found.' });
    }
    const senderProfileId = senderProfileResult.rows[0].id;
    // recipientId is already a profile id
    const recipientProfileId = recipientId;

    const conversationResult = await pool.query(
      `SELECT id FROM conversations 
       WHERE (sender_id = $1 AND recipient_id = $2) 
          OR (sender_id = $2 AND recipient_id = $1)
       LIMIT 1`,
      [senderProfileId, recipientProfileId],
    );
    const conversationId = conversationResult.rows[0]?.id;
    if (!conversationId) {
      return res.status(200).json({ messages: [] });
    }

    const rolesMap = await getRoles(senderProfileId, recipientProfileId);
    const senderRole = rolesMap[String(senderProfileId)]?.role ?? null;
    const recipientRole = rolesMap[String(recipientProfileId)]?.role ?? null;

    let studentProfileId = null;
    let tutorProfileId = null;

    if (
      (senderRole === 'student' && recipientRole === 'tutor') ||
      (senderRole === 'tutor' && recipientRole === 'student')
    ) {
      const resolved = resolveStudentTutor(
        senderProfileId,
        recipientProfileId,
        rolesMap,
      );
      studentProfileId = resolved.studentProfileId;
      tutorProfileId = resolved.tutorProfileId;
    } else if (senderRole === 'student') {
      studentProfileId = senderProfileId;
      tutorProfileId = recipientProfileId;
    } else if (senderRole === 'tutor') {
      tutorProfileId = senderProfileId;
      studentProfileId = recipientProfileId;
    } else if (recipientRole === 'student') {
      studentProfileId = recipientProfileId;
      tutorProfileId = senderProfileId;
    } else if (recipientRole === 'tutor') {
      tutorProfileId = recipientProfileId;
      studentProfileId = senderProfileId;
    } else {
      tutorProfileId = senderProfileId;
      studentProfileId = recipientProfileId;
    }

    const { chatStatus } = await syncConversationLock(
      conversationId,
      studentProfileId,
      tutorProfileId,
    );

    const messages = await pool.query(
      `SELECT * FROM messages 
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset],
    );

    let rows = messages.rows;
    const viewerIsStudent =
      String(senderProfileId) === String(studentProfileId);
    if (chatStatus === 'locked' && viewerIsStudent) {
      rows = rows.filter(
        (m) => String(m.sender_id) === String(studentProfileId),
      );
      rows.push({
        id: 'system-locked',
        sender_id: 'system',
        content: 'Book a session to view tutor replies.',
        unread: false,
        meta: { type: 'system_locked_notice' },
        created_at: new Date().toISOString(),
      });
    }

    console.log(
      'Fetched messages for conversation with recipientProfileId ' +
        recipientProfileId +
        ':',
      rows,
    );
    res.status(200).json({ messages: rows });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to retrieve messages.' });
  }
};

// Mark Messages as Read
export const markAsRead = async (req, res) => {
  const { recipientId } = req.params; // recipient's profile id
  const authUserId = req.user.id; // sender's user_id (authenticated user)

  try {
    // Convert sender's user_id to sender's profile id
    const senderProfileResult = await pool.query(
      'SELECT id FROM profiles WHERE user_id = $1',
      [authUserId],
    );
    if (senderProfileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sender profile not found.' });
    }
    const senderProfileId = senderProfileResult.rows[0].id;
    // recipientId is already a profile id
    const recipientProfileId = recipientId;

    // Update messages: mark all messages in this conversation sent by the recipient as read.
    // Using IN to handle the possibility of multiple conversation IDs.
    await pool.query(
      `UPDATE messages 
       SET unread = FALSE 
       WHERE conversation_id IN (
         SELECT id FROM conversations 
         WHERE (sender_id = $1 AND recipient_id = $2) 
            OR (sender_id = $2 AND recipient_id = $1)
       )
       AND sender_id = $2 AND unread = TRUE`,
      [senderProfileId, recipientProfileId],
    );

    res.status(200).json({ message: 'Messages marked as read.' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Failed to mark messages as read.' });
  }
};

// Delete a Specific Message
export const deleteMessage = async (req, res) => {
  const { messageId } = req.params; // messageId is provided
  const authUserId = req.user.id;

  try {
    const senderProfileResult = await pool.query(
      'SELECT id FROM profiles WHERE user_id = $1',
      [authUserId],
    );
    if (senderProfileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profile not found.' });
    }
    const senderProfileId = senderProfileResult.rows[0].id;
    // Delete the message if the sender matches
    const result = await pool.query(
      `DELETE FROM messages 
       WHERE id = $1 AND sender_id = $2 RETURNING *`,
      [messageId, senderProfileId],
    );

    if (result.rows.length === 0) {
      return res
        .status(403)
        .json({ message: 'You can only delete your own messages.' });
    }

    res.status(200).json({ message: 'Message deleted successfully.' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Failed to delete message.' });
  }
};

// Delete an Entire Conversation
export const deleteConversation = async (req, res) => {
  const { conversationId } = req.params;
  const authUserId = req.user.id;

  try {
    const profileResult = await pool.query(
      'SELECT id FROM profiles WHERE user_id = $1',
      [authUserId],
    );
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Profile not found.' });
    }
    const profileId = profileResult.rows[0].id;
    const conversation = await pool.query(
      `SELECT * FROM conversations 
       WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
      [conversationId, profileId],
    );

    if (conversation.rows.length === 0) {
      return res.status(403).json({
        message: 'You can only delete conversations you are part of.',
      });
    }

    await pool.query('DELETE FROM conversations WHERE id = $1', [
      conversationId,
    ]);

    res.status(200).json({ message: 'Conversation deleted successfully.' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ message: 'Failed to delete conversation.' });
  }
};
