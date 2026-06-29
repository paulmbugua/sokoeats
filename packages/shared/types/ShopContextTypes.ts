// packages/shared/types/ShopContextTypes.ts
import { Dispatch, SetStateAction } from 'react';

/** All supported user roles across apps */
export type UserRole = 'student' | 'tutor' | 'admin' | 'superadmin' | null;

/** Core user profile metadata */
export interface Profile {
  id: string;
  name: string;
  category: string;
  expertise: string[];
  teachingStyle: string[];
  gallery: string[];
  role?: Exclude<UserRole, null>; // profile records should have a concrete role if present
  email?: string;
  certified?: boolean;
}

/** Single chat message */
export interface ChatMessage {
  id?: string;
  sender: string;
  content: string;
  unread: boolean;
  timestamp?: string;
  sender_name?: string;
  meta?: any;
}

/** One conversation thread */
export interface Conversation {
  conversationId: string;
  recipientId: string;
  name: string;
  lastMessage: string;
  unreadCount: number;
  avatar: string;
  messages: ChatMessage[];
  chatStatus?: 'locked' | 'unlocked';
  prebookingUsed?: boolean;
}

/** Raw shape from your backend */
export interface RawConversation {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  recipient_id: string;
  recipient_name: string;
  recipient_avatar?: string;
  last_message: string;
  unread_count: number;
  chat_status?: 'locked' | 'unlocked';
  prebooking_used?: boolean;
  messages: ChatMessage[];
}

/** What ShopContext provides (only auth/profile/language) */
export interface ShopContextValue {
  backendUrl: string;
  initializing: boolean;
  hydrated: boolean;
  authMode: 'consumer' | 'org' | null;
  accessToken: string | null;
  token: string;
  userId: string | null;
  language: string; // keep liberal; provider currently uses 'EN' | 'FR'
  loginConsumer: (newToken: string, meta?: { userId?: string; email?: string }) => Promise<void>;
  loginOrg: (newToken: string, meta?: { userId?: string; email?: string }) => Promise<void>;
  hydrateAuth: () => Promise<void>;
  toggleLanguage: () => void;
  logout: () => Promise<void>;
  userEmail: string | null;
  userName: string | null;
  userPhone: string | null;
  tokens: number;
  setTokens: Dispatch<SetStateAction<number>>;
  loadingProfile: boolean;
  profile: Profile | null;
  orgToken: string;
  orgLogout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshUserDetails: () => Promise<void>;
  role: UserRole; // <-- now includes admin/superadmin
}

/** What ChatContext provides (only chat/socket pieces) */
export interface ChatContextValue {
  chats: Conversation[];
  unreadCount: number;
  isSocketReady: boolean;
  fetchConversations: () => Promise<void>;
  fetchMessages: (recipientId: string, limit?: number, offset?: number) => Promise<void>;
  sendMessage: (
    recipientId: string,
    content: string
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
  sendPrebookingInquiry: (payload: {
    tutorProfileId: string;
    topic: string;
    level: string;
    availability: string;
    note?: string;
  }) => Promise<{ ok: boolean; error?: string; message?: string }>;
  markAsRead: (recipientId: string) => void;

  // ✅ make optional if some providers/consumers lag behind
  setActiveConversation?: (conversationId: string | null, recipientId: string | null) => void;
  setAppPresence?: (active: boolean) => void;
  setChatPresence?: (conversationId: string | null, active: boolean) => void;
}
