// /packages/shared/api/messagesApi.ts
import axios from 'axios';

const dev = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : false;

export const fetchConversations = async (backendUrl: string, token: string) => {
  if (!token) return [];
  try {
    const response = await axios.get(`${backendUrl}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 404,
    });
    if (response.status === 401 || response.status === 404) return [];
    if (dev) {
      console.debug(
        '[ChatContext] fetchConversations → response.data.conversations:',
        response.data?.conversations
      );
    }
    return response.data?.conversations ?? [];
  } catch {
    return []; // keep UI quiet; treat failures as no data
  }
};

export const fetchMessages = async (
  backendUrl: string,
  recipientId: string,
  limit: number,
  offset: number,
  token: string
) => {
  if (!token || !recipientId) return [];
  try {
    const response = await axios.get(
      `${backendUrl}/api/messages/${recipientId}?limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 404,
      }
    );
    if (response.status === 401 || response.status === 404) return [];
    return response.data?.messages ?? [];
  } catch {
    return [];
  }
};

export const sendMessage = async (
  backendUrl: string,
  recipientId: string,
  content: string,
  token: string
) => {
  if (!token || !recipientId || !content.trim()) return null;
  const response = await axios.post(
    `${backendUrl}/api/messages`,
    { recipientId, content },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const markAsRead = async (backendUrl: string, recipientId: string, token: string) => {
  if (!token || !recipientId) return null;
  try {
    const response = await axios.post(
      `${backendUrl}/api/messages/mark-read`,
      { recipientId },
      {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 404,
      }
    );
    if (response.status === 401 || response.status === 404) return null;
    return response.data;
  } catch {
    return null;
  }
};
