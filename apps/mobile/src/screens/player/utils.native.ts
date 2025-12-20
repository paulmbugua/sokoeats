// apps/mobile/src/components/player/utils.native.ts
import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export const hexToRgb = (hex: string): string => {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  );
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return `${r} ${g} ${b}`;
};

export const pickTextOnBg = (hex: string): '#000' | '#fff' => {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  );
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return L > 0.58 ? '#000' : '#fff';
};

export const formatTime = (sec: number) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Native-friendly measured height hook:
 * usage:
 *   const { height, onLayout } = useMeasuredHeight(40);
 *   <View onLayout={onLayout}>...</View>
 */
export function useMeasuredHeight(fallback = 56) {
  const [height, setHeight] = useState(fallback);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setHeight(e.nativeEvent.layout.height);
  }, []);

  return { height, onLayout };
}
