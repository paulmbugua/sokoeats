// packages/shared/context/ChatContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import debounce from 'lodash.debounce';
import { useShopContext } from './ShopContext';
import useAppQuery from '../hooks/useAppQuery';
import axios from 'axios';
import type { QueryClient } from '@tanstack/react-query';
import type {
  RawConversation,
  Conversation,
  ChatMessage,
  ChatContextValue,
} from '@mytutorapp/shared/types';

export const ChatContext = createContext<ChatContextValue | undefined>(undefined);

type ChatProviderProps = {
  children: ReactNode;
  /** Optional: allows app to inject the same QueryClient instance if desired */
  queryClient?: QueryClient;
};

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const { backendUrl, token, profile } = useShopContext();

  const [chats, setChats] = useState<Conversation[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isSocketReady, setSocketReady] = useState<boolean>(false);

  const dev = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : false;
  const hasAuth = Boolean(token && profile?.id);

  // ———————————————————————————————————————————————
  // Helpers
  // ———————————————————————————————————————————————
  const normalizeMsg = useCallback(
    (m: any): ChatMessage => ({
      id: String(m.id),
      sender: String(m.sender_id),
      sender_name: m.sender_name || '',
      content: m.content,
      unread: Boolean(m.unread),
      timestamp: m.timestamp || new Date().toISOString(),
    }),
    []
  );

  const mapRaw = useCallback(
    (r: RawConversation): Conversation => {
      const me = String(profile?.id);
      const sender = String(r.sender_id);
      const recipient = String(r.recipient_id);
      const amSender = sender === me;

      const peerId = amSender ? recipient : sender;
      const peerName = amSender ? r.recipient_name : r.sender_name;
      const peerAvatar = amSender ? r.recipient_avatar : r.sender_avatar;

      return {
        conversationId: String(r.id),
        recipientId: peerId,
        name: peerName ?? '', // ← fix: ensure string
        avatar: peerAvatar ?? '',
        lastMessage: r.last_message ?? '',
        unreadCount: Number(r.unread_count ?? 0),
        messages: Array.isArray(r.messages) ? r.messages.map(normalizeMsg) : [],
      };
    },
    [normalizeMsg, profile?.id]
  );

  // ———————————————————————————————————————————————
  // Conversations list (quiet on 401/404)
  // ———————————————————————————————————————————————
  const { data: rawConversations = [], refetch: rawRefetchConversations } = useAppQuery<
    RawConversation[],
    Error
  >(
    ['conversations', token, profile?.id],
    async () => {
      // This function only runs when enabled=true (see options below)
      const res = await axios.get(`${backendUrl}/api/profileActions/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
        // Accept 401/404 as non-throwing responses
        validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 404,
      });
      if (res.status === 401 || res.status === 404) {
        if (dev) console.debug('[conversations] got', res.status, '→ returning []');
        return [];
      }
      return (res.data?.conversations as RawConversation[]) ?? [];
    },
    {
      enabled: hasAuth, // ⬅️ no auth, no request (prevents 401 spam)
      refetchOnWindowFocus: false,
      retry: (count, err: any) => {
        // Don’t retry unauthorized/missing endpoints
        const status = err?.response?.status ?? 0;
        if (status === 401 || status === 404) return false;
        return count < 1;
      },
    }
  );

  // Keep state in sync with query data
  const lastChatsRef = useRef<Conversation[]>([]);
  const lastUnreadRef = useRef<number>(0);

  useEffect(() => {
    const formatted = rawConversations.filter((r) => r.sender_id !== r.recipient_id).map(mapRaw);

    const total = formatted.reduce((sum, c) => sum + c.unreadCount, 0);

    const same =
      formatted.length === lastChatsRef.current.length &&
      formatted.every(
        (c, i) =>
          c.conversationId === lastChatsRef.current[i].conversationId &&
          c.unreadCount === lastChatsRef.current[i].unreadCount
      );

    if (!same) {
      lastChatsRef.current = formatted;
      setChats(formatted);
    }
    if (total !== lastUnreadRef.current) {
      lastUnreadRef.current = total;
      setUnreadCount(total);
    }
  }, [rawConversations, mapRaw]);

  // Manual refetch
  const fetchConversations = useCallback(async (): Promise<void> => {
    if (!hasAuth) return; // ⬅️ guard
    await rawRefetchConversations();
  }, [rawRefetchConversations, hasAuth]);

  // ———————————————————————————————————————————————
  // Fetch messages (quiet on 401/404)
  // ———————————————————————————————————————————————
  const fetchMessages = useCallback(
    async (recipientId: string, limit = 20, offset = 0) => {
      if (!hasAuth || !recipientId) return; // ⬅️ guard
      try {
        const res = await axios.get(
          `${backendUrl}/api/profileActions/conversations/${recipientId}/messages`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { limit, offset },
            validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 404,
          }
        );
        if (res.status === 401 || res.status === 404) return;
        const newMsgs = (res.data?.messages as any[])?.map?.(normalizeMsg) ?? [];

        setChats((prev) =>
          prev.map((c) =>
            c.recipientId !== recipientId
              ? c
              : {
                  ...c,
                  messages: offset === 0 ? newMsgs : [...c.messages, ...newMsgs],
                }
          )
        );
      } catch {
        // swallow; UI can stay as-is
      }
    },
    [backendUrl, token, normalizeMsg, hasAuth]
  );

  // ———————————————————————————————————————————————
  // Socket.io
  // ———————————————————————————————————————————————
  const socket: Socket | null = useMemo(() => {
    if (!hasAuth) return null;
    return io(backendUrl, {
      query: { token: token as string },
      transports: ['websocket'],
      autoConnect: false,
    });
  }, [backendUrl, hasAuth, token]);

  useEffect(() => {
    if (!socket || profile?.id == null) return;

    socket.connect();
    socket.on('connect', () => setSocketReady(true));
    socket.on('disconnect', () => setSocketReady(false));
    socket.on('messageReceived', (raw: RawConversation) => {
      const inc = mapRaw(raw);
      setChats((prev) => {
        const idx = prev.findIndex((c) => c.conversationId === inc.conversationId);
        if (idx > -1) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lastMessage: inc.lastMessage,
            unreadCount: updated[idx].unreadCount + inc.unreadCount,
            messages: [...updated[idx].messages, ...inc.messages],
          };
          return updated;
        }
        return [inc, ...prev];
      });
      setUnreadCount((u) => u + inc.unreadCount);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('messageReceived');
      socket.disconnect();
    };
  }, [socket, profile?.id, mapRaw]);

  // ———————————————————————————————————————————————
  // Send message (optimistic)
  // ———————————————————————————————————————————————
  const sendMessage = useCallback(
    (recipientId: string, content: string) => {
      if (!(socket && isSocketReady && profile?.id != null)) return;

      const temp: ChatMessage = {
        id: `temp-${Date.now()}`,
        sender: String(profile.id),
        sender_name: profile.name || '',
        content,
        unread: false,
        timestamp: new Date().toISOString(),
      };
      setChats((prev) =>
        prev.map((c) =>
          c.recipientId === recipientId
            ? {
                ...c,
                lastMessage: content,
                messages: [...c.messages, temp],
              }
            : c
        )
      );

      socket.emit('sendMessage', {
        recipientId,
        content,
        senderId: profile.id,
        unread: true,
      });
    },
    [socket, isSocketReady, profile]
  );

  // ———————————————————————————————————————————————
  // Mark as read (debounced, quiet on 401/404)
  // ———————————————————————————————————————————————
  const markAsRead = useMemo(
    () =>
      debounce(async (recipientId: string) => {
        if (!hasAuth || !recipientId) return;
        try {
          const res = await axios.post(
            `${backendUrl}/api/profileActions/conversations/${recipientId}/markAsRead`,
            null,
            {
              headers: { Authorization: `Bearer ${token}` },
              validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 404,
            }
          );
          if (res.status === 401 || res.status === 404) return;
          await fetchConversations();
        } catch {
          // swallow
        }
      }, 300),
    [backendUrl, token, fetchConversations, hasAuth]
  );

  // ———————————————————————————————————————————————
  // Initial load (guarded + StrictMode-safe)
  // ———————————————————————————————————————————————
  const fetchedOnce = useRef(false);
  useEffect(() => {
    if (!hasAuth) return;
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    fetchConversations();
  }, [hasAuth, fetchConversations]);

  // ———————————————————————————————————————————————
  // Context value
  // ———————————————————————————————————————————————
  const value = useMemo<ChatContextValue>(
    () => ({
      chats,
      unreadCount,
      isSocketReady,
      fetchConversations,
      fetchMessages,
      sendMessage,
      markAsRead,
    }),
    [chats, unreadCount, isSocketReady, fetchConversations, fetchMessages, sendMessage, markAsRead]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChatContext = (): ChatContextValue => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
};
