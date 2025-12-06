/* eslint-disable no-console */
/* eslint-disable react-hooks/exhaustive-deps */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  useWindowDimensions,
  Pressable,
  ImageBackground,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import type { AVPlaybackStatus } from 'expo-av';
import tw from '../../tailwind';

import LessonOverlay from './LessonOverlay.native';

// word-sync + shop
import { useWordSync } from '@mytutorapp/shared/hooks/useWordSync';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  listTtsVoices,
  type TtsVoiceInfo,
} from '@mytutorapp/shared/api/ttsAvatarApi';

// Subject-aware image helpers (shared)
import {
  pickImageForCourse,
  SUBJECT_IMAGE_MAP,
  SUBJECT_ALIASES,
  FALLBACK_COURSE_IMAGE,
} from '../../utils/subjectImages';

// split components
import TopBar from './player/TopBar.native';
import BottomBar from './player/BottomBar.native';
import Narration from './player/Narration.native';
import { ThemeProvider, useThemeTokens } from './player/ThemeContext.native';

type WordTiming = { text: string; start: number; end: number };

type SpeakAsMode = 'math' | 'spell-out' | 'characters' | 'none';
const toSpeakAsMode = (v?: string): SpeakAsMode | undefined => {
  switch ((v || '').toLowerCase()) {
    case 'math':
    case 'spell-out':
    case 'characters':
    case 'none':
      return v as SpeakAsMode;
    default:
      return undefined;
  }
};

type LessonImage = {
  id: string;
  title?: string;
  alt?: string;
  url?: string;
  caption?: string;
  announceAtSentence?: number;
};

type LessonSnippet = {
  id: string;
  title?: string;
  language?: string;
  code: string;
  explanation?: string;
  announceAtSentence?: number;
};

type LessonChart = {
  id: string;
  title?: string;
  kind?:
    | 'bar'
    | 'line'
    | 'pie'
    | 'histogram'
    | 'scatter'
    | 'box'
    | 'heatmap'
    | 'other';
  alt?: string;
  url?: string;
  svg?: string;
  caption?: string;
  announceAtSentence?: number;
};

type LessonLite = {
  id: string;
  title?: string;
  ssml: string;
  markdown?: string;
  formulas?: {
    id: string;
    latex: string;
    speakAs?: SpeakAsMode;
    title?: string;
    announceAtSentence?: number;
  }[];
  tables?: {
    title: string;
    columns: string[];
    rows: (string | number | boolean)[][];
    caption?: string;
    announceAtSentence?: number;
  }[];
  images?: LessonImage[];
  snippets?: LessonSnippet[];
  charts?: LessonChart[];
};

type OutlineSection = { id: string; title: string; keyPoints?: string[] };

const DEFAULT_VOICE = 'en-US-Wavenet-F';

export type ClassroomPlayerProps = {
  ssml?: string;
  lessons?: LessonLite[];
  title?: string;
  voiceName?: string;

  onNext?: () => Promise<boolean> | boolean;
  onPrev?: () => Promise<boolean> | boolean;

  isBuildingNext?: boolean;
  activeIndex?: number;

  maximized?: boolean;
  playerHeight?: number | string;
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
};

/* helpers */
const toOverlayLesson = (lesson: LessonLite | undefined) => {
  if (!lesson) return null;
  const formulas = Array.isArray(lesson.formulas)
    ? lesson.formulas.map((f) => ({
        id: f.id,
        latex: f.latex,
        speakAs: toSpeakAsMode(f.speakAs),
        title: f.title,
        announceAtSentence: f.announceAtSentence,
      }))
    : undefined;

  return { ...lesson, formulas };
};

function collectSubjectKeysFromText(txt: string) {
  const hay = txt.toLowerCase();
  const hits: string[] = [];
  for (const key of Object.keys(SUBJECT_IMAGE_MAP))
    if (hay.includes(key)) hits.push(key);
  for (const [canonical, aliases] of Object.entries(
    SUBJECT_ALIASES as Record<string, string[]>
  ))
    if (aliases.some((a) => hay.includes(a))) hits.push(canonical);
  return Array.from(new Set(hits));
}

function useBackdropImages({
  course,
  outline,
  backendUrl,
}: {
  course?: any | null;
  outline?: OutlineSection[];
  backendUrl?: string;
}) {
  const base = useMemo(() => {
    try {
      return course
        ? pickImageForCourse(course, backendUrl ?? '')
        : FALLBACK_COURSE_IMAGE;
    } catch {
      return FALLBACK_COURSE_IMAGE;
    }
  }, [course, backendUrl]);

  const images = useMemo(() => {
    const textBits: string[] = [];
    if (course?.title) textBits.push(course.title);
    if (course?.subject) textBits.push(course.subject);
    if (course?.category) textBits.push(course.category);
    if (course?.description) textBits.push(course.description);
    (outline || []).forEach((s) => {
      textBits.push(s.title);
      (s.keyPoints || []).forEach((k) => textBits.push(k));
    });

    const keys = collectSubjectKeysFromText(textBits.join(' '));
    const pool = new Set<string>([base]);
    const SIM = SUBJECT_IMAGE_MAP as Record<string, string>;
    keys.forEach((k) => {
      if (k && SIM[k]) pool.add(SIM[k]);
    });

    return Array.from(pool).slice(0, 4);
  }, [base, course, outline]);

  return { images, base };
}

/* ─────────────────────────────────────────────────────────
   Inner component
   ───────────────────────────────────────────────────────── */
function ClassroomPlayerNativeInner({
  ssml,
  lessons = [],
  title = 'AI Lesson',
  voiceName = DEFAULT_VOICE,

  maximized,
  onToggleMaximize,
  playerHeight,

  onNext,
  onPrev,
  isBuildingNext,
  activeIndex,

  course,
  outline = [],
  backendUrlOverride,
  playing = true,
  onEnded,
  onBeforePlay,
  onToggleThemePanel,
  onPlayerLoadingChange,
  onRequestStart,
  playJoinedIfAvailable = true,
  disableInternalBackdrop = true,
  backdropOverride,
}: ClassroomPlayerProps) {
  const ws = useWordSync() as any;
  const retimeEvenly =
    (ws.retimeEvenly as ((dur: number) => void) | undefined) ?? undefined;

  const speak = ws.speak as (
    backend: string,
    o: { ssml: string; voiceName: string }
  ) => Promise<unknown>;
  const loading: boolean = !!ws.loading;
  const error: string | null = ws.error ?? null;
  const wordsRaw: WordTiming[] = ws.words ?? [];
  const currentIndex: number = ws.currentIndex ?? 0;
  const resumeAudioContext = ws.resumeAudioContext ?? (async () => {});
  const seekToWord = ws.seekToWord ?? (() => {});
  const audioUrl: string | null = ws.audioUrl ?? null;
  const endedTick: number = ws.endedTick ?? 0;
  const markEnded = ws.markEnded ?? (() => {});
  const setTime: ((t: number) => void) | undefined = ws.setTime;

  const { backendUrl } = useShopContext();
  const effectiveBackend = backendUrlOverride || backendUrl;

  const hasLessons = Array.isArray(lessons) && lessons.length > 0;
  const hasJoined = typeof ssml === 'string' && ssml.trim().length > 0;
  const useJoined = playJoinedIfAvailable && hasJoined;

  // theme sheet
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const handleToggleThemeSheet = () => {
    setShowThemeSheet((v) => !v);
    onToggleThemePanel?.();
  };

  // 🔊 Voice selection state
  const initialVoice = voiceName || DEFAULT_VOICE;
  const [currentVoiceName, setCurrentVoiceName] = useState(initialVoice);
  const [voiceOptions, setVoiceOptions] = useState<string[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  // keep local voice in sync with prop defaults
  useEffect(() => {
    setCurrentVoiceName(voiceName || DEFAULT_VOICE);
  }, [voiceName]);

  // load voices from backend
  useEffect(() => {
    if (!effectiveBackend) return;
    let cancelled = false;

    const run = async () => {
      setVoicesLoading(true);
      setVoicesError(null);
      try {
        const resp = (await listTtsVoices(
          effectiveBackend
        )) as unknown as { voices?: TtsVoiceInfo[] } | TtsVoiceInfo[];

        const arr: TtsVoiceInfo[] = Array.isArray(resp)
          ? (resp as TtsVoiceInfo[])
          : (resp.voices || []);

        const names = arr
          .map((v) => (typeof v === 'string' ? v : v.name))
          .filter(Boolean) as string[];

        if (cancelled) return;

        setVoiceOptions(names);

        if (names.length && !names.includes(currentVoiceName)) {
          const fallback = names[0] ?? initialVoice;
          setCurrentVoiceName(fallback);
        }
      } catch (e: any) {
        if (cancelled) return;
        console.warn('[tts] listTtsVoices failed', e);
        setVoicesError(e?.message || 'Failed to load voices');
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [effectiveBackend]);

  const handleChangeVoice = useCallback((v: string) => {
    setCurrentVoiceName(v);

    (async () => {
      try {
        await soundRef.current?.unloadAsync();
      } catch {}
      soundRef.current = null;
    })().catch(() => {});

    requestedKeyRef.current = null;
  }, []);

  // AV state
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlayingAv, setIsPlayingAv] = useState(false);
  const [mediaDur, setMediaDur] = useState(0);
  const [mediaTime, setMediaTime] = useState(0);
  const retimedRef = useRef(false);
  const lastLoadedUrlRef = useRef<string | null>(null);
  const autoPlayArmedRef = useRef(false);
  const requestedKeyRef = useRef<string | null>(null);
  const speakKeyFor = (text: string) =>
    `${currentVoiceName}|${text.length}|${text.slice(0, 64)}`;

  // index state
  const [lessonIdx, setLessonIdx] = useState(0);
  useEffect(() => {
    if (typeof activeIndex === 'number') setLessonIdx(activeIndex);
  }, [activeIndex]);
  const displayIdx = typeof activeIndex === 'number' ? activeIndex : lessonIdx;

  const pickSpeakSource = useCallback(() => {
    const lessonCur = lessons[lessonIdx]?.ssml?.trim();
    if (lessonCur) return lessonCur;

    const firstReadyIdx = lessons.findIndex(
      (l) => l?.ssml && l.ssml.trim().length
    );
    if (firstReadyIdx >= 0) {
      return lessons[firstReadyIdx]!.ssml.trim();
    }

    if (useJoined && typeof ssml === 'string' && ssml.trim()) {
      return ssml.trim();
    }
    return '';
  }, [lessons, lessonIdx, useJoined, ssml]);

  const [chromeTop, setChromeTop] = useState(44);
  const [chromeBottom, setChromeBottom] = useState(84);
  const wdim = useWindowDimensions();
  const isSmall = wdim.width < 640;

  // expo-av status
  const onSoundStatus = useCallback(
    (st: AVPlaybackStatus) => {
      if (!st.isLoaded) return;
      const pos = (st.positionMillis ?? 0) / 1000;
      const dur = (st.durationMillis ?? 0) / 1000;
      setMediaTime(pos);
      setMediaDur(dur);

      setIsPlayingAv(st.isPlaying);
      try {
        setTime?.(pos);
      } catch {}

      if (!('isBuffering' in st) || !st.isBuffering) {
        try {
          onPlayerLoadingChange?.(false);
        } catch {}
      }

      if (st.didJustFinish) {
        setIsPlayingAv(false);
        try {
          markEnded();
        } catch {}
      }
    },
    [setTime, markEnded, onPlayerLoadingChange]
  );

  // load/unload sound when audioUrl changes
  useEffect(() => {
    (async () => {
      if (!audioUrl || audioUrl === lastLoadedUrlRef.current) return;
      lastLoadedUrlRef.current = audioUrl;

      // new track → allow retiming again
      retimedRef.current = false;

      try {
        if (soundRef.current) {
          try {
            await soundRef.current.unloadAsync();
          } catch {}
          soundRef.current = null;
        }
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, progressUpdateIntervalMillis: 100 },
          onSoundStatus
        );
        soundRef.current = sound;

        // retime words to match actual duration, once per URL
        if (retimeEvenly && !retimedRef.current && wordsRaw.length) {
          try {
            const st = await sound.getStatusAsync();
            if (st.isLoaded && st.durationMillis != null) {
              const durSec = st.durationMillis / 1000;
              const wordsTail = Math.max(...wordsRaw.map((w) => w.end || 0));
              const diff = Math.abs(durSec - wordsTail);
              const rel = diff / Math.max(0.5, durSec);
              if (diff > 0.05 || rel > 0.02) {
                retimeEvenly(durSec);
                retimedRef.current = true;
              }
            }
          } catch {}
        }

        if (autoPlayArmedRef.current) {
          try {
            await sound.playAsync();
            setIsPlayingAv(true);
          } catch {}
          autoPlayArmedRef.current = false;
        }
      } catch (e) {
        console.warn('Failed to load sound', e);
      }
    })();
  }, [audioUrl, onSoundStatus, retimeEvenly, wordsRaw]);

  // 🔊 auto-start TTS (first time only; doesn't re-trigger on voice change)
  useEffect(() => {
    if (!effectiveBackend || audioUrl || loading) return;
    const cur = pickSpeakSource();
    if (!cur) return;
    const key = speakKeyFor(cur);
    if (requestedKeyRef.current === key) return;
    onPlayerLoadingChange?.(true);
    autoPlayArmedRef.current = true;
    speak(effectiveBackend, { ssml: cur, voiceName: currentVoiceName }).catch(
      () => {}
    );
  }, [
    lessons,
    ssml,
    audioUrl,
    loading,
    effectiveBackend,
    currentVoiceName,
    pickSpeakSource,
    speak,
    onPlayerLoadingChange,
  ]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      (async () => {
        try {
          await soundRef.current?.unloadAsync();
        } catch {}
        soundRef.current = null;
      })();
    };
  }, []);

  // play/pause handler
  const handlePlayClick = useCallback(async () => {
    const snd = soundRef.current;

    if (!snd) {
      autoPlayArmedRef.current = true;
      requestedKeyRef.current = null;

      try {
        await resumeAudioContext?.();
        onPlayerLoadingChange?.(true);
        await onBeforePlay?.();
      } catch (e) {
        console.warn(
          '[word-sync] resume/onBeforePlay failed (continuing):',
          e
        );
      }

      const cur = pickSpeakSource();
      if (cur && effectiveBackend && !loading) {
        const key = speakKeyFor(cur);
        if (requestedKeyRef.current !== key) {
          requestedKeyRef.current = key;
          speak(effectiveBackend, {
            ssml: cur,
            voiceName: currentVoiceName,
          }).catch((e) => console.warn('[word-sync] speak() failed', e));
        }
      }
      return;
    }

    try {
      const st = await snd.getStatusAsync();
      if (!st.isLoaded) return;
      if (st.isPlaying) {
        await snd.pauseAsync();
        setIsPlayingAv(false);
      } else {
        await onBeforePlay?.();
        await snd.playAsync();
        setIsPlayingAv(true);
      }
    } catch (e) {
      console.warn('[word-sync] toggle failed:', e);
    }
  }, [
    resumeAudioContext,
    onPlayerLoadingChange,
    onBeforePlay,
    pickSpeakSource,
    loading,
    effectiveBackend,
    currentVoiceName,
    speak,
  ]);

  const seekToTimeAv = useCallback(
    async (sec: number) => {
      const snd = soundRef.current;
      if (!snd) return;
      try {
        const st = await snd.getStatusAsync();
        if (!st.isLoaded) return;
        const dur = (st.durationMillis ?? 0) / 1000;
        const t = Math.max(0, Math.min(dur || 0, sec));
        await snd.setPositionAsync(t * 1000);
        setMediaTime(t);
        try {
          setTime?.(t);
        } catch {}
      } catch {}
    },
    [setTime]
  );

  const nudgeSeconds = useCallback(
    async (d: number) => {
      const snd = soundRef.current;
      if (!snd) return;
      try {
        const st = await snd.getStatusAsync();
        if (!st.isLoaded) return;
        const cur = (st.positionMillis ?? 0) / 1000;
        await seekToTimeAv(cur + d);
      } catch {}
    },
    [seekToTimeAv]
  );

  // max / drawers
  const [internalMax, setInternalMax] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const isControlledMax = typeof maximized === 'boolean';
  const isMax = isControlledMax ? (maximized as boolean) : internalMax;
  const toggleMax = () => {
    if (onToggleMaximize) onToggleMaximize();
    else setInternalMax((v) => !v);
  };

  const totalLessonsForUi = useMemo(
    () => Math.max(lessons?.length || 0, outline?.length || 0) || 1,
    [lessons?.length, outline?.length]
  );

  const handlePrevClick = useCallback(async () => {
    if (useJoined) return;
    if (typeof onPrev === 'function') {
      try {
        const parentDidAdvance = await onPrev();
        if (parentDidAdvance) return;
      } catch {}
    }
    if (typeof activeIndex !== 'number') {
      setLessonIdx((i) => Math.max(0, i - 1));
    }
  }, [useJoined, onPrev, activeIndex]);

  const handleNextClick = useCallback(async () => {
    if (useJoined) return;
    if (typeof onNext === 'function') {
      try {
        const parentDidAdvance = await onNext();
        if (parentDidAdvance) return;
      } catch {}
    }
    if (typeof activeIndex !== 'number') {
      setLessonIdx((i) =>
        Math.min(i + 1, Math.max(totalLessonsForUi - 1, 0))
      );
    }
  }, [useJoined, onNext, activeIndex, totalLessonsForUi]);

  // build lines from word timings
  const LINES = useMemo(() => {
    type Line = { text: string; start: number; end: number; indices: number[] };
    const arr: Line[] = [];
    let buf = '';
    let start = 0;
    let indices: number[] = [];
    const maxChars = isSmall ? 40 : 64;

    wordsRaw.forEach((w, i) => {
      const piece = (buf ? ' ' : '') + w.text;
      if ((buf + piece).length > maxChars && buf) {
        const li = indices.length ? indices[indices.length - 1]! : -1;
        const endTime =
          li >= 0 && wordsRaw[li] ? (wordsRaw[li]!.end ?? start) : start;
        arr.push({ text: buf, start, end: endTime, indices });
        buf = w.text;
        start = Number.isFinite(w.start) ? (w.start as number) : start;
        indices = [i];
      } else {
        if (!buf)
          start = Number.isFinite(w.start) ? (w.start as number) : start;
        buf += piece;
        indices.push(i);
      }
    });
    if (buf && indices.length) {
      const li = indices.length ? indices[indices.length - 1]! : -1;
      const endTime =
        li >= 0 && wordsRaw[li] ? (wordsRaw[li]!.end ?? start) : start;
      arr.push({ text: buf, start, end: endTime, indices });
    }
    return arr;
  }, [wordsRaw, isSmall]);

  const activeLine = useMemo(() => {
    const idx = LINES.findIndex((ln) => ln.indices.includes(currentIndex));
    return idx === -1 ? 0 : idx;
  }, [LINES, currentIndex]);

  const durationSec =
    mediaDur || (wordsRaw.length ? Math.max(...wordsRaw.map((w) => w.end)) : 0);
  const currentSec = mediaTime || (wordsRaw[currentIndex]?.start ?? 0);
  const progress = durationSec ? currentSec / durationSec : 0;

  // end handling + auto-advance
  const advancingRef = useRef(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const endFiredForRef = useRef<number | null>(null);
  const lastEndedTickRef = useRef(0);

  useEffect(() => {
    if (!endedTick || endedTick === lastEndedTickRef.current) return;
    lastEndedTickRef.current = endedTick;

    if (error) return;
    if (wordsRaw.length) return;

    if (useJoined) {
      if (endFiredForRef.current !== -1) {
        autoPlayArmedRef.current = true;
        endFiredForRef.current = -1;
        try {
          onEnded?.();
        } catch {}
      }
      return;
    }

    if (endFiredForRef.current !== lessonIdx) {
      autoPlayArmedRef.current = true;
      endFiredForRef.current = lessonIdx;
      try {
        onEnded?.();
      } catch {}
    }

    const hasImmediateNext = hasLessons && lessonIdx < lessons.length - 1;
    const maybeMoreComing =
      (outline?.length || 0) > (lessons?.length || 0);

    if (!hasImmediateNext && !maybeMoreComing) return;
    if (advancingRef.current) return;

    advancingRef.current = true;
    setIsAdvancing(true);
    onPlayerLoadingChange?.(true);
    autoPlayArmedRef.current = true;

    if (hasImmediateNext) {
      setTimeout(() => {
        setLessonIdx((i) => Math.min(i + 1, lessons.length - 1));
        advancingRef.current = false;
        setIsAdvancing(false);
      }, 50);
    } else if (typeof onNext === 'function') {
      (async () => {
        try {
          await onNext();
        } catch {}
        advancingRef.current = false;
        setIsAdvancing(false);
      })();
    }
  }, [
    endedTick,
    error,
    wordsRaw.length,
    useJoined,
    lessonIdx,
    hasLessons,
    lessons.length,
    outline?.length,
    onEnded,
    onNext,
    onPlayerLoadingChange,
  ]);

  useEffect(() => {
    onPlayerLoadingChange?.(loading || isAdvancing);
  }, [loading, isAdvancing, onPlayerLoadingChange]);

  // backdrop
  const { images, base } = useBackdropImages({
    course: course || null,
    outline,
    backendUrl: effectiveBackend,
  });
  const [bgIdx, setBgIdx] = useState(0);
  const fadeA = useRef(new Animated.Value(1)).current;
  const fadeB = useRef(new Animated.Value(0)).current;
  const [frontA, setFrontA] = useState(true);

  useEffect(() => {
    if (
      disableInternalBackdrop ||
      (typeof playing === 'boolean' ? !playing : !isPlayingAv) ||
      images.length <= 1
    )
      return;
    const t = setInterval(() => {
      if (frontA) {
        setBgIdx((i) => (i + 1) % images.length);
        fadeB.setValue(0);
        Animated.timing(fadeB, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          fadeA.setValue(0);
          setFrontA(false);
        });
      } else {
        setBgIdx((i) => (i + 1) % images.length);
        fadeA.setValue(0);
        Animated.timing(fadeA, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          fadeB.setValue(0);
          setFrontA(true);
        });
      }
    }, 14000);
    return () => clearInterval(t);
  }, [images.length, disableInternalBackdrop, playing, isPlayingAv, fadeA, fadeB, frontA]);

  const currentBg = images[bgIdx] || base;

  const titleForUi = useJoined
    ? title
    : hasLessons
    ? lessons[displayIdx]?.title ||
      `${title} — Lesson ${displayIdx + 1}/${totalLessonsForUi}`
    : title;

  const currentLesson = hasLessons ? lessons[lessonIdx] : undefined;
  const notesMarkdown = useMemo(() => {
    const md = (currentLesson?.markdown || '').trim();
    if (md) return md;
    const eqs = (currentLesson?.formulas || [])
      .map((f) => `**${f.id || ''}**\n\n${f.latex || ''}`)
      .join('\n\n');
    const tbls = (currentLesson?.tables || [])
      .map((t) => {
        if (!t?.columns?.length || !t?.rows?.length) return '';
        const head = `| ${t.columns.join(' | ')} |`;
        const sep = `| ${t.columns.map(() => '---').join(' | ')} |`;
        const rows = t.rows
          .map((r) => `| ${r.map((v) => String(v)).join(' | ')} |`)
          .join('\n');
        return `\n\n**${t.title || 'Table'}**\n\n${head}\n${sep}\n${rows}`;
      })
      .join('\n\n');
    return [eqs, tbls].filter(Boolean).join('\n\n').trim();
  }, [currentLesson]);

  const Core = (
    <View style={tw`flex-1 bg-[#0b1220]`}>
      <TopBar
        voiceName={currentVoiceName}
        title={titleForUi}
        useJoined={useJoined}
        hasLessons={hasLessons}
        displayIdx={displayIdx}
        totalLessonsForUi={totalLessonsForUi}
        isBuildingNext={!!isBuildingNext}
        isPlaying={isPlayingAv}
        loading={loading}
        showTranscript={showTranscript}
        showNotes={showNotes}
        isMax={isMax}
        onMeasuredHeight={setChromeTop}
        onPlay={handlePlayClick}
        onPrev={handlePrevClick}
        onNext={handleNextClick}
        onToggleTranscript={() => setShowTranscript((s) => !s)}
        onToggleNotes={() => setShowNotes((s) => !s)}
        onToggleMax={toggleMax}
        onToggleThemePanel={handleToggleThemeSheet}
        voiceOptions={voiceOptions}
        voiceLoading={voicesLoading}
        voiceError={voicesError}
        onChangeVoice={handleChangeVoice}
      />

      <View
        style={tw`flex-1`}
        pointerEvents="box-none"
        removeClippedSubviews={false}
      >
        {!disableInternalBackdrop && !backdropOverride && (
          <View style={tw`absolute inset-0`}>
            <Animated.View
              style={[tw`absolute inset-0`, { opacity: frontA ? fadeA : fadeB }]}
            >
              <ImageBackground
                source={{ uri: currentBg }}
                resizeMode="cover"
                style={tw`flex-1`}
              >
                <View style={tw`absolute inset-0 bg-black/25`} />
              </ImageBackground>
            </Animated.View>
            <Animated.View
              style={[tw`absolute inset-0`, { opacity: frontA ? fadeB : fadeA }]}
            >
              <ImageBackground
                source={{ uri: currentBg }}
                resizeMode="cover"
                style={tw`flex-1`}
              >
                <View style={tw`absolute inset-0 bg-black/25`} />
              </ImageBackground>
            </Animated.View>
          </View>
        )}
        {backdropOverride}

        <Narration
          chromeTop={chromeTop}
          chromeBottom={chromeBottom}
          words={wordsRaw}
          lines={LINES}
          activeLine={activeLine}
          currentIndex={currentIndex}
          isMax={isMax}
        />

        <LessonOverlay
          words={wordsRaw}
          currentIndex={currentIndex}
          lesson={toOverlayLesson(currentLesson)}
          topOffset={chromeTop}
          lingerMs={6000}
          defaultPinned={false}
          rememberKey={
            currentLesson?.id ? `overlay:${currentLesson.id}` : 'overlay:joined'
          }
          zIndex={10000}
          freeMove
          fullOnMaximize
        />

        {!wordsRaw.length && !error && !isAdvancing && (
          <View
            style={[
              tw`absolute left-0 right-0 items-center`,
              { bottom: chromeBottom + 8 },
            ]}
          >
            <View
              style={tw`flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-black/65`}
            >
              <View
                style={tw`h-3 w-3 rounded-full border-2 border-white/30 border-t-white`}
              />
              <Text style={tw`text-white/90 text-xs`}>
                Generating lesson narration…
              </Text>
            </View>
          </View>
        )}

        {isAdvancing && (
          <View style={tw`absolute inset-0 items-center justify-center`}>
            <View style={tw`rounded-full bg-black/60 p-5`}>
              <View
                style={tw`h-10 w-10 rounded-full border-2 border-white/30 border-t-white`}
              />
            </View>
            <Text style={tw`mt-3 text-white/90 text-sm`}>
              Loading next lesson…
            </Text>
          </View>
        )}

        {error && !loading && (
          <View style={[tw`absolute left-2`, { bottom: chromeBottom + 8 }]}>
            <Text style={tw`text-red-200 bg-red-950/50 px-2 py-1 rounded`}>
              {error}
            </Text>
          </View>
        )}
      </View>

      <BottomBar
        currentSec={currentSec}
        durationSec={durationSec}
        progress={progress}
        onBack5={() => nudgeSeconds(-5)}
        onFwd5={() => nudgeSeconds(5)}
        onPlay={handlePlayClick}
        playing={isPlayingAv}
        loading={loading}
        useJoined={useJoined}
        hasLessons={hasLessons}
        displayIdx={displayIdx}
        totalLessonsForUi={totalLessonsForUi}
        isBuildingNext={!!isBuildingNext}
        showTranscript={showTranscript}
        showNotes={showNotes}
        isMax={isMax}
        onMeasuredHeight={setChromeBottom}
        onPrev={handlePrevClick}
        onNext={handleNextClick}
        onToggleTranscript={() => setShowTranscript((s) => !s)}
        onToggleThemePanel={handleToggleThemeSheet}
        onToggleMax={toggleMax}
        onToggleNotes={() => setShowNotes((s) => !s)}
        onSeek={seekToTimeAv}
      />

      <ThemeSheetInline
        open={showThemeSheet}
        onClose={() => setShowThemeSheet(false)}
      />
    </View>
  );

  return isMax ? (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={toggleMax}
    >
      {Core}
      <TranscriptDrawerInline
        open={showTranscript}
        title={titleForUi}
        lines={LINES}
        words={wordsRaw}
        activeLine={activeLine}
        readerScale={1}
        loading={!!loading}
        error={error ?? undefined}
        onSeekToWord={(wi: number) => seekToWord(wi)}
        onClose={() => setShowTranscript(false)}
      />

      <NotesDrawerInline
        open={showNotes}
        title={`${titleForUi} — Notes`}
        markdown={
          (currentLesson?.markdown || '').trim() ||
          (notesMarkdown || '_No notes for this lesson yet._')
        }
        onClose={() => setShowNotes(false)}
      />
    </Modal>
  ) : (
    <View
      style={[
        { width: '100%', minHeight: 260 },
        playerHeight != null ? { height: playerHeight } : tw`flex-1`,
        tw`bg-[#0b1220] rounded-[28px] overflow-hidden ring-1 ring-white/15`,
      ]}
    >
      {Core}
      <TranscriptDrawerInline
        open={showTranscript}
        title={titleForUi}
        lines={LINES}
        words={wordsRaw}
        activeLine={activeLine}
        readerScale={1}
        loading={!!loading}
        error={error ?? undefined}
        onSeekToWord={(wi: number) => seekToWord(wi)}
        onClose={() => setShowTranscript(false)}
      />

      <NotesDrawerInline
        open={showNotes}
        title={`${titleForUi} — Notes`}
        markdown={
          (currentLesson?.markdown || '').trim() ||
          (notesMarkdown || '_No notes for this lesson yet._')
        }
        onClose={() => setShowNotes(false)}
      />

      <ThemeSheetInline
        open={showThemeSheet}
        onClose={() => setShowThemeSheet(false)}
      />
    </View>
  );
}

/* public export with ThemeProvider */
export default function ClassroomPlayerNative(props: ClassroomPlayerProps) {
  return (
    <ThemeProvider>
      <ClassroomPlayerNativeInner {...props} />
    </ThemeProvider>
  );
}

/* drawers */
function TranscriptDrawerInline({
  open,
  title,
  lines,
  words,
  activeLine,
  readerScale,
  loading,
  error,
  onSeekToWord,
  onClose,
}: {
  open: boolean;
  title: string;
  lines: { text: string; start: number; end: number; indices: number[] }[];
  words: any[];
  activeLine: number;
  readerScale: number;
  loading: boolean;
  error?: string;
  onSeekToWord: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      animationType="slide"
      visible={open}
      transparent
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[tw`flex-1`, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
      >
        <Pressable style={tw`flex-1`} onPress={onClose} />

        <View
          style={[
            tw`bg-slate-900 rounded-t-2xl px-4 pt-3 pb-6`,
            { maxHeight: '70%' },
          ]}
        >
          <Text style={tw`text-white text-base font-semibold mb-2`}>
            {title} — Transcript
          </Text>
          {loading && (
            <Text style={tw`text-white/80 mb-2`}>Generating…</Text>
          )}
          {error ? (
            <Text style={tw`text-red-300`}>{error}</Text>
          ) : (
            <ScrollView style={tw`max-h-[60%]`} contentContainerStyle={tw`pb-4`}>
              {lines.map((ln, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => onSeekToWord(ln.indices[0] ?? 0)}
                  style={[
                    tw`px-3 py-2 rounded-lg mb-2`,
                    {
                      backgroundColor:
                        idx === activeLine
                          ? 'rgba(255,255,255,0.08)'
                          : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      tw`text-white`,
                      { fontSize: Math.min(18, 16 * readerScale) },
                    ]}
                  >
                    {ln.text}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function NotesDrawerInline({
  open,
  title,
  markdown,
  onClose,
}: {
  open: boolean;
  title: string;
  markdown: string;
  onClose: () => void;
}) {
  return (
    <Modal
      animationType="slide"
      visible={open}
      transparent
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[tw`flex-1`, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
      >
        <Pressable style={tw`flex-1`} onPress={onClose} />

        <View
          style={[
            tw`bg-slate-900 rounded-t-2xl px-4 pt-3 pb-6`,
            { maxHeight: '70%' },
          ]}
        >
          <Text style={tw`text-white text-base font-semibold mb-2`}>
            {title}
          </Text>
          <ScrollView>
            <Text style={tw`text-white/90`}>
              {markdown || '_No notes for this lesson yet._'}
            </Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────
   Theme sheet bottom modal
   ───────────────────────────────────────────────────────── */
function ThemeSheetInline({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { hlHex, genHex, templateId, setTemplateId, applyPreset } =
    useThemeTokens();

  const presets = [
    { key: 'default', label: 'Orange', swatch: '#f97316' },
    { key: 'sky', label: 'Sky', swatch: '#0ea5e9' },
    { key: 'lime', label: 'Lime', swatch: '#84cc16' },
    { key: 'violet', label: 'Violet', swatch: '#8b5cf6' },
    { key: 'amber', label: 'Amber', swatch: '#fbbf24' },
    { key: 'rose', label: 'Rose', swatch: '#f97373' },
  ];

  const templates: { id: any; label: string; desc: string }[] = [
    { id: 'boxed-pill', label: 'Pill', desc: 'Rounded box around active word' },
    { id: 'clean-stripe', label: 'Stripe', desc: 'Soft stripe behind text' },
    { id: 'underline-glow', label: 'Underline', desc: 'Bright underline' },
    { id: 'karaoke-glow', label: 'Glow', desc: 'Karaoke-style glow' },
    { id: 'ribbon', label: 'Ribbon', desc: 'Long pill ribbon' },
  ];

  return (
    <Modal animationType="slide" visible={open} transparent>
      <SafeAreaView
        style={[tw`flex-1 justify-end`, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      >
        <Pressable style={tw`flex-1`} onPress={onClose} />
        <View
          style={[
            tw`bg-slate-900 rounded-t-3xl px-4 pt-3 pb-6`,
            { maxHeight: '70%' },
          ]}
        >
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-white text-base font-semibold`}>
              Theme & Highlights
            </Text>
            <Pressable onPress={onClose}>
              <Text style={tw`text-slate-300 text-sm`}>Done</Text>
            </Pressable>
          </View>

          <Text style={tw`text-slate-300 text-xs mb-2`}>Highlight style</Text>
          <View style={tw`flex-col mb-3`}>
            {templates.map((t) => {
              const selected = t.id === templateId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTemplateId(t.id)}
                  style={tw`flex-row items-center py-1.5`}
                >
                  <View
                    style={[
                      tw`h-4 w-4 rounded-full mr-2 border border-slate-500 items-center justify-center`,
                      selected && tw`border-white`,
                    ]}
                  >
                    {selected && (
                      <View style={tw`h-2 w-2 rounded-full bg-white`} />
                    )}
                  </View>
                  <View>
                    <Text style={tw`text-white text-sm`}>{t.label}</Text>
                    <Text style={tw`text-slate-400 text-xs`}>{t.desc}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={tw`text-slate-300 text-xs mb-2`}>
            Highlight color
          </Text>
          <View style={tw`flex-row flex-wrap gap-2 mb-3`}>
            {presets.map((p) => {
              const isActive =
                hlHex.toLowerCase() === p.swatch.toLowerCase();
              return (
                <Pressable
                  key={p.key}
                  onPress={() => applyPreset(p.key)}
                  style={tw`items-center`}
                >
                  <View
                    style={[
                      tw`h-7 w-7 rounded-full border border-slate-700`,
                      {
                        backgroundColor: p.swatch,
                        borderColor: isActive
                          ? '#ffffff'
                          : 'rgba(148,163,184,0.7)',
                      },
                    ]}
                  />
                  <Text style={tw`text-slate-300 text-[10px] mt-0.5`}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={tw`text-slate-500 text-[11px]`}>
            Active:{' '}
            <Text style={tw`text-slate-200`}>{hlHex}</Text> · Past text:{' '}
            <Text style={tw`text-slate-200`}>{genHex}</Text>
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
