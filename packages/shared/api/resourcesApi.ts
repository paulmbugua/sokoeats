import axios from 'axios';
import type { Course, RecordedVideo } from '@mytutorapp/shared/types';
import type { ResourceCategoryResult } from '@mytutorapp/shared/types';

export type OerVideoItem = {
  slug?: string | null;
  title: string;
  provider?: string | null;
  subject?: string | null;
  thumbnail_url?: string | null;
  source_url?: string | null;
  embed_url?: string | null;
  created_at?: string | null;
};

export type OerBookItem = {
  id: string;
  slug?: string | null;
  title: string;
  cover_url?: string | null;
  created_at?: string | null;
};

const cleaned = (u?: string) => String(u || '').replace(/\/+$/, '');

export async function fetchClassVaultExplore(
  backendUrl: string,
  params: { limit?: number; offset?: number; q?: string }
): Promise<ResourceCategoryResult<RecordedVideo>> {
  const { data } = await axios.get(`${cleaned(backendUrl)}/api/classvault/explore`, { params });
  return {
    items: data?.items ?? [],
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? params?.limit ?? 0),
    offset: Number(data?.offset ?? params?.offset ?? 0),
  };
}

export async function fetchOerVideosExplore(
  backendUrl: string,
  params: { limit?: number; offset?: number; q?: string }
): Promise<ResourceCategoryResult<OerVideoItem>> {
  const { data } = await axios.get(`${cleaned(backendUrl)}/api/oer/videos`, {
    params,
  });
  return {
    items: data?.items ?? [],
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? params?.limit ?? 0),
    offset: Number(data?.offset ?? params?.offset ?? 0),
  };
}

export async function fetchExploreCourses(
  backendUrl: string,
  params: { limit?: number; offset?: number; q?: string }
): Promise<ResourceCategoryResult<Course>> {
  const { data } = await axios.get(`${cleaned(backendUrl)}/api/courses/explore`, {
    params,
  });
  return {
    items: data?.items ?? [],
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? params?.limit ?? 0),
    offset: Number(data?.offset ?? params?.offset ?? 0),
  };
}

export async function fetchOerBooksExplore(
  backendUrl: string,
  params: { limit?: number; offset?: number; q?: string }
): Promise<ResourceCategoryResult<OerBookItem>> {
  const { data } = await axios.get(`${cleaned(backendUrl)}/api/oer/books`, {
    params,
  });
  return {
    items: data?.items ?? [],
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? params?.limit ?? 0),
    offset: Number(data?.offset ?? params?.offset ?? 0),
  };
}
