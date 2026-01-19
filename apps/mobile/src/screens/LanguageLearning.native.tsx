import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  findNodeHandle,
  UIManager,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Animated
} from 'react-native';


import { useNavigation, useRoute } from '@react-navigation/native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useLanguageLearning, useOrg } from '@mytutorapp/shared/hooks';
import { useThemePref } from '../theme/ThemeContext';
import { buildGradePayload } from '@mytutorapp/shared/utils/buildGradePayload';
import {
  downloadCertificateFile,
  downloadTranscriptFile,
  generateCertificate,
  generateTranscript,
  gradeQuizApi,
} from '@mytutorapp/shared/api';
import ClassroomPlayer from './ClassroomPlayer.native';
import type {
  LanguageLearningMessage,
  PlaybackPayload,
  PlaybackQueueItem,
} from '@mytutorapp/shared/types';

// Modified for Language Learning UX upgrade (safe area, active line, themed voice sheet).
const extractInitMessages = (
  preview: LanguageLearningMessage[] = [],
  playback?: PlaybackPayload | null
) => {
  if (!preview.length) return [];
  const mapped = preview.map((msg) => ({ ...msg }));
  const last = mapped[mapped.length - 1];
  if (playback && last && last.role === 'assistant') {
    last.playback = playback;
  }
  return mapped;
};

const VOICES = [
  { id: 'calm', label: 'Calm' },
  { id: 'bright', label: 'Bright' },
  { id: 'deep', label: 'Deep' },
  { id: 'storyteller', label: 'Storyteller' },
  { id: 'teacher', label: 'Teacher' },
  { id: 'kid', label: 'Kid-friendly' },
  { id: 'sunny', label: 'Sunny' },
  { id: 'focus', label: 'Focus' },
];

const TOPICS = [
  {
    id: 'travel',
    label: 'Travel',
    prompts: [
      'Teach me travel phrases in {language}. Start with a short dialogue and explain new words.',
      'Give me airport and hotel phrases in {language}, with pronunciation tips.',
      'Role-play a traveler asking for help in {language}.',
    ],
  },
  {
    id: 'food',
    label: 'Food',
    prompts: [
      'Teach me restaurant phrases in {language}. Start with a short dialogue.',
      'Give me a food vocabulary mini-lesson in {language}.',
      'Role-play ordering food in {language} with polite phrases.',
    ],
  },
  {
    id: 'work',
    label: 'Work',
    prompts: [
      'Teach me workplace phrases in {language}. Provide a short dialogue.',
      'Give me office small-talk phrases in {language}.',
      'Role-play a meeting introduction in {language}.',
    ],
  },
  {
    id: 'school',
    label: 'School',
    prompts: [
      'Teach me school-related phrases in {language}.',
      'Role-play asking a teacher for help in {language}.',
      'Give me classroom vocabulary in {language}.',
    ],
  },
  {
    id: 'friends',
    label: 'Friends',
    prompts: [
      'Teach me friendly greetings in {language} with a short dialogue.',
      'Give me casual phrases to make plans in {language}.',
      'Role-play meeting a new friend in {language}.',
    ],
  },
  {
    id: 'shopping',
    label: 'Shopping',
    prompts: [
      'Teach me shopping phrases in {language}.',
      'Role-play buying clothes in {language}.',
      'Give me pricing and bargaining phrases in {language}.',
    ],
  },
  {
    id: 'directions',
    label: 'Directions',
    prompts: [
      'Teach me directions and navigation phrases in {language}.',
      'Role-play asking for directions in {language}.',
      'Give me transit phrases in {language} for buses and trains.',
    ],
  },
  {
    id: 'doctor',
    label: 'Doctor',
    prompts: [
      'Teach me health and doctor visit phrases in {language}.',
      'Role-play explaining symptoms in {language}.',
      'Give me pharmacy phrases in {language}.',
    ],
  },
  {
    id: 'hobbies',
    label: 'Hobbies',
    prompts: [
      'Teach me hobby-related phrases in {language}.',
      'Role-play talking about hobbies in {language}.',
      'Give me sports and leisure phrases in {language}.',
    ],
  },
  {
    id: 'weather',
    label: 'Weather',
    prompts: [
      'Teach me weather phrases in {language}.',
      'Role-play a weather forecast in {language}.',
      'Give me seasonal vocabulary in {language}.',
    ],
  },
  {
    id: 'interviews',
    label: 'Interviews',
    prompts: [
      'Teach me interview phrases in {language}.',
      'Role-play a short job interview in {language}.',
      'Give me polite professional phrases in {language}.',
    ],
  },
  {
    id: 'small-talk',
    label: 'Small talk',
    prompts: [
      'Teach me small-talk phrases in {language}.',
      'Role-play a casual conversation in {language}.',
      'Give me ice-breaker questions in {language}.',
    ],
  },
];

const DEFAULT_VOICE = {
  voiceId: VOICES.at(0)?.id ?? 'calm',
  rate: 1,
  pitch: 1,
};

const normalizeLangKey = (s?: string | null) => {
  const t = String(s ?? '').trim().toLowerCase();
  if (!t) return '';
  if (t.includes('deutsch') || t.includes('german')) return 'german';
  if (t.includes('français') || t.includes('francais') || t.includes('french')) return 'french';
  if (t.includes('español') || t.includes('espanol') || t.includes('spanish')) return 'spanish';
  if (t.includes('arabic') || t.includes('arab') || t.includes('عربي')) return 'arabic';
  return t;
};

const llCourseIdStorageKey = (langKey: string) => `ll_course_id_v1_${langKey}`;

const FONT_SIZE_KEY = 'll_font_size_v1';
const MUTE_EN_KEY = 'll_mute_en_v1';
const MUTE_TR_KEY = 'll_mute_tr_v1';

const DBG_LL_AUDIO = __DEV__ && Boolean((globalThis as any)?.__DBG_LL_AUDIO__);
const llAudioLog = (...args: any[]) => {
  if (!DBG_LL_AUDIO) return;
  // eslint-disable-next-line no-console
  console.log('[LLAudio]', ...args);
};

const buildSegmentsFromQueue = (items: PlaybackQueueItem[]) => {
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
};

const LanguageLearningScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { backendUrl, token } = useShopContext();
  const insets = useSafeAreaInsets();
  const themePref = useThemePref();
  const isDark = themePref.resolvedScheme === 'dark';
  const theme = useMemo(
    () => ({
      bg: isDark ? '#0b1220' : '#f8fafc',
      card: isDark ? 'rgba(15,23,42,0.85)' : '#ffffff',
      cardSoft: isDark ? 'rgba(30,41,59,0.6)' : '#f1f5f9',
      border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      text: isDark ? '#f8fafc' : '#0f172a',
      subtext: isDark ? 'rgba(248,250,252,0.7)' : 'rgba(15,23,42,0.6)',
      muted: isDark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.45)',
      pill: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
      accent: '#34d399',
      accentSoft: isDark ? 'rgba(52,211,153,0.2)' : 'rgba(16,185,129,0.12)',
      userBubble: isDark ? '#3b82f6' : '#2563eb',
      userBorder: isDark ? '#60a5fa' : '#1d4ed8',
      assistantBubble: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
    }),
    [isDark]
  );

  const courseId = route.params?.courseId as string;
  const languageStart = route.params?.languageStart;
  const targetLanguage = languageStart?.targetLanguage || 'your target language';
  const voiceStorageKey = `ll_voice_settings_v1_${targetLanguage}`;

  const initMessages = useMemo(
    () => extractInitMessages(languageStart?.messagesPreview, languageStart?.playback),
    [languageStart]
  );

  const { activeOrgId } = useOrg();

  const {
    messages,
    headerLabel,
    playbackQueue,
    promptsUsed,
    promptsLimit,
    resetAt,
    loading,
    error,
    bundleBlocked,
    setPlaybackQueue,
    setInitialState,
    sendPrompt,
    purchaseBundle,
    completeCourse,
  } = useLanguageLearning(backendUrl, token || '', courseId || '', {
    messages: initMessages,
    entitlement: languageStart?.entitlement,
    targetLanguage: languageStart?.targetLanguage,
    orgId: activeOrgId ?? null,
  });

  const [input, setInput] = useState('');
  const [quiz, setQuiz] = useState<any | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [grade, setGrade] = useState<any | null>(null);
  const [certId, setCertId] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showVoiceSheet, setShowVoiceSheet] = useState(false);
  const [showTopicSheet, setShowTopicSheet] = useState(false);
  const [topicFilter, setTopicFilter] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<(typeof TOPICS)[number] | null>(null);
  const [voiceSettings, setVoiceSettings] = useState(DEFAULT_VOICE);
  const [fontSize, setFontSize] = useState(16);
  const [muteEn, setMuteEn] = useState(false);
  const [muteTr, setMuteTr] = useState(false);

  const [activeMessageKey, setActiveMessageKey] = useState<string | null>(null);
  const [inlinePlayback, setInlinePlayback] = useState<PlaybackPayload | null>(null);
  const [inlineIndex, setInlineIndex] = useState(0);
  const [inlinePlaying, setInlinePlaying] = useState(false);
  const [inlineAutoPlayNext, setInlineAutoPlayNext] = useState(false);
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  const [activeLineIsTarget, setActiveLineIsTarget] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const lineRefs = useRef(new Map<string, any>());
const inputRef = useRef<TextInput>(null);

  const lastUserScrollRef = useRef(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevVoiceIdRef = useRef(voiceSettings.voiceId);
  const playSessionRef = useRef(0);
  const playOpRef = useRef<Promise<void>>(Promise.resolve());
  const inlineIndexRef = useRef(0);
  const inlineItemsRef = useRef<PlaybackQueueItem[]>([]);
type RepeatSheetState = {
  messageKey: string;
  msg: any;
  idx: number;
};

const getMsgId = (msg: any) => msg?.id ?? msg?.messageId ?? null;
const cacheKeyFor = (messageKey: string, voiceId: string) => `${messageKey}::${voiceId}`;

const [playbackByKey, setPlaybackByKey] = useState<Record<string, PlaybackPayload>>({});
const [playbackLoadingKey, setPlaybackLoadingKey] = useState<string | null>(null);
const [repeatSheet, setRepeatSheet] = useState<RepeatSheetState | null>(null);

const [inputFocused, setInputFocused] = useState(false);
const [keyboardOpen, setKeyboardOpen] = useState(false);
const [nowTs, setNowTs] = useState(() => Date.now());

useEffect(() => {
  const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

  const subShow = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
  const subHide = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));

  return () => {
    subShow.remove();
    subHide.remove();
  };
}, []);

useEffect(() => {
  if (!resetAt) return;
  const timer = setInterval(() => setNowTs(Date.now()), 1000);
  return () => clearInterval(timer);
}, [resetAt]);

const [keyboardHeight, setKeyboardHeight] = useState(0);
const kbAnim = useRef(new Animated.Value(0)).current;

useEffect(() => {
  const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

  const subShow = Keyboard.addListener(showEvt, (e: any) => {
    const h = e?.endCoordinates?.height ?? 0;
    setKeyboardOpen(true);
    setKeyboardHeight(h);
    Animated.timing(kbAnim, {
      toValue: h,
      duration: Platform.OS === 'ios' ? 250 : 140,
      useNativeDriver: false,
    }).start();
  });

  const subHide = Keyboard.addListener(hideEvt, () => {
    setKeyboardOpen(false);
    setKeyboardHeight(0);
    Animated.timing(kbAnim, {
      toValue: 0,
      duration: Platform.OS === 'ios' ? 250 : 140,
      useNativeDriver: false,
    }).start();
  });

  return () => {
    subShow.remove();
    subHide.remove();
  };
}, [kbAnim]);


// keep track of which message is “active” so switching voice can refetch the right audio
const activeMsgMetaRef = useRef<{ messageKey: string; idx: number; msgId: any } | null>(null);

  const inlineItems = inlinePlayback?.items || [];
  const inlineSegments = useMemo(() => buildSegmentsFromQueue(inlineItems), [inlineItems]);
  const inlineCurrentItem = inlineItems[inlineIndex];
  const inlineSegmentIdx = inlineCurrentItem?.segmentIdx ?? 0;
  const inlineSegment = inlineSegments.find((seg) => seg.segmentIdx === inlineSegmentIdx);
const composerCollapsed = inputFocused || keyboardOpen;

  useEffect(() => {
    inlineIndexRef.current = inlineIndex;
  }, [inlineIndex]);

  useEffect(() => {
    inlineItemsRef.current = inlineItems;
  }, [inlineItems]);

  const measureLineYInScroll = useCallback((lineNode: any, onY: (y: number) => void) => {
  const scrollNode = scrollRef.current as any;
  if (!lineNode || !scrollNode) return;

  // ✅ Fabric-safe: pass the *native ref* (not a tag)
  try {
    if (typeof lineNode.measureLayout === 'function') {
      lineNode.measureLayout(
        scrollNode,
        (_x: number, y: number) => onY(y),
        () => {}
      );
      return;
    }
  } catch {
    // fallthrough
  }

  // ✅ Fallback: UIManager with node handles
  const lineHandle = findNodeHandle(lineNode);
  const scrollHandle = findNodeHandle(scrollNode);
  if (!lineHandle || !scrollHandle) return;

  UIManager.measureLayout(
    lineHandle,
    scrollHandle,
    () => {},
    (_x: number, y: number) => onY(y)
  );
}, []);


  useEffect(() => {
    if (!inlinePlaying || !activeMessageKey || !inlineCurrentItem) {
      setActiveLineKey(null);
      setActiveLineIsTarget(false);
      return;
    }
    // Active-line logic lives here: map the narrated segment to a UI line.
    setActiveLineKey(`${activeMessageKey}-${inlineCurrentItem.segmentIdx}`);
    setActiveLineIsTarget(inlineCurrentItem.kind === 'tr');
  }, [activeMessageKey, inlineCurrentItem, inlinePlaying]);


  useEffect(() => {
  if (!activeLineKey) return;
  if (Date.now() - lastUserScrollRef.current < 1200) return;

  const lineNode = lineRefs.current.get(activeLineKey);
  if (!lineNode) return;

  measureLineYInScroll(lineNode, (y) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
  });
}, [activeLineKey, measureLineYInScroll]);


  useEffect(() => {
    if (!token) {
      navigation.navigate('Login' as any, { reason: 'language-learning' } as any);
    }
  }, [navigation, token]);

  useEffect(() => {
    if (languageStart) {
      setInitialState({
        messages: initMessages,
        entitlement: languageStart.entitlement,
        targetLanguage: languageStart.targetLanguage,
      });
      if (languageStart?.playback) {
        setPlaybackQueue(languageStart.playback);
      }
    }
  }, [languageStart, initMessages, setInitialState, setPlaybackQueue]);

  useEffect(() => {
  if (!languageStart?.playback) return;

  // Find the last assistant message in initMessages (matches extractInitMessages behavior)
  const lastAssistantIdx = [...initMessages]
    .map((m, i) => ({ m, i }))
    .reverse()
    .find((x) => x.m?.role === 'assistant')?.i;

  if (lastAssistantIdx == null) return;

  const mk = `assistant-${lastAssistantIdx}`;
  const ck = cacheKeyFor(mk, DEFAULT_VOICE.voiceId);

  setPlaybackByKey((prev) => ({ ...prev, [ck]: languageStart.playback }));
}, [languageStart?.playback, initMessages]);


  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(voiceStorageKey)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (parsed?.voiceId && typeof parsed?.rate === 'number') {
          setVoiceSettings({
            voiceId: parsed.voiceId,
            rate: parsed.rate,
            pitch: typeof parsed.pitch === 'number' ? parsed.pitch : 1,
          });
        }
      })
      .catch(() => {
        AsyncStorage.removeItem(voiceStorageKey).catch(() => {});
      });
  }, [voiceStorageKey]);

  useEffect(() => {
    AsyncStorage.setItem(voiceStorageKey, JSON.stringify(voiceSettings)).catch(() => {});
  }, [voiceSettings, voiceStorageKey]);

  useEffect(() => {
    AsyncStorage.multiGet([FONT_SIZE_KEY, MUTE_EN_KEY, MUTE_TR_KEY])
      .then((entries) => {
        const storedFont = entries.find(([key]) => key === FONT_SIZE_KEY)?.[1];
        const storedMuteEn = entries.find(([key]) => key === MUTE_EN_KEY)?.[1];
        const storedMuteTr = entries.find(([key]) => key === MUTE_TR_KEY)?.[1];
        const parsedFont = Number(storedFont);
        if (!Number.isNaN(parsedFont)) {
          setFontSize(Math.min(22, Math.max(12, parsedFont)));
        }
        if (storedMuteEn != null) setMuteEn(storedMuteEn === 'true');
        if (storedMuteTr != null) setMuteTr(storedMuteTr === 'true');
      })
      .catch(() => {
        AsyncStorage.removeItem(FONT_SIZE_KEY).catch(() => {});
        AsyncStorage.removeItem(MUTE_EN_KEY).catch(() => {});
        AsyncStorage.removeItem(MUTE_TR_KEY).catch(() => {});
      });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(FONT_SIZE_KEY, String(fontSize)).catch(() => {});
  }, [fontSize]);

  useEffect(() => {
    AsyncStorage.setItem(MUTE_EN_KEY, String(muteEn)).catch(() => {});
  }, [muteEn]);

  useEffect(() => {
    AsyncStorage.setItem(MUTE_TR_KEY, String(muteTr)).catch(() => {});
  }, [muteTr]);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  const clearInlineTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const isItemMuted = useCallback(
    (item?: PlaybackQueueItem | null) => {
      if (!item) return false;
      if (item.kind === 'en') return muteEn;
      if (item.kind === 'tr') return muteTr;
      return false;
    },
    [muteEn, muteTr]
  );

  const findNextPlayableIndex = useCallback(
    (startIdx: number, items?: PlaybackQueueItem[]) => {
      const list = items ?? inlineItemsRef.current;
      for (let i = startIdx; i < list.length; i += 1) {
        const item = list[i];
        if (!isItemMuted(item)) return i;
      }
      return null;
    },
    [isItemMuted]
  );

  const loadInlineCurrent = useCallback(async () => {
    const sessionId = ++playSessionRef.current;
    const item = inlineCurrentItem;
    const itemKey = item?.audioUrl ? `${inlineIndex}:${item.audioUrl}` : 'none';
    llAudioLog('load start', { sessionId, itemKey });

    await (playOpRef.current = playOpRef.current.then(async () => {
      if (sessionId !== playSessionRef.current) {
        llAudioLog('load ignored (stale session)', { sessionId });
        return;
      }
      clearInlineTimer();
      await unloadSound();

      if (!item?.audioUrl) {
        setInlinePlaying(false);
        return;
      }

      if (isItemMuted(item)) {
        const nextIdx = findNextPlayableIndex(inlineIndex + 1, inlineItemsRef.current);
        if (nextIdx === null) {
          setInlinePlaying(false);
          setInlineAutoPlayNext(false);
        } else {
          setInlineAutoPlayNext(true);
          setInlineIndex(nextIdx);
          setInlinePlaying(true);
        }
        return;
      }

      const sound = new Audio.Sound();
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (sessionId !== playSessionRef.current) {
          if (status.isLoaded && status.didJustFinish) {
            llAudioLog('ended ignored (stale session)', { sessionId });
          }
          return;
        }
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          llAudioLog('ended', { sessionId });
          setInlineIndex((idx) => {
            const nextIdx = findNextPlayableIndex(idx + 1);
            if (nextIdx === null) {
              setInlinePlaying(false);
              setInlineAutoPlayNext(false);
              return idx;
            }
            setInlineAutoPlayNext(true);
            return nextIdx;
          });
        }
      });

      await sound.loadAsync({ uri: item.audioUrl }, { shouldPlay: false });
      await sound.setRateAsync(voiceSettings.rate, true);

      if (inlineAutoPlayNext || inlinePlaying) {
        const delay = item.kind === 'en' ? 300 : 220;
        timerRef.current = setTimeout(async () => {
          if (sessionId !== playSessionRef.current) {
            llAudioLog('play ignored (stale session)', { sessionId });
            return;
          }
          try {
            llAudioLog('play start', { sessionId, itemKey });
            await sound.playAsync();
            setInlinePlaying(true);
          } catch {
            setInlinePlaying(false);
          } finally {
            setInlineAutoPlayNext(false);
          }
        }, delay);
      }
    }));
  }, [
    clearInlineTimer,
    inlineAutoPlayNext,
    inlineCurrentItem,
    inlineIndex,
    inlinePlaying,
    findNextPlayableIndex,
    isItemMuted,
    unloadSound,
    voiceSettings.rate,
  ]);


  useEffect(() => {
  const prevVoiceId = prevVoiceIdRef.current;
  if (prevVoiceId === voiceSettings.voiceId) return;
  prevVoiceIdRef.current = voiceSettings.voiceId;
  if (!inlinePlaying) return;
  void loadInlineCurrent();
}, [inlinePlaying, loadInlineCurrent, voiceSettings.voiceId]);

  useEffect(() => {
    loadInlineCurrent();
    return () => {
      clearInlineTimer();
    };
  }, [loadInlineCurrent, clearInlineTimer]);

  useEffect(() => {
    setInlineIndex(0);
    setInlinePlaying(false);
    setInlineAutoPlayNext(false);
  }, [inlinePlayback?.items]);

  useEffect(() => {
    return () => {
      unloadSound();
    };
  }, [unloadSound]);

  const handleInlinePlayPause = useCallback(
    async (messageKey: string, playback: PlaybackPayload | null | undefined) => {
      if (!playback?.items?.length) return;
      llAudioLog('play requested', { messageKey, activeMessageKey, inlineIndex });
      if (activeMessageKey !== messageKey) {
        setActiveMessageKey(messageKey);
        setInlinePlayback(playback);
        setInlineIndex(0);
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
        setPlaybackQueue(playback);
        return;
      }
      if (!soundRef.current) {
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
        return;
      }
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
        setInlinePlaying(false);
      } else {
        if (inlineIndex >= inlineItems.length - 1) {
          setInlineIndex(0);
          setInlineAutoPlayNext(true);
          setInlinePlaying(true);
          return;
        }
        await soundRef.current.playAsync();
        setInlinePlaying(true);
      }
    },
    [activeMessageKey, inlineIndex, inlineItems.length, setPlaybackQueue]
  );

  const handleInlineReplay = useCallback(
    (messageKey: string, playback: PlaybackPayload | null | undefined) => {
      if (!playback?.items?.length) return;
      if (activeMessageKey !== messageKey) {
        setActiveMessageKey(messageKey);
        setInlinePlayback(playback);
        setInlineIndex(0);
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
        setPlaybackQueue(playback);
        return;
      }
      const idx = inlineItems.findIndex(
        (item) => item.segmentIdx === inlineSegmentIdx && item.kind === 'en'
      );
      if (idx >= 0) {
        const playableIdx = isItemMuted(inlineItems[idx])
          ? findNextPlayableIndex(idx, inlineItems)
          : idx;
        if (playableIdx === null) {
          setInlinePlaying(false);
          return;
        }
        setInlineIndex(playableIdx);
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
      }
    },
    [activeMessageKey, findNextPlayableIndex, inlineItems, inlineSegmentIdx, isItemMuted, setPlaybackQueue]
  );

    const title = headerLabel
    ? `Language Learning: English → ${headerLabel}`
    : 'Language Learning';

  const promptLocked = useMemo(() => {
    if (bundleBlocked) return true;
    if (typeof promptsLimit !== 'number' || promptsLimit <= 0) return false;
    return promptsUsed >= promptsLimit;
  }, [bundleBlocked, promptsLimit, promptsUsed]);


  const handleSend = useCallback(async () => {
    if (!input.trim() || promptLocked || loading) return;
    await sendPrompt(input.trim());
    setInput('');
  }, [input, promptLocked, loading, sendPrompt]);

  const handleComplete = useCallback(async () => {
    const q = await completeCourse();
    if (q) {
      setQuiz(q);
      setAnswers({});
      setGrade(null);
    }
  }, [completeCourse]);

  const handleGrade = useCallback(async () => {
    if (!quiz || !courseId) return;
    const payload = buildGradePayload(quiz, answers, { courseId });
    const g = await gradeQuizApi(backendUrl, token || '', payload);
    setGrade(g);
  }, [quiz, answers, courseId, backendUrl, token]);

  const allAnswered = useMemo(() => {
    if (!quiz?.questions?.length) return false;
    return quiz.questions.every((q: any) => answers[q.id] !== undefined);
    
  }, [quiz, answers]);


const fetchPlaybackForMessage = useCallback(
  async (msg: any, idx: number) => {
    const base = String(backendUrl || '').replace(/\/$/, '');
    const url = `${base}/api/ai/courses/language/playback`;

    const messageId = getMsgId(msg);

    const payload: any = {
      courseId,
      voiceId: voiceSettings.voiceId,
    };

    // ✅ only send valid locator
    if (messageId !== null && messageId !== undefined && messageId !== '') {
      payload.messageId = messageId;
    } else {
      payload.messageIndex = idx;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 404) {
      console.error('[LL playback] 404 endpoint not found', { url });
      throw new Error(`PLAYBACK_ENDPOINT_404: ${url}`);
    }

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      console.error('[LL playback] request failed', {
        status: res.status,
        url,
        payload,
        response: json,
      });
      throw new Error(json?.error || json?.message || 'PLAYBACK_FETCH_FAILED');
    }

    return json as PlaybackPayload;
  },
  [backendUrl, token, courseId, voiceSettings.voiceId]
);


const ensurePlaybackFor = useCallback(
  async (messageKey: string, msg: any, idx: number) => {
    const ck = cacheKeyFor(messageKey, voiceSettings.voiceId);

    // ✅ Prefer per-voice cache FIRST (so voice switching works)
    const perVoice = playbackByKey[ck];
    if (perVoice?.items?.length) return perVoice;

    // ✅ Embedded playback only as fallback (usually default voice from start)
    const embedded = msg?.playback as PlaybackPayload | undefined;
    if (embedded?.items?.length) return embedded;

    setPlaybackLoadingKey(ck);
    try {
      const pb = await fetchPlaybackForMessage(msg, idx);
      if (pb?.items?.length) {
        setPlaybackByKey((prev) => ({ ...prev, [ck]: pb }));
        return pb;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      setPlaybackLoadingKey((cur) => (cur === ck ? null : cur));
    }
  },
  [voiceSettings.voiceId, playbackByKey, fetchPlaybackForMessage]
);


const startPlaybackAt = useCallback(
  async (messageKey: string, msg: any, idx: number, segmentIdx: number, kind: 'en' | 'tr') => {
    const pb = await ensurePlaybackFor(messageKey, msg, idx);
    if (!pb?.items?.length) return;

    activeMsgMetaRef.current = { messageKey, idx, msgId: getMsgId(msg) };

    const startIdx = pb.items.findIndex(
      (it) => it.segmentIdx === segmentIdx && it.kind === kind
    );
    const desiredIdx = startIdx >= 0 ? startIdx : 0;
    if (isItemMuted(pb.items[desiredIdx])) {
      setInlinePlaying(false);
      return;
    }

    setActiveMessageKey(messageKey);
    setInlinePlayback(pb);
    setPlaybackQueue(pb);
    setInlineIndex(desiredIdx);
    setInlineAutoPlayNext(true);
    setInlinePlaying(true);
  },
  [ensurePlaybackFor, isItemMuted, setPlaybackQueue]
);

  const handleCertificate = useCallback(async () => {
    if (!courseId || !token) return;
    setDownloading(true);
    try {
      const cert = await generateCertificate(backendUrl, token, courseId);
      setCertId(cert?.id || null);
      if (cert?.id) {
        await downloadCertificateFile(backendUrl, token, cert.id);
      }
    } finally {
      setDownloading(false);
    }
  }, [backendUrl, token, courseId]);

  const handleTranscript = useCallback(async () => {
    if (!courseId || !token) return;
    setDownloading(true);
    try {
      const transcript = await generateTranscript(backendUrl, token, courseId);
      const id = transcript?.id || null;
      setTranscriptId(id);
      if (id) {
        await downloadTranscriptFile(backendUrl, token, id);
      }
    } finally {
      setDownloading(false);
    }
  }, [backendUrl, token, courseId]);


  const formatCountdown = useCallback((ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, []);

  const resetLabel = useMemo(() => {
    if (!resetAt) return null;
    const ts = new Date(resetAt).getTime();
    if (Number.isNaN(ts)) return null;
    const remaining = ts - nowTs;
    if (remaining <= 0) {
      return `Resets at ${new Date(ts).toLocaleString()}`;
    }
    return `Resets in ${formatCountdown(remaining)}`;
  }, [resetAt, nowTs, formatCountdown]);

  const baseFontSize = Math.min(22, Math.max(12, fontSize));
  const targetFontSize = Math.max(12, baseFontSize - 2);
  const targetActiveFontSize = Math.min(26, baseFontSize + 2);

  const progressPct = useMemo(() => {
    if (!promptsLimit) return 0;
    return Math.min(100, Math.round((promptsUsed / promptsLimit) * 100));
  }, [promptsLimit, promptsUsed]);

  const filteredTopics = useMemo(() => {
    const term = topicFilter.trim().toLowerCase();
    if (!term) return TOPICS;
    return TOPICS.filter((topic) => topic.label.toLowerCase().includes(term));
  }, [topicFilter]);

const applyPrompt = useCallback(
  (prompt?: string) => {
    const p = String(prompt ?? '').trim();
    if (!p) return;

    setInput(p.replace('{language}', headerLabel || targetLanguage));

    // ✅ close sheets so user sees the composer immediately
    setShowTopicSheet(false);
    setShowVoiceSheet(false);

    // ✅ keep UX smooth
    requestAnimationFrame(() => inputRef.current?.focus());
  },
  [headerLabel, targetLanguage]
);


useEffect(() => {
  const cid = String(courseId || '').trim();
  if (!cid) return;

  const keys = new Set<string>();
  const k1 = normalizeLangKey(targetLanguage);
  const k2 = normalizeLangKey(headerLabel);

  if (k1) keys.add(k1);
  if (k2) keys.add(k2);

  for (const k of keys) {
    AsyncStorage.setItem(llCourseIdStorageKey(k), cid).catch(() => {});
  }
}, [courseId, targetLanguage, headerLabel]);



 const handleTopicSelect = useCallback(
  (topic: (typeof TOPICS)[number]) => {
    setSelectedTopic(topic);
    applyPrompt(topic.prompts?.[0]);
  },
  [applyPrompt]
);


 const handleSurprise = useCallback(() => {
  const random = TOPICS.at(Math.floor(Math.random() * TOPICS.length));
  if (!random) return; // satisfies TS when array access can be undefined
  setSelectedTopic(random);
  applyPrompt(random.prompts?.[0]);
}, [applyPrompt]);

const activeVoiceLabel =
  VOICES.find((v) => v.id === voiceSettings.voiceId)?.label ?? voiceSettings.voiceId;

  const footerPadding = insets.bottom + 12;
  
 const footerLift = keyboardOpen ? 0 : 14;
const compact = keyboardOpen || inputFocused;
const sheetBottomGap = footerHeight + keyboardHeight;

const footerSafePad = footerPadding + footerLift;

const bottomPadding = footerHeight + footerSafePad + keyboardHeight + 10;
  const voiceSheetTheme = useMemo(
    () => ({
      bg: isDark ? '#0f172a' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
      text: isDark ? '#f8fafc' : '#0f172a',
      subtext: isDark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.6)',
      pillBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
      sliderTrack: isDark ? '#1f2937' : '#e2e8f0',
    }),
    [isDark]
  );

  return (
  <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
    {/* Main content */}
    <View style={tw`flex-1`}>
      <ScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => {
          lastUserScrollRef.current = Date.now();
        }}
        onMomentumScrollBegin={() => {
          lastUserScrollRef.current = Date.now();
        }}
        scrollIndicatorInsets={{ bottom: bottomPadding }}
        contentContainerStyle={[
          tw`gap-4`,
          {
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: bottomPadding,
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
          },
        ]}
      >
        {/* ─────────────────────────────────────────────
            Header card
        ───────────────────────────────────────────── */}
        <View style={[tw`rounded-3xl p-5 gap-3 border`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[tw`text-2xl font-bold`, { color: theme.text }]}>{title}</Text>
          <Text style={[tw`text-xs`, { color: theme.subtext }]}>
            Prompts used {promptsUsed} / {promptsLimit}
          </Text>
          <View style={[tw`h-2 rounded-full mt-1 overflow-hidden`, { backgroundColor: theme.pill }]}>
            <View style={[tw`h-2 rounded-full`, { width: `${progressPct}%`, backgroundColor: theme.accent }]} />
          </View>
        </View>

        {/* ─────────────────────────────────────────────
            Messages
        ───────────────────────────────────────────── */}
        <View style={[tw`rounded-3xl p-4 gap-4 border`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {messages.length === 0 && (
            <Text style={[tw`text-sm`, { color: theme.subtext }]}>Start chatting to build your course.</Text>
          )}

          {messages.map((msg, idx) => {
            const messageKey = `${msg.role}-${idx}`;
            const isAssistant = msg.role === 'assistant';
            const isActive = activeMessageKey === messageKey;

            return (
              <View key={messageKey} style={tw`${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <View
                  style={[
                    tw`max-w-[86%] rounded-3xl px-4 py-3 border`,
                    {
                      backgroundColor: msg.role === 'user' ? theme.userBubble : theme.assistantBubble,
                      borderColor: isActive ? theme.accent : msg.role === 'user' ? theme.userBorder : theme.border,
                    },
                  ]}
                >
                  {isAssistant && msg.segments ? (
                    <View style={tw`gap-2`}>
                      {msg.segments.map((seg: any, segIdx: number) => {
                        const lineKey = `${messageKey}-${segIdx}`;
                        const isActiveLine = isActive && activeLineKey === lineKey;

                        return (
                          <View
                            key={`${seg.en}-${segIdx}`}
                            ref={(node) => {
                              if (node) lineRefs.current.set(lineKey, node);
                              else lineRefs.current.delete(lineKey);
                            }}
                            style={[
                              tw`rounded-2xl px-3 py-2`,
                              { backgroundColor: isActiveLine ? theme.accentSoft : 'transparent' },
                            ]}
                          >
                            <Text
                              style={[tw`text-sm`, { color: theme.text, fontSize: baseFontSize, flexShrink: 1 }]}
                            >
                              {seg.en}
                            </Text>
                            <Text
                              style={[
                                tw`text-xs`,
                                {
                                  color: isActiveLine && activeLineIsTarget ? theme.text : theme.subtext,
                                  fontSize: isActiveLine && activeLineIsTarget ? targetActiveFontSize : targetFontSize,
                                  fontWeight: isActiveLine && activeLineIsTarget ? '600' : '400',
                                  flexShrink: 1,
                                },
                              ]}
                            >
                              {seg.tr}
                            </Text>
                          </View>
                        );
                      })}

                      {/* Narration controls */}
                      <View style={tw`gap-2`}>
                        {(() => {
                          const ck = cacheKeyFor(messageKey, voiceSettings.voiceId);
                          const pb = playbackByKey[ck] || (msg.playback as PlaybackPayload) || null;

                          const hasPb = !!pb?.items?.length;
                          const isPbLoading = playbackLoadingKey === ck;

                          return (
                            <>
                              <View style={tw`flex-row items-center gap-2`}>
                                <Pressable
                                  onPress={async () => {
                                    try {
                                      const ensured = await ensurePlaybackFor(messageKey, msg, idx);
                                      if (!ensured) return;

                                      activeMsgMetaRef.current = { messageKey, idx, msgId: getMsgId(msg) };
                                      await handleInlinePlayPause(messageKey, ensured);
                                    } catch (e) {
                                      console.error(e);
                                    }
                                  }}
                                  style={[
                                    tw`rounded-full px-3 py-1`,
                                    { backgroundColor: hasPb ? theme.accentSoft : theme.pill },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      tw`text-xs font-semibold`,
                                      { color: hasPb ? theme.accent : theme.text },
                                    ]}
                                  >
                                    {isPbLoading
                                      ? 'Loading…'
                                      : hasPb
                                        ? isActive && inlinePlaying
                                          ? 'Pause'
                                          : 'Play'
                                        : 'Load narration'}
                                  </Text>
                                </Pressable>

                                <Pressable
                                  disabled={!hasPb || isPbLoading}
                                  onPress={async () => {
                                    const ensured = await ensurePlaybackFor(messageKey, msg, idx);
                                    if (!ensured) return;

                                    activeMsgMetaRef.current = { messageKey, idx, msgId: getMsgId(msg) };
                                    handleInlineReplay(messageKey, ensured);
                                  }}
                                  style={[
                                    tw`rounded-full px-3 py-1`,
                                    { backgroundColor: theme.pill },
                                    !hasPb || isPbLoading ? tw`opacity-50` : null,
                                  ]}
                                >
                                  <Text style={[tw`text-xs`, { color: theme.text }]}>Replay</Text>
                                </Pressable>

                                <Pressable
                                  onPress={() => setRepeatSheet({ messageKey, msg, idx })}
                                  style={[tw`rounded-full px-3 py-1`, { backgroundColor: theme.pill }]}
                                >
                                  <Text style={[tw`text-xs`, { color: theme.text }]}>Repeat section</Text>
                                </Pressable>

                                {isActive && (
                                  <Text style={[tw`text-[11px]`, { color: theme.subtext }]}>
                                    {inlineIndex + 1} / {inlineItems.length || 0}
                                  </Text>
                                )}
                              </View>

                              {isActive && inlineSegment && (
                                <View
                                  style={[tw`rounded-2xl px-3 py-2`, { backgroundColor: theme.accentSoft }]}
                                >
                                  <Text style={[tw`text-xs font-semibold`, { color: theme.accent }]}>
                                    Now playing
                                  </Text>
                                  <Text style={[tw`text-xs`, { color: theme.text }]}>{inlineSegment.en}</Text>
                                  <Text style={[tw`text-[11px]`, { color: theme.subtext }]}>
                                    {inlineSegment.tr}
                                  </Text>
                                </View>
                              )}
                            </>
                          );
                        })()}
                      </View>
                    </View>
                  ) : (
                    <Text style={[tw`text-sm`, { color: theme.text }]}>{msg.content}</Text>
                  )}
                </View>
              </View>
            );
          })}

          {loading && (
            <View style={tw`flex-row items-center gap-2`}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[tw`text-xs`, { color: theme.subtext }]}>Tutor is typing…</Text>
            </View>
          )}
        </View>

        {/* Complete */}
        <View style={[tw`rounded-3xl p-4 border`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable onPress={handleComplete} style={tw`rounded-xl bg-emerald-600 px-4 py-2`}>
            <Text style={tw`text-sm text-white font-semibold text-center`}>Course Complete</Text>
          </Pressable>
        </View>

        {/* Player */}
        <View style={[tw`rounded-3xl p-3 border`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ClassroomPlayer
            mode="language"
            playback={playbackQueue || undefined}
            title={title}
            rate={voiceSettings.rate}
            pitch={voiceSettings.pitch}
            voiceId={voiceSettings.voiceId}
          />
        </View>

        {/* Quiz */}
        {quiz && (
          <View style={[tw`rounded-3xl p-4 gap-4 border`, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[tw`text-lg font-semibold`, { color: theme.text }]}>Final Quiz</Text>

            {quiz.questions.map((q: any, qIdx: number) => (
              <View key={q.id} style={tw`gap-2`}>
                <Text style={[tw`text-sm font-semibold`, { color: theme.text }]}>
                  {qIdx + 1}. {q.prompt}
                </Text>

                <View style={tw`gap-2`}>
                  {q.choices.map((choice: string, cIdx: number) => {
                    const selected = answers[q.id] === cIdx;
                    return (
                      <Pressable
                        key={choice}
                        onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))}
                        style={[
                          tw`flex-row items-center gap-2 rounded-2xl border px-3 py-2`,
                          {
                            borderColor: selected ? '#60a5fa' : theme.border,
                            backgroundColor: selected ? 'rgba(59,130,246,0.2)' : 'transparent',
                          },
                        ]}
                      >
                        <View
                          style={[
                            tw`h-4 w-4 rounded-full border items-center justify-center`,
                            {
                              borderColor: selected ? '#93c5fd' : theme.subtext,
                              backgroundColor: selected ? '#60a5fa' : 'transparent',
                            },
                          ]}
                        >
                          {selected && <View style={tw`h-2 w-2 rounded-full bg-white`} />}
                        </View>
                        <Text style={[tw`text-sm`, { color: theme.text }]}>{choice}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <Pressable
              onPress={handleGrade}
              disabled={!allAnswered}
              style={tw`rounded-xl bg-blue-600 px-4 py-2 ${!allAnswered ? 'opacity-50' : ''}`}
            >
              <Text style={tw`text-sm text-white font-semibold text-center`}>Submit Quiz</Text>
            </Pressable>

            {grade && (
              <Text style={[tw`text-sm`, { color: theme.subtext }]}>
                Score: {grade.scorePct}%
              </Text>
            )}

            {grade?.scorePct >= 70 && (
              <View style={tw`gap-2`}>
                <Pressable
                  onPress={handleCertificate}
                  disabled={downloading}
                  style={tw`rounded-xl border border-emerald-400 px-3 py-2 flex-row items-center justify-center gap-2`}
                >
                  {downloading && <ActivityIndicator color={theme.accent} />}
                  <Text style={tw`text-sm text-emerald-300 font-semibold text-center`}>
                    {certId ? 'Download Certificate' : 'Generate Certificate'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleTranscript}
                  disabled={downloading}
                  style={tw`rounded-xl border border-emerald-400 px-3 py-2 flex-row items-center justify-center gap-2`}
                >
                  {downloading && <ActivityIndicator color={theme.accent} />}
                  <Text style={tw`text-sm text-emerald-300 font-semibold text-center`}>
                    {transcriptId ? 'Download Transcript' : 'Generate Transcript'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ─────────────────────────────────────────────
          FLOATING FOOTER DOCK (always visible)
      ───────────────────────────────────────────── */}
      <Animated.View
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        style={[
          tw`border-t px-4 py-2`,
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: kbAnim,
            paddingBottom: footerSafePad,
            zIndex: 50,
            backgroundColor: theme.bg,
            borderColor: theme.border,
          },
        ]}
      >
        {/* Suggested */}
        {selectedTopic && (
          <View style={tw`mb-2`}>
            <Text style={[tw`text-xs`, { color: theme.subtext }]}>
              Suggested: <Text style={tw`text-emerald-300 font-semibold`}>{selectedTopic.label}</Text>
            </Text>
            <Pressable onPress={() => applyPrompt(selectedTopic.prompts?.[0])}>
              <Text style={tw`text-xs text-emerald-300 mt-1`}>Use prompt</Text>
            </Pressable>
          </View>
        )}

        {/* Topics + Voice (always visible; compact when typing) */}
        <View style={tw`flex-row items-center gap-2 mb-2`}>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setShowTopicSheet(true);
              setShowVoiceSheet(false);
            }}
            style={[
              tw`flex-1 rounded-full border px-3`,
              {
                borderColor: theme.border,
                backgroundColor: theme.pill,
                paddingVertical: compact ? 6 : 8,
              },
            ]}
          >
            <Text style={[tw`${compact ? 'text-[11px]' : 'text-xs'} font-semibold`, { color: theme.text }]}>
              ✨ Topics{selectedTopic ? `: ${selectedTopic.label}` : ''}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setShowVoiceSheet(true);
              setShowTopicSheet(false);
            }}
            style={[
              tw`flex-1 rounded-full border px-3`,
              {
                borderColor: theme.border,
                backgroundColor: theme.pill,
                paddingVertical: compact ? 6 : 8,
              },
            ]}
          >
            <Text style={[tw`${compact ? 'text-[11px]' : 'text-xs'} font-semibold`, { color: theme.text }]}>
              🎙 Voice: {activeVoiceLabel}
            </Text>
          </Pressable>
        </View>

        {/* Composer */}
        <View style={tw`flex-row items-center gap-2`}>
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={promptLocked ? 'Unlock more prompts to continue.' : 'Ask your tutor...'}
            placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
            editable={!promptLocked && !loading}
            style={[
              tw`flex-1 rounded-2xl border px-4 py-3 text-sm`,
              { borderColor: theme.border, color: theme.text, backgroundColor: theme.cardSoft },
            ]}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          <Pressable
            onPress={handleSend}
            disabled={promptLocked || loading || !input.trim()}
            style={tw`rounded-2xl bg-emerald-500 px-4 py-3 ${
              promptLocked || loading || !input.trim() ? 'opacity-50' : ''
            }`}
          >
            <Text style={tw`text-sm text-white font-semibold`}>Send</Text>
          </Pressable>
        </View>

        {promptLocked && (
          <View
            style={[
              tw`mt-3 rounded-2xl border px-4 py-3 gap-2`,
              { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: theme.accentSoft },
            ]}
          >
            <View style={tw`flex-row items-center gap-2`}>
              <Text style={tw`text-base`}>🔒</Text>
              <Text style={tw`text-sm text-emerald-200 font-semibold`}>
                You’ve hit your free prompt limit.
              </Text>
            </View>
            {resetLabel ? (
              <Text style={tw`text-xs text-emerald-200`}>{resetLabel}</Text>
            ) : null}
            <Pressable onPress={purchaseBundle} style={tw`rounded-2xl bg-emerald-500 px-3 py-2`}>
              <Text style={tw`text-sm text-white font-semibold text-center`}>Unlock 300 prompts (20 tokens)</Text>
            </Pressable>
          </View>
        )}

        {error && <Text style={tw`text-xs text-red-400 mt-2`}>{error}</Text>}
      </Animated.View>
    </View>

    {/* ─────────────────────────────────────────────
        MODALS (stop above footer using sheetBottomGap)
    ───────────────────────────────────────────── */}
    <Modal transparent animationType="slide" visible={showTopicSheet} onRequestClose={() => setShowTopicSheet(false)}>
      <Pressable style={tw`flex-1 bg-black/40`} onPress={() => setShowTopicSheet(false)} />
      <View
        style={[
          tw`rounded-t-3xl p-4 gap-4 border`,
          { paddingBottom: insets.bottom + 16, marginBottom: sheetBottomGap },
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={tw`flex-row items-center gap-2`}>
          <TextInput
            value={topicFilter}
            onChangeText={setTopicFilter}
            placeholder="Search topics"
            placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
            style={[
              tw`flex-1 rounded-xl border px-3 py-2 text-sm`,
              { color: theme.text, borderColor: theme.border },
            ]}
          />
          <Pressable onPress={handleSurprise} style={tw`rounded-full bg-amber-500/20 px-3 py-2`}>
            <Text style={tw`text-xs text-amber-200 font-semibold`}>Surprise me</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2`}>
          {filteredTopics.map((topic) => (
            <Pressable
              key={topic.id}
              onPress={() => handleTopicSelect(topic)}
              style={[
                tw`rounded-full px-3 py-2`,
                { backgroundColor: selectedTopic?.id === topic.id ? theme.accent : theme.pill },
              ]}
            >
              <Text style={[tw`text-xs`, { color: theme.text }]}>{topic.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {selectedTopic && (
          <View style={tw`gap-2`}>
            <Text style={[tw`text-xs font-semibold`, { color: theme.subtext }]}>Suggested prompts</Text>
            {selectedTopic.prompts.map((prompt) => (
              <Pressable
                key={prompt}
                onPress={() => applyPrompt(prompt)}
                style={[tw`rounded-2xl border px-3 py-2`, { borderColor: theme.border }]}
              >
                <Text style={[tw`text-xs`, { color: theme.subtext }]}>
                  {prompt.replace('{language}', headerLabel || targetLanguage)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Modal>

    <Modal transparent animationType="slide" visible={!!repeatSheet} onRequestClose={() => setRepeatSheet(null)}>
      <Pressable style={tw`flex-1 bg-black/40`} onPress={() => setRepeatSheet(null)} />
      <View
        style={[
          tw`rounded-t-3xl p-4 gap-3 border`,
          { paddingBottom: insets.bottom + 16, marginBottom: sheetBottomGap },
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={[tw`font-semibold`, { color: theme.text }]}>Repeat a section</Text>
          <Text style={[tw`text-xs`, { color: theme.subtext }]}>{headerLabel || targetLanguage}</Text>
        </View>

        <ScrollView style={tw`max-h-[420px]`} contentContainerStyle={tw`gap-2`}>
          {(repeatSheet?.msg?.segments || []).map((seg: any, segIdx: number) => (
            <View
              key={`${seg.en}-${segIdx}`}
              style={[
                tw`rounded-2xl border p-3`,
                { borderColor: theme.border, backgroundColor: theme.pill },
              ]}
            >
              <Pressable
                onPress={() => {
                  if (!repeatSheet) return;
                  setRepeatSheet(null);
                  startPlaybackAt(repeatSheet.messageKey, repeatSheet.msg, repeatSheet.idx, segIdx, 'en');
                }}
                style={tw`flex-row items-center justify-between`}
              >
                <Text style={[tw`text-xs flex-1 pr-3`, { color: theme.text }]}>{seg.en}</Text>
                <Text style={tw`text-xs text-emerald-300 font-semibold`}>Play EN</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!repeatSheet) return;
                  setRepeatSheet(null);
                  startPlaybackAt(repeatSheet.messageKey, repeatSheet.msg, repeatSheet.idx, segIdx, 'tr');
                }}
                style={tw`mt-2 flex-row items-center justify-between`}
              >
                <Text style={[tw`text-[11px] flex-1 pr-3`, { color: theme.subtext }]}>{seg.tr}</Text>
                <Text style={tw`text-xs text-emerald-300 font-semibold`}>Play TR</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>

        <Text style={[tw`text-[11px]`, { color: theme.muted }]}>
          Tip: Tap any line to replay from exactly there.
        </Text>
      </View>
    </Modal>

    <Modal transparent animationType="slide" visible={showVoiceSheet} onRequestClose={() => setShowVoiceSheet(false)}>
      <Pressable style={tw`flex-1 bg-black/40`} onPress={() => setShowVoiceSheet(false)} />
      <View
        style={[
          tw`rounded-t-3xl p-4 gap-4 border`,
          {
            backgroundColor: voiceSheetTheme.bg,
            borderColor: voiceSheetTheme.border,
            paddingBottom: insets.bottom + 16,
            marginBottom: sheetBottomGap,
          },
        ]}
      >
        <View style={tw`gap-2`}>
          <Text style={[tw`text-xs font-semibold`, { color: voiceSheetTheme.subtext }]}>Voice style</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2`}>
            {VOICES.map((voice) => (
              <Pressable
                key={voice.id}
                onPress={() => setVoiceSettings((prev) => ({ ...prev, voiceId: voice.id }))}
                style={[
                  tw`rounded-full px-3 py-2`,
                  { backgroundColor: voiceSettings.voiceId === voice.id ? '#2563eb' : voiceSheetTheme.pillBg },
                ]}
              >
                <Text
                  style={[
                    tw`text-xs`,
                    { color: voiceSettings.voiceId === voice.id ? '#ffffff' : voiceSheetTheme.text },
                  ]}
                >
                  {voice.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={tw`gap-2`}>
          <Text style={[tw`text-xs font-semibold`, { color: voiceSheetTheme.subtext }]}>
            Speed ({voiceSettings.rate.toFixed(2)}x)
          </Text>
          <Slider
            minimumValue={0.6}
            maximumValue={1.2}
            step={0.05}
            value={voiceSettings.rate}
            onValueChange={(value) => setVoiceSettings((prev) => ({ ...prev, rate: value }))}
            minimumTrackTintColor="#34d399"
            maximumTrackTintColor={voiceSheetTheme.sliderTrack}
          />
        </View>

        <View style={tw`gap-2`}>
          <Text style={[tw`text-xs font-semibold`, { color: voiceSheetTheme.subtext }]}>
            Pitch ({voiceSettings.pitch.toFixed(2)}x)
          </Text>
          <Slider
            minimumValue={0.8}
            maximumValue={1.2}
            step={0.05}
            value={voiceSettings.pitch}
            onValueChange={(value) => setVoiceSettings((prev) => ({ ...prev, pitch: value }))}
            minimumTrackTintColor="#38bdf8"
            maximumTrackTintColor={voiceSheetTheme.sliderTrack}
          />
          <Text style={[tw`text-[11px]`, { color: voiceSheetTheme.subtext }]}>
            Pitch may vary by device. Voice controls affect playback; regeneration coming soon.
          </Text>
        </View>

        <View style={tw`gap-2`}>
          <Text style={[tw`text-xs font-semibold`, { color: voiceSheetTheme.subtext }]}>
            Text size ({baseFontSize}px)
          </Text>
          <Slider
            minimumValue={12}
            maximumValue={22}
            step={1}
            value={baseFontSize}
            onValueChange={(value) => setFontSize(value)}
            minimumTrackTintColor="#34d399"
            maximumTrackTintColor={voiceSheetTheme.sliderTrack}
          />
        </View>

        <View style={tw`gap-2`}>
          <Text style={[tw`text-xs font-semibold`, { color: voiceSheetTheme.subtext }]}>
            Mute voices
          </Text>
          <View style={tw`flex-row flex-wrap gap-2`}>
            <Pressable
              onPress={() => setMuteEn((prev) => !prev)}
              style={[
                tw`rounded-full px-3 py-2`,
                { backgroundColor: muteEn ? '#ef4444' : voiceSheetTheme.pillBg },
              ]}
            >
              <Text style={[tw`text-xs`, { color: muteEn ? '#ffffff' : voiceSheetTheme.text }]}>
                Mute English voice
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMuteTr((prev) => !prev)}
              style={[
                tw`rounded-full px-3 py-2`,
                { backgroundColor: muteTr ? '#ef4444' : voiceSheetTheme.pillBg },
              ]}
            >
              <Text style={[tw`text-xs`, { color: muteTr ? '#ffffff' : voiceSheetTheme.text }]}>
                Mute Target voice
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={tw`flex-row items-center justify-between`}>
          <Pressable onPress={() => setVoiceSettings(DEFAULT_VOICE)}>
            <Text style={[tw`text-xs font-semibold`, { color: voiceSheetTheme.subtext }]}>Reset</Text>
          </Pressable>
          <Text style={[tw`text-xs`, { color: voiceSheetTheme.subtext }]}>Saved for {headerLabel || targetLanguage}</Text>
        </View>
      </View>
    </Modal>
  </SafeAreaView>
);

};

export default LanguageLearningScreen;
