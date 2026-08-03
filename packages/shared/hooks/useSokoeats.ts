import { useEffect, useState } from 'react';
export function useAsyncResource<T>(loader: () => Promise<T>, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setLoading(true);
    loader().then((value) => live && setData(value)).catch((err) => live && setError(err instanceof Error ? err.message : 'Request failed')).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);
  return { data, loading, error };
}
