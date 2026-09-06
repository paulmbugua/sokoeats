import { useEffect, useRef, useState } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';

export function useMapDiagnostics(surface: string, active = true) {
  const id = useRef(`map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`).current;
  const startedAt = useRef(Date.now());
  const ready = useRef(false);
  const loaded = useRef(false);
  const layout = useRef({ width: 0, height: 0 });
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) return;
    startedAt.current = Date.now();
    ready.current = false;
    loaded.current = false;
    setSlow(false);
    console.info('[SokoEats][Maps] mount', { id, surface, platform: Platform.OS });
    const timer = setTimeout(() => {
      if (loaded.current) return;
      setSlow(true);
      console.warn('[SokoEats][Maps] tiles-pending', {
        id, surface, elapsedMs: Date.now() - startedAt.current,
        nativeViewReady: ready.current, layout: layout.current,
        diagnostic: 'Check device logcat for Maps SDK authorization or network errors. View readiness does not confirm tile loading.',
      });
    }, 15000);
    return () => clearTimeout(timer);
  }, [active, id, surface]);

  return {
    slow,
    onLayout: (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      if (layout.current.width === width && layout.current.height === height) return;
      layout.current = { width, height };
      console.info('[SokoEats][Maps] layout', { id, surface, width, height });
    },
    onMapReady: () => {
      ready.current = true;
      console.info('[SokoEats][Maps] native-ready', { id, surface, elapsedMs: Date.now() - startedAt.current });
    },
    onMapLoaded: () => {
      if (loaded.current) return;
      loaded.current = true;
      setSlow(false);
      console.info('[SokoEats][Maps] tiles-loaded', { id, surface, elapsedMs: Date.now() - startedAt.current });
    },
  };
}
