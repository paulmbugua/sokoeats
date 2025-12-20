// packages/shared/hooks/useNavbar.ts

import { useState } from 'react';
import useAppQuery from './useAppQuery';
import { fetchTutorProfiles } from '@mytutorapp/shared/api';
import { fetchAllVideos } from '@mytutorapp/shared/api/classVaultApi';
import { useShopContext, useChatContext } from '@mytutorapp/shared/context';
import type { Profile, RecordedVideo } from '@mytutorapp/shared/types';

export interface UseNavbarOptions {
  onLogout?: () => void;
  onLogoClick?: () => void;
}

const FIVE_MINUTES = 1000 * 60 * 5;

const useNavbar = (options?: UseNavbarOptions) => {
  // Local UI state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showAlert, setShowAlert] = useState<boolean>(false);

  // Context
  const { token, logout, backendUrl, language, toggleLanguage } = useShopContext();
  const { unreadCount } = useChatContext();
  const unreadMessagesCount = unreadCount;

  // 1) Tutor suggestions — cache for 5m, no retry on 429
  const {
    data: tutorSuggestions = [],
    isLoading: loadingTutors,
    error: tutorsError,
  } = useAppQuery<Profile[], Error>(
    ['tutorSuggestions', backendUrl],
    () => fetchTutorProfiles(backendUrl),
    {
      enabled: Boolean(token),
      staleTime: FIVE_MINUTES,
      retry: (failureCount, error) => {
        // Don’t retry if it’s a 429
        return (error as any)?.response?.status !== 429 && failureCount < 2;
      },
    }
  );
  if (tutorsError) console.error('Error fetching tutors', tutorsError);

  // 2) Video suggestions — same caching and retry logic
  const {
    data: videoSuggestions = [],
    isLoading: loadingVideos,
    error: videosError,
  } = useAppQuery<RecordedVideo[], Error>(
    ['videoSuggestions', backendUrl],
    () => fetchAllVideos(backendUrl),
    {
      enabled: Boolean(token),
      staleTime: FIVE_MINUTES,
      retry: (failureCount, error) => {
        return (error as any)?.response?.status !== 429 && failureCount < 2;
      },
    }
  );
  if (videosError) console.error('Error fetching videos', videosError);

  // Handlers
  const handleSearch = () => searchTerm;
  const handleLogout = () => {
    logout();
    options?.onLogout?.();
  };
  const handleLogoClick = () => {
    setSearchTerm('');
    options?.onLogoClick?.();
  };
  const handleSettingsClick = () => setShowAlert(false);

  return {
    token,
    searchTerm,
    setSearchTerm,
    showAlert,
    unreadMessagesCount,
    language,
    toggleLanguage,
    handleSearch,
    handleLogout,
    handleLogoClick,
    handleSettingsClick,
    tutorSuggestions,
    videoSuggestions,
    loadingTutors,
    loadingVideos,
  };
};

export default useNavbar;
