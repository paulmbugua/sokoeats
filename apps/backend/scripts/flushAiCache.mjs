// scripts/flushAiCache.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Adjust this import to your actual helper path:
import {
  createRedis,
  ensureRedisConnected,
} from '../cronJobs/redisConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const patternsFromArgs = process.argv.slice(2).filter(Boolean);
const DEFAULT_PATTERNS = ['ai:ssml:*', 'ai:outline:*', 'ai:quiz:*'];

async function deleteByPattern(redis, pattern) {
  let cursor = '0';
  let total = 0;
  do {
    const [next, keys] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      500,
    );
    cursor = next;
    if (keys.length) {
      total += keys.length;
      await redis.del(keys);
    }
  } while (cursor !== '0');
  return total;
}

(async () => {
  const redis = createRedis();
  await ensureRedisConnected(redis);

  const patterns = patternsFromArgs.length
    ? patternsFromArgs
    : DEFAULT_PATTERNS;

  let grandTotal = 0;
  for (const p of patterns) {
    const n = await deleteByPattern(redis, p);
    console.log(`Deleted ${n} keys matching "${p}"`);
    grandTotal += n;
  }
  await redis.disconnect?.();
  console.log(`Done. Total deleted: ${grandTotal}`);
  process.exit(0);
})().catch(async (e) => {
  console.error('[flushAiCache] error:', e?.message || e);
  process.exit(1);
});
