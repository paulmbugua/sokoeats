// packages/shared/hooks/useAppQuery.ts
import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
  QueryKey,
  QueryFunction,
} from '@tanstack/react-query';

export default function useAppQuery<TQueryFnData, TError = unknown, TData = TQueryFnData>(
  queryKey: QueryKey,
  queryFn: QueryFunction<TQueryFnData, QueryKey>,
  options?: Omit<UseQueryOptions<TQueryFnData, TError, TData, QueryKey>, 'queryKey' | 'queryFn'>
): UseQueryResult<TData, TError> {
  return useQuery<TQueryFnData, TError, TData>({
    queryKey,
    queryFn,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, err: any) => {
      const s = err?.response?.status;
      if (s === 429) return failureCount < 3; // gentle backoff for rate limit
      return failureCount < 1; // otherwise be conservative
    },
    retryDelay: (i) => Math.min(1000 * 2 ** i, 30_000),
    ...options,
  });
}
