import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useLanguageLearning } from '@mytutorapp/shared/hooks';
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

  const courseId = route.params?.courseId as string;
  const languageStart = route.params?.languageStart;
  const targetLanguage = languageStart?.targetLanguage || 'your target language';
  const voiceStorageKey = `ll_voice_settings_v1_${targetLanguage}`;

  const initMessages = useMemo(
    () => extractInitMessages(languageStart?.messagesPreview, languageStart?.playback),
    [languageStart]
  );

  const {
    messages,
    headerLabel,
    playbackQueue,
    promptsUsed,
    promptsLimit,
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

  const [activeMessageKey, setActiveMessageKey] = useState<string | null>(null);
  const [inlinePlayback, setInlinePlayback] = useState<PlaybackPayload | null>(null);
  const [inlineIndex, setInlineIndex] = useState(0);
  const [inlinePlaying, setInlinePlaying] = useState(false);
  const [inlineAutoPlayNext, setInlineAutoPlayNext] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const inlineItems = inlinePlayback?.items || [];
  const inlineSegments = useMemo(() => buildSegmentsFromQueue(inlineItems), [inlineItems]);
  const inlineCurrentItem = inlineItems[inlineIndex];
  const inlineSegmentIdx = inlineCurrentItem?.segmentIdx ?? 0;
  const inlineSegment = inlineSegments.find((seg) => seg.segmentIdx === inlineSegmentIdx);

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

  const loadInlineCurrent = useCallback(async () => {
    clearInlineTimer();
await unloadSound();

const item = inlineCurrentItem;
if (!item?.audioUrl) return;

const sound = new Audio.Sound();
soundRef.current = sound;

sound.setOnPlaybackStatusUpdate((status) => {
  if (!status.isLoaded) return;
  if (status.didJustFinish) {
    if (inlineIndex + 1 < inlineItems.length) {
      setInlineAutoPlayNext(true);
      setInlineIndex((idx) => idx + 1);
    } else {
      setInlinePlaying(false);
    }
  }
});

await sound.loadAsync({ uri: item.audioUrl }, { shouldPlay: false });
await sound.setRateAsync(voiceSettings.rate, true);

if (inlineAutoPlayNext || inlinePlaying) {
  const delay = item.kind === 'en' ? 300 : 220;
  timerRef.current = setTimeout(async () => {
    try {
      await sound.playAsync();
      setInlinePlaying(true);
    } catch {
      setInlinePlaying(false);
    } finally {
      setInlineAutoPlayNext(false);
    }
  }, delay);
}

  }, [
    clearInlineTimer,
    inlineAutoPlayNext,
    inlineCurrentItem,
    inlineIndex,
    inlineItems.length,
    inlinePlaying,
    unloadSound,
    voiceSettings.rate,
  ]);

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
        await soundRef.current.playAsync();
        setInlinePlaying(true);
      }
    },
    [activeMessageKey, setPlaybackQueue]
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
        setInlineIndex(idx);
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
      }
    },
    [activeMessageKey, inlineItems, inlineSegmentIdx, setPlaybackQueue]
  );

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    await sendPrompt(input.trim());
    setInput('');
  }, [input, sendPrompt]);

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

  const title = headerLabel ? `Language Learning: English → ${headerLabel}` : 'Language Learning';

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
  },
  [headerLabel, targetLanguage]
);

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


  return (
    <View style={tw`flex-1 bg-slate-950`}>
      <ScrollView contentContainerStyle={tw`p-4 pb-40 gap-4`}>
        <View style={tw`bg-slate-900/80 rounded-3xl p-5 gap-3 border border-white/5`}>
          <Text style={tw`text-2xl font-bold text-white`}>{title}</Text>
          <Text style={tw`text-xs text-white/70`}>Prompts used {promptsUsed} / {promptsLimit}</Text>
          <View style={tw`h-2 bg-white/10 rounded-full mt-1 overflow-hidden`}>
            <View style={[tw`h-2 bg-emerald-400 rounded-full`, { width: `${progressPct}%` }]} />
          </View>
        </View>

        <View style={tw`bg-slate-900/80 rounded-3xl p-4 gap-4 border border-white/5`}>
          {messages.length === 0 && (
            <Text style={tw`text-sm text-white/60`}>Start chatting to build your course.</Text>
          )}
          {messages.map((msg, idx) => {
            const messageKey = `${msg.role}-${idx}`;
            const isAssistant = msg.role === 'assistant';
            const isActive = activeMessageKey === messageKey;
            return (
              <View key={messageKey} style={tw`${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <View
                  style={tw`max-w-[86%] rounded-3xl px-4 py-3 border ${
                    msg.role === 'user' ? 'bg-blue-500 border-blue-400' : 'bg-white/10 border-white/10'
                  } ${isActive ? 'border-emerald-300' : ''}`}
                >
                  {isAssistant && msg.segments ? (
                    <View style={tw`gap-3`}>
                      {msg.segments.map((seg, segIdx) => (
                        <View key={`${seg.en}-${segIdx}`}>
                          <Text style={tw`text-sm text-white`}>{seg.en}</Text>
                          <Text style={tw`text-xs text-white/60`}>{seg.tr}</Text>
                        </View>
                      ))}
                      {msg.playback && (
                        <View style={tw`gap-2`}>
                          <View style={tw`flex-row items-center gap-2`}> 
                            <Pressable
                              onPress={() =>
                                handleInlinePlayPause(messageKey, msg.playback as PlaybackPayload)
                              }
                              style={tw`rounded-full bg-emerald-500/20 px-3 py-1`}
                            >
                              <Text style={tw`text-xs text-emerald-200 font-semibold`}>
                                {isActive && inlinePlaying ? 'Pause' : 'Play'} narration
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() =>
                                handleInlineReplay(messageKey, msg.playback as PlaybackPayload)
                              }
                              style={tw`rounded-full bg-white/10 px-3 py-1`}
                            >
                              <Text style={tw`text-xs text-white`}>Replay</Text>
                            </Pressable>
                            {isActive && (
                              <Text style={tw`text-[11px] text-white/60`}>
                                {inlineIndex + 1} / {inlineItems.length || 0}
                              </Text>
                            )}
                          </View>
                          {isActive && inlineSegment && (
                            <View style={tw`rounded-2xl bg-emerald-500/10 px-3 py-2`}>
                              <Text style={tw`text-xs text-emerald-200 font-semibold`}>
                                Now playing
                              </Text>
                              <Text style={tw`text-xs text-white`}>{inlineSegment.en}</Text>
                              <Text style={tw`text-[11px] text-white/60`}>{inlineSegment.tr}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text style={tw`text-sm text-white`}>{msg.content}</Text>
                  )}
                </View>
              </View>
            );
          })}
          {loading && (
            <View style={tw`flex-row items-center gap-2`}> 
              <ActivityIndicator color="#34d399" />
              <Text style={tw`text-xs text-white/60`}>Tutor is typing…</Text>
            </View>
          )}
        </View>

        <View style={tw`bg-slate-900/80 rounded-3xl p-4 border border-white/5`}>
          <Pressable onPress={handleComplete} style={tw`rounded-xl bg-emerald-600 px-4 py-2`}>
            <Text style={tw`text-sm text-white font-semibold text-center`}>Course Complete</Text>
          </Pressable>
        </View>

        <View style={tw`bg-slate-900/80 rounded-3xl p-3 border border-white/5`}>
          <ClassroomPlayer
            mode="language"
            playback={playbackQueue || undefined}
            title={title}
            rate={voiceSettings.rate}
            pitch={voiceSettings.pitch}
            voiceId={voiceSettings.voiceId}
          />
        </View>

        {quiz && (
          <View style={tw`bg-slate-900/80 rounded-3xl p-4 gap-4 border border-white/5`}>
            <Text style={tw`text-lg font-semibold text-white`}>Final Quiz</Text>
            {quiz.questions.map((q: any, idx: number) => (
              <View key={q.id} style={tw`gap-2`}>
                <Text style={tw`text-sm font-semibold text-white`}>
                  {idx + 1}. {q.prompt}
                </Text>
                <View style={tw`gap-2`}>
                  {q.choices.map((choice: string, cIdx: number) => {
                    const selected = answers[q.id] === cIdx;
                    return (
                      <Pressable
                        key={choice}
                        onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))}
                        style={tw`flex-row items-center gap-2 rounded-2xl border px-3 py-2 ${
                          selected ? 'border-blue-400 bg-blue-500/20' : 'border-white/10'
                        }`}
                      >
                        <View
                          style={tw`h-4 w-4 rounded-full border border-white/50 items-center justify-center ${
                            selected ? 'bg-blue-400 border-blue-300' : 'bg-transparent'
                          }`}
                        >
                          {selected && <View style={tw`h-2 w-2 rounded-full bg-white`} />}
                        </View>
                        <Text style={tw`text-sm text-white`}>{choice}</Text>
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
              <Text style={tw`text-sm text-white/70`}>Score: {grade.scorePct}%</Text>
            )}

            {grade?.scorePct >= 70 && (
              <View style={tw`gap-2`}>
                <Pressable
                  onPress={handleCertificate}
                  disabled={downloading}
                  style={tw`rounded-xl border border-emerald-400 px-3 py-2 flex-row items-center justify-center gap-2`}
                >
                  {downloading && <ActivityIndicator color="#34d399" />}
                  <Text style={tw`text-sm text-emerald-300 font-semibold text-center`}>
                    {certId ? 'Download Certificate' : 'Generate Certificate'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleTranscript}
                  disabled={downloading}
                  style={tw`rounded-xl border border-emerald-400 px-3 py-2 flex-row items-center justify-center gap-2`}
                >
                  {downloading && <ActivityIndicator color="#34d399" />}
                  <Text style={tw`text-sm text-emerald-300 font-semibold text-center`}>
                    {transcriptId ? 'Download Transcript' : 'Generate Transcript'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={tw`border-t border-white/10 bg-slate-950/95 px-4 py-3`}>
        {selectedTopic && (
          <View style={tw`mb-2`}>
            <Text style={tw`text-xs text-white/60`}>
              Suggested: <Text style={tw`text-emerald-300 font-semibold`}>{selectedTopic.label}</Text>
            </Text>
            <Pressable onPress={() => applyPrompt(selectedTopic.prompts?.[0])}>

              <Text style={tw`text-xs text-emerald-300 mt-1`}>Use prompt</Text>
            </Pressable>
          </View>
        )}
        <View style={tw`flex-row items-center gap-2 mb-3`}>
          <Pressable
            onPress={() => {
              setShowTopicSheet(true);
              setShowVoiceSheet(false);
            }}
            style={tw`rounded-full border border-white/10 px-3 py-1`}
          >
            <Text style={tw`text-xs text-white`}>✨ Topics</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShowVoiceSheet(true);
              setShowTopicSheet(false);
            }}
            style={tw`rounded-full border border-white/10 px-3 py-1`}
          >
            <Text style={tw`text-xs text-white`}>🎙 Voice</Text>
          </Pressable>
        </View>
        <View style={tw`flex-row items-center gap-2`}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={bundleBlocked ? 'Unlock more prompts to continue.' : 'Ask your tutor...'}
            placeholderTextColor="#94a3b8"
            editable={!bundleBlocked && !loading}
            style={tw`flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm text-white bg-slate-900/80`}
          />
          <Pressable
            onPress={handleSend}
            disabled={bundleBlocked || loading || !input.trim()}
            style={tw`rounded-2xl bg-emerald-500 px-4 py-3 ${
              bundleBlocked || loading || !input.trim() ? 'opacity-50' : ''
            }`}
          >
            <Text style={tw`text-sm text-white font-semibold`}>Send</Text>
          </Pressable>
        </View>

        {bundleBlocked && (
          <View style={tw`mt-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 gap-2`}>
            <View style={tw`flex-row items-center gap-2`}>
              <Text style={tw`text-base`}>🔒</Text>
              <Text style={tw`text-sm text-emerald-200 font-semibold`}>You’ve used your 5 free prompts.</Text>
            </View>
            <Pressable onPress={purchaseBundle} style={tw`rounded-2xl bg-emerald-500 px-3 py-2`}>
              <Text style={tw`text-sm text-white font-semibold text-center`}>
                Unlock 300 prompts (20 tokens)
              </Text>
            </Pressable>
          </View>
        )}

        {error && <Text style={tw`text-xs text-red-400 mt-2`}>{error}</Text>}
      </View>

      <Modal transparent animationType="slide" visible={showTopicSheet} onRequestClose={() => setShowTopicSheet(false)}>
        <Pressable style={tw`flex-1 bg-black/40`} onPress={() => setShowTopicSheet(false)} />
        <View style={tw`bg-slate-900 rounded-t-3xl p-4 gap-4 border border-white/10`}>
          <View style={tw`flex-row items-center gap-2`}>
            <TextInput
              value={topicFilter}
              onChangeText={setTopicFilter}
              placeholder="Search topics"
              placeholderTextColor="#94a3b8"
              style={tw`flex-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-white`}
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
                style={tw`rounded-full px-3 py-2 ${
                  selectedTopic?.id === topic.id ? 'bg-emerald-500' : 'bg-white/10'
                }`}
              >
                <Text style={tw`text-xs text-white`}>{topic.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {selectedTopic && (
            <View style={tw`gap-2`}>
              <Text style={tw`text-xs text-white/60 font-semibold`}>Suggested prompts</Text>
              {selectedTopic.prompts.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => applyPrompt(prompt)}
                  style={tw`rounded-2xl border border-white/10 px-3 py-2`}
                >
                  <Text style={tw`text-xs text-white/80`}>
                    {prompt.replace('{language}', headerLabel || targetLanguage)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={showVoiceSheet} onRequestClose={() => setShowVoiceSheet(false)}>
        <Pressable style={tw`flex-1 bg-black/40`} onPress={() => setShowVoiceSheet(false)} />
        <View style={tw`bg-slate-900 rounded-t-3xl p-4 gap-4 border border-white/10`}>
          <View style={tw`gap-2`}>
            <Text style={tw`text-xs text-white/60 font-semibold`}>Voice style</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2`}>
              {VOICES.map((voice) => (
                <Pressable
                  key={voice.id}
                  onPress={() => setVoiceSettings((prev) => ({ ...prev, voiceId: voice.id }))}
                  style={tw`rounded-full px-3 py-2 ${
                    voiceSettings.voiceId === voice.id ? 'bg-blue-500' : 'bg-white/10'
                  }`}
                >
                  <Text style={tw`text-xs text-white`}>{voice.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={tw`gap-2`}>
            <Text style={tw`text-xs text-white/60 font-semibold`}>Speed ({voiceSettings.rate.toFixed(2)}x)</Text>
            <Slider
              minimumValue={0.6}
              maximumValue={1.2}
              step={0.05}
              value={voiceSettings.rate}
              onValueChange={(value) => setVoiceSettings((prev) => ({ ...prev, rate: value }))}
              minimumTrackTintColor="#34d399"
              maximumTrackTintColor="#1f2937"
            />
          </View>
          <View style={tw`gap-2`}>
            <Text style={tw`text-xs text-white/60 font-semibold`}>Pitch ({voiceSettings.pitch.toFixed(2)}x)</Text>
            <Slider
              minimumValue={0.8}
              maximumValue={1.2}
              step={0.05}
              value={voiceSettings.pitch}
              onValueChange={(value) => setVoiceSettings((prev) => ({ ...prev, pitch: value }))}
              minimumTrackTintColor="#38bdf8"
              maximumTrackTintColor="#1f2937"
            />
            <Text style={tw`text-[11px] text-white/50`}>
              Pitch may vary by device. Voice controls affect playback; regeneration coming soon.
            </Text>
          </View>
          <View style={tw`flex-row items-center justify-between`}>
            <Pressable onPress={() => setVoiceSettings(DEFAULT_VOICE)}>
              <Text style={tw`text-xs text-white/60 font-semibold`}>Reset</Text>
            </Pressable>
            <Text style={tw`text-xs text-white/40`}>Saved for {headerLabel || targetLanguage}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default LanguageLearningScreen;
