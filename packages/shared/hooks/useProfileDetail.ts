// packages/shared/hooks/useProfileDetail.ts
import axios, { AxiosError } from 'axios';
import { useState, useCallback } from 'react';
import useAppQuery from './useAppQuery';
import { useShopContext, useChatContext } from '@mytutorapp/shared/context';
import { getTutorProfile } from '@mytutorapp/shared/api/profileDetailApi';
import type { Pricing, TutorProfile } from '@mytutorapp/shared/types';
import type { ChatMessage } from '@mytutorapp/shared/types/ShopContextTypes';

/* ----------------------------- Types ---------------------------------- */

export type Notifier = {
  success?: (msg: string) => void;
  error?: (msg: string) => void;
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
};

export type UseProfileDetailOptions = {
  notify?: Notifier;
};

interface RawTutorProfile {
  id: string | number;
  user?: string;
  user_id?: string;
  name: string;
  pricing: Pricing;
  category?: string;
  gallery?: string[];
  video?: string;
  role?: string;
  status?: string;
  certified?: boolean;
  lastOnline?: string;
  description?: {
    bio?: string;
    expertise?: string[];
    teachingStyle?: string[];
  };
  recommended?: RawTutorProfile[];
  languages?: string[];
  rating?: number;
  totalReviews?: number;

  // optional extras we may receive
  school_grade?: string | null;
  schoolGrade?: string | null;
  country?: string | null;
  country_code?: string | null;
}

type TutorWithExtras =
  | (TutorProfile & {
      school_grade?: string | null;
      schoolGrade?: string | null;
      country?: string | null;
    })
  | null;

type CreateSessionParams = {
  action: 'createSession';
  tutorId: string;
  tutorName: string;
  subject: string;
  pricing: Pricing;
};

type NavigateFn = (screen: string, params?: CreateSessionParams) => void;

/* ----------------------------- Hook ----------------------------------- */

export default function useProfileDetail(
  tutorId: string,
  backendUrl: string,
  options?: UseProfileDetailOptions
) {
  const { token, profile: myProfile } = useShopContext();
  const { sendMessage, chats } = useChatContext(); // ✅ only here
  const notify = {
    success: options?.notify?.success ?? ((m: string) => console.log(`[success] ${m}`)),
    error: options?.notify?.error ?? ((m: string) => console.error(`[error] ${m}`)),
    info: options?.notify?.info ?? ((m: string) => console.log(`[info] ${m}`)),
    warn: options?.notify?.warn ?? ((m: string) => console.warn(`[warn] ${m}`)),
  };

  const [showChat, setShowChat] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { data: tutorProfile = null, isLoading: loading } = useAppQuery<TutorWithExtras, Error>(
    ['tutorProfile', tutorId],
    async () => {
      if (!tutorId) return null;
      const base = backendUrl.replace(/\/$/, '');
      let raw: RawTutorProfile;

      try {
        raw = (await getTutorProfile(base, token || '', tutorId)) as RawTutorProfile;
      } catch (err) {
        const ae = err as AxiosError;
        if (ae.response?.status === 404) {
          const url = `${base}/api/profile/${tutorId}`;
          try {
            const resp = await axios.get<RawTutorProfile>(url, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
              timeout: 10000,
              validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
            });
            if (resp.status === 404) {
              notify.error('Tutor profile not found.');
              return null;
            }
            raw = resp.data;
          } catch {
            notify.error('Tutor profile not found.');
            return null;
          }
        } else if (ae.response?.status === 401) {
          notify.error('Unauthorized – please log in again.');
          return null;
        } else {
          console.error('[useProfileDetail] fetch error', ae);
          notify.error('Failed to load profile.');
          return null;
        }
      }

      const userId = raw.user ?? raw.user_id;
      if (!userId) {
        console.error('[useProfileDetail] missing user field', raw);
        notify.error('Incomplete profile data from server.');
        return null;
      }

      const recommended: TutorProfile[] = (raw.recommended ?? []).map((r) => {
        const ru = r.user ?? r.user_id;
        return {
          id: String(r.id),
          user: String(ru),
          name: r.name,
          pricing: r.pricing,
          category: r.category,
          gallery: r.gallery ?? [],
          video: r.video,
          role: r.role,
          status: r.status,
          certified: r.certified ?? false,
          lastOnline: r.lastOnline,
          description: r.description,
          recommended: [],
          languages: r.languages ?? [],
          rating: r.rating ?? 0,
          totalReviews: r.totalReviews ?? 0,
        };
      });

      const school_grade = raw.school_grade ?? raw.schoolGrade ?? null;
      const country = raw.country ?? raw.country_code ?? null;

      return {
        id: String(raw.id),
        user: String(userId),
        name: raw.name,
        pricing: raw.pricing,
        category: raw.category,
        gallery: raw.gallery ?? [],
        video: raw.video,
        role: raw.role,
        status: raw.status,
        certified: raw.certified ?? false,
        lastOnline: raw.lastOnline,
        description: raw.description,
        recommended,
        languages: raw.languages ?? [],
        rating: raw.rating ?? 0,
        totalReviews: raw.totalReviews ?? 0,
        school_grade,
        country,
      };
    },
    { enabled: !!tutorId, refetchOnWindowFocus: false, retry: false }
  );

  const toggleChat = useCallback(() => setShowChat((v) => !v), []);

  const handleCreateSession = useCallback(
    (navigateFn: NavigateFn) => {
      if (!tutorProfile) return;
      const { user: tutorUserId, name, pricing, category } = tutorProfile;
      if (!tutorUserId || !name || !pricing) {
        notify.error('Incomplete profile data.');
        return;
      }
      navigateFn('Account', {
        action: 'createSession',
        tutorId: tutorUserId,
        tutorName: name,
        subject: category ?? '',
        pricing,
      });
    },
    [tutorProfile] // notify is stable enough for this use
  );

  const handleSendMessage = useCallback(async () => {
    if (!token) {
      notify.error('You need to be logged in to send messages.');
      return;
    }
    if (!newMessage.trim() || !tutorProfile) {
      notify.error("Message can't be empty.");
      return;
    }
    await sendMessage(tutorProfile.id, newMessage.trim());
    setNewMessage('');
    setShowChat(false);
    notify.success('Message sent.');
  }, [newMessage, sendMessage, tutorProfile, token]);

  const chatMessages: ChatMessage[] =
    chats.find((c) => String(c.recipientId) === String(tutorProfile?.id))?.messages ?? [];

  const handleImageClick = useCallback((img: string) => setSelectedImage(img), []);
  const closeModal = useCallback(() => setSelectedImage(null), []);

  return {
    tutorProfile,
    loading,
    showChat,
    newMessage,
    setNewMessage,
    toggleChat,
    handleCreateSession,
    handleSendMessage,
    chatMessages,
    selectedImage,
    handleImageClick,
    closeModal,
    myProfile,
  };
}
