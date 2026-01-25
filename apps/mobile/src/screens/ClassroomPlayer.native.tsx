
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  useColorScheme,
  AppState,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../../tailwind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import { useShopContext } from '@mytutorapp/shared/context';
import { useWordSync } from '@mytutorapp/shared/hooks/useWordSync';
import type { PlaybackPayload, PlaybackQueueItem } from '@mytutorapp/shared/types';
import { ssmlToPlainText } from '@mytutorapp/shared/utils/ssmlText';

import { listTtsVoices, type TtsVoiceInfo } from '@mytutorapp/shared/api/ttsAvatarApi';

import Markdown from '@/screens/Markdown.native';

import {
  ThemeProvider,
  useThemeTokens,
  type HighlightTemplate,
} from '../screens/player/ThemeContext.native';
import VoiceSelectNative from '../screens/player/VoiceSelect.native';

// ───────────────────────── Types ─────────────────────────

export type LessonLite = {
  id: string;
  title?: string;
  ssml: string;
  markdown?: string;
};

export type OutlineSection = {
  id: string;
  title: string;
  keyPoints?: string[];
};

type SentenceGroup = {
  indices: number[];
  start?: number;
  end?: number;
};

type Props = {
  ssml?: string;
  lessons?: LessonLite[];
  title?: string;
  voiceName?: string;
  onNext?: () => Promise<boolean> | boolean;
  onPrev?: () => Promise<boolean> | boolean;
  isBuildingNext?: boolean;
  onEnded?: () => void;
  onWordSync?: (p: { words: any[]; currentIndex: number }) => void;

  course?: any | null;
  outline?: OutlineSection[];
  backendUrlOverride?: string;
  playJoinedIfAvailable?: boolean;
  onBeforePlay?: () => Promise<void> | void;

  onPlayerLoadingChange?: (loading: boolean) => void;
  onRequestStart?: () => Promise<void> | void;

  activeIndex?: number;

  // ✅ ADD THESE (for ClassroomThemeShell compatibility)
  disableInternalBackdrop?: boolean;
  backdropOverride?: React.ReactNode;
  onToggleThemePanel?: () => void;

  // ✅ optional alias support (your shell already passes this sometimes)
  onLoadingChange?: (loading: boolean) => void;

  gateMode?: 'narration' | 'notes_only';
  gateNotice?: {
    reason?: string;
    resetsAt?: string | null;
    remainingMinutes?: number | null;
  } | null;
  gateUsage?: Array<{
    bucket?: string;
    remainingSeconds?: number;
    limitSeconds?: number;
    resetsAt?: string | null;
  }>;
  hideGateBanner?: boolean;
  playback?: PlaybackPayload | null;
  mode?: 'lesson' | 'language';
  voiceId?: string;
  rate?: number;
  pitch?: number;
};

// ─────────────────────── Constants ───────────────────────

const VOICE_KEY = 'classroomMobileVoice';
const SCALE_KEY = 'classroomMobileScale';
const TEMPLATE_KEY = 'classroomMobileTemplate';

// Small helper
function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function indexForTime(ws: Array<{ start: number; end: number }>, t: number): number {
  if (!ws.length) return 0;

  const first = ws[0];
  if (!first || typeof first.start !== 'number') return 0;
  if (t <= first.start) return 0;

  const last = ws[ws.length - 1];
  if (!last || typeof last.end !== 'number') return ws.length - 1;
  if (t >= last.end) return ws.length - 1;

  let lo = 0;
  let hi = ws.length - 1;
  let ans = ws.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midWord = ws[mid];

    if (!midWord) {
      hi = mid - 1;
      continue;
    }

    if (midWord.end >= t) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return Math.max(0, Math.min(ans, ws.length - 1));
}

function buildSegmentsFromQueue(items: PlaybackQueueItem[]) {
  const map = new Map<number, { en?: string; tr?: string }>();
  for (const item of items) {
    const entry = map.get(item.segmentIdx) || {};
    if (item.kind === 'en') entry.en = item.text;
    if (item.kind === 'tr') entry.tr = item.text;
    map.set(item.segmentIdx, entry);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([idx, seg]) => ({
      segmentIdx: idx,
      en: seg.en || '',
      tr: seg.tr || '',
    }));
}

const LanguageQueuePlayerNative: React.FC<{
  playback?: PlaybackPayload | null;
  title?: string;
  rate?: number;
}> = ({ playback, title, rate = 1 }) => {
  const items = playback?.items || [];
  const segments = useMemo(() => buildSegmentsFromQueue(items), [items]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentItem = items[currentIndex];
  const currentSegmentIdx = currentItem?.segmentIdx ?? 0;
  const currentSegment =
    segments.find((seg) => seg.segmentIdx === currentSegmentIdx) || segments[0];

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  const loadCurrent = useCallback(async () => {
    clearTimer();
    await unloadSound();
    if (!currentItem?.audioUrl) return;
    const sound = new Audio.Sound();
    soundRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        if (currentIndex + 1 < items.length) {
          setAutoPlayNext(true);
          setCurrentIndex((i) => i + 1);
        } else {
          setPlaying(false);
        }
      }
    });
    await sound.loadAsync({ uri: currentItem.audioUrl }, { shouldPlay: false });
    await sound.setRateAsync(rate, true);
    if (autoPlayNext || playing) {
      const delay = currentItem.kind === 'en' ? 350 : 250;
      timerRef.current = setTimeout(async () => {
        try {
          await sound.playAsync();
          setPlaying(true);
        } catch {
          setPlaying(false);
        } finally {
          setAutoPlayNext(false);
        }
      }, delay);
    }
  }, [autoPlayNext, currentIndex, currentItem, items.length, playing, rate, unloadSound]);

  useEffect(() => {
    if (!soundRef.current) return;
    soundRef.current.setRateAsync(rate, true).catch(() => {});
  }, [rate]);

  useEffect(() => {
    loadCurrent();
    return () => {
      clearTimer();
    };
  }, [loadCurrent]);

  useEffect(() => {
    setCurrentIndex(0);
    setPlaying(false);
    setAutoPlayNext(false);
    unloadSound();
  }, [playback?.items, unloadSound]);

  useEffect(() => {
    return () => {
      unloadSound();
    };
  }, [unloadSound]);

  const handlePlayPause = useCallback(async () => {
    if (!soundRef.current) {
      setPlaying(false);
      return;
    }
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
      setPlaying(false);
    } else {
      await soundRef.current.playAsync();
      setPlaying(true);
    }
  }, []);

  const handleReplaySegment = useCallback(() => {
    const idx = items.findIndex(
      (item) => item.segmentIdx === currentSegmentIdx && item.kind === 'en'
    );
    if (idx >= 0) {
      setCurrentIndex(idx);
      setAutoPlayNext(true);
      setPlaying(true);
    }
  }, [items, currentSegmentIdx]);

  return (
    <View style={tw`rounded-2xl bg-slate-900/90 p-4`}>
      <Text style={tw`text-sm text-white font-semibold mb-3`}>{title || 'Language Learning'}</Text>
      <View style={tw`rounded-xl bg-white/10 p-3`}>
        <Text style={tw`text-base text-white`}>{currentSegment?.en || '—'}</Text>
        <Text style={tw`text-xs text-white/60`}>{currentSegment?.tr || '—'}</Text>
      </View>
      <View style={tw`flex-row items-center gap-2 mt-3`}>
        <Pressable onPress={handlePlayPause} style={tw`rounded-full bg-white/10 px-4 py-1`}>
          <Text style={tw`text-sm text-white`}>{playing ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable onPress={handleReplaySegment} style={tw`rounded-full bg-white/5 px-3 py-1`}>
          <Text style={tw`text-xs text-white`}>Replay segment</Text>
        </Pressable>
        <Text style={tw`text-xs text-white/60`}>
          {currentIndex + 1} / {items.length || 0}
        </Text>
      </View>
    </View>
  );
};

function hasUsefulPunctuation(arr: Array<{ text?: string }>) {
  return (arr || []).some((w) => {
    const t = (w?.text || '').trim();
    if (!t) return false;

    // punctuation-only tokens like "..." or "—"
    if (/^[\p{P}\p{S}]+$/u.test(t)) return true;

    // sentence / clause punctuation (IGNORE apostrophes inside words)
    return /[.!?…,:;(){}[\]]/.test(t);
  });
}

function mergeExampleSentenceGroups(
  groups: Array<{ indices: number[] }> = [],
  words: Array<{ text?: string }> = []
) {
  if (!groups.length) return groups;
  const exampleRe = /\b(for instance|for example|let's look at an example)\b/i;
  const sentenceText = (group: { indices: number[] }) =>
    group.indices
      .map((wi) => words[wi]?.text)
      .filter(Boolean)
      .join(' ')
      .trim();

  const merged: Array<{ indices: number[] }> = [];
  let i = 0;
  while (i < groups.length) {
    const current = groups[i];
    const currentText = sentenceText(current);
    const next = groups[i + 1];
    const nextText = next ? sentenceText(next) : '';

    if (currentText && exampleRe.test(currentText) && next && !nextText) {
      let j = i + 2;
      let nextNonEmpty: { indices: number[] } | null = null;
      while (j < groups.length) {
        const text = sentenceText(groups[j]);
        if (text) {
          nextNonEmpty = groups[j];
          break;
        }
        j++;
      }
      if (nextNonEmpty) {
        merged.push({ ...current, indices: [...current.indices, ...nextNonEmpty.indices] });
        i = j + 1;
        continue;
      }
    }

    merged.push(current);
    i++;
  }
  return merged;
}

// ───────────────────── Inner Player ─────────────────────

type TabKey = 'narration' | 'notes';

const InnerPlayer: React.FC<Props> = (props) => {
  const {
    ssml,
    lessons = [],
    title = 'AI Lesson',
    voiceName = 'en-US-Wavenet-C',
    onNext,
    onPrev,
    isBuildingNext,
    course,
    onWordSync,
    outline = [],
    backendUrlOverride,
    playJoinedIfAvailable = false,
    onBeforePlay,
    onPlayerLoadingChange,
    onRequestStart,
    onEnded,
    activeIndex,
    disableInternalBackdrop,
    backdropOverride,
    onToggleThemePanel,
    onLoadingChange,
    playback,
    mode,
  } = props;

  const isLanguageMode = mode === 'language' || playback?.mode === 'queue';
  if (isLanguageMode) {
    return <LanguageQueuePlayerNative playback={playback} title={title} rate={props.rate} />;
  }

  const loadingCb = onPlayerLoadingChange ?? onLoadingChange;

  const narrationLocked = props.gateMode === 'notes_only';
  const canNarrate = !narrationLocked;

  const gateReset = props.gateNotice?.resetsAt
    ? new Date(props.gateNotice.resetsAt).toLocaleString()
    : null;

  // ✅ Define tab state + helpers (fixes: activeTab, isNotesTab, switchToNotes, switchToNarration)
  const [activeTab, setActiveTab] = useState<TabKey>(narrationLocked ? 'notes' : 'narration');

  useEffect(() => {
    // If quota locks narration, force notes tab.
    if (narrationLocked) setActiveTab('notes');
  }, [narrationLocked]);

  const isNotesTab = activeTab === 'notes';

  const switchToNarration = useCallback(() => {
    if (!canNarrate) return; // locked → ignore
    setActiveTab('narration');
  }, [canNarrate]);

  const switchToNotes = useCallback(() => {
    setActiveTab('notes');
  }, []);

  // ✅ Notes helper strings (fixes: notesSubtitle, notesCtaLabel)
  const notesSubtitle = useMemo(() => {
    if (narrationLocked) {
      if (props.gateNotice?.reason) return props.gateNotice.reason;
      if (gateReset) return `Narration will reset on: ${gateReset}`;
      return 'Narration is currently unavailable. You can still read the notes.';
    }
    return 'Read the lesson notes here. Switch back to Narration anytime to listen.';
  }, [narrationLocked, props.gateNotice?.reason, gateReset]);

  const notesCtaLabel = useMemo(() => {
    if (narrationLocked) return 'Keep learning with notes while narration is locked.';
    return 'Switch back to Narration to listen to the lesson.';
  }, [narrationLocked]);

  const { backendUrl } = useShopContext();
  const effectiveBackend = backendUrlOverride || backendUrl;

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  const { hlHex, genHex, activeTextOnHl, templateId, setTemplateId } = useThemeTokens();

  const {
    speak,
    loading,
    error,
    words: wordsRaw,
    sentenceGroups,
    clearForNewSession,
    volume,
    setVolume,
    endedTick,
    markEnded,
    audioUrl,
    retimeEvenly,
  } = useWordSync();

  const words = wordsRaw ?? [];

  const wordsRef = useRef<any[]>([]);
  useEffect(() => {
    wordsRef.current = words as any[];
  }, [words]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // ✅ Keep latest callback without re-triggering sync effect
  const onWordSyncRef = useRef<typeof onWordSync>(onWordSync);
  useEffect(() => {
    onWordSyncRef.current = onWordSync;
  }, [onWordSync]);

  useEffect(() => {
    const fn = onWordSyncRef.current;
    if (!fn) return;
    fn({ words: words || [], currentIndex: Number(currentIndex) || 0 });
  }, [words, currentIndex]);

  // Which lesson index (local vs controlled)
  const [lessonIdx, setLessonIdx] = useState(0);
  const uiLessonIdx = typeof activeIndex === 'number' ? Math.max(0, activeIndex) : lessonIdx;

  const hasLessons = Array.isArray(lessons) && lessons.length > 0;
  const hasJoined = typeof ssml === 'string' && ssml.trim().length > 0;
  const useJoined = playJoinedIfAvailable && hasJoined;

  const [showTranscript, setShowTranscript] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [topBarH, setTopBarH] = useState(56);

  // Reader scale
  const [userScale, setUserScale] = useState(1);

  // Local playback state (expo-av)
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  // Keep a ref so we can stop/unload even if state is stale during navigation changes
const soundRef = useRef<Audio.Sound | null>(null);
useEffect(() => {
  soundRef.current = sound;
}, [sound]);

const pausePlayback = useCallback(async (reason: string) => {
  autoPlayRef.current = false;
  try {
    const s = soundRef.current;
    if (s) await s.pauseAsync();
  } catch {}
  setNativeIsPlaying(false);
}, []);

const unloadPlayback = useCallback(async (reason: string) => {
  autoPlayRef.current = false;

  const s = soundRef.current;
  soundRef.current = null;

  try {
    if (s) {
      // stopAsync resets position; if you prefer "pause only", remove stopAsync
      await s.stopAsync().catch(() => {});
      await s.unloadAsync().catch(() => {});
    }
  } catch {}
}, []);

  const [nativeIsPlaying, setNativeIsPlaying] = useState(false);
  const [nativePositionSec, setNativePositionSec] = useState(0);

  const [audioDurationSec, setAudioDurationSec] = useState(0);

  const autoPlayRef = useRef(false);
  const markEndedRef = useRef(markEnded);
  const retimedForDurationRef = useRef<number | null>(null);
  const beforePlayKeyRef = useRef<string | null>(null);
  const lastPlayTapRef = useRef(0);

  useEffect(() => {
    markEndedRef.current = markEnded;
  }, [markEnded]);

  // Reset retiming guard when a new audio file is loaded
  useEffect(() => {
    retimedForDurationRef.current = null;
  }, [audioUrl]);

  // Theme template persisted (default = none)
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TEMPLATE_KEY);
        if (saved) setTemplateId(saved as HighlightTemplate);
        else setTemplateId('none' as HighlightTemplate);
      } catch {}
    })();
  }, [setTemplateId]);

  useEffect(() => {
    AsyncStorage.setItem(TEMPLATE_KEY, templateId).catch(() => {});
  }, [templateId]);

  useFocusEffect(
  useCallback(() => {
    // when focused: do nothing
    return () => {
      // when blurred/unfocused: stop audio
      pausePlayback('blur');
    };
  }, [pausePlayback])
);

useEffect(() => {
  const sub = AppState.addEventListener('change', (st) => {
    if (st !== 'active') pausePlayback(`appstate:${st}`);
  });
  return () => sub.remove();
}, [pausePlayback]);

useEffect(() => {
  return () => {
    // hard cleanup: guarantees no orphaned native audio keeps playing
    unloadPlayback('unmount');
    try {
      clearForNewSession(); // optional: stops word-sync timers/state
    } catch {}
  };
}, [unloadPlayback, clearForNewSession]);


  // Reader scale persisted
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SCALE_KEY);
        if (saved) {
          const n = Number(saved);
          if (!Number.isNaN(n) && n > 0.6 && n < 2) setUserScale(n);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(SCALE_KEY, String(userScale)).catch(() => {});
  }, [userScale]);

  const baseFont = width < 380 ? 18 : width < 480 ? 20 : 22;
  const stageFontSize = baseFont * userScale;

  // Voice selection
  const [voice, setVoice] = useState(voiceName || 'en-US-Wavenet-C');
  const [voicesList, setVoicesList] = useState<TtsVoiceInfo[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(VOICE_KEY);
        if (saved) setVoice(saved);
        else if (voiceName) setVoice(voiceName);
      } catch {}
    })();
  }, [voiceName]);

  useEffect(() => {
    AsyncStorage.setItem(VOICE_KEY, voice).catch(() => {});
  }, [voice]);

  useEffect(() => {
    if (!effectiveBackend) return;
    let alive = true;

    (async () => {
      try {
        setVoicesLoading(true);
        setVoicesError(null);
        const list = await listTtsVoices(effectiveBackend, { onlyWavenet: true });
        if (alive) setVoicesList(list || []);
      } catch (e: any) {
        if (alive) setVoicesError(e?.message || 'Failed to load voices');
      } finally {
        if (alive) setVoicesLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [effectiveBackend]);

  // Effective SSML to play
  const effectiveSsml = useMemo(() => {
    if (useJoined) return (ssml || '').trim();
    if (hasLessons) return (lessons[uiLessonIdx]?.ssml || '').trim();
    return (ssml || '').trim();
  }, [useJoined, ssml, hasLessons, lessons, uiLessonIdx]);

  const displayWords = useMemo(() => {
    const alreadyDecorated = hasUsefulPunctuation(words as any);
    if (alreadyDecorated) return words as any;

    const plain = ssmlToPlainText(effectiveSsml ?? '');
    return applyPunctuationToWords(words as any, plain) as any;
  }, [words, effectiveSsml]);

  const lessonContentKey = useMemo(() => {
    if (useJoined) return `joined:${course?.id ?? title ?? 'joined'}`;
    return lessons?.[uiLessonIdx]?.id ?? `idx:${uiLessonIdx}`;
  }, [useJoined, course?.id, title, lessons, uiLessonIdx]);

  const courseTitleForUi = useMemo(() => {
    const t = (course?.title || course?.name || title || 'AI Course')?.toString?.() ?? 'AI Course';
    return t.trim() || 'AI Course';
  }, [course, title]);

  const lessonHeadingForUi = useMemo(() => {
    if (useJoined) return (title || 'AI Lesson').trim();

    const total = Math.max(lessons.length, outline.length) || 1;
    const lessonT = (lessons?.[uiLessonIdx]?.title || '').trim();
    const outlineT = (outline?.[uiLessonIdx]?.title || '').trim();
    return lessonT || outlineT || `Lesson ${uiLessonIdx + 1}/${total}`;
  }, [useJoined, title, lessons, outline, uiLessonIdx]);

  const notesMarkdown = useMemo(() => {
    if (hasLessons && lessons[uiLessonIdx]) {
      return lessons[uiLessonIdx]?.markdown || '_No notes for this lesson yet._';
    }
    return '_No notes for this lesson yet._';
  }, [hasLessons, lessons, uiLessonIdx]);

  // duration from aligner (fallback)
  const wordDurationSec = useMemo(
    () => (words.length ? Math.max(...words.map((w: any) => w.end || 0)) : 0),
    [words]
  );

  const durationSec = audioDurationSec || wordDurationSec || 0;
  const currentSec = nativePositionSec;
  const progress = durationSec ? Math.max(0, Math.min(1, currentSec / durationSec)) : 0;

  // Prefetch trigger at 70%
  const PREFETCH_AT = 0.7;
  const prefetch70KeyRef = useRef<string | null>(null);
  const pendingNextRef = useRef<null | { fromIdx: number; token: number }>(null);
  const pendingTokenRef = useRef(0);

  const nextIsReady = useCallback(() => {
    const next = lessons?.[uiLessonIdx + 1];
    return !!(next && typeof next.ssml === 'string' && next.ssml.trim().length > 0);
  }, [lessons, uiLessonIdx]);

  useEffect(() => {
    if (!audioUrl) return;
    if (!nativeIsPlaying) return;
    if (loading) return;
    if (!durationSec || durationSec <= 0) return;
    if (progress < PREFETCH_AT) return;

    const key = `${uiLessonIdx}|${voice}|${audioUrl}`;
    if (prefetch70KeyRef.current === key) return;
    prefetch70KeyRef.current = key;

    try {
      onRequestStart?.();
    } catch {}
  }, [
    progress,
    audioUrl,
    nativeIsPlaying,
    loading,
    durationSec,
    uiLessonIdx,
    voice,
    onRequestStart,
  ]);

  // expo-av: load/unload sound whenever audioUrl changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!audioUrl) {
        if (sound) {
          try {
            await sound.unloadAsync();
          } catch {}
          setSound(null);
        }
        setNativeIsPlaying(false);
        setNativePositionSec(0);
        setCurrentIndex(0);
        setAudioDurationSec(0);
        return;
      }

      if (sound) {
        try {
          await sound.unloadAsync();
        } catch {}
        setSound(null);
      }

      try {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, volume }
        );

        if (cancelled) {
          try {
            await newSound.unloadAsync();
          } catch {}
          return;
        }

        newSound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;

          const realPosSec = (status.positionMillis ?? 0) / 1000;
          const realDurSec = (status.durationMillis ?? 0) / 1000;

          if (realDurSec && !Number.isNaN(realDurSec)) {
            setAudioDurationSec(realDurSec);

            const ws = wordsRef.current;
            if (ws && ws.length && !retimedForDurationRef.current && realDurSec > 0.5) {
              const lastEnd = Number(ws[ws.length - 1]?.end ?? 0);
              if (lastEnd > 0) {
                const gap = realDurSec - lastEnd;
                const rel = Math.abs(gap) / Math.max(0.5, realDurSec);
                const TH_ABS = 0.05;
                const TH_REL = 0.01;

                if (Math.abs(gap) > TH_ABS || rel > TH_REL) {
                  retimeEvenly(realDurSec);
                }
                retimedForDurationRef.current = realDurSec;
              }
            }
          }

          setNativePositionSec(realPosSec);

          const ws2 = wordsRef.current;
          if (ws2 && ws2.length) {
            const last = ws2[ws2.length - 1] as any;
            const lastEnd = typeof last?.end === 'number' ? Number(last.end) : wordDurationSec;

            if (lastEnd > 0.1) {
              const t = Math.min(realPosSec, lastEnd);
              const idx = indexForTime(ws2 as any, t);
              setCurrentIndex((prev) => (prev === idx ? prev : idx));
            }
          }

          if (status.didJustFinish) {
            setNativeIsPlaying(false);
            markEndedRef.current?.();
          }
        });

        setSound(newSound);
        setNativePositionSec(0);
        setCurrentIndex(0);

        if (autoPlayRef.current) {
          autoPlayRef.current = false;
          try {
            await newSound.playAsync();
            setNativeIsPlaying(true);
          } catch (e) {
            setNativeIsPlaying(false);
            console.warn('[ClassroomPlayer.native] autoplay failed', e);
          }
        }
      } catch (e) {
        console.warn('[ClassroomPlayer.native] load sound error', e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, volume]);

  // keep expo-av volume in sync with hook volume
  useEffect(() => {
    if (sound) sound.setVolumeAsync(volume).catch(() => {});
  }, [sound, volume]);

  const seekToWordNative = useCallback(
    async (idx: number) => {
      if (!sound || !words.length) return;
      const clamped = Math.max(0, Math.min(words.length - 1, idx));
      const targetWord = words[clamped] as any;

      const fallbackTotal = audioDurationSec || wordDurationSec || 0;
      const targetSec =
        typeof targetWord?.start === 'number'
          ? Math.max(0, targetWord.start)
          : (fallbackTotal || 0) * (clamped / Math.max(1, words.length));

      try {
        await sound.setPositionAsync(targetSec * 1000);
        setNativePositionSec(targetSec);
        setCurrentIndex(clamped);
      } catch (e) {
        console.warn('[ClassroomPlayer.native] seekToWordNative failed', e);
      }
    },
    [sound, words, audioDurationSec, wordDurationSec]
  );

  const seekToTime = useCallback(
    (t: number) => {
      if (!sound) return;
      const totalDur = audioDurationSec || wordDurationSec || 0;
      if (!totalDur) return;

      const clamped = Math.max(0, Math.min(totalDur, t));

      (async () => {
        try {
          await sound.setPositionAsync(clamped * 1000);
          setNativePositionSec(clamped);

          const ws = wordsRef.current;
          if (ws && ws.length) {
            const last = ws[ws.length - 1] as any;
            const lastEnd = typeof last?.end === 'number' ? Number(last.end) : wordDurationSec;

            if (lastEnd > 0.1) {
              const t2 = Math.min(clamped, lastEnd);
              const idx = indexForTime(ws as any, t2);
              setCurrentIndex(idx);
            }
          }
        } catch (e) {
          console.warn('[ClassroomPlayer.native] seekToTime failed', e);
        }
      })();
    },
    [sound, audioDurationSec, wordDurationSec]
  );

  const nudgeSeconds = (d: number) => seekToTime(currentSec + d);

  // play/pause (native)
  const handlePlayPause = useCallback(async () => {
    try {
      const now = Date.now();
      if (now - lastPlayTapRef.current < 350) return;
      lastPlayTapRef.current = now;

      if (!canNarrate) return;

      if (nativeIsPlaying) {
        autoPlayRef.current = false;
        if (sound) await sound.pauseAsync();
        setNativeIsPlaying(false);
        return;
      }

      autoPlayRef.current = true;

      const trimmed = (effectiveSsml || '').trim();

      if (!trimmed) {
        await onRequestStart?.();
        return;
      }

      const playKey = `${uiLessonIdx}|${voice}|${trimmed.length}|${useJoined ? 'joined' : 'per'}`;
      if (beforePlayKeyRef.current !== playKey) {
        beforePlayKeyRef.current = playKey;
        await onBeforePlay?.();
      }

      if (!audioUrl && !loading && effectiveBackend) {
        try {
          clearForNewSession();
          await speak(effectiveBackend, { ssml: trimmed, voiceName: voice });
        } catch {}
        return;
      }

      if (sound) {
        // If we're at (or extremely near) the end, rewind before playing.
        const dur = audioDurationSec || 0;
        if (dur > 0 && nativePositionSec >= dur - 0.05) {
          await sound.setPositionAsync(0);
          setNativePositionSec(0);
          setCurrentIndex(0);
        }

        await sound.playAsync();
        setNativeIsPlaying(true);
        return;
      }
    } catch (e) {
      console.warn('[ClassroomPlayer.native] play/generate failed', e);
    }
  }, [
    canNarrate,
    nativeIsPlaying,
    sound,
    effectiveSsml,
    uiLessonIdx,
    voice,
    useJoined,
    onBeforePlay,
    onRequestStart,
    audioUrl,
    loading,
    effectiveBackend,
    speak,
    clearForNewSession,
    audioDurationSec,
    nativePositionSec,
  ]);

  useEffect(() => {
    const pending = pendingNextRef.current;
    if (!pending) return;

    if (isBuildingNext) return;
    if (!nextIsReady()) return;

    pendingNextRef.current = null;
    autoPlayRef.current = true;

    // ✅ advance even in controlled mode
    if (typeof onNext === 'function') {
      onNext();
      return;
    }

    // fallback uncontrolled
    setLessonIdx((i) => Math.min(i + 1, Math.max(lessons.length - 1, 0)));
  }, [isBuildingNext, nextIsReady, onNext, lessons.length]);

  // loading callback from hook
  useEffect(() => {
    loadingCb?.(loading);
  }, [loading, loadingCb]);

  // speak when ssml/voice changes
  const lastSpeakKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!effectiveBackend) return;

    const trimmed = (effectiveSsml || '').trim();
    if (!trimmed) return;

    const key = `${voice}|${lessonContentKey}|${trimmed.length}|${useJoined ? 'joined' : 'per'}`;

    if (key === lastSpeakKeyRef.current) return;
    lastSpeakKeyRef.current = key;

    let cancelled = false;

    (async () => {
      try {
        if (sound) {
          try {
            await sound.stopAsync();
          } catch {}
        }

        clearForNewSession();
        if (!trimmed || cancelled) return;

        await speak(effectiveBackend, { ssml: trimmed, voiceName: voice });
        if (cancelled) return;
      } catch (e) {
        console.warn('[ClassroomPlayer.native] speak failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveBackend,
    effectiveSsml,
    lessonContentKey,
    useJoined,
    voice,
    speak,
    clearForNewSession,
    sound,
  ]);

  // ended / auto-next
  const lastEndedTickRef = useRef(0);
  useEffect(() => {
    if (!endedTick || endedTick === lastEndedTickRef.current) return;
    lastEndedTickRef.current = endedTick;

    if (error) return;

    try {
      onEnded?.();
    } catch {}

    const hasImmediateNext = hasLessons && uiLessonIdx < lessons.length - 1;
    const maybeMoreComing = (outline?.length || 0) > (lessons?.length || 0);

    if (!hasImmediateNext && !maybeMoreComing) return;

    (async () => {
      autoPlayRef.current = false;
      if (isBuildingNext && !nextIsReady()) {
        pendingTokenRef.current += 1;
        pendingNextRef.current = { fromIdx: uiLessonIdx, token: pendingTokenRef.current };
        return;
      }

      if (nextIsReady()) {
        autoPlayRef.current = true;
        if (typeof activeIndex !== 'number') {
          setLessonIdx((i) => Math.min(i + 1, Math.max(lessons.length - 1, 0)));
        }
        return;
      }

      if (typeof onNext === 'function') {
        try {
          const handled = await onNext();
          if (handled) return;
        } catch {}
      }

      if (typeof activeIndex !== 'number') {
        setLessonIdx((i) => Math.min(i + 1, Math.max(lessons.length - 1, 0)));
      }
    })();
  }, [
    endedTick,
    error,
    hasLessons,
    lessons.length,
    uiLessonIdx,
    outline?.length,
    onNext,
    onEnded,
    activeIndex,
    isBuildingNext,
    nextIsReady,
  ]);

  const handlePrev = useCallback(async () => {
    if (uiLessonIdx <= 0) return;

    if (typeof onPrev === 'function') {
      try {
        const did = await onPrev();
        if (did) return;
      } catch {}
    }

    if (typeof activeIndex !== 'number') {
      setLessonIdx((i) => Math.max(0, i - 1));
    }
  }, [onPrev, uiLessonIdx, activeIndex]);

  const handleNext = useCallback(async () => {
    if (isBuildingNext && !nextIsReady()) {
      pendingTokenRef.current += 1;
      pendingNextRef.current = { fromIdx: uiLessonIdx, token: pendingTokenRef.current };
      return;
    }

    if (nextIsReady()) {
      autoPlayRef.current = true;
      if (typeof activeIndex !== 'number') {
        setLessonIdx((i) => Math.min(i + 1, Math.max(lessons.length - 1, 0)));
      }
      return;
    }

    if (typeof onNext === 'function') {
      try {
        const did = await onNext();
        if (did) return;
      } catch {}
    }

    if (typeof activeIndex !== 'number') {
      setLessonIdx((i) => Math.min(i + 1, Math.max(lessons.length - 1, 0)));
    }
  }, [onNext, activeIndex, lessons.length, isBuildingNext, nextIsReady, uiLessonIdx]);

  const totalLessonsForUi = useMemo(
    () => Math.max(lessons?.length || 0, outline?.length || 0) || 1,
    [lessons?.length, outline?.length]
  );

  // Volume / mute
  const [mutedAt, setMutedAt] = useState<number | null>(null);
  const toggleMute = () => {
    if (mutedAt === null && volume > 0) {
      setMutedAt(volume);
      setVolume(0);
    } else {
      setVolume(mutedAt ?? 1);
      setMutedAt(null);
    }
  };
  const volDown = () => setVolume(Math.max(0, +Math.max(0, volume - 0.1).toFixed(3)));
  const volUp = () => setVolume(Math.min(1, +Math.min(1, volume + 0.1).toFixed(3)));

  const sentences = mergeExampleSentenceGroups(
    (sentenceGroups || []) as SentenceGroup[],
    words as any[]
  ) as SentenceGroup[];
  const [stableTimed, setStableTimed] = useState<{
    words: any[];
    sentences: SentenceGroup[];
    key: string;
  } | null>(null);

  const liveReady = !!(sentences?.length && words?.length);

  useEffect(() => {
    if (!liveReady) return;

    setStableTimed((prev) => {
      if (prev?.key === lessonContentKey) return prev;
      return {
        words: displayWords as any,
        sentences: sentences as any,
        key: lessonContentKey,
      };
    });
  }, [liveReady, lessonContentKey, displayWords, sentences]);

  const renderWords = liveReady ? (displayWords as any) : (stableTimed?.words ?? []);
  const renderSentences = liveReady ? (sentences as any) : (stableTimed?.sentences ?? []);
  const shouldShowFallback = !liveReady && !stableTimed;

  return (
    <View style={tw`flex-1`}>
      {/* Frame */}
      <View
        style={tw.style(
          'flex-1 rounded-3xl overflow-hidden',
          'bg-slate-900/90 dark:bg-black/90 border border-white/10',
          { marginBottom: Math.max(0, insets.bottom - 6) }
        )}
      >
        {/* Top bar */}
        <TopBarMobile
          title={courseTitleForUi}
          subtitle={lessonHeadingForUi}
          voice={voice}
          setVoice={setVoice}
          voices={(voicesList || []).map((v) => v.name)}
          voicesLoading={voicesLoading}
          voicesError={voicesError}
          onPlayPause={handlePlayPause}
          playing={nativeIsPlaying}
          loading={loading}
          onToggleTranscript={() => setShowTranscript((s) => !s)}
          transcriptOpen={showTranscript}
          onToggleNotes={() => {
            if (isNotesTab) switchToNarration();
            else switchToNotes();
          }}
          onToggleTheme={() => setShowThemeSheet(true)}
          lessonIndex={uiLessonIdx}
          totalLessons={totalLessonsForUi}
          maximized={maximized}
          onToggleMaximize={() => setMaximized((m) => !m)}
          onHeight={setTopBarH}
          disablePlay={!canNarrate}
          gateNotice={props.gateNotice}
        />

        {narrationLocked && !props.hideGateBanner && (
          <View style={tw`bg-amber-500/80 px-3 py-2`}>
            <Text style={tw`text-white font-semibold`}>Narration quota reached / locked.</Text>
            <Text style={tw`text-white`}>
              {gateReset ? `Resets on: ${gateReset}` : 'Narration is currently unavailable.'}
            </Text>
          </View>
        )}

        {/* Title chip */}
        {topBarH > 0 ? (
          <View pointerEvents="none" style={[tw`absolute left-3 right-3 z-50`, { top: topBarH + 8 }]}>
            <TitleChip title={lessonHeadingForUi} />
          </View>
        ) : null}

        {/* Body */}
        <View style={[tw`flex-1 px-3 pb-3`, { paddingTop: 44 }]}>
          <View style={tw`flex-row gap-2 mb-3`}>
            <Pressable
              onPress={switchToNarration}
              disabled={!canNarrate}
              style={tw.style(
                'flex-1 flex-row items-center justify-center gap-2 px-3 py-2 rounded-2xl border',
                activeTab === 'narration' ? 'bg-white text-black' : 'bg-slate-800/70 border-white/10',
                !canNarrate && 'opacity-60'
              )}
            >
              <Ionicons
                name={!canNarrate ? 'lock-closed' : 'musical-notes'}
                size={16}
                color={activeTab === 'narration' ? '#0f172a' : '#e5e7eb'}
              />
              <Text
                style={tw.style(
                  'text-sm font-semibold',
                  activeTab === 'narration' ? 'text-slate-900' : 'text-slate-100'
                )}
              >
                Narration
              </Text>
            </Pressable>

            <Pressable
              onPress={switchToNotes}
              style={tw.style(
                'flex-1 flex-row items-center justify-center gap-2 px-3 py-2 rounded-2xl border',
                activeTab === 'notes' ? 'bg-white text-black' : 'bg-slate-800/70 border-white/10'
              )}
            >
              <Ionicons
                name="document-text-outline"
                size={16}
                color={activeTab === 'notes' ? '#0f172a' : '#e5e7eb'}
              />
              <Text
                style={tw.style(
                  'text-sm font-semibold',
                  activeTab === 'notes' ? 'text-slate-900' : 'text-slate-100'
                )}
              >
                Notes
              </Text>
            </Pressable>
          </View>

          {isNotesTab ? (
            <ScrollView style={tw`flex-1`} contentContainerStyle={tw`gap-3 pb-4`}>
              <View
                style={tw.style(
                  'p-3 rounded-2xl',
                  narrationLocked ? 'bg-amber-500/20 border border-amber-300/50' : 'bg-slate-800/60'
                )}
              >
                <Text style={tw`text-sm font-semibold text-slate-100`}>Notes</Text>
                <Text style={tw`text-xs text-slate-200 mt-1`}>{notesSubtitle}</Text>
              </View>

              <View style={tw`p-3 rounded-2xl bg-black/30 border border-white/10`}>
                <Markdown>{notesMarkdown}</Markdown>
              </View>

              <View style={tw`p-3 rounded-2xl bg-indigo-900/50 border border-indigo-500/30`}>
                <Text style={tw`text-sm font-semibold text-white`}>Continue learning</Text>
                <Text style={tw`text-xs text-indigo-100 mt-1`}>{notesCtaLabel}</Text>
                {narrationLocked ? (
                  <Text style={tw`text-[11px] text-indigo-100/80 mt-1`}>
                    Narration is locked for this course. {notesSubtitle}
                  </Text>
                ) : null}
              </View>
            </ScrollView>
          ) : (
            <>
              {/* Small chip row (hidden in maximized mode) */}
              {!maximized ? (
                <View style={tw`flex-row items-center justify-end mb-2`}>
                  {hasLessons ? (
                    <View
                      style={tw.style(
                        'px-3 py-1 rounded-full flex-row items-center gap-1',
                        'bg-slate-800/80 dark:bg-slate-900/90 border border-white/10'
                      )}
                    >
                      <Ionicons name="book-outline" size={14} color="#e5e7eb" />
                      <Text style={tw`text-[11px] text-slate-100 dark:text-slate-200`}>
                        Lesson {uiLessonIdx + 1}/{totalLessonsForUi}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Main narration stage */}
              <NarrationStage
                sentences={renderSentences}
                words={renderWords}
                currentIndex={currentIndex}
                fontSize={stageFontSize}
                isDark={isDark}
                maximized={maximized}
                fallbackSsml={shouldShowFallback ? effectiveSsml : ''}
              />

              {/* Status */}
              {loading && !words.length && !error ? (
                <View style={tw`mt-3 items-center`}>
                  <View style={tw`px-3 py-1.5 rounded-full bg-black/60 border border-white/15 flex-row items-center`}>
                    <View style={tw`h-3 w-3 rounded-full border-2 border-white/30 border-t-white mr-2`} />
                    <Text style={tw`text-xs text-slate-100`}>Generating lesson narration…</Text>
                  </View>
                </View>
              ) : null}

              {error && !loading ? (
                <View style={tw`mt-3 items-center`}>
                  <View style={tw`px-3 py-1.5 rounded-full bg-red-950/80 border border-red-500/60`}>
                    <Text style={tw`text-xs text-red-100`}>{error}</Text>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* Bottom bar */}
        <BottomBarMobile
          currentSec={currentSec}
          durationSec={durationSec}
          progress={progress}
          onSeek={seekToTime}
          onBack5={() => nudgeSeconds(-5)}
          onFwd5={() => nudgeSeconds(5)}
          onPlayPause={handlePlayPause}
          playing={nativeIsPlaying}
          loading={loading}
          disablePlay={!canNarrate}
          volume={volume}
          volDown={volDown}
          volUp={volUp}
          toggleMute={toggleMute}
          onPrev={hasLessons ? handlePrev : undefined}
          onNext={hasLessons ? handleNext : undefined}
          lessonIndex={uiLessonIdx}
          totalLessons={totalLessonsForUi}
          isBuildingNext={!!isBuildingNext}
          userScale={userScale}
          setUserScale={setUserScale}
          hlHex={hlHex}
        />
      </View>

      {/* Transcript */}
      <TranscriptModal
        open={showTranscript}
        onClose={() => setShowTranscript(false)}
        title={lessonHeadingForUi}
        sentences={renderSentences}
        words={renderWords}
        currentIndex={currentIndex}
        seekToWord={seekToWordNative}
      />

      {/* Theme */}
      <ThemeSheet
        open={showThemeSheet}
        onClose={() => setShowThemeSheet(false)}
        templateId={templateId}
        setTemplateId={setTemplateId}
        hlHex={hlHex}
      />
    </View>
  );
};

// ─────────────────────── Main Screen ───────────────────────

const ClassroomPlayerScreen: React.FC<Props> = (props) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <ThemeProvider>
      <SafeAreaView style={tw.style('flex-1', isDark ? 'bg-slate-950' : 'bg-slate-100')}>
        <View style={tw`flex-1`}>
          <InnerPlayer {...props} />
        </View>
      </SafeAreaView>
    </ThemeProvider>
  );
};

export default ClassroomPlayerScreen;

// ───────────────────── Top Bar (mobile) ─────────────────────

function TopBarMobile({
  title,
  subtitle,
  voice,
  setVoice,
  voices,
  voicesLoading,
  voicesError,
  onPlayPause,
  playing,
  loading,
  onToggleTranscript,
  transcriptOpen,
  onToggleNotes,
  onToggleTheme,
  lessonIndex,
  totalLessons,
  maximized,
  onToggleMaximize,
  onHeight,
  disablePlay = false,
  gateNotice,
}: {
  title: string;
  subtitle?: string;
  voice: string;
  setVoice: (v: string) => void;
  voices: string[];
  voicesLoading?: boolean;
  voicesError?: string | null;
  onPlayPause: () => void;
  playing: boolean;
  loading: boolean;
  onToggleTranscript: () => void;
  transcriptOpen: boolean;
  onToggleNotes: () => void;
  onToggleTheme: () => void;
  lessonIndex: number;
  totalLessons: number;
  maximized: boolean;
  onToggleMaximize: () => void;
  onHeight?: (h: number) => void;
  disablePlay?: boolean;
  gateNotice?: { reason?: string; resetsAt?: string | null } | null;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const voiceOptions = voices.length ? voices : voice ? [voice] : [];

  const voiceLabel = voicesLoading
    ? 'Loading voices…'
    : voiceOptions.length
      ? voice
      : voicesError
        ? 'Voices unavailable'
        : voice || 'Voice';

  return (
    <View
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      style={tw.style(
        'px-3 py-2 flex-row items-center gap-2',
        'bg-slate-900/95 dark:bg-black/95 border-b border-white/10'
      )}
    >
      {/* Left: dot + title */}
      <View style={tw`flex-row items-center gap-2 flex-1 min-w-0`}>
        <View style={tw`h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]`} />
        <View style={tw`flex-1`}>
          <Text style={tw.style('text-xs text-slate-200', isDark && 'text-slate-100')} numberOfLines={1}>
            {title}
          </Text>

          <Text style={tw`text-[10px] text-slate-400 mt-0.5`} numberOfLines={1}>
            Lesson {lessonIndex + 1}/{totalLessons}
            {subtitle ? ` · ${subtitle}` : ''}
            {' · '}
            {voiceLabel}
          </Text>
        </View>
      </View>

      {/* Voice pill */}
      <View style={tw`mr-1`}>
        <VoiceSelectNative
          value={voice}
          onChange={setVoice}
          options={voiceOptions}
          loading={!!voicesLoading}
          error={voicesError ?? null}
        />
      </View>

      {/* Buttons */}
      <Pressable
        onPress={onToggleTranscript}
        style={tw.style(
          'h-9 w-9 rounded-full items-center justify-center ml-1',
          transcriptOpen ? 'bg-white' : 'bg-white/10 dark:bg-white/10'
        )}
      >
        <Ionicons name="newspaper-outline" size={16} color={transcriptOpen ? '#000' : '#f9fafb'} />
      </Pressable>

      <Pressable
        onPress={onToggleNotes}
        style={tw.style('h-9 w-9 rounded-full items-center justify-center', 'bg-white/10 dark:bg-white/10')}
      >
        <Ionicons name="pencil-outline" size={16} color="#f9fafb" />
      </Pressable>

      <Pressable
        onPress={onToggleTheme}
        style={tw.style('h-9 w-9 rounded-full items-center justify-center', 'bg-white/10 dark:bg-white/10 ml-1')}
      >
        <MaterialIcons name="palette" size={18} color="#f9fafb" />
      </Pressable>

      <Pressable
        onPress={onToggleMaximize}
        style={tw.style('h-9 w-9 rounded-full items-center justify-center', 'bg-white/10 dark:bg-white/10 ml-1')}
      >
        <MaterialIcons name={maximized ? 'fullscreen-exit' : 'fullscreen'} size={18} color="#f9fafb" />
      </Pressable>
    </View>
  );
}

function TitleChip({ title }: { title: string }) {
  return (
    <View pointerEvents="none" style={tw`items-center`}>
      <View style={tw.style('px-3 py-1.5 rounded-full border border-white/10', 'bg-black/50')}>
        <Text style={tw`text-[11px] text-slate-100`} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}

// ───────────────────── Narration Stage ─────────────────────
function normalizeForMatch(s: string) {
  return (s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '');
}

function applyPunctuationToWords(
  timedWords: Array<{ text: string; start: number; end: number }>,
  plainText: string
) {
  const raw = (plainText || '').replace(/\s+/g, ' ').trim();
  const plainTokens = raw ? raw.split(' ').filter(Boolean) : [];

  if (!timedWords?.length || !plainTokens.length) return timedWords || [];

  const timedHasPunc = hasUsefulPunctuation(timedWords as any);
  const plainHasPunc = /[\p{P}\p{S}]/u.test(plainText || '');

  if (timedHasPunc || !plainHasPunc) return timedWords;

  const out = timedWords.map((w) => ({ ...w }));

  const isPuncOnly = (t: string) => normalizeForMatch(t) === '' && /^[\p{P}\p{S}]+$/u.test(t);

  const peel = (t: string) => {
    const leading = t.match(/^[\p{P}\p{S}]+/u)?.[0] ?? '';
    const trailing = t.match(/[\p{P}\p{S}]+$/u)?.[0] ?? '';
    const core = t.slice(leading.length, t.length - trailing.length);
    return { leading, core, trailing };
  };

  let j = 0;
  let lastMatchedI: number | null = null;

  for (let i = 0; i < out.length; i++) {
    const wi = out[i];
    if (!wi) continue;

    const base = normalizeForMatch(wi.text || '');
    if (!base) continue;

    while (j < plainTokens.length) {
      const tok = plainTokens[j];
      if (!tok || !isPuncOnly(tok)) break;

      if (lastMatchedI != null) {
        const prev = out[lastMatchedI];
        if (prev) prev.text = (prev.text || '') + tok;
      }
      j++;
    }

    while (j < plainTokens.length) {
      const tok = plainTokens[j];
      if (!tok) {
        j++;
        continue;
      }
      if (isPuncOnly(tok)) break;

      const { core } = peel(tok);
      if (normalizeForMatch(core) === base) break;
      j++;
    }

    const tok = plainTokens[j];
    if (tok && !isPuncOnly(tok)) {
      const { leading, core, trailing } = peel(tok);
      wi.text = `${leading}${core}${trailing}`;
      lastMatchedI = i;
      j++;

      while (j < plainTokens.length) {
        const tok2 = plainTokens[j];
        if (!tok2 || !isPuncOnly(tok2)) break;
        wi.text = (wi.text || '') + tok2;
        j++;
      }
    }
  }

  return out;
}

function NarrationStage({
  sentences,
  words,
  currentIndex,
  fontSize,
  isDark,
  maximized,
  fallbackSsml,
}: {
  sentences: SentenceGroup[];
  words: { text: string; start: number; end: number }[];
  currentIndex: number;
  fontSize: number;
  isDark: boolean;
  maximized: boolean;
  fallbackSsml?: string;
}) {
  const baseTextColor = isDark ? '#F9FAFB' : '#0F172A';
  const dimmedColor = isDark ? '#94a3b8' : '#4b5563';

  const hasTimedText = !!(sentences?.length && words?.length);

  if (!hasTimedText) {
    const plain = ssmlToPlainText(fallbackSsml || '');
    return (
      <View
        style={tw.style(
          'flex-1 rounded-3xl border border-white/10',
          maximized ? 'mt-0 mb-0' : 'mt-1 mb-2',
          'bg-slate-900/70 dark:bg-slate-950/80 px-4 py-4'
        )}
      >
        <ScrollView contentContainerStyle={tw`flex-1 justify-center`} showsVerticalScrollIndicator={false}>
          <Text style={{ textAlign: 'center', fontSize, lineHeight: fontSize * 1.35, color: baseTextColor }}>
            {plain || '...'}
          </Text>
        </ScrollView>
      </View>
    );
  }

  const activeSentenceIdx = useMemo(() => {
    const idx = sentences.findIndex((s) => s.indices.includes(currentIndex));
    return idx === -1 ? 0 : idx;
  }, [sentences, currentIndex]);

  const visibleSentenceIndices = useMemo(() => {
    const idx = activeSentenceIdx;
    const arr: number[] = [];
    if (idx > 0) arr.push(idx - 1);
    arr.push(idx);
    if (idx + 1 < sentences.length) arr.push(idx + 1);
    return arr;
  }, [sentences, activeSentenceIdx]);

  return (
    <View
      style={tw.style(
        'flex-1 rounded-3xl border border-white/10',
        maximized ? 'mt-0 mb-0' : 'mt-1 mb-2',
        'bg-slate-900/70 dark:bg-slate-950/80 px-4 py-4'
      )}
    >
      <ScrollView contentContainerStyle={tw`flex-1 justify-center`} showsVerticalScrollIndicator={false}>
        {visibleSentenceIndices.map((sIdx) => {
          const s = sentences[sIdx];
          const isActiveSentence = sIdx === activeSentenceIdx;
          if (!s) return null;

          return (
            <Text
              key={`sent-${sIdx}`}
              style={{
                textAlign: 'center',
                fontSize,
                lineHeight: fontSize * 1.35,
                color: isActiveSentence ? baseTextColor : dimmedColor,
                marginBottom:
                  sIdx === visibleSentenceIndices[visibleSentenceIndices.length - 1] ? 0 : fontSize * 0.4,
              }}
            >
              {s.indices.map((wi) => words[wi]?.text).filter(Boolean).join(' ')}
            </Text>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ───────────────────── Bottom Bar ─────────────────────

function BottomBarMobile({
  currentSec,
  durationSec,
  progress,
  onSeek,
  onBack5,
  onFwd5,
  onPlayPause,
  playing,
  loading,
  volume,
  volDown,
  volUp,
  toggleMute,
  onPrev,
  onNext,
  lessonIndex,
  totalLessons,
  isBuildingNext,
  userScale,
  setUserScale,
  hlHex,
  disablePlay = false,
}: {
  currentSec: number;
  durationSec: number;
  progress: number;
  onSeek: (sec: number) => void;
  onBack5: () => void;
  onFwd5: () => void;
  onPlayPause: () => void;
  playing: boolean;
  loading: boolean;
  volume: number;
  volDown: () => void;
  volUp: () => void;
  toggleMute: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  lessonIndex: number;
  totalLessons: number;
  isBuildingNext: boolean;
  userScale: number;
  setUserScale: (n: number) => void;
  hlHex: string;
  disablePlay?: boolean;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const minScale = 0.8;
  const maxScale = 1.6;

  return (
    <View
      style={tw.style(
        'px-3 pt-2 pb-3 border-t border-white/10',
        'bg-slate-900/95 dark:bg-black/95'
      )}
    >
      {/* Row 1: playback + time */}
      <View style={tw`flex-row items-center mb-2`}>
        <Pressable
          onPress={onBack5}
          style={tw`h-9 w-9 rounded-full bg-white/10 items-center justify-center mr-1`}
        >
          <Ionicons name="play-back" size={18} color="#f9fafb" />
        </Pressable>

        <Pressable
          onPress={onPlayPause}
          disabled={loading || disablePlay}
          style={tw.style(
            'h-9 w-9 rounded-full items-center justify-center mr-1',
            loading || disablePlay ? 'bg-slate-600/60' : 'bg-white'
          )}
        >
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={18}
            color={loading || disablePlay ? '#e5e7eb' : '#000'}
          />
        </Pressable>

        <Pressable
          onPress={onFwd5}
          style={tw`h-9 w-9 rounded-full bg-white/10 items-center justify-center mr-2`}
        >
          <Ionicons name="play-forward" size={18} color="#f9fafb" />
        </Pressable>

        <Text style={tw`text-xs text-slate-100 tabular-nums`}>
          {formatTime(currentSec)} / {durationSec ? formatTime(durationSec) : '0:00'}
        </Text>

        <View style={tw`flex-row items-center ml-auto`}>
          {onPrev ? (
            <Pressable
              onPress={onPrev}
              accessibilityRole="button"
              accessibilityLabel="Previous lesson"
              style={tw`h-9 w-9 rounded-full bg-white/10 items-center justify-center mr-1`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={18} color="#f9fafb" />
            </Pressable>
          ) : null}

          {onNext ? (
            <Pressable
              onPress={onNext}
              disabled={isBuildingNext}
              accessibilityRole="button"
              accessibilityLabel={isBuildingNext ? 'Building next lesson' : 'Next lesson'}
              style={tw.style(
                'h-9 w-9 rounded-full items-center justify-center',
                isBuildingNext ? 'bg-white/10 opacity-70' : 'bg-white'
              )}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isBuildingNext ? <ActivityIndicator /> : <Ionicons name="chevron-forward" size={18} color="#000" />}
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Row 2: scrubber */}
      <View style={tw`flex-row items-center mb-2`}>
        <Text style={tw`w-10 text-[11px] text-slate-300 tabular-nums`}>{formatTime(currentSec)}</Text>

        <View style={tw`flex-1 mx-2`}>
          <Slider
            value={durationSec ? currentSec : 0}
            minimumValue={0}
            maximumValue={Math.max(1, durationSec)}
            onSlidingComplete={(sec) => onSeek(sec)}
            minimumTrackTintColor={hlHex}
            maximumTrackTintColor={isDark ? '#1f2937' : '#e5e7eb'}
            thumbTintColor={hlHex}
          />
        </View>

        <Text style={tw`w-10 text-[11px] text-slate-300 tabular-nums text-right`}>
          {durationSec ? formatTime(durationSec) : '0:00'}
        </Text>
      </View>

      {/* Row 3: volume + text size + lesson chip */}
      <View style={tw`flex-row items-center`}>
        <Pressable onPress={toggleMute} style={tw`h-8 w-8 rounded-full bg-white/10 items-center justify-center`}>
          <Ionicons name={volume === 0 ? 'volume-mute' : 'volume-high'} size={16} color="#f9fafb" />
        </Pressable>

        <Pressable onPress={volDown} style={tw`ml-1 h-7 w-7 rounded-full bg-white/10 items-center justify-center`}>
          <Text style={tw`text-xs text-slate-100`}>−</Text>
        </Pressable>

        <Pressable onPress={volUp} style={tw`ml-1 h-7 w-7 rounded-full bg-white/10 items-center justify-center`}>
          <Text style={tw`text-xs text-slate-100`}>+</Text>
        </Pressable>

        <Text style={tw`ml-1 text-[11px] text-slate-200 tabular-nums`}>{Math.round(volume * 100)}%</Text>

        <View style={tw`flex-row items-center ml-4`}>
          <Text style={tw`text-[11px] text-slate-300 mr-1`}>Text</Text>
          <Pressable
            onPress={() => setUserScale(Math.max(minScale, userScale - 0.1))}
            style={tw`h-7 w-7 rounded-full bg-white/10 items-center justify-center`}
          >
            <Text style={tw`text-xs text-slate-100`}>A-</Text>
          </Pressable>
          <Pressable
            onPress={() => setUserScale(Math.min(maxScale, userScale + 0.1))}
            style={tw`ml-1 h-7 w-7 rounded-full bg-white/10 items-center justify-center`}
          >
            <Text style={tw`text-xs text-slate-100`}>A+</Text>
          </Pressable>
        </View>

        <View style={tw`ml-auto px-2 py-1 rounded-full bg-white/5`}>
          <Text style={tw`text-[11px] text-slate-100 tabular-nums`}>
            {lessonIndex + 1}/{totalLessons}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ───────────────────── Transcript Modal ─────────────────────

function TranscriptModal({
  open,
  onClose,
  title,
  sentences,
  words,
  currentIndex,
  seekToWord,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sentences: SentenceGroup[];
  words: { text: string; start: number; end: number }[];
  currentIndex: number;
  seekToWord: (i: number) => void;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const activeSentenceIdx = useMemo(() => {
    if (!sentences?.length) return 0;
    const idx = sentences.findIndex((s) => s.indices.includes(currentIndex));
    return idx === -1 ? 0 : idx;
  }, [sentences, currentIndex]);

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={tw`flex-1 justify-end bg-black/40`}>
        <View
          style={tw.style(
            'max-h-[70%] rounded-t-3xl px-4 pt-3 pb-4',
            isDark ? 'bg-slate-950' : 'bg-slate-100'
          )}
        >
          <View style={tw`flex-row items-center mb-2`}>
            <Text
              style={tw.style('flex-1 text-xs font-semibold', isDark ? 'text-slate-100' : 'text-slate-900')}
              numberOfLines={1}
            >
              Transcript · {title}
            </Text>

            <Pressable onPress={onClose} style={tw`h-8 w-8 rounded-full items-center justify-center bg-slate-800/70`}>
              <Ionicons name="close" size={16} color="#f9fafb" />
            </Pressable>
          </View>

          <ScrollView>
            {sentences.map((s, sIdx) => {
              const isActive = sIdx === activeSentenceIdx;
              return (
                <Pressable
                  key={`t-${sIdx}`}
                  onPress={() => {
                    if (s.indices[0] != null) seekToWord(s.indices[0]);
                  }}
                  style={tw.style('px-2 py-1.5 rounded-xl mb-1', isActive ? 'bg-indigo-600/70' : 'bg-slate-800/80')}
                >
                  <Text style={tw.style('text-[12px]', isActive ? 'text-white' : 'text-slate-100')}>
                    {s.indices.map((wi) => words[wi]?.text).filter(Boolean).join(' ')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────── Theme Sheet ─────────────────────

const COLOR_PRESETS = [
  '#22d3ee',
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f97316',
  '#ef4444',
  '#f472b6',
  '#a78bfa',
  '#ffffff',
  '#e5e7eb',
];

function ThemeSheet({
  open,
  onClose,
  templateId,
  setTemplateId,
  hlHex,
}: {
  open: boolean;
  onClose: () => void;
  templateId: HighlightTemplate;
  setTemplateId: (t: HighlightTemplate) => void;
  hlHex: string;
}) {
  const templates: { id: HighlightTemplate; label: string }[] = [
    { id: 'none' as HighlightTemplate, label: 'No color highlight' },
    { id: 'clean-stripe', label: 'Clean Stripe' },
    { id: 'underline-glow', label: 'Underline Glow' },
    { id: 'karaoke-glow', label: 'Karaoke Glow' },
    { id: 'boxed-pill', label: 'Boxed Pill' },
    { id: 'ribbon', label: 'Ribbon' },
  ];

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={tw`flex-1 justify-end bg-black/40`}>
        <View style={tw.style('rounded-t-3xl px-4 pt-3 pb-4', 'bg-slate-950')}>
          <View style={tw`flex-row items-center mb-2`}>
            <Text style={tw`flex-1 text-xs font-semibold text-slate-100`}>Highlight & style</Text>

            <Pressable onPress={onClose} style={tw`h-8 w-8 rounded-full items-center justify-center bg-slate-800/70`}>
              <Ionicons name="close" size={16} color="#f9fafb" />
            </Pressable>
          </View>

          <Text style={tw`text-[11px] text-slate-400 mb-1`}>Highlight color</Text>
          <View style={tw`flex-row flex-wrap gap-2 mb-3`}>
            {COLOR_PRESETS.map((c) => (
              <View key={c}>
                <View style={tw`h-7 w-7 rounded-full items-center justify-center`}>
                  <Pressable
                    onPress={() => {
                      // Hook up to ThemeContext's color setter if/when you expose it.
                    }}
                    style={[tw`h-6 w-6 rounded-full border border-white/20`, { backgroundColor: c }]}
                  />
                </View>
              </View>
            ))}
          </View>

          <Text style={tw`text-[11px] text-slate-400 mb-1`}>Template</Text>
          {templates.map((t) => {
            const active = t.id === templateId;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTemplateId(t.id)}
                style={tw.style('flex-row items-center px-3 py-2 rounded-xl mb-1', active ? 'bg-indigo-600' : 'bg-slate-900')}
              >
                <View style={tw`h-6 w-6 rounded-md bg-black/60 mr-2`} />
                <Text style={tw.style('text-xs', active ? 'text-white' : 'text-slate-100')}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
