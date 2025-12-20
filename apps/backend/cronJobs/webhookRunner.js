// apps/backend/cronJobs/webhookRunner.js
import 'dotenv/config';
import { runWebhookTickSingleton as runWebhookTick } from './webhookWorkerSingleton.js';

const periodMs = Number(process.env.WEBHOOK_TICK_MS || 60_000);

async function tick() {
  try {
    await runWebhookTick();
  } catch (e) {
    console.error('[webhooks] tick error', e);
  }
}

console.log(`[webhooks] runner starting — every ${periodMs}ms`);
tick(); // run once at boot
const timer = setInterval(tick, periodMs);

process.on('SIGTERM', () => {
  console.log('[webhooks] SIGTERM — stopping runner...');
  try {
    clearInterval(timer);
  } catch {}
  process.exit(0);
});
