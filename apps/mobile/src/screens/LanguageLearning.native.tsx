import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
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
import type { LanguageLearningMessage, PlaybackPayload } from '@mytutorapp/shared/types';

const extractInitMessages = (
  preview: LanguageLearningMessage[] = [],
  playback?: PlaybackPayload | null
) => {
  if (!preview.length) return [];
  const mapped = preview.map((msg) => ({ ...msg }));
  if (playback && mapped[mapped.length - 1]?.role === 'assistant') {
    mapped[mapped.length - 1].playback = playback;
  }
  return mapped;
};

const LanguageLearningScreen: React.FC = () => {
  const route = useRoute<any>();
  const { backendUrl, token } = useShopContext();

  const courseId = route.params?.courseId as string;
  const languageStart = route.params?.languageStart;

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

  return (
    <View style={tw`flex-1 bg-slate-950`}>
      <ScrollView contentContainerStyle={tw`p-4 gap-4`}>
        <View>
          <Text style={tw`text-2xl font-bold text-white`}>{title}</Text>
          <Text style={tw`text-xs text-white/70 mt-1`}>
            Prompts: {promptsUsed} / {promptsLimit}
          </Text>
        </View>

        <View style={tw`bg-slate-900 rounded-2xl p-4 gap-4`}>
          {messages.length === 0 && (
            <Text style={tw`text-sm text-white/60`}>Start chatting to build your course.</Text>
          )}
          {messages.map((msg, idx) => (
            <View
              key={`${msg.role}-${idx}`}
              style={tw`${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <View
                style={tw`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-white/10'
                }`}
              >
                {msg.role === 'assistant' && msg.segments ? (
                  <View style={tw`gap-2`}>
                    {msg.segments.map((seg, segIdx) => (
                      <View key={`${seg.en}-${segIdx}`}>
                        <Text style={tw`text-sm text-white`}>{seg.en}</Text>
                        <Text style={tw`text-xs text-white/60`}>{seg.tr}</Text>
                      </View>
                    ))}
                    {msg.playback && (
                      <Pressable onPress={() => setPlaybackQueue(msg.playback as PlaybackPayload)}>
                        <Text style={tw`text-xs text-blue-300 mt-2`}>▶ Play narration</Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <Text style={tw`text-sm text-white`}>{msg.content}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={tw`bg-slate-900 rounded-2xl p-4 gap-3`}>
          <View style={tw`flex-row items-center gap-2`}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={bundleBlocked ? 'Unlock more prompts to continue.' : 'Ask your tutor...'}
              placeholderTextColor="#94a3b8"
              editable={!bundleBlocked && !loading}
              style={tw`flex-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-white`}
            />
            <Pressable
              onPress={handleSend}
              disabled={bundleBlocked || loading || !input.trim()}
              style={tw`rounded-xl bg-blue-600 px-4 py-2 ${
                bundleBlocked || loading || !input.trim() ? 'opacity-50' : ''
              }`}
            >
              <Text style={tw`text-sm text-white font-semibold`}>Send</Text>
            </Pressable>
          </View>

          {bundleBlocked && (
            <Pressable
              onPress={purchaseBundle}
              style={tw`rounded-xl border border-blue-400 px-3 py-2`}
            >
              <Text style={tw`text-sm text-blue-300 font-semibold text-center`}>
                Unlock 300 more prompts (20 tokens)
              </Text>
            </Pressable>
          )}

          {error && <Text style={tw`text-xs text-red-400`}>{error}</Text>}
        </View>

        <View style={tw`bg-slate-900 rounded-2xl p-4`}>
          <Pressable onPress={handleComplete} style={tw`rounded-xl bg-emerald-600 px-4 py-2`}>
            <Text style={tw`text-sm text-white font-semibold text-center`}>Course Complete</Text>
          </Pressable>
        </View>

        <View style={tw`bg-slate-900 rounded-2xl p-3`}>
          <ClassroomPlayer mode="language" playback={playbackQueue || undefined} title={title} />
        </View>

        {quiz && (
          <View style={tw`bg-slate-900 rounded-2xl p-4 gap-4`}>
            <Text style={tw`text-lg font-semibold text-white`}>Final Quiz</Text>
            {quiz.questions.map((q: any, idx: number) => (
              <View key={q.id} style={tw`gap-2`}>
                <Text style={tw`text-sm font-semibold text-white`}>
                  {idx + 1}. {q.prompt}
                </Text>
                <View style={tw`gap-1`}>
                  {q.choices.map((choice: string, cIdx: number) => (
                    <Pressable
                      key={choice}
                      onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))}
                      style={tw`flex-row items-center gap-2`}
                    >
                      <View
                        style={tw`h-4 w-4 rounded-full border border-white/50 ${
                          answers[q.id] === cIdx ? 'bg-white' : 'bg-transparent'
                        }`}
                      />
                      <Text style={tw`text-sm text-white`}>{choice}</Text>
                    </Pressable>
                  ))}
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
                  style={tw`rounded-xl border border-emerald-400 px-3 py-2`}
                >
                  <Text style={tw`text-sm text-emerald-300 font-semibold text-center`}>
                    {certId ? 'Download Certificate' : 'Generate Certificate'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleTranscript}
                  disabled={downloading}
                  style={tw`rounded-xl border border-emerald-400 px-3 py-2`}
                >
                  <Text style={tw`text-sm text-emerald-300 font-semibold text-center`}>
                    {transcriptId ? 'Download Transcript' : 'Generate Transcript'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {loading && (
          <View style={tw`flex-row items-center gap-2`}> 
            <ActivityIndicator color="#38bdf8" />
            <Text style={tw`text-xs text-white/60`}>Working…</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default LanguageLearningScreen;
