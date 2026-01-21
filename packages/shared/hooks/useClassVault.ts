// packages/shared/hooks/useClassVault.ts

import { useCallback, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import useAppQuery from './useAppQuery';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  fetchAllVideos,
  fetchPurchasedVideoIds,
  purchaseClassVault,
  deleteVideoById,
  fetchVideoById,
  fetchDownloadResources,
  updateVideoById,
  type PurchaseClassVaultResponse,
} from '@mytutorapp/shared/api/classVaultApi';
import type { RecordedVideo } from '@mytutorapp/shared/types';
import type { CreateRecordedVideoPayload } from '@mytutorapp/shared/hooks/useUploadClassVault';

/** split into rows of `size` */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type UpdatePatch = Partial<CreateRecordedVideoPayload>;

export function useClassVault(subjectFilter: string = '', gradeFilter: string = '') {
  const { backendUrl, token, tokens, setTokens } = useShopContext();
  const qc = useQueryClient();

  // 1) Always fetch videos
  const {
    data: videos = [],
    isLoading: loadingVideos,
    error: videosError,
    refetch: refreshVideos,
  } = useAppQuery<RecordedVideo[], Error>(['classVaultVideos'], () => fetchAllVideos(backendUrl), {
    enabled: Boolean(backendUrl),
  });

  // 2) Fetch purchased IDs only if logged in
  const {
    data: purchasedIdsArr = [],
    isLoading: loadingPurchased,
    error: purchasedError,
    refetch: refreshPurchased,
  } = useAppQuery<number[], Error>(
    ['purchasedVideoIds', token],
    () => fetchPurchasedVideoIds(backendUrl, token!),
    { enabled: Boolean(token) }
  );

  const purchasedIds = useMemo<Set<number>>(() => new Set(purchasedIdsArr), [purchasedIdsArr]);

  // Composite loading & error
  const loading = loadingVideos || loadingPurchased;
  const error = videosError?.message || purchasedError?.message || '';

  // 3) Refresh both
  const refresh = useCallback(() => {
    void refreshVideos();
    if (token) void refreshPurchased();
  }, [refreshVideos, refreshPurchased, token]);

  // 4) Purchase mutation
  const purchaseMutation = useMutation<PurchaseClassVaultResponse, Error, RecordedVideo>({
    mutationFn: (video) => {
      if (!token) throw new Error('You must be logged in to purchase');
      return purchaseClassVault(backendUrl, video.id, token);
    },
    onMutate: (video) => {
      // optimistic token decrement + add to purchased set
      setTokens((t) => t - Number(video.price || 0));
      qc.setQueryData<number[]>(['purchasedVideoIds', token], (prev = []) =>
        prev.includes(video.id) ? prev : [...prev, video.id]
      );
    },
    onSuccess: (resp) => {
      if (typeof resp?.tokens === 'number') setTokens(resp.tokens);
    },
    onError: (_err, video) => {
      // rollback optimistic changes
      setTokens((t) => t + Number(video.price || 0));
      if (token) void refreshPurchased();
      void qc.invalidateQueries({ queryKey: ['userTokens'] });
    },
  });

  const purchase = useCallback(
    async (video: RecordedVideo) => {
      if (!token) throw new Error('You must log in to purchase');
      const cost = Number(video.price || 0);
      if (Number(tokens || 0) < cost) throw new Error('Insufficient tokens');
      await purchaseMutation.mutateAsync(video);
    },
    [purchaseMutation, tokens, token]
  );

  // 5) Delete mutation
  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: (id) => {
      if (!token) throw new Error('You must be logged in to delete');
      return deleteVideoById(backendUrl, id, token);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classVaultVideos'] });
    },
  });

  const remove = useCallback(
    async (id: number) => {
      if (!token) throw new Error('You must be logged in to delete');
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation, token]
  );

  // 6) Update mutation (tutor edit)
  const updateMutation = useMutation<RecordedVideo, Error, { id: number; patch: UpdatePatch }>({
    mutationFn: ({ id, patch }) => {
      if (!token) throw new Error('You must be logged in to update');
      return updateVideoById(backendUrl, id, token, patch);
    },
    onSuccess: (updated) => {
      // keep list + detail caches consistent
      qc.setQueryData<RecordedVideo[]>(['classVaultVideos'], (prev = []) =>
        prev.map((v) => (v.id === updated.id ? updated : v))
      );
      qc.setQueryData<RecordedVideo>(['classVaultVideo', updated.id], updated);
    },
    onError: () => {
      // ensure we re-sync if something went wrong
      void qc.invalidateQueries({ queryKey: ['classVaultVideos'] });
    },
  });

  const update = useCallback(
    async (id: number, patch: UpdatePatch) => {
      if (!token) throw new Error('You must be logged in to update');
      return updateMutation.mutateAsync({ id, patch });
    },
    [updateMutation, token]
  );

  // 7) Filtering (works with new purchase-gated API: has_video/has_pdf flags)
  const filteredVideos = useMemo<RecordedVideo[]>(() => {
    return videos.filter((v: any) => {
      const hasVideo = Boolean(v?.has_video) || Boolean(v?.video_url); // fallback for old data
      if (!hasVideo) return false;
      if (subjectFilter && v.subject !== subjectFilter) return false;
      if (gradeFilter && String(v.grade_level) !== String(gradeFilter)) return false;
      return true;
    });
  }, [videos, subjectFilter, gradeFilter]);

  const filteredPdfRows = useMemo<RecordedVideo[][]>(() => {
    const pdfs = videos.filter((v: any) => {
      const hasPdf = Boolean(v?.has_pdf) || Boolean(v?.pdf_url); // fallback for old data
      if (!hasPdf) return false;
      if (subjectFilter && v.subject !== subjectFilter) return false;
      if (gradeFilter && String(v.grade_level) !== String(gradeFilter)) return false;
      return true;
    });
    return chunk(pdfs, 2);
  }, [videos, subjectFilter, gradeFilter]);

  return {
    // raw
    videos,
    purchasedIds,
    loading,
    error,
    refresh,
    purchase,
    remove,
    update,

    // filtered
    filteredVideos,
    filteredPdfRows,

    // optional mutation states
    isPurchasing: purchaseMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

/**
 * Detail‐screen hook
 *
 * @param videoId  the id to fetch & unlock
 */
export function useClassVaultDetail(videoId: number) {
  const { backendUrl, token } = useShopContext();
  const qc = useQueryClient();

  // 1) Load video metadata (PUBLIC SAFE)
  const {
    data: video,
    isLoading: loadingVideo,
    error: videoError,
    refetch: refreshVideo,
  } = useAppQuery<RecordedVideo, Error>(
    ['classVaultVideo', videoId],
    () => fetchVideoById(backendUrl, videoId),
    { enabled: Boolean(backendUrl) }
  );

  // 2) Unlock download URLs on demand (AUTH REQUIRED)
  const resourcesKey = ['classVaultResources', token, videoId] as const;

  const {
    data: resources,
    isLoading: loadingResources,
    error: resourcesError,
    refetch: unlockResources,
  } = useAppQuery<{ video_url?: string | null; pdf_url?: string | null }, Error>(
    resourcesKey,
    () => fetchDownloadResources(backendUrl, videoId, token!),
    {
      enabled: false, // manual trigger only
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    }
  );

  return {
    video: video ?? null,
    resources: resources ?? null,
    error: videoError?.message || resourcesError?.message || '',
    loading: loadingVideo || loadingResources,
    refresh: async () => {
      await refreshVideo();
      qc.removeQueries({ queryKey: resourcesKey });
    },
    unlockContent: async () => {
      if (!token) throw new Error('You must log in to unlock content');
      if (qc.getQueryData(resourcesKey)) return; // already cached
      await unlockResources();
    },
  };
}
