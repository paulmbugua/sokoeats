// packages/shared/hooks/useAttemptIntegrity.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  startAttemptApi,
  heartbeatAttemptApi,
  submitAttemptApi,
  AttemptStartResp,
} from '../api/attemptsApi';

type StartOpts = {
  assignmentId: string;
  timerSec?: number;
  heartbeatSec?: number;
  maxBackgrounds?: number;
  maxSuspicion?: number;
};

export function useAttemptIntegrity(backendUrl: string, token?: string) {
  const [attempt, setAttempt] = useState<AttemptStartResp | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [quizActive, setQuizActive] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [backgrounds, setBackgrounds] = useState(0);
  const [suspicions, setSuspicions] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const heartbeatRef = useRef<any>(null);
  const startTsRef = useRef<number>(0);
  const appStateRef = useRef(AppState.currentState);

  // ✅ keep latest values for heartbeat without re-creating startHeartbeat every tick
  const attemptIdRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string>('');
  const elapsedMsRef = useRef(0);
  const backgroundsRef = useRef(0);
  const suspicionsRef = useRef(0);
  const tokenRef = useRef<string | undefined>(token);
  const backendUrlRef = useRef<string>(backendUrl);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);
  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);
  useEffect(() => {
    elapsedMsRef.current = elapsedMs;
  }, [elapsedMs]);
  useEffect(() => {
    backgroundsRef.current = backgrounds;
  }, [backgrounds]);
  useEffect(() => {
    suspicionsRef.current = suspicions;
  }, [suspicions]);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  useEffect(() => {
    backendUrlRef.current = backendUrl;
  }, [backendUrl]);

  // ✅ IMPORTANT: idempotent setter (prevents render-loops if parent calls this often)
  const bindDeviceId = useCallback((id: string) => {
    const next = (id || '').trim();
    setDeviceId((prev) => (prev === next ? prev : next));
  }, []);

  const start = useCallback(
    async (opts: StartOpts) => {
      if (!token) {
        setError('No token');
        return null;
      }
      setError(null);

      const res = await startAttemptApi(backendUrl, token, opts);

      setAttempt(res);
      setAttemptId(res.attemptId);
      setQuizActive(true);

      startTsRef.current = Date.now();
      setElapsedMs(0);
      setBackgrounds(0);
      setSuspicions(0);

      return res;
    },
    [backendUrl, token]
  );

  // elapsed ticker
  useEffect(() => {
    if (!quizActive) return;
    const id = setInterval(() => {
      const base = startTsRef.current || Date.now();
      setElapsedMs(Date.now() - base);
    }, 1000);
    return () => clearInterval(id);
  }, [quizActive]);

  // app background counter
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (!quizActive) return;
      if ((next === 'background' || next === 'inactive') && prev === 'active') {
        setBackgrounds((n) => n + 1);
      }
    });
    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, [quizActive]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // ✅ startHeartbeat no longer depends on elapsedMs/backgrounds/suspicions (no interval thrash)
  const startHeartbeat = useCallback(() => {
    if (!quizActive || !attemptId) return;
    if (!token) return;

    stopHeartbeat();

    const every = Math.max(5, Number(attempt?.heartbeatSec || 15)) * 1000;

    heartbeatRef.current = setInterval(() => {
      const t = tokenRef.current;
      const b = backendUrlRef.current;
      const aId = attemptIdRef.current;

      if (!t || !b || !aId) return;

      heartbeatAttemptApi(b, t, {
        attemptId: aId,
        deviceId: deviceIdRef.current,
        elapsedMs: elapsedMsRef.current,
        backgrounds: backgroundsRef.current,
        suspicions: suspicionsRef.current,
      }).catch(() => {});
    }, every);
  }, [quizActive, attemptId, token, attempt?.heartbeatSec, stopHeartbeat]);

  useEffect(() => {
    if (quizActive && attemptId) startHeartbeat();
    return () => stopHeartbeat();
  }, [quizActive, attemptId, startHeartbeat, stopHeartbeat]);

  const bumpSuspicion = useCallback((delta = 1) => setSuspicions((s) => s + delta), []);
  const markNotActive = useCallback(() => setQuizActive(false), []);
  const markActive = useCallback(() => {
    if (!startTsRef.current) {
      startTsRef.current = Date.now();
      setElapsedMs(0);
    }
    setQuizActive(true);
  }, []);

  const submit = useCallback(
    async (assignmentId: string, answers: any[]) => {
      if (!token || !attemptId) {
        setError('No attempt or token');
        return null;
      }
      try {
        const resp = await submitAttemptApi(backendUrl, token, {
          assignmentId,
          attemptId,
          deviceId,
          answers,
        });
        markNotActive();
        stopHeartbeat();
        return resp;
      } catch (e: any) {
        setError(e?.message || 'submit failed');
        throw e;
      }
    },
    [backendUrl, token, attemptId, deviceId, stopHeartbeat, markNotActive]
  );

  return {
    attempt,
    attemptId,
    deviceId,
    bindDeviceId,
    quizActive,
    markActive,
    markNotActive,
    elapsedMs,
    backgrounds,
    suspicions,
    start,
    submit,
    bumpSuspicion,
    error,
  };
}
