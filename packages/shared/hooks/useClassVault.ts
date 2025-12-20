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
} from '@mytutorapp/shared/api/classVaultApi';
import type { RecordedVideo } from '@mytutorapp/shared/types';

/** split into rows of `size` */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * List‐screen hook
 *
 * @param subjectFilter  single chosen subject (or empty = no filter)
 * @param gradeFilter    single chosen grade (or empty = no filter)
 */
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

  // 2) Fetch purchased IDs *only* if we have a token
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
  const purchasedIds = useMemo<Set<number>>(
    () => new Set<number>(purchasedIdsArr),
    [purchasedIdsArr]
  );

  // Composite loading & error
  const loading = loadingVideos || loadingPurchased;
  const error = videosError?.message || purchasedError?.message || '';

  // 3) Refresh both
  const refresh = useCallback(() => {
    void refreshVideos();
    if (token) void refreshPurchased();
  }, [refreshVideos, refreshPurchased, token]);

  // 4) Purchase mutation (requires login)
  const purchaseMutation = useMutation<
    { video_url: string; pdf_url: string },
    Error,
    RecordedVideo
  >({
    mutationFn: (video) => {
      if (!token) throw new Error('You must be logged in to purchase');
      return purchaseClassVault(backendUrl, video.id, token);
    },
    onMutate: (video) => {
      setTokens((t) => t - video.price);
      qc.setQueryData<number[]>(['purchasedVideoIds', token], (prev = []) => [...prev, video.id]);
    },
    onError: () => {
      if (token) void refreshPurchased();
      void qc.invalidateQueries({ queryKey: ['userTokens'] });
    },
  });

  const purchase = useCallback(
    async (video: RecordedVideo) => {
      if (!token) throw new Error('You must log in to purchase');
      if (tokens < video.price) throw new Error('Insufficient tokens');
      await purchaseMutation.mutateAsync(video);
    },
    [purchaseMutation, tokens, token]
  );

  // 5) Delete mutation (tutor only, requires login)
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

  // 6) Filtering
  const filteredVideos = useMemo<RecordedVideo[]>(() => {
    return videos.filter((v: RecordedVideo) => {
      if (!v.video_url) return false;
      if (subjectFilter && v.subject !== subjectFilter) return false;
      if (gradeFilter && String(v.grade_level) !== gradeFilter) return false;
      return true;
    });
  }, [videos, subjectFilter, gradeFilter]);

  const filteredPdfRows = useMemo<RecordedVideo[][]>(() => {
    const pdfs = videos.filter((v: RecordedVideo) => {
      if (!v.pdf_url) return false;
      if (subjectFilter && v.subject !== subjectFilter) return false;
      if (gradeFilter && String(v.grade_level) !== gradeFilter) return false;
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
    // filtered
    filteredVideos,
    filteredPdfRows,
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

  // 1) Load video metadata
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

  // 2) Unlock download URLs on demand
  const resourcesKey = ['classVaultResources', token, videoId] as const;

  const {
    data: resources,
    isLoading: loadingResources,
    error: resourcesError,
    refetch: unlockResources,
  } = useAppQuery<{ video_url: string; pdf_url: string }, Error>(
    resourcesKey,
    () => fetchDownloadResources(backendUrl, videoId, token!),
    {
      enabled: false, // manual trigger only
      refetchOnWindowFocus: false, // avoid duplicate calls on focus
      staleTime: 5 * 60 * 1000, // cache the unlocked URLs for 5 minutes
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
      // If we already have cached resources, do not refetch
      if (qc.getQueryData(resourcesKey)) return;
      await unlockResources();
    },
  };
}
