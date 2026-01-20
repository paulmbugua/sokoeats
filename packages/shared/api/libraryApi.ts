import axios from 'axios';
import type { Course, RecordedVideo } from '@mytutorapp/shared/types';
import type { ResourceCategoryResult } from '@mytutorapp/shared/types';

const cleaned = (u?: string) => String(u || '').replace(/\/+$/, '');
const auth = (token?: string) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});

export async function fetchPurchasedClassVault(
  backendUrl: string,
  token: string,
  params: { limit?: number; offset?: number; q?: string }
): Promise<ResourceCategoryResult<RecordedVideo>> {
  const { data } = await axios.get(`${cleaned(backendUrl)}/api/classvault/purchases`, {
    ...auth(token),
    params,
  });
  return {
    items: data?.purchases ?? [],
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? params?.limit ?? 0),
    offset: Number(data?.offset ?? params?.offset ?? 0),
  };
}

export async function fetchCreatedClassVault(
  backendUrl: string,
  token: string,
  params: { limit?: number; offset?: number; q?: string }
): Promise<ResourceCategoryResult<RecordedVideo>> {
  const { data } = await axios.get(`${cleaned(backendUrl)}/api/classvault/mine`, {
    ...auth(token),
    params,
  });
  return {
    items: data?.items ?? [],
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? params?.limit ?? 0),
    offset: Number(data?.offset ?? params?.offset ?? 0),
  };
}

export async function fetchUnlockedCourses(
  backendUrl: string,
  token: string,
  params: { limit?: number; offset?: number; ai?: boolean }
): Promise<ResourceCategoryResult<Course>> {
  const { data } = await axios.get(`${cleaned(backendUrl)}/api/courses/mine/unlocked-ai`, {
    ...auth(token),
    params: {
      limit: params?.limit,
      offset: params?.offset,
      ai: params?.ai ? 1 : params?.ai === false ? 0 : undefined,
    },
  });
  return {
    items: data?.items ?? [],
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? params?.limit ?? 0),
    offset: Number(data?.offset ?? params?.offset ?? 0),
  };
}

export async function fetchTutorCoursesPaged(
  backendUrl: string,
  token: string,
  params: { limit?: number; offset?: number }
): Promise<ResourceCategoryResult<Course>> {
  const { data } = await axios.get(`${cleaned(backendUrl)}/api/courses/mine`, {
    ...auth(token),
    params,
  });

  const items = Array.isArray(data) ? data : data?.items ?? data ?? [];
  const total = Array.isArray(data)
    ? Number(items?.[0]?.total_rows ?? items?.length ?? 0)
    : Number(data?.total ?? items?.[0]?.total_rows ?? items?.length ?? 0);

  const cleanItems = (items || []).map((it: any) => {
    if (it && 'total_rows' in it) {
      const { total_rows, ...rest } = it;
      return rest;
    }
    return it;
  });

  return {
    items: cleanItems,
    total,
    limit: Number(params?.limit ?? 0),
    offset: Number(params?.offset ?? 0),
  };
}
