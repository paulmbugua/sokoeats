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
}

/** Single chat message */
export interface ChatMessage {
  id?: string;
  sender: string;
  content: string;
  unread: boolean;
  timestamp?: string;
  sender_name?: string;
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
  messages: ChatMessage[];
}

/** What ShopContext provides (only auth/profile/language) */
export interface ShopContextValue {
  backendUrl: string;
  initializing: boolean;
  token: string;
  userId: string | null;
  language: string; // keep liberal; provider currently uses 'EN' | 'FR'
  setToken: (newToken: string) => Promise<void>;
  toggleLanguage: () => void;
  logout: () => Promise<void>;
  userEmail: string | null;
  tokens: number;
  setTokens: Dispatch<SetStateAction<number>>;
  loadingProfile: boolean;
  profile: Profile | null;
  orgToken: string;
  setOrgToken: (t: string) => Promise<void> | void;
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
  sendMessage: (recipientId: string, content: string) => void;
  markAsRead: (recipientId: string) => void;
}
