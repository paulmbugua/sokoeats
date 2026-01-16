import React, { createContext, useCallback, useContext,  useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { RefreshControl, ScrollView, FlatList } from 'react-native';
import { queryClient } from '@mytutorapp/shared/utils/queryClient';

type RefreshFn = () => Promise<void> | void;

type Ctx = {
  refreshing: boolean;
  refresh: () => Promise<void>;
  register: (fn: RefreshFn) => () => void; // returns unsubscribe
};

const GlobalRefreshContext = createContext<Ctx | null>(null);

export function GlobalRefreshProvider({ children }: PropsWithChildren) {
  const [refreshing, setRefreshing] = useState(false);
  const subscribers = useRef(new Set<RefreshFn>());

  const register = useCallback<Ctx['register']>((fn) => {
    subscribers.current.add(fn);
    return () => subscribers.current.delete(fn);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 1) Invalidate React Query caches
      await queryClient.invalidateQueries({ predicate: () => true });

      // 2) Run any screen-specific reloads
      const tasks: Promise<any>[] = [];
      subscribers.current.forEach((fn) => {
        try {
          const p = fn();
          if (p && typeof (p as any).then === 'function') tasks.push(p as Promise<any>);
        } catch {
          // ignore individual subscriber errors
        }
      });
      if (tasks.length) await Promise.allSettled(tasks);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const value = useMemo<Ctx>(
    () => ({ refreshing, refresh, register }),
    [refreshing, refresh, register]
  );

  return <GlobalRefreshContext.Provider value={value}>{children}</GlobalRefreshContext.Provider>;
}

export const useGlobalRefresh = () => {
  const ctx = useContext(GlobalRefreshContext);
  if (!ctx) throw new Error('useGlobalRefresh must be used within GlobalRefreshProvider');
  return ctx;
};

/* ---------- Convenience wrappers ---------- */

/** Attach to ScrollView-based screens */
export function withRefreshControlScrollProps() {
  const { refreshing, refresh } = useGlobalRefresh();
  return {
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} />,
  };
}

/** Attach to FlatList/SectionList screens */
export function useListRefreshProps() {
  const { refreshing, refresh } = useGlobalRefresh();
  return { refreshing, onRefresh: refresh };
}

/** Allow a screen to add extra refresh work (e.g., refetch local state) */
export function useRegisterScreenRefresh(fn: RefreshFn | null | undefined) {
  const { register } = useGlobalRefresh();
  useEffect(() => {          // ✅ use named import
    if (!fn) return;
    return register(fn);
  }, [fn, register]);

}
