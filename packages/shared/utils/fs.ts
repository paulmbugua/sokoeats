import type { ExpoFileSystem, FsDirMap, Base64Encoding } from '../types';

export const ensureSlash = (p?: string) => (p ? (p.endsWith('/') ? p : p + '/') : undefined);

export function getFsDir<T extends FsDirMap>(fs: T, key: keyof FsDirMap): string | undefined {
  const v = fs[key];
  return typeof v === 'string' ? ensureSlash(v) : undefined;
}

export function resolveCacheDir<T extends FsDirMap>(fs: T): string {
  return getFsDir(fs, 'cacheDirectory') ?? getFsDir(fs, 'documentDirectory') ?? 'file:///';
}

export async function readAsBase64WithFallback(
  fs: ExpoFileSystem,
  uri: string,
  cacheDir?: string
): Promise<string> {
  const enc: Base64Encoding = 'base64';
  try {
    return await fs.readAsStringAsync(uri, { encoding: enc });
  } catch {
    const base = cacheDir ?? resolveCacheDir(fs);
    const dest = `${base}cert_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await fs.copyAsync({ from: uri, to: dest });
    try {
      return await fs.readAsStringAsync(dest, { encoding: enc });
    } finally {
      try {
        await fs.deleteAsync(dest, { idempotent: true });
      } catch {}
    }
  }
}
