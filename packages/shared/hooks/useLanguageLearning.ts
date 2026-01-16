import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type {
  LanguageLearningAssistant,
  LanguageLearningEntitlement,
  LanguageLearningMessage,
  PlaybackPayload,
  TargetLanguage,
} from '@mytutorapp/shared/types';
import {
  completeLanguageCourse,
  purchaseLanguageBundle,
  sendLanguagePrompt,
} from '@mytutorapp/shared/api/languageLearningApi';

export type LanguageLearningInit = {
  messages?: LanguageLearningMessage[];
  entitlement?: LanguageLearningEntitlement | null;
  targetLanguage?: TargetLanguage | null;
};

export function useLanguageLearning(
  backendUrl: string,
  token: string,
  courseId: string,
  init?: LanguageLearningInit
) {
  const [messages, setMessages] = useState<LanguageLearningMessage[]>(init?.messages || []);
  const [entitlement, setEntitlement] = useState<LanguageLearningEntitlement | null>(
    init?.entitlement ?? null
  );
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage | null>(
    init?.targetLanguage ?? null
  );
  const [playbackQueue, setPlaybackQueue] = useState<PlaybackPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundleBlocked, setBundleBlocked] = useState(false);

  const promptsUsed = entitlement?.promptsUsed ?? 0;
  const promptsLimit = entitlement?.promptsLimit ?? 5;

  const appendAssistant = useCallback(
    (assistant: LanguageLearningAssistant, playback: PlaybackPayload) => {
      const segments = assistant?.segments || [];
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: segments.map((seg) => `${seg.en} / ${seg.tr}`).join('\n'),
          segments,
          playback,
        },
      ]);
      setPlaybackQueue(playback);
    },
  );

  const sendPrompt = useCallback(
    async (prompt: string) => {
      if (promptsLimit && promptsUsed >= promptsLimit) {
        setBundleBlocked(true);
        setError('You have reached the free prompt limit.');
        return;
      }
      setLoading(true);
      setError(null);
      setBundleBlocked(false);
      setMessages((prev) => [...prev, { role: 'user', content: prompt }]);

      try {
        const res = await sendLanguagePrompt(backendUrl, token, courseId, prompt);
        if (res?.entitlement) setEntitlement(res.entitlement);
        appendAssistant(res.assistant, res.playback);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const data = err.response?.data as any;
          if (
            data?.error === 'PROMPT_BUNDLE_EXHAUSTED' ||
            data?.error === 'PROMPT_LIMIT_REACHED' ||
            data?.error === 'BUNDLE_BLOCKED'
          ) {
            setBundleBlocked(true);
            setError(data?.message || 'You have reached the free prompt limit.');
            setEntitlement((prev) =>
              prev
                ? {
                    ...prev,
                    promptsUsed: data.promptsUsed ?? prev.promptsUsed,
                    promptsLimit: data.promptsLimit ?? prev.promptsLimit,
                  }
                : prev
            );
            return;
          }
          setError(data?.message || err.message || 'Failed to send prompt.');
        } else {
          setError('Failed to send prompt.');
        }
      } finally {
        setLoading(false);
      }
    },
    [appendAssistant, backendUrl, token, courseId, promptsLimit, promptsUsed]
  );

  const purchaseBundle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await purchaseLanguageBundle(backendUrl, token, courseId);
      if (res?.entitlement) setEntitlement(res.entitlement);
      setBundleBlocked(false);
      return res.entitlement;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as any;
        setError(data?.message || err.message || 'Failed to purchase bundle.');
      } else {
        setError('Failed to purchase bundle.');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, courseId]);

  const completeCourse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await completeLanguageCourse(backendUrl, token, courseId);
      return res.quiz;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as any;
        setError(data?.message || err.message || 'Failed to complete course.');
      } else {
        setError('Failed to complete course.');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, courseId]);

  const setInitialState = useCallback((next: LanguageLearningInit) => {
    if (next.messages) setMessages(next.messages);
    if (next.entitlement) setEntitlement(next.entitlement);
    if (next.targetLanguage) setTargetLanguage(next.targetLanguage);
  }, []);

  useEffect(() => {
    if (!targetLanguage && entitlement?.targetLanguage) {
      setTargetLanguage(entitlement.targetLanguage);
    }
  }, [targetLanguage, entitlement]);

  useEffect(() => {
    if (entitlement) {
      setBundleBlocked((entitlement.promptsUsed ?? 0) >= (entitlement.promptsLimit ?? 5));
    }
  }, [entitlement]);

  const headerLabel = useMemo(() => {
    if (!targetLanguage) return null;
    const map: Record<string, string> = {
      de: 'German',
      fr: 'French',
      es: 'Spanish',
      ar: 'Arabic',
    };
    return map[targetLanguage] || targetLanguage.toUpperCase();
  }, [targetLanguage]);

  return {
    messages,
    entitlement,
    targetLanguage,
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
    setTargetLanguage,
  };
}
