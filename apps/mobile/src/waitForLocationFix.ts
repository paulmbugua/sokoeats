import type { LocationObject, LocationSubscription } from 'expo-location';

type StartWatch = (
  onPosition: (position: LocationObject) => void,
  onError: (reason: string) => void,
) => Promise<LocationSubscription>;

// Remove even a late-arriving subscription after timeout or an early callback.
export function waitForLocationFix(startWatch: StartWatch, timeoutMs = 12000): Promise<LocationObject> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: LocationSubscription | undefined;
    const finish = (position?: LocationObject, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      if (position) resolve(position);
      else reject(error);
    };
    const timer = setTimeout(() => finish(undefined, Object.assign(
      new Error(`No location fix received within ${timeoutMs / 1000} seconds.`),
      { code: 'LOCATION_FIX_TIMEOUT' },
    )), timeoutMs);

    Promise.resolve().then(() => startWatch(
      (position) => finish(position),
      (reason) => finish(undefined, Object.assign(new Error(reason), { code: 'LOCATION_PROVIDER_ERROR' })),
    )).then((watch) => {
      if (settled) watch.remove();
      else subscription = watch;
    }).catch((error) => finish(undefined, error));
  });
}
