import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import type { WithdrawalRequestBody, WithdrawalResponse } from '@mytutorapp/shared/types';
import { requestWithdrawal } from '@mytutorapp/shared/api/payoutApi';
import { useShopContext } from '@mytutorapp/shared/context';

type NotifyType = 'success' | 'error';

export interface UseWithdrawalOptions {
  backendUrl?: string; // optional override
  token?: string; // optional override
  onSuccess?: (data: WithdrawalResponse) => void;
  onError?: (message: string) => void;
  notify?: (message: string, type?: NotifyType) => void; // optional UI notifier
}

/**
 * Platform-agnostic hook for requesting tutor withdrawals.
 * It uses react-query under the hood and accepts optional backendUrl/token overrides,
 * so it works in both web and native. No DOM/Toast dependencies.
 */
export const useWithdrawal = (opts?: UseWithdrawalOptions) => {
  const ctx = useShopContext?.(); // context is shared across apps
  const backendUrl = opts?.backendUrl ?? ctx?.backendUrl ?? '';
  const token = opts?.token ?? ctx?.token ?? '';

  const mutation = useMutation<WithdrawalResponse, Error, WithdrawalRequestBody>({
    mutationFn: async (input) => {
      if (!backendUrl) throw new Error('Missing backendUrl');
      if (!token) throw new Error('Not authenticated');
      return requestWithdrawal(backendUrl, token, input);
    },
    onSuccess: (data) => {
      opts?.notify?.(data.message || 'Withdrawal queued.', 'success');
      opts?.onSuccess?.(data);
    },
    onError: (err: unknown) => {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as any)?.message || err.message
        : (err as Error).message;
      opts?.notify?.(message, 'error');
      opts?.onError?.(message);
    },
  });

  return {
    // Call with { currency: 'USD' | 'KES', amount: number }
    withdraw: mutation.mutate,
    withdrawAsync: mutation.mutateAsync,

    // React-Query state
    isSubmitting: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
};

export default useWithdrawal;
