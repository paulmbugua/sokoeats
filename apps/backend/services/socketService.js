let ioInstance = null;
const presenceByProfile = new Map();

const nowMs = () => Date.now();

export const setSocketServer = (io) => {
  ioInstance = io;
};

export const getSocketServer = () => ioInstance;

export const emitToProfile = (profileId, event, payload) => {
  if (!ioInstance || !profileId) return;
  ioInstance.to(String(profileId)).emit(event, payload);
};

export const setAppPresence = (profileId, active) => {
  if (!profileId) return;
  const entry = presenceByProfile.get(String(profileId)) || {
    appForeground: false,
    appActiveAt: 0,
    chatConversationId: null,
    chatActiveAt: 0,
  };
  entry.appForeground = Boolean(active);
  entry.appActiveAt = nowMs();
  presenceByProfile.set(String(profileId), entry);
};

export const setChatPresence = (profileId, conversationId, active) => {
  if (!profileId) return;
  const entry = presenceByProfile.get(String(profileId)) || {
    appForeground: false,
    appActiveAt: 0,
    chatConversationId: null,
    chatActiveAt: 0,
  };
  if (active) {
    entry.chatConversationId = conversationId ? String(conversationId) : null;
    entry.chatActiveAt = nowMs();
  } else if (
    conversationId &&
    entry.chatConversationId &&
    String(conversationId) === entry.chatConversationId
  ) {
    entry.chatConversationId = null;
    entry.chatActiveAt = nowMs();
  }
  presenceByProfile.set(String(profileId), entry);
};

export const clearPresence = (profileId) => {
  if (!profileId) return;
  presenceByProfile.delete(String(profileId));
};

export const isChatActive = (profileId, conversationId, windowMs = 30000) => {
  if (!profileId || !conversationId) return false;
  const entry = presenceByProfile.get(String(profileId));
  if (!entry || !entry.chatConversationId) return false;
  if (String(conversationId) !== entry.chatConversationId) return false;
  return nowMs() - entry.chatActiveAt <= windowMs;
};

export const isAppRecentlyActive = (profileId, windowMs = 30000) => {
  if (!profileId) return false;
  const entry = presenceByProfile.get(String(profileId));
  if (!entry) return false;
  if (entry.appForeground) return true;
  return nowMs() - entry.appActiveAt <= windowMs;
};
