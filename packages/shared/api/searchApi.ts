// packages/shared/api/searchApi.ts
import axios from 'axios';

const cleaned = (u?: string) => String(u || '').replace(/\/+$/, '');

export async function unifiedSearchApi(
  backendUrl: string,
  params: {
    q?: string;
    kinds?: string;
    limit?: number;
    offset?: number;

    // ✅ filters (sent as querystring)
    subject?: string;
    gradeBand?: string;
    country?: string;
    providers?: string; // CSV
    contentKinds?: string; // CSV
    sourceKind?: string;
    scope?: string;
    minRating?: number;
    maxPrice?: number;
  },
  token?: string,
  signal?: AbortSignal
) {
  const base = cleaned(backendUrl);

  const { data } = await axios.get(`${base}/api/search`, {
    params,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });

  return data;
}
