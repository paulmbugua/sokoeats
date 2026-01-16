import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ClassroomPlayer from '@/components/ClassroomPlayer.web';
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
import type {
  LanguageLearningMessage,
  PlaybackPayload,
} from '@mytutorapp/shared/types';

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

const LanguageLearningPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { state } = useLocation() as { state?: any };
  const navigate = useNavigate();
  const { backendUrl, token } = useShopContext();

  const languageStart = state?.languageStart;
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
    if (!token) {
      navigate('/login', { replace: true });
    }
  }, [token, navigate]);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="flex flex-col gap-2 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          <div className="text-sm text-slate-500 dark:text-slate-300">
            Prompts: <span className="font-semibold">{promptsUsed}</span> / {promptsLimit}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-sm text-slate-500">Start chatting to build your course.</div>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={`${msg.role}-${idx}`}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {msg.role === 'assistant' && msg.segments ? (
                      <div className="space-y-2">
                        {msg.segments.map((seg, segIdx) => (
                          <div key={`${seg.en}-${segIdx}`}>
                            <div>{seg.en}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {seg.tr}
                            </div>
                          </div>
                        ))}
                        {msg.playback && (
                          <button
                            className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-300"
                            onClick={() => setPlaybackQueue(msg.playback as PlaybackPayload)}
                          >
                            ▶ Play narration
                          </button>
                        )}
                      </div>
                    ) : (
                      <div>{msg.content}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={bundleBlocked ? 'Unlock more prompts to continue.' : 'Ask your tutor...'}
                  disabled={bundleBlocked || loading}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSend}
                  disabled={bundleBlocked || loading || !input.trim()}
                  className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Send
                </button>
              </div>

              {bundleBlocked && (
                <button
                  onClick={purchaseBundle}
                  className="w-full rounded-xl border border-blue-500 text-blue-600 dark:text-blue-300 px-3 py-2 text-sm font-semibold"
                >
                  Unlock 300 more prompts (20 tokens)
                </button>
              )}

              {error && <div className="text-xs text-red-500">{error}</div>}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <button
                onClick={handleComplete}
                className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold"
              >
                Course Complete
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
              <ClassroomPlayer mode="language" playback={playbackQueue || undefined} title={title} />
            </div>

            {quiz && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
                <h2 className="text-lg font-semibold">Final Quiz</h2>
                {quiz.questions.map((q: any, idx: number) => (
                  <div key={q.id} className="space-y-2">
                    <div className="text-sm font-semibold">
                      {idx + 1}. {q.prompt}
                    </div>
                    <div className="space-y-1">
                      {q.choices.map((choice: string, cIdx: number) => (
                        <label key={choice} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={q.id}
                            checked={answers[q.id] === cIdx}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))}
                          />
                          {choice}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleGrade}
                  disabled={!allAnswered}
                  className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Submit Quiz
                </button>

                {grade && (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Score: <span className="font-semibold">{grade.scorePct}%</span>
                  </div>
                )}

                {grade?.scorePct >= 70 && (
                  <div className="space-y-2">
                    <button
                      onClick={handleCertificate}
                      disabled={downloading}
                      className="w-full rounded-xl border border-emerald-500 text-emerald-600 px-3 py-2 text-sm font-semibold"
                    >
                      {certId ? 'Download Certificate' : 'Generate Certificate'}
                    </button>
                    <button
                      onClick={handleTranscript}
                      disabled={downloading}
                      className="w-full rounded-xl border border-emerald-500 text-emerald-600 px-3 py-2 text-sm font-semibold"
                    >
                      {transcriptId ? 'Download Transcript' : 'Generate Transcript'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default LanguageLearningPage;
