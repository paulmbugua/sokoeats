import axios from 'axios';

const cleaned = (u?: string) => String(u || '').replace(/\/+$/, '');

export async function unifiedSearchApi(
  backendUrl: string,
  params: Record<string, any>,
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
