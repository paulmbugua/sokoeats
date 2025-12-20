// packages/shared/api/attemptsApi.ts
export type AttemptStartResp = {
  attemptId: string;
  remainingMs: number;
  seed: number;
  heartbeatSec: number;
  maxBackgrounds: number;
  maxSuspicion: number;
  reused?: boolean;
};

export async function startAttemptApi(
  backendUrl: string,
  token: string,
  body: {
    assignmentId: string;
    timerSec?: number;
    heartbeatSec?: number;
    maxBackgrounds?: number;
    maxSuspicion?: number;
  }
): Promise<AttemptStartResp> {
  const r = await fetch(`${backendUrl}/api/orgs/attempts/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`startAttemptApi: ${r.status}`);
  return r.json();
}

export async function heartbeatAttemptApi(
  backendUrl: string,
  token: string,
  body: {
    attemptId: string;
    deviceId?: string;
    elapsedMs?: number;
    backgrounds?: number;
    suspicions?: number;
  }
) {
  const r = await fetch(`${backendUrl}/api/orgs/attempts/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`heartbeatAttemptApi: ${r.status}`);
  return r.json();
}

export async function submitAttemptApi(
  backendUrl: string,
  token: string,
  body: { assignmentId: string; attemptId: string; deviceId?: string; answers: any[] }
) {
  const r = await fetch(`${backendUrl}/api/orgs/attempts/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`submitAttemptApi: ${r.status}`);
  return r.json();
}
