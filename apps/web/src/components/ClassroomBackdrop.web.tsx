// apps/web/src/components/ClassroomBackdrop.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  pickImageForCourse,
  SUBJECT_IMAGE_MAP,
  SUBJECT_ALIASES,
  FALLBACK_COURSE_IMAGE,
} from '@/utils/subjectImages';

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

  // 🔧 Live-tunable appearance
  dim?: number; // 0–1
  blurPx?: number; // e.g. 0–6
  brightness?: number; // e.g. 0.3–1.2
  saturation?: number; // e.g. 0.6–1.3
  vignetteInner?: number; // 0–1

  // 🎨 Optional: override images + controlled index
  imagesOverride?: string[];
  index?: number; // controlled current index
  onIndexChange?: (next: number) => void; // controlled change
};

function normalize(s: string) {
  return s.toLowerCase().trim();
}
function collectSubjectKeysFromText(txt: string) {
  const hay = normalize(txt);
  const hits: string[] = [];
  for (const key of Object.keys(SUBJECT_IMAGE_MAP)) if (hay.includes(key)) hits.push(key);
  for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if ((aliases as string[]).some((a) => hay.includes(a))) hits.push(canonical);
  }
  return Array.from(new Set(hits));
}

const ClassroomBackdrop: React.FC<BackdropProps> = ({
  course,
  outline,
  backendUrl,
  intervalSec = 14,
  playing = true,

  dim = 0.35,
  blurPx = 2,
  brightness = 0.6,
  saturation = 0.9,
  vignetteInner = 0.45,

  imagesOverride,
  index,
  onIndexChange,
}) => {
  // Base from helper
  const base = useMemo(() => {
    try {
      return course ? pickImageForCourse(course as any, backendUrl) : FALLBACK_COURSE_IMAGE;
    } catch {
      return FALLBACK_COURSE_IMAGE;
    }
  }, [course, backendUrl]);

  // Build smart images (unless override provided)
  const autoImages = useMemo(() => {
    const pool = new Set<string>();
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
    keys.forEach((k) => pool.add(SUBJECT_IMAGE_MAP[k]));
    const arr = [base, ...Array.from(pool)];
    return Array.from(new Set(arr)).slice(0, 4);
  }, [base, course, outline]);

  const images = imagesOverride?.length ? imagesOverride : autoImages;

  // Rotation (controlled or internal)
  const [internalIdx, setInternalIdx] = useState(0);
  const activeIdx = typeof index === 'number' ? index : internalIdx;
  const setIdx = (next: number) => {
    if (typeof index === 'number') onIndexChange?.(next);
    else setInternalIdx(next);
  };

  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || images.length <= 1) return () => {};
    if (timerRef.current) window.clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      // use the actual current index (controlled or internal)
      const cur = typeof index === 'number' ? index : internalIdx;
      const next = (cur + 1) % images.length;
      setIdx(next); // pass a number, not a function
    }, intervalSec * 1000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, intervalSec, playing, index, internalIdx]);

  // Preload
  useEffect(() => {
    images.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [images]);

  const prevIdx = (activeIdx - 1 + images.length) % images.length;
  const cur = images[activeIdx] || base;
  const prev = images[prevIdx] || base;

  const filterCSS = `brightness(${brightness}) saturate(${saturation})`;
  const vignetteCSS = `radial-gradient(ellipse at center, rgba(0,0,0,0) ${Math.round(
    Math.max(0, Math.min(1, vignetteInner)) * 100
  )}%, rgba(0,0,0,0.55) 100%)`;

  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl">
      {/* Previous (hidden, but keeps crossfade feel if you want to animate opacity later) */}
      <div
        aria-hidden
        className="absolute inset-0 bg-center bg-cover transition-opacity duration-700"
        style={{ backgroundImage: `url('${prev}')`, opacity: 0, filter: filterCSS }}
      />
      {/* Current */}
      <div
        aria-hidden
        key={activeIdx}
        className="absolute inset-0 bg-center bg-cover transition-opacity duration-700 opacity-100"
        style={{ backgroundImage: `url('${cur}')`, filter: filterCSS }}
      />

      {/* Dim + blur */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: `rgba(0,0,0,${Math.max(0, Math.min(1, dim))})`,
          backdropFilter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
        }}
      />
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: vignetteCSS }} />
      {/* Bottom fade for legibility */}
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
    </div>
  );
};

export default ClassroomBackdrop;
