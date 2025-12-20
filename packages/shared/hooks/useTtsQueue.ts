// packages/shared/hooks/useTtsQueue.ts
import { useCallback, useRef, useState } from 'react';

export function useTtsQueue(onPlayNext: (ssml: string) => void) {
  const qRef = useRef<string[]>([]);
  const [pending, setPending] = useState(0);

  const enqueue = useCallback((ssml: string, opts?: { replaceLatest?: boolean }) => {
    if (!ssml?.trim()) return;
    if (opts?.replaceLatest) qRef.current = [ssml];
    else qRef.current.push(ssml);
    setPending(qRef.current.length);
  }, []);

  const clear = useCallback(() => {
    qRef.current = [];
    setPending(0);
  }, []);

  const playNext = useCallback(() => {
    const next = qRef.current.shift() || '';
    setPending(qRef.current.length);
    if (next) onPlayNext(next);
  }, [onPlayNext]);

  return { enqueue, clear, pending, playNext };
}
