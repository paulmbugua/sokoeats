import { estimatePaystackTransferFee } from './financeProvider.js';
import { accounts, postJournal, postPaidPayout, reference } from './financeService.js';

export async function createPayoutBatches(client) {
  const { rows: groups } = await client.query(
    `SELECT p.beneficiary_type,p.vendor_id,p.rider_user_id,p.recipient_code,pp.method,
            MIN(p.scheduled_for) AS scheduled_for,SUM(p.amount)::int AS amount,array_agg(p.id) AS payout_ids
       FROM sokoeats_payouts p
       JOIN sokoeats_order_settlements s ON s.id=p.settlement_id
       JOIN sokoeats_payout_profiles pp
         ON (p.vendor_id IS NOT NULL AND pp.vendor_id=p.vendor_id)
         OR (p.rider_user_id IS NOT NULL AND pp.rider_user_id=p.rider_user_id)
      WHERE p.status='scheduled' AND p.scheduled_for<=NOW() AND p.batch_id IS NULL
        AND s.dispute_status<>'open' AND s.frozen_at IS NULL
      GROUP BY p.beneficiary_type,p.vendor_id,p.rider_user_id,p.recipient_code,pp.method`,
  );
  const batches = [];
  for (const group of groups) {
    const fee = estimatePaystackTransferFee(group.amount, group.method);
    const { rows } = await client.query(
      `INSERT INTO sokoeats_payout_batches
        (reference,beneficiary_type,vendor_id,rider_user_id,recipient_code,payout_method,amount,estimated_provider_fee,scheduled_for)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [reference('sko-batch'),group.beneficiary_type,group.vendor_id,group.rider_user_id,group.recipient_code,group.method,group.amount,fee,group.scheduled_for],
    );
    await client.query(`UPDATE sokoeats_payouts SET batch_id=$1,status='queued',updated_at=NOW() WHERE id=ANY($2::uuid[])`, [rows[0].id, group.payout_ids]);
    batches.push(rows[0]);
  }
  return batches;
}

export async function completePayoutBatch(client, batch, providerPayload, actorUserId = null) {
  const providerFeeMinor = Number(providerPayload?.fees || providerPayload?.fee || 0);
  const actualFee = providerFeeMinor > 0 ? Math.round(providerFeeMinor / 100) : Number(batch.estimated_provider_fee || 0);
  const { rows: payouts } = await client.query(
    `UPDATE sokoeats_payouts SET status='paid',provider_reference=COALESCE($2,provider_reference),
     provider_payload=provider_payload || $3::jsonb,paid_at=COALESCE(paid_at,NOW()),updated_at=NOW()
     WHERE batch_id=$1 AND status<>'paid' RETURNING *`,
    [batch.id, providerPayload?.transfer_code || null, providerPayload || {}],
  );
  for (const payout of payouts) await postPaidPayout(client, payout, actorUserId);
  if (actualFee > 0) {
    await postJournal(client, {
      reference: `payout-batch:${batch.reference}:fee`,
      eventType: 'PSP_TRANSFER_FEE',
      description: `Paystack transfer fee for ${batch.reference}`,
      metadata: { beneficiaryType: batch.beneficiary_type, payoutCount: payouts.length },
      createdBy: actorUserId,
      entries: [
        { account: accounts.pspExpense, direction: 'debit', amount: actualFee },
        { account: accounts.providerReceivable, direction: 'credit', amount: actualFee },
      ],
    });
  }
  return payouts;
}
