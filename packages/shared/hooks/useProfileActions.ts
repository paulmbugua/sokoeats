// packages/shared/hooks/useProfileActions.ts
import { useShopContext } from '@mytutorapp/shared/context';
import { addToFavorites } from '@mytutorapp/shared/api';
import type { AxiosError } from 'axios';

export type Notifier = {
  success?: (m: string) => void;
  error?: (m: string) => void;
  info?: (m: string) => void;
  warn?: (m: string) => void;
};

export type UseProfileActionsOptions = {
  notify?: Notifier;
};

const NOOP_NOTIFY: Required<Notifier> = {
  success: (m) => console.log('[success]', m),
  error: (m) => console.error('[error]', m),
  info: (m) => console.log('[info]', m),
  warn: (m) => console.warn('[warn]', m),
};

const useProfileActions = (options?: UseProfileActionsOptions) => {
  const notify = { ...NOOP_NOTIFY, ...(options?.notify ?? {}) };
  const { backendUrl, token } = useShopContext();

  const handleAddToFavorites = async (recipientId: string) => {
    if (!backendUrl || !token) {
      notify.error('Please log in first.');
      return;
    }
    try {
      const res = await addToFavorites(backendUrl, token, recipientId);
      const msg = (res?.data as { message?: string } | undefined)?.message || 'Added to favorites';
      notify.success(msg);
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const msg = axiosError.response?.data?.message || 'Failed to add to favorites';
      console.error('Failed to add to favorites:', axiosError);
      notify.error(msg);
    }
  };

  return { handleAddToFavorites };
};

export default useProfileActions;
