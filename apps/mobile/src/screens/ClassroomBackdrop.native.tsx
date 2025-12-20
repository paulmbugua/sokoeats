/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, Animated, Easing, Platform, ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  // Native utilities from apps/mobile/utils/subjectImages
  getImageSourceForCourse, // → ImageSourcePropType for <Image source={...} />
  pickImageUriForCourse, // → raw URL string
  SUBJECT_IMAGE_MAP_NATIVE, // → Record<string, ImageSourcePropType>
  SUBJECT_ALIASES,
  FALLBACK_COURSE_IMAGE_URL, // → raw URL string (used for prefetch fallback)
} from '../../utils/subjectImages';

type CourseLike = {
  id?: string;
  title?: string;
  subject?: string;
  category?: string;
  level?: string;
  description?: string;
  [k: string]: any;
};

type BackdropProps = {
  course?: CourseLike | null;
  outline?: { id: string; title: string; keyPoints?: string[] }[];
  backendUrl?: string;
  intervalSec?: number;
  playing?: boolean;

  // Live-tunable appearance
  dim?: number; // 0–1 (applied as a black overlay)
  blurPx?: number; // RN Image.blurRadius
  brightness?: number; // approximated by increasing dim
  saturation?: number; // ignored in core RN
  vignetteInner?: number; // 0–1 (vignette via edge gradients)

  // Optional: override images + controlled index
  imagesOverride?: Array<string | ImageSourcePropType>;
  index?: number;
  onIndexChange?: (next: number) => void;
};

function normalize(s: string) {
  return s.toLowerCase().trim();
}

function collectSubjectKeysFromText(txt: string) {
  const hay = normalize(txt);
  const hits: string[] = [];
  // Use keys from the native map (same canonical keys as web)
  for (const key of Object.keys(SUBJECT_IMAGE_MAP_NATIVE)) if (hay.includes(key)) hits.push(key);
  for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES as Record<string, string[]>)) {
    if ((aliases as string[]).some((a) => hay.includes(a))) hits.push(canonical);
  }
  return Array.from(new Set(hits));
}

// Convert possible string | ImageSourcePropType to ImageSourcePropType
const toSource = (v: string | ImageSourcePropType): ImageSourcePropType =>
  typeof v === 'string' ? { uri: v } : v;

// Extract a URI string if available (for prefetch)
const toUri = (v: string | ImageSourcePropType | undefined): string | undefined => {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return undefined; // local require() cannot be prefetched
  // { uri: string } case:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyV = v as any;
  return typeof anyV.uri === 'string' ? anyV.uri : undefined;
};

const ClassroomBackdrop: React.FC<BackdropProps> = ({
  course,
  outline,
  backendUrl,
  intervalSec = 14,
  playing = true,

  dim = 0.35,
  blurPx = 2,
  brightness = 0.6, // brightness -> folded into dim
  saturation = 0.9, // ignored
  vignetteInner = 0.45,

  imagesOverride,
  index,
  onIndexChange,
}) => {
  // 1) Base source using native helper (ImageSourcePropType) + a raw URL for prefetch
  const baseSource = useMemo<ImageSourcePropType>(() => {
    try {
      return course
        ? getImageSourceForCourse(course as any, backendUrl)
        : { uri: FALLBACK_COURSE_IMAGE_URL };
    } catch {
      return { uri: FALLBACK_COURSE_IMAGE_URL };
    }
  }, [course, backendUrl]);

  const baseUri = useMemo<string>(() => {
    try {
      return course ? pickImageUriForCourse(course as any, backendUrl) : FALLBACK_COURSE_IMAGE_URL;
    } catch {
      return FALLBACK_COURSE_IMAGE_URL;
    }
  }, [course, backendUrl]);

  // 2) Auto-select a small image pool from title/subject/outline (native sources)
  const autoImages = useMemo<ImageSourcePropType[]>(() => {
    const pool = new Set<ImageSourcePropType>();

    const textBits: string[] = [];
    if (course?.title) textBits.push(course.title);
    if ((course as any)?.subject) textBits.push((course as any).subject);
    if ((course as any)?.category) textBits.push((course as any).category);
    if (course?.description) textBits.push(course.description || '');
    (outline || []).forEach((s) => {
      textBits.push(s.title);
      (s.keyPoints || []).forEach((k) => textBits.push(k));
    });

    const keys = collectSubjectKeysFromText(textBits.join(' '));
    keys.forEach((k) => {
      const src = SUBJECT_IMAGE_MAP_NATIVE[k];
      if (src) pool.add(src);
    });

    // Start with base, then curated subjects
    const arr: ImageSourcePropType[] = [baseSource, ...Array.from(pool)];
    // Unique by uri reference (best-effort)
    const seen = new Set<string>();
    const unique: ImageSourcePropType[] = [];
    for (const s of arr) {
      const uri = toUri(s) || `local#${typeof s === 'number' ? s : JSON.stringify(s)}`;
      if (!seen.has(uri)) {
        seen.add(uri);
        unique.push(s);
      }
    }
    return unique.slice(0, 4);
  }, [baseSource, course, outline]);

  const images: ImageSourcePropType[] = useMemo(() => {
    if (imagesOverride?.length) {
      return imagesOverride.map(toSource);
    }
    return autoImages;
  }, [imagesOverride, autoImages]);

  // 3) Controlled/uncontrolled index
  const [internalIdx, setInternalIdx] = useState(0);
  const activeIdx = typeof index === 'number' ? index : internalIdx;
  const setIdx = (next: number) => {
    if (typeof index === 'number') onIndexChange?.(next);
    else setInternalIdx(next);
  };

  // 4) Crossfade animation
  const fade = useRef(new Animated.Value(1)).current;
  const prevIdx = (activeIdx - 1 + images.length) % images.length;
  const curSrc = images[activeIdx] || baseSource;
  const prevSrc = images[prevIdx] || baseSource;

  // 5) Rotate images on a timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing || images.length <= 1) return;

    if (timerRef.current != null) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      const cur = typeof index === 'number' ? index : internalIdx;
      const next = (cur + 1) % images.length;
      setIdx(next);
    }, intervalSec * 1000);

    return () => {
      if (timerRef.current != null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, intervalSec, playing, index, internalIdx]);

  // 6) Fade in whenever the active index changes
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIdx, fade]);

  // 7) Prefetch images (only for remote URIs)
  useEffect(() => {
    images.forEach((src) => {
      const uri = toUri(src);
      if (uri) Image.prefetch(uri).catch(() => undefined);
    });
    // Also ensure base is warmed
    if (baseUri) Image.prefetch(baseUri).catch(() => undefined);
  }, [images, baseUri]);

  // 8) Visual layers
  const rnBlur = Math.max(0, Math.round(blurPx)); // RN Image.blurRadius
  const effectiveDim = Math.max(0, Math.min(1, dim + (1 - brightness) * 0.35));
  const vignetteEdgeStrength = Math.max(0, Math.min(1, 1 - vignetteInner)); // 0–1

  return (
    <View style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 16 }}>
      {/* Previous image (below) */}
      <Image
        source={prevSrc}
        blurRadius={rnBlur}
        resizeMode="cover"
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      />

      {/* Current image (on top, fades in) */}
      <Animated.Image
        source={curSrc}
        blurRadius={rnBlur}
        resizeMode="cover"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          opacity: fade,
          transform: [{ scale: Platform.OS === 'android' ? 1.001 : 1 }],
        }}
      />

      {/* Dim overlay */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          backgroundColor: `rgba(0,0,0,${effectiveDim})`,
        }}
      />

      {/* Vignette approximation with edge gradients */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 120 * vignetteEdgeStrength,
        }}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.70)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 160 * Math.max(0.6, vignetteEdgeStrength),
        }}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 80 * vignetteEdgeStrength,
        }}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.45)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 80 * vignetteEdgeStrength,
        }}
      />
    </View>
  );
};

export default ClassroomBackdrop;
