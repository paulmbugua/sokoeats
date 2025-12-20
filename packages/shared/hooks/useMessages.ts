// packages/shared/hooks/useMessages.ts
import { useState, useEffect, useRef } from 'react';
import { useShopContext, useChatContext } from '@mytutorapp/shared/context';
import type { Conversation } from '@mytutorapp/shared/types/ShopContextTypes';

/* ---------- Optional, platform-supplied notifier ---------- */
export type Notifier = {
  success?: (m: string) => void;
  error?: (m: string) => void;
  info?: (m: string) => void;
  warn?: (m: string) => void;
};
export type UseMessagesOptions = { notify?: Notifier };

const NOOP_NOTIFY: Required<Notifier> = {
  success: (m) => console.log('[success]', m),
  error: (m) => console.error('[error]', m),
  info: (m) => console.log('[info]', m),
  warn: (m) => console.warn('[warn]', m),
};

/* ---------- Cross-platform event + ref shapes ---------- */
type ScrollEventLike =
  | { nativeEvent: { contentOffset: { y: number } } } // RN
  | { target?: { scrollTop?: number } } // web-ish
  | { currentTarget?: { scrollTop?: number } }; // web-ish

type ScrollableRef =
  | { scrollToEnd?: (opts?: { animated?: boolean }) => void } // RN
  | { scrollTop?: number; scrollHeight?: number } // HTML element-ish
  | null;

const useMessages = (options?: UseMessagesOptions) => {
  const notify = { ...NOOP_NOTIFY, ...(options?.notify ?? {}) };

  // 1) Auth + profile
  const { token, profile: myProfile } = useShopContext();

  // 2) Chat methods & data
  const { fetchConversations, fetchMessages, chats, markAsRead, sendMessage } = useChatContext();

  // 3) UI state
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [messageOffset, setMessageOffset] = useState(0);
  const messagesLimit = 20;

  // StrictMode guard to avoid double fetch in dev
  const fetchedOnce = useRef(false);

  // 4) Scrolling helper
  const messageContainerRef = useRef<ScrollableRef>(null);
  const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
  const scrollToBottom = () => {
    const ref = messageContainerRef.current as any;
    if (!ref) return;
    if (isWeb && typeof ref.scrollHeight === 'number') {
      // HTML-like element
      ref.scrollTop = ref.scrollHeight;
    } else {
      // React Native-like
      ref.scrollToEnd?.({ animated: true });
    }
  };

  // 5) Initial load
  useEffect(() => {
    if (!token) return;
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    fetchConversations();
  }, [token, fetchConversations]);

  // 6) Sync activeChat when `chats` changes
  useEffect(() => {
    if (!activeChat) return;
    const updated = chats.find((c) => c.conversationId === activeChat.conversationId);
    if (updated) setActiveChat(updated);
  }, [chats, activeChat]);

  // 7) Auto-scroll on new messages
  useEffect(() => {
    if (activeChat?.messages?.length) {
      scrollToBottom();
    }
  }, [activeChat?.messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // 8) Open a thread
  const openChat = async (chat: Conversation) => {
    setActiveChat(chat);
    setMessageOffset(0);

    await fetchMessages(chat.recipientId, messagesLimit, 0);
    setSidebarOpen(false);

    // mark unread as read (only those not sent by me)
    if (chat.messages.some((m) => m.unread && String(m.sender) !== String(myProfile?.id))) {
      await markAsRead(chat.recipientId);
      await fetchConversations();
    }
  };

  // 9) Load more on scroll
  const loadMoreMessages = () => {
    if (!activeChat) return;
    const newOffset = messageOffset + messagesLimit;
    fetchMessages(activeChat.recipientId, messagesLimit, newOffset);
    setMessageOffset(newOffset);
  };

  const handleScroll = (e: ScrollEventLike) => {
    if (isWeb) {
      const el =
        (messageContainerRef.current as any) || (e as any).target || (e as any).currentTarget;
      const top = el?.scrollTop ?? 0;
      if (typeof top === 'number' && top < 100) loadMoreMessages();
    } else {
      const y = (e as any)?.nativeEvent?.contentOffset?.y ?? 9999;
      if (y < 100) loadMoreMessages();
    }
  };

  // 10) Send a message
  const handleSendMessage = async () => {
    if (!token) {
      notify.error('You need to be logged in to send messages.');
      return;
    }
    if (!activeChat || !newMessage.trim()) {
      notify.error("Message can't be empty.");
      return;
    }
    await sendMessage(activeChat.recipientId, newMessage.trim());
    setNewMessage('');
    setTimeout(scrollToBottom, 100);
    notify.success('Message sent.');
  };

  return {
    activeChat,
    setActiveChat,
    newMessage,
    setNewMessage,
    isSidebarOpen,
    setSidebarOpen,
    messageOffset,
    messageContainerRef,
    handleScroll,
    handleSendMessage,
    openChat,
    loadMoreMessages,
    chats,
    myProfile,
  };
};

export default useMessages;
