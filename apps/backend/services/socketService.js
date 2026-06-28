let io = null;

const appPresence = new Map();
const chatPresence = new Map();

function key(value) {
  return String(value ?? '').trim();
}

function chatKey(profileId, conversationId) {
  return `${key(profileId)}:${key(conversationId)}`;
}

export function setSocketServer(server) {
  io = server;
}

export function getSocketServer() {
  return io;
}

export function setAppPresence(profileId, active = true) {
  const id = key(profileId);
  if (!id) return;
  if (active) {
    appPresence.set(id, Date.now());
  } else {
    appPresence.delete(id);
  }
}

export function setChatPresence(profileId, conversationId, active = true) {
  const id = key(profileId);
  const conversation = key(conversationId);
  if (!id || !conversation) return;

  const presenceKey = chatKey(id, conversation);
  if (active) {
    chatPresence.set(presenceKey, Date.now());
  } else {
    chatPresence.delete(presenceKey);
  }
}

export function clearPresence(profileId) {
  const id = key(profileId);
  if (!id) return;

  appPresence.delete(id);
  for (const presenceKey of chatPresence.keys()) {
    if (presenceKey.startsWith(`${id}:`)) {
      chatPresence.delete(presenceKey);
    }
  }
}

export function isAppRecentlyActive(profileId, windowMs = 30000) {
  const seenAt = appPresence.get(key(profileId));
  return Boolean(seenAt && Date.now() - seenAt <= windowMs);
}

export function isChatActive(profileId, conversationId, windowMs = 30000) {
  const seenAt = chatPresence.get(chatKey(profileId, conversationId));
  return Boolean(seenAt && Date.now() - seenAt <= windowMs);
}
