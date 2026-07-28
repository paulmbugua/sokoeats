import cron from 'node-cron';
import { runMondayProviderSettlements } from '../services/marketplaceSettlementService.js';

cron.schedule('0 7 * * 1', async () => {
  try {
    console.log('[settlement] Running Monday provider payouts...');
    const result = await runMondayProviderSettlements({ force: true });
    console.log('[settlement] Monday provider payouts complete', result);
  } catch (error) {
    console.error('[settlement] Monday provider payouts failed:', error);
  }
}, { timezone: 'Africa/Nairobi' });
