// apps/web/src/components/ClassroomPlayer.web.tsx
/* eslint-disable no-console */
/* eslint-disable react-hooks/exhaustive-deps */
import ReactDOM from 'react-dom';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NotesDrawer, TranscriptDrawer } from './SideDrawers';
import type { HighlightTemplate } from './player/TemplateMenu';
import { useWordSync } from '@mytutorapp/shared/hooks/useWordSync';
import { useShopContext } from '@mytutorapp/shared/context';
import { listTtsVoices, type TtsVoiceInfo } from '@mytutorapp/shared/api/ttsAvatarApi';

import ClassroomBackdrop from './ClassroomBackdrop.web';
import LessonOverlay from './LessonOverlay';
import { ThemeProvider, useThemeTokens } from './player/ThemeContext';
import TopBar from './player/TopBar';
import Narration from './player/Narration';
import BottomBar from './player/BottomBar';
import { useMeasuredHeight } from './player/utils';
import type { LessonLite, OutlineSection } from './player/types';

type Props = {
  ssml?: string;
  lessons?: LessonLite[];
  title?: string;
  voiceName?: string;
  onNext?: () => Promise<boolean> | boolean;
  onPrev?: () => Promise<boolean> | boolean;
  isBuildingNext?: boolean;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  onEnded?: () => void;

  disableInternalBackdrop?: boolean;
  backdropOverride?: React.ReactNode;
  onToggleThemePanel?: () => void;

  onPlayerLoadingChange?: (loading: boolean) => void;
  onRequestStart?: () => void;

  course?: any | null;
  outline?: OutlineSection[];
  backendUrlOverride?: string;
  playing?: boolean;
  playJoinedIfAvailable?: boolean;
  onBeforePlay?: () => Promise<void> | void;

  activeIndex?: number;
};

// --- helpers -----------------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    try {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      // Safari < 14
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
  }, []);
  return reduced;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------

function Container(props: Props) {
  const {
    ssml, lessons = [], title = 'AI Lesson', voiceName = 'en-US-Wavenet-C',
    maximized, onToggleMaximize, onNext, onPrev, isBuildingNext,
    course, outline = [], backendUrlOverride, playing = true, onEnded, onBeforePlay,
    onToggleThemePanel, onPlayerLoadingChange, onRequestStart,
    playJoinedIfAvailable = false, disableInternalBackdrop = true, backdropOverride,
  } = props;

  const prefersReduced = usePrefersReducedMotion();
  const { hlRgb, genRgb, activeTextOnHl } = useThemeTokens();

  const {
    speak, loading, error, words: wordsRaw, currentIndex, isPlaying, play, pause,
    seekToWord, resumeAudioContext, audioUrl, endedTick,
    sentenceGroups, clearForNewSession, volume, setVolume,
  } = useWordSync();
  const words = wordsRaw ?? [];

  const hasLessons = Array.isArray(lessons) && lessons.length > 0;
  const hasJoined  = typeof ssml === 'string' && ssml.trim().length > 0;
  const useJoined  = playJoinedIfAvailable && hasJoined;

  const [lessonIdx, setLessonIdx] = React.useState(0);

  const uiLessonIdx =
  typeof props.activeIndex === 'number'
    ? Math.max(0, props.activeIndex as number)
    : lessonIdx;
  const [scrubbing, setScrubbing] = React.useState(false);
  const [hoveringBar, setHoveringBar] = React.useState(false);

  const [highlightStyle, setHighlightStyle] = React.useState<'stripe'|'underline'|'boxed'>(() => {
    try { return (localStorage.getItem('classroomHighlightStyle') as any) || 'stripe'; } catch { return 'stripe'; }
  });
  React.useEffect(() => { try { localStorage.setItem('classroomHighlightStyle', highlightStyle); } catch {} }, [highlightStyle]);

  const [userScale, setUserScale] = React.useState<number>(() => {
    try { return parseFloat(localStorage.getItem('classroomUserScale') || '1'); } catch { return 1; }
  });
  React.useEffect(() => { try { localStorage.setItem('classroomUserScale', String(userScale)); } catch {} }, [userScale]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const { backendUrl } = useShopContext();
  const effectiveBackend = backendUrlOverride || backendUrl;

  // Voice
  const [voice, setVoice] = React.useState<string>(() => {
    try { return localStorage.getItem('classroomVoiceName') || voiceName || 'en-US-Wavenet-C'; }
    catch { return voiceName || 'en-US-Wavenet-C'; }
  });
  React.useEffect(()=>{ if (voiceName && voiceName !== voice) setVoice(voiceName); },[voiceName]);
  React.useEffect(()=>{ try { localStorage.setItem('classroomVoiceName', voice); } catch {} },[voice]);
  const [templateId, setTemplateId] = React.useState<HighlightTemplate>(() => {
  try {
    return (
      (localStorage.getItem('classroomHighlightTemplate') as HighlightTemplate) ||
      'ribbon'
    );
  } catch {
    return 'ribbon';
  }
});

  React.useEffect(() => { try { localStorage.setItem('classroomHighlightTemplate', templateId); } catch {} }, [templateId]);

  // Load voices
  const [voicesList, setVoicesList] = React.useState<TtsVoiceInfo[]>([]);
  const [voicesLoading, setVoicesLoading] = React.useState(false);
  const [voicesError, setVoicesError] = React.useState<string | null>(null);
  const [showTranscript, setShowTranscript] = React.useState(false);
  const [showNotes, setShowNotes] = React.useState(false);
  const [showAudioDebug, setShowAudioDebug] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try { setVoicesLoading(true); setVoicesError(null);
        const list = await listTtsVoices(effectiveBackend, { onlyWavenet: true });
        if (alive) setVoicesList(list || []);
      } catch (e: any) { if (alive) setVoicesError(e?.message || 'Failed to load voices'); }
      finally { if (alive) setVoicesLoading(false); }
    })();
    return () => { alive = false; };
  }, [effectiveBackend]);

  // Speak effect
  const lastSpeakKey = React.useRef<string | null>(null);
  const makeKey = () => {
    if (useJoined) return `joined|voice:${voice}|len:${(ssml?.trim().length ?? 0)}`;
    if (hasLessons) { const l = lessons[lessonIdx]; return `lesson:${l?.id || lessonIdx}|voice:${voice}|len:${(l?.ssml || '').length}`; }
    return `single|voice:${voice}|len:${(ssml || '').length}`;
  };
  const advancingRef = React.useRef(false);
  const [isAdvancing, setIsAdvancing] = React.useState(false);
  React.useEffect(() => {
    const key = makeKey();
    if (!key || key === lastSpeakKey.current) return;
    (async () => {
      try { await pause(); } catch {}
      const cur = useJoined ? (ssml || '').trim() : hasLessons ? (lessons[lessonIdx]?.ssml || '').trim() : (ssml || '').trim();
      try { clearForNewSession(); } catch {}
      if (cur.length > 0) {
        await speak(effectiveBackend, { ssml: cur, voiceName: voice });
        lastSpeakKey.current = key;
        if (advancingRef.current) { advancingRef.current = false; setIsAdvancing(false); }
      }
    })();
  }, [useJoined, hasLessons, lessonIdx, lessons, ssml, voice, effectiveBackend]);

  // Durations / progress
  const durationSec = React.useMemo(() => (words.length ? Math.max(...words.map((w) => w.end)) : 0), [words]);
  const currentSec  = React.useMemo(() => (words as any)[currentIndex]?.start ?? 0, [words, currentIndex]);
  const progress    = durationSec ? currentSec / durationSec : 0;

  const totalLessonsForUi = React.useMemo(
    () => Math.max(lessons?.length || 0, outline?.length || 0) || 1,
    [lessons?.length, outline?.length]
  );

  const titleForUi = useJoined
  ? title
  : hasLessons
  ? (lessons[lessonIdx]?.title ||
      `${title || 'AI Lesson'} — Lesson ${uiLessonIdx + 1}/${totalLessonsForUi}`)
  : (title || 'AI Lesson');


  // Bars heights
  const topBarRef = React.useRef<HTMLDivElement | null>(null);
  const bottomBarRef = React.useRef<HTMLDivElement | null>(null);
  const topH = useMeasuredHeight(topBarRef, 40);
  const bottomH = useMeasuredHeight(bottomBarRef, 64);
  const [internalMax, setInternalMax] = React.useState(false);
  const isControlled = typeof maximized === 'boolean';
  const isMax = isControlled ? (maximized as boolean) : internalMax;
  const toggleMax = () => { if (onToggleMaximize) onToggleMaximize(); else setInternalMax((v) => !v); };

  // Player actions
  const lastPlayClickRef = React.useRef(0);
  const handlePlayClick = React.useCallback(async () => {
    const now = Date.now(); if (now - lastPlayClickRef.current < 400) return; lastPlayClickRef.current = now;
    try {
      await resumeAudioContext();
      if (!isPlaying) {
        if (!words.length) { onRequestStart?.(); onPlayerLoadingChange?.(true); autoPlayArmedRef.current = true; }
        await onBeforePlay?.();
        await play();
      } else { pause(); }
    } catch {}
  }, [isPlaying, onBeforePlay, play, pause, resumeAudioContext, words.length, onRequestStart, onPlayerLoadingChange]);

  // Seek helpers
  function indexForTime(ws: Array<{ start: number; end: number }>, t: number) {
    if (!ws.length) return 0;
    if (t <= ws[0].start) return 0;
    const last = ws[ws.length - 1];
    if (t >= last.end) return ws.length - 1;
    let lo = 0, hi = ws.length - 1, ans = ws.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ws[mid].end >= t) { ans = mid; hi = mid - 1; }
      else { lo = mid + 1; }
    }
    return Math.max(0, Math.min(ans, ws.length - 1));
  }

  const seekToTime = (t: number) => {
    if (!words.length) return;
    const tt = Math.max(0, Math.min(durationSec, t));
    try { void resumeAudioContext(); } catch {}
    const idx = indexForTime(words as any, tt);
    seekToWord(idx);
  };

  const nudgeSeconds = (d: number) => seekToTime(Math.max(0, Math.min(durationSec, currentSec + d)));

  // Scrubber hover state
  const barRef = React.useRef<HTMLDivElement | null>(null);
  const [hoverPct, setHoverPct] = React.useState(0);
  const [hoverSec, setHoverSec] = React.useState(0);
  const setFromPointer = (clientX: number) => {
    const el = barRef.current; if (!el || !durationSec) return;
    const rect = el.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverPct(ratio); setHoverSec(ratio * durationSec);
  };
  const commitFromPointer = (clientX: number) => {
    const el = barRef.current;
    if (!el || !durationSec) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    try { void resumeAudioContext(); } catch {}
    seekToTime(ratio * durationSec);
  };

  // Auto play after words arrive
  const autoPlayArmedRef = React.useRef(false);
  const prevCountRef = React.useRef(0);
  React.useEffect(() => {
    if (!words?.length) return;
    if (words.length !== prevCountRef.current) {
      prevCountRef.current = words.length;
      if (autoPlayArmedRef.current) {
        (async () => { try { await resumeAudioContext(); await play(); } catch {} autoPlayArmedRef.current = false; })();
      }
    }
  }, [words?.length, play, resumeAudioContext]);

  // End handling
    const endFiredForRef = React.useRef<number | null>(null);
  const lastEndedTickRef = React.useRef(0);

  React.useEffect(() => {
    if (!endedTick || endedTick === lastEndedTickRef.current) return;
    lastEndedTickRef.current = endedTick;

    if (error) return;
    if (words.length) return;

    // Joined mode: just tell the parent we're done and allow it to decide
    if (useJoined) {
      if (endFiredForRef.current !== -1) {
        // Arm autoplay so if the parent builds a next item, we'll auto-start
        autoPlayArmedRef.current = true;
        endFiredForRef.current = -1;
        try {
          onEnded?.();
        } catch {}
      }
      return;
    }

    // Per-lesson mode
    if (endFiredForRef.current !== lessonIdx) {
      autoPlayArmedRef.current = true;
      endFiredForRef.current = lessonIdx;
      try {
        onEnded?.();
      } catch {}
    }

    const hasImmediateNext = hasLessons && lessonIdx < lessons.length - 1;
    const maybeMoreComing = (outline?.length || 0) > (lessons?.length || 0);

    // Nothing more to play
    if (!hasImmediateNext && !maybeMoreComing) return;
    if (advancingRef.current) return;

    advancingRef.current = true;
    setIsAdvancing(true);
    onPlayerLoadingChange?.(true);
    autoPlayArmedRef.current = true;

    if (hasImmediateNext) {
      // We already have the next lesson locally – just advance the index
      setTimeout(() => {
        setLessonIdx((i) => Math.min(i + 1, lessons.length - 1));
      }, 50);
    } else if (typeof onNext === 'function') {
      // Ask the parent (RobotTeacher) to build the next lesson
      (async () => {
        try {
          await onNext();
        } catch {}
      })();
    }
  }, [
    endedTick,
    error,
    words.length,
    useJoined,
    lessonIdx,
    hasLessons,
    lessons.length,
    outline?.length,
    onEnded,
    onNext,
    onPlayerLoadingChange,
  ]);

  React.useEffect(() => {
    onPlayerLoadingChange?.(loading || isAdvancing);
  }, [loading, isAdvancing, onPlayerLoadingChange]);

  // Overlay spacing
  const [lockedTopH, setLockedTopH] = React.useState<number | null>(null);
  React.useEffect(() => { if (isMax && isMobile) { if (topH && lockedTopH == null) setLockedTopH(topH); } else setLockedTopH(null); }, [isMax, isMobile, topH, lockedTopH]);
  const defaultGap = 8;
  const minimizedTopRef = React.useRef<number | null>(null);
  React.useEffect(() => { if (!isMax && topH) minimizedTopRef.current = topH; }, [isMax, topH]);
  const barHForLayout = isMax && isMobile ? lockedTopH ?? topH : isMax ? topH : minimizedTopRef.current ?? topH;
  const overlayRowTop = Math.max(0, Number(barHForLayout) + defaultGap);

  // Title chip
  const titleChip = (
    <div className="absolute left-3 right-3 z-[80] flex justify-center pointer-events-none" style={{ top: overlayRowTop }}>
      <div className="max-w-full truncate px-3 py-1.5 rounded-full bg-black/35 backdrop-blur-md text-white/90 text-xs sm:text-sm ring-1 ring-white/10 shadow-md">
        {titleForUi}
      </div>
    </div>
  );

  // Volume mute helper
  const [mutedAt, setMutedAt] = React.useState<number | null>(null);
  const toggleMute = () => {
    if (mutedAt === null && volume > 0) { setMutedAt(volume); setVolume(0); }
    else { setVolume(mutedAt ?? 1); setMutedAt(null); }
  };

  // Reader scale (auto * user)
  const [autoScale, setAutoScale] = React.useState<number>(1);
  React.useEffect(() => {
    const calc = () => {
      const w = window.innerWidth, h = window.innerHeight;
      let s = 1; if (Math.max(w, h) >= 2160) s = 1.8; else if (w >= 1920 || h >= 1080) s = 1.4; else if (w >= 1440 || h >= 900) s = 1.2;
      setAutoScale(s);
    };
    calc(); window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  const readerScale = autoScale * userScale;
  const stageFontSize = React.useMemo(() => {
    const base = isMax ? (isMobile ? 'clamp(18px, 6vw, 48px)' : 'clamp(20px, min(6.5vw, 6.5svh), 56px)') : (isMobile ? 'clamp(16px, 4.8vw, 30px)' : 'clamp(18px, 2.4vw, 32px)');
    return `calc(${base} * ${readerScale})`;
  }, [isMobile, isMax, readerScale]);

  // Status pill
  const StatusPill = (!words.length && !error && !isAdvancing) ? (
    <motion.div key="status-pill" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
      className="absolute left-0 right-0 flex justify-center z-30" style={{ bottom: bottomH + 10 }} aria-live="polite" role="status">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/65 text-white/90 text-xs sm:text-sm backdrop-blur-md ring-1 ring-white/10 shadow-lg">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        <span>Generating lesson narration…</span>
      </div>
    </motion.div>
  ) : null;

  // CSS vars
  const frameStyle: React.CSSProperties = {
    ['--hl-rgb' as any]: hlRgb,
    ['--gen-rgb' as any]: genRgb,
    ['--hl-text' as any]: activeTextOnHl,
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName ?? '';
      if (/(INPUT|TEXTAREA|SELECT)/.test(tag)) return;

      if (e.key.toLowerCase() === 't') {
        setShowTranscript((s) => !s);
      } else if (e.key.toLowerCase() === 'n') {
        setShowNotes((s) => !s);
      } else if (e.key.toLowerCase() === 'd') {
        setShowAudioDebug((s) => !s);
      } else if (e.code === 'Space') {
        e.preventDefault();
        await handlePlayClick();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        nudgeSeconds(5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        nudgeSeconds(-5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlayClick]);

  // A11y: screen-reader friendly explicit slider for seek (overlay but visually hidden)
  const onA11ySeek = (v: number) => {
    setScrubbing(true);
    seekToTime(v);
    setTimeout(() => setScrubbing(false), 0);
  };

   // --- Prev/Next handlers for lesson navigation -----------------------------
  const handlePrevClick = React.useCallback(async () => {
    // Use the UI index (prop-driven if provided)
    const idxForUi =
      typeof props.activeIndex === 'number'
        ? Math.max(0, props.activeIndex as number)
        : lessonIdx;

    // Nothing before the first section
    if (idxForUi <= 0) return;

    if (typeof onPrev === 'function') {
      try {
        const did = await onPrev();
        if (did) return; // parent handled navigation
      } catch {}
    }

    // Fallback only if we are *not* controlled by activeIndex
    if (typeof props.activeIndex !== 'number') {
      setLessonIdx((i) => Math.max(0, i - 1));
    }
  }, [onPrev, lessonIdx, props.activeIndex]);

  const handleNextClick = React.useCallback(async () => {
    if (typeof onNext === 'function') {
      try {
        const did = await onNext();
        if (did) return; // parent handled navigation
      } catch {}
    }

    // Same idea: only mutate local index if not controlled
    if (typeof props.activeIndex !== 'number') {
      setLessonIdx((i) => Math.min(i + 1, Math.max(lessons.length - 1, 0)));
    }
  }, [onNext, lessons.length, props.activeIndex]);

  return (
    <div
      className={isMax ? 'fixed inset-0 z-[9999] bg-black' : 'relative w-full'}
      role="region"
      aria-label="Lesson player"
      aria-busy={loading || isAdvancing}
    >
        <div
    className={
      `${isMax
        ? 'absolute inset-0 rounded-none'
        : 'relative rounded-[1.5rem] md:rounded-[1.75rem]'
      } overflow-hidden
      shadow-[0_24px_80px_rgba(15,23,42,0.95)]
      ring-1 ring-white/10
      bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.25)_0,_transparent_55%),_radial-gradient(circle_at_bottom,_rgba(45,212,191,0.18)_0,_#020617_52%)]
      ${isMax ? 'w-full h-full' : 'md:aspect-video aspect-[3/4]'}`
    }
    style={frameStyle}
  >

        {/* Top bar */}
        <div ref={topBarRef} className="absolute top-0 inset-x-0 z-[60]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <TopBar
            title={titleForUi}
            voice={voice}
            setVoice={setVoice}
            voices={(voicesList || []).map((v) => v.name)}
            voicesLoading={voicesLoading}
            voicesError={voicesError}
            onPlayPause={handlePlayClick}
            playing={isPlaying}
            loading={loading}
            onToggleTranscript={() => setShowTranscript((s: boolean) => !s)}
            transcriptOpen={showTranscript}
            onToggleThemePanel={onToggleThemePanel}
            onToggleMax={toggleMax}
            isMax={isMax}
            templateId={templateId}
            setTemplateId={setTemplateId}
          />
        </div>

        {titleChip}

        {/* Mini lesson controls — HIDE when maximized or on small screens */}
        {hasLessons && !useJoined && !isMax && !isMobile && (
          <div
            className="absolute right-3 z-[80] pointer-events-none hidden sm:block"
            style={{ top: overlayRowTop }}
          >
            <div className="flex gap-2 text-[11px] pointer-events-auto">
              <button
                onClick={handlePrevClick}
                disabled={uiLessonIdx <= 0}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                aria-label="Previous section"
              >
                Prev
              </button>

              <div
                className="px-2 py-1 rounded bg-white/10 text-white/90 tabular-nums"
                aria-live="polite"
                aria-atomic="true"
              >
                {uiLessonIdx + 1}/{totalLessonsForUi}
              </div>

                            <button
                onClick={handleNextClick}
                disabled={!!isBuildingNext}
                className={`px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white ${
                  isBuildingNext ? 'opacity-70 cursor-wait' : ''
                }`}
                aria-label={isBuildingNext ? 'Preparing next' : 'Next'}
              >
                {isBuildingNext ? 'Preparing next…' : 'Next'}
              </button>

            </div>
          </div>
        )}

        {/* Content */}
        <div
          className="absolute inset-0"
          style={{ paddingTop: topH }}
          onPointerDown={async () => { try { await resumeAudioContext(); } catch {} }}
        >
          {!disableInternalBackdrop && !backdropOverride && (
            <ClassroomBackdrop
              course={course || null}
              outline={outline}
              backendUrl={effectiveBackend}
              playing={typeof playing === 'boolean' ? playing : isPlaying}
              intervalSec={14}
            />
          )}
          {backdropOverride}

          <Narration
            sentences={sentenceGroups || []}
            words={words}
            currentIndex={currentIndex}
            lessonIdx={lessonIdx}
            useLessons={hasLessons && !useJoined}
            stageFontSize={stageFontSize}
            reducedMotion={prefersReduced}
            highlightStyle={highlightStyle}
            scrubbing={scrubbing}
            lang={(course?.lang as string) || 'en'}
            ssml={useJoined ? (ssml || '') : (lessons[lessonIdx]?.ssml || '')}
            timings={words as any}
            templateId={templateId}
          />

          <LessonOverlay
            words={words}
            currentIndex={currentIndex}
            lesson={hasLessons ? lessons[lessonIdx] : undefined}
            topOffset={Number(overlayRowTop) + 40}
            lingerMs={6000}
            defaultPinned={false}
            rememberKey={`${course?.id || 'global'}:${lessonIdx}`}
            portal={!isMax}
            zIndex={10050}
            
          />

          {!isPlaying && !isAdvancing && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <button
                onClick={handlePlayClick}
                className="group pointer-events-auto relative grid place-items-center"
                aria-label={isPlaying ? 'Pause narration' : 'Play narration'}
                aria-pressed={isPlaying}
                title="Play (Space)"
              >
                <span className="absolute inset-0 rounded-full blur-xl opacity-60 group-hover:opacity-80 transition-opacity bg-[conic-gradient(from_210deg,rgba(255,255,255,0.65),rgba(255,255,255,0.2))]" style={{ width: '7.5rem', height: '7.5rem' }} />
                <span className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-black/55 backdrop-blur-xl ring-1 ring-white/20 shadow-2xl grid place-items-center">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" className="drop-shadow" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            </div>
          )}

          <AnimatePresence>
            {isAdvancing && (
              <motion.div key="next-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
                className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none" aria-live="polite" role="status">
                <div className="rounded-full bg-black/60 p-5 shadow-2xl"><div className="h-10 w-10 rounded-full border-2 border-white/30 border-t-white animate-spin" /></div>
                <div className="mt-3 text-white/90 text-sm">Loading next lesson…</div>
              </motion.div>
            )}
          </AnimatePresence>

          {StatusPill}

          {(hasLessons && outline?.length > lessons.length) && (
            <div className="absolute left-2 z-30 text-[12px] sm:text-xs text-white/85 bg-black/45 rounded px-2 py-1 ring-1 ring-white/10" style={{ bottom: bottomH + 10 }} aria-live="polite">
              Loading the rest of the lessons…
            </div>
          )}
          {error && !loading && (
            <div className="absolute left-2 z-30 text-[12px] sm:text-xs text-red-200/95 bg-red-950/50 rounded px-2 py-1 ring-1 ring-red-300/30" style={{ bottom: bottomH + 10 }} role="alert">
              {error}
            </div>
          )}

          {/* A11y-only range control for seek (screen readers) */}
          <div className="sr-only">
            <label htmlFor="a11y-seek">Seek through narration</label>
            <input
              id="a11y-seek"
              type="range"
              min={0}
              max={Math.max(1, Math.floor(durationSec))}
              step={0.5}
              value={currentSec}
              onChange={(e) => onA11ySeek(Number(e.target.value))}
              aria-label="Seek through narration"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.floor(durationSec))}
              aria-valuenow={Math.floor(currentSec)}
              aria-valuetext={`${formatTime(currentSec)} of ${formatTime(durationSec)}`}
            />
          </div>
        </div>

        {/* Bottom controls */}
        <div ref={bottomBarRef} className="absolute bottom-0 inset-x-0 z-30" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <BottomBar
            currentSec={currentSec}
            durationSec={durationSec}
            progress={progress}
            onBack5={() => nudgeSeconds(-5)}
            onFwd5={() => nudgeSeconds(5)}
            onPlayPause={handlePlayClick}
            playing={isPlaying}
            loading={loading}
            volume={volume}
            setVolume={setVolume}
            toggleMute={toggleMute}
            barRef={barRef}
            hoveringBar={hoveringBar}
            setHoveringBar={setHoveringBar}
            scrubbing={scrubbing}
            setScrubbing={setScrubbing}
            setFromPointer={setFromPointer}
            commitFromPointer={commitFromPointer}
            hoverPct={hoverPct}
            hoverSec={hoverSec}
            childrenTopFloating={isMax && hasLessons ? (
              <div className="absolute bottom-full left-0 right-0 mb-3 pointer-events-none z-[10000]">
                <div className="mx-auto w-full max-w-3xl px-3">
                  <div className="rounded-xl bg-black/55 backdrop-blur-md ring-1 ring-white/10 shadow-lg pointer-events-auto">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-2 text-sm text-white">
                      {/* Prev / index / Next */}
                      <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevClick}
                            disabled={uiLessonIdx <= 0}
                            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Previous section"
                          >
                            Prev
                          </button>

                        <div
                          className="min-w-[96px] text-center tabular-nums"
                          aria-live="polite"
                          aria-atomic="true"
                        >
                          {uiLessonIdx + 1}/{totalLessonsForUi}
                        </div>
                        <button
                          onClick={handleNextClick}
                          disabled={!!isBuildingNext}
                          className={`px-3 py-1.5 rounded-lg bg-white text-black shadow-sm ${
                            isBuildingNext ? 'opacity-70 cursor-wait' : 'hover:bg-white/90'
                          }`}
                          aria-label={isBuildingNext ? 'Preparing next' : 'Next'}
                        >
                          {isBuildingNext ? 'Preparing next…' : 'Next'}
                        </button>
                      </div>

                      {/* Reader controls: scale + highlight style */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <label htmlFor="reader-scale" className="text-white/80">
                            Text size
                          </label>
                          <input
                            id="reader-scale"
                            type="range"
                            min={0.8}
                            max={1.6}
                            step={0.05}
                            value={userScale}
                            onChange={(e) => setUserScale(Number(e.target.value))}
                            aria-label="Adjust on-screen text size"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-white/80">Highlight</span>
                          <select
                            value={highlightStyle}
                            onChange={(e) => setHighlightStyle(e.target.value as any)}
                            aria-label="Change highlight style"
                            className="bg-white/10 hover:bg-white/15 rounded-md px-2 py-1"
                          >
                            <option value="stripe">Stripe</option>
                            <option value="underline">Underline</option>
                            <option value="boxed">Boxed</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          />

        </div>

        {/* Transcript Drawer — themed */}
        <TranscriptDrawer
          open={showTranscript}
          title={titleForUi}
          lines={sentenceGroups || []}
          words={words}
          activeLine={React.useMemo(() => (sentenceGroups || []).findIndex((s:any)=>s.indices.includes(currentIndex)), [sentenceGroups, currentIndex])}
          currentIndex={currentIndex}
          top={topH}
          bottom={bottomH}
          readerScale={readerScale}
          loading={loading}
          error={error ?? undefined}
          onSeekToWord={(wi:number) => seekToWord(wi)}
          {...({ theme: { highlightRgb: hlRgb, generatedRgb: genRgb, activeTextOnHighlight: activeTextOnHl } } as any)}
        />

        {/* Notes Drawer */}
        <NotesDrawer
          open={showNotes}
          title={`${titleForUi} — Notes`}
          markdown={((hasLessons ? lessons[lessonIdx]?.markdown : '') || '_No notes for this lesson yet._')}
          top={topH}
          bottom={bottomH}
          readerScale={readerScale}
          isMax={isMax}
        />
      </div>

      {/* Dev-only raw audio */}
      {showAudioDebug && audioUrl && (
        <div className="mt-2 text-white/70 text-xs">
          <div>Debug audio element (direct MP3):</div>
          <audio controls src={audioUrl} style={{ width: '100%' }} />
        </div>
      )}
    </div>
  );
}
export default function ClassroomPlayer(props: Props) {
  const content = (
    <ThemeProvider>
      <Container {...props} />
    </ThemeProvider>
  );

  // When maximized, render the whole player into <body> so it truly
  // sits on top of everything else in the app (old portal behaviour).
  if (typeof document !== 'undefined' && props.maximized) {
    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-[9999] pointer-events-auto">
        {content}
      </div>,
      document.body
    );
  }

  // Normal inline rendering when not maximized
  return content;
}
