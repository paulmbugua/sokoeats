export async function registerPushTokenApi(
  backendUrl: string,
  authToken: string,
  expoPushToken: string,
  platform: string,
  deviceId?: string | null,
) {
  const res = await fetch(`${backendUrl}/api/push/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ expoPushToken, platform, deviceId: deviceId ?? null }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`registerPushToken failed: ${res.status} ${txt}`);
  }

  return res.json();
}
