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
  ChatContextValue as SharedChatContextValue,
} from '@myhandymanapp/shared/types/ShopContextTypes';

/**
 * ✅ FIX:
 * Your shared ChatContextValue currently doesn't include setChatPresence,
 * but the app uses it. We extend the shared type locally so TS stops erroring
 * even before you update the shared types package.
 *
 * Later you can (optionally) add these fields to @myhandymanapp/shared/types too.
 */
export type ChatContextValueFixed = SharedChatContextValue & {
  setAppPresence?: (active: boolean) => void;
  setChatPresence: (conversationId: string | null, active: boolean) => void;
  setActiveConversation?: (conversationId: string | null, recipientId: string | null) => void;
};

export const ChatContext = createContext<ChatContextValueFixed | undefined>(undefined);

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
  const activeConversationRef = useRef<string | null>(null);
  const activeRecipientRef = useRef<string | null>(null);

  const dev = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : false;
  const hasAuth = Boolean(token && profile?.id);

  // ———————————————————————————————————————————————
  // Helpers
  // ———————————————————————————————————————————————
  const normalizeMsg = useCallback(
    (m: any): ChatMessage => ({
      id: String(m.id),
      sender: String(m.sender_id ?? m.sender ?? ''),
      sender_name: m.sender_name || '',
      content: m.content,
      unread: Boolean(m.unread),
      timestamp: m.timestamp || m.created_at || new Date().toISOString(),
      meta: m.meta || {},
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
        name: peerName ?? '',
        avatar: peerAvatar ?? '',
        lastMessage: r.last_message ?? '',
        unreadCount: Number(r.unread_count ?? 0),
        messages: Array.isArray(r.messages) ? r.messages.map(normalizeMsg) : [],
        chatStatus: r.chat_status,
        prebookingUsed: r.prebooking_used ?? false,
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
      const res = await axios.get(`${backendUrl}/api/profileActions/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 404,
      });
      if (res.status === 401 || res.status === 404) {
        if (dev) console.debug('[conversations] got', res.status, '→ returning []');
        return [];
      }
      return (res.data?.conversations as RawConversation[]) ?? [];
    },
    {
      enabled: hasAuth,
      refetchOnWindowFocus: false,
      retry: (count, err: any) => {
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
      formatted.every((c, i) => {
        const previous = lastChatsRef.current[i];
        return Boolean(
          previous &&
            c.conversationId === previous.conversationId &&
            c.unreadCount === previous.unreadCount
        );
      });

    if (!same) {
      lastChatsRef.current = formatted;
      setChats(formatted);
    }
    if (total !== lastUnreadRef.current) {
      lastUnreadRef.current = total;
      setUnreadCount(total);
    }
  }, [rawConversations, mapRaw]);

  const fetchConversations = useCallback(async (): Promise<void> => {
    if (!hasAuth) return;
    await rawRefetchConversations();
  }, [rawRefetchConversations, hasAuth]);

  // ———————————————————————————————————————————————
  // Fetch messages (quiet on 401/404)
  // ———————————————————————————————————————————————
  const fetchMessages = useCallback(
    async (recipientId: string, limit = 20, offset = 0) => {
      if (!hasAuth || !recipientId) return;

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
              : { ...c, messages: offset === 0 ? newMsgs : [...c.messages, ...newMsgs] }
          )
        );
      } catch {
        // swallow
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
          const current = prev[idx];
          if (!current) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...current,
            lastMessage: inc.lastMessage,
            unreadCount: current.unreadCount + inc.unreadCount,
            messages: [...current.messages, ...inc.messages],
          };
          return updated;
        }
        return [inc, ...prev];
      });

      setUnreadCount((u) => u + inc.unreadCount);
    });

    socket.on('chatUnlocked', (payload?: { conversationId?: string }) => {
      fetchConversations();
      const activeConversationId = activeConversationRef.current;
      const activeRecipientId = activeRecipientRef.current;

      if (
        payload?.conversationId &&
        activeConversationId &&
        String(payload.conversationId) === String(activeConversationId) &&
        activeRecipientId
      ) {
        fetchMessages(activeRecipientId, 20, 0);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('messageReceived');
      socket.off('chatUnlocked');
      socket.disconnect();
    };
  }, [socket, profile?.id, mapRaw, fetchConversations, fetchMessages]);

  // ———————————————————————————————————————————————
  // Send message (optimistic)
  // ———————————————————————————————————————————————
  const sendMessage = useCallback(
    async (recipientId: string, content: string) => {
      if (!(socket && isSocketReady && profile?.id != null)) {
        return { ok: false, error: 'SOCKET_NOT_READY' };
      }

      const tempId = `temp-${Date.now()}`;
      const temp: ChatMessage = {
        id: tempId,
        sender: String(profile.id),
        sender_name: profile.name || '',
        content,
        unread: false,
        timestamp: new Date().toISOString(),
        meta: {},
      };

      setChats((prev) =>
        prev.map((c) =>
          c.recipientId === recipientId
            ? { ...c, lastMessage: content, messages: [...c.messages, temp] }
            : c
        )
      );

      return new Promise<{ ok: boolean; error?: string; message?: string }>((resolve) => {
        socket.emit(
          'sendMessage',
          { recipientId, content, senderId: profile.id, unread: true },
          (resp?: { status?: string; code?: string; message?: string }) => {
            if (resp?.status === 'error' && resp?.code === 'CHAT_LOCKED') {
              setChats((prev) =>
                prev.map((c) =>
                  c.recipientId === recipientId
                    ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) }
                    : c
                )
              );
              resolve({ ok: false, error: resp.code, message: resp.message });
              return;
            }

            if (resp?.status === 'error') {
              resolve({ ok: false, error: 'SEND_FAILED', message: resp.message });
              return;
            }

            resolve({ ok: true });
          }
        );
      });
    },
    [socket, isSocketReady, profile]
  );

  const sendPrebookingInquiry = useCallback(
    async (payload: {
      tutorProfileId: string;
      topic: string;
      level: string;
      availability: string;
      note?: string;
    }) => {
      if (!hasAuth || !profile?.id) return { ok: false, error: 'UNAUTHORIZED' };

      if (socket && isSocketReady) {
        return new Promise<{ ok: boolean; error?: string; message?: string }>((resolve) => {
          socket.emit(
            'prebookingInquiry',
            { ...payload, senderId: profile.id },
            (resp?: { status?: string; message?: string }) => {
              if (resp?.status === 'success') {
                fetchConversations();
                resolve({ ok: true });
                return;
              }
              resolve({ ok: false, error: 'INQUIRY_FAILED', message: resp?.message });
            }
          );
        });
      }

      try {
        await axios.post(`${backendUrl}/api/profileActions/prebookingInquiry`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        await fetchConversations();
        return { ok: true };
      } catch (err: any) {
        const message = err?.response?.data?.message || 'Failed to send inquiry.';
        return { ok: false, error: 'INQUIRY_FAILED', message };
      }
    },
    [backendUrl, fetchConversations, hasAuth, isSocketReady, profile?.id, socket, token]
  );

  // ✅ App presence (online/offline)
  const setAppPresence = useCallback(
    (active: boolean) => {
      if (!(socket && isSocketReady && profile?.id != null)) return;
      socket.emit('presence:app', { profileId: profile.id, active });
    },
    [socket, isSocketReady, profile?.id]
  );

  /**
   * ✅ Chat presence
   * conversationId may be null (meaning: not viewing any chat)
   */
  const setChatPresence = useCallback(
    (conversationId: string | null, active: boolean) => {
      if (!(socket && isSocketReady && profile?.id != null)) return;
      socket.emit('presence:chat', { profileId: profile.id, conversationId, active });
    },
    [socket, isSocketReady, profile?.id]
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
  const value = useMemo<ChatContextValueFixed>(
    () => ({
      chats,
      unreadCount,
      isSocketReady,
      fetchConversations,
      fetchMessages,
      sendMessage,
      sendPrebookingInquiry,
      markAsRead,

      setActiveConversation: (conversationId: string | null, recipientId: string | null) => {
        activeConversationRef.current = conversationId;
        activeRecipientRef.current = recipientId;
      },

      setAppPresence,
      setChatPresence, // ✅ now guaranteed in type
    }),
    [
      chats,
      unreadCount,
      isSocketReady,
      fetchConversations,
      fetchMessages,
      sendMessage,
      sendPrebookingInquiry,
      markAsRead,
      setAppPresence,
      setChatPresence,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChatContext = (): ChatContextValueFixed => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
};
