import React, { useEffect, useMemo, useState } from 'react';

import {
  cn,
  calcTotalsPerCurrency,
  LearnerLite,
  maxCurrencyValue,
  moneyFromCents,
  pickAdmissionCode,
  pickFeeLearnerRef,
  pickLearnerId,
  pickLearnerName,
  toCents,
} from './OrgFees.shared';

import { Badge, EmptyState, Modal, MoneyStack } from './OrgFees.ui';

export function UnmatchedPaymentsModal({
  title,
  onClose,
  loading,
  rows,
  learners,
  onRefresh,
  onAttach,
}: {
  title: string;
  onClose: () => void;
  loading: boolean;
  rows: Array<any>;
  learners: LearnerLite[];
  onRefresh: () => Promise<void>;
  onAttach: (inboundId: string | number, learnerId: string) => Promise<void>;
}) {
  const [selectedInboundId, setSelectedInboundId] = useState<string | number | null>(null);
  const [selectedLearnerId, setSelectedLearnerId] = useState('');
  const [saving, setSaving] = useState(false);

  const [learnerQuery, setLearnerQuery] = useState('');

  const filteredLearners = useMemo(() => {
    const q = learnerQuery.trim().toLowerCase();
    const base = Array.isArray(learners) ? learners : [];

    if (!q) return base;

    return base.filter((l) => {
      const name = String(pickLearnerName(l) || '').toLowerCase();
      const adm = String(pickAdmissionCode(l) || '').toLowerCase();
      return name.includes(q) || adm.includes(q);
    });
  }, [learners, learnerQuery]);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">{loading ? 'Loading…' : `${rows?.length || 0} unmatched`}</div>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {(!rows || rows.length === 0) && !loading ? (
          <EmptyState title="No unmatched payments" body="You’re all caught up." />
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
            {(rows || []).map((r) => (
              <button
                key={String(r.id)}
                type="button"
                onClick={() => setSelectedInboundId(r.id)}
                className={cn(
                  'w-full border-b border-slate-200 p-3 text-left text-sm dark:border-slate-800',
                  selectedInboundId === r.id && 'bg-blue-50/60 dark:bg-blue-900/10',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {moneyFromCents(Number(r.amount_cents || 0), r.currency || 'USD')}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {r.reference ? `Ref: ${r.reference}` : 'No reference'} {r.payer_phone ? ` • ${r.payer_phone}` : ''}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                  <Badge tone="warn">Unmatched</Badge>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-3 md:items-end">
          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Attach to learner</div>

            <input
              value={learnerQuery}
              onChange={(e) => setLearnerQuery(e.target.value)}
              placeholder="Search by student name or admission no…"
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />

            <select
              value={selectedLearnerId}
              onChange={(e) => setSelectedLearnerId(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="">Select learner…</option>

              {filteredLearners.map((l) => {
                // For attach endpoint: prefer admission_code (friendly), fallback to internal ref.
                const feeRef = pickFeeLearnerRef(l);
                const adm = pickAdmissionCode(l);
                const value = adm || feeRef;
                if (!value) return null;

                return (
                  <option key={`${value}`} value={value}>
                    {pickLearnerName(l)}
                    {adm ? ` • ${adm}` : ''}
                  </option>
                );
              })}
            </select>

            <div className="mt-1 text-[11px] text-slate-500">Tip: You can type part of the name or admission number.</div>
          </div>

          <button
            type="button"
            disabled={!selectedInboundId || !selectedLearnerId || saving}
            onClick={async () => {
              if (!selectedInboundId || !selectedLearnerId) return;
              setSaving(true);
              try {
                await onAttach(selectedInboundId, selectedLearnerId);
                setSelectedInboundId(null);
                setSelectedLearnerId('');
              } finally {
                setSaving(false);
              }
            }}
            className={cn(
              'rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {saving ? 'Attaching…' : 'Attach'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ResponsiveChargeModal({
  title,
  onClose,
  learners,
  classLabels,
  selectedLearnerId,
  onCharge,
}: {
  title: string;
  onClose: () => void;
  learners: LearnerLite[];
  classLabels: string[];
  selectedLearnerId: string;
  onCharge: (payload: any, isBulk?: boolean) => Promise<void>;
}) {
  const [chargeLearnerId, setChargeLearnerId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeCurrency, setChargeCurrency] = useState('USD');
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeClassLabel, setChargeClassLabel] = useState('');
  const [chargeDueDate, setChargeDueDate] = useState('');
  const [chargeMode, setChargeMode] = useState<'single' | 'bulk'>('single');
  const [bulkLearnerIds, setBulkLearnerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedLearnerId) setChargeLearnerId(selectedLearnerId);
  }, [selectedLearnerId]);

  const amount_cents = toCents(chargeAmount);
  const bulkCandidates = chargeClassLabel
    ? learners.filter((l) => String(l.class_label || '') === chargeClassLabel)
    : learners;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600 dark:text-slate-200">
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
            <input type="radio" checked={chargeMode === 'single'} onChange={() => setChargeMode('single')} />
            Single learner
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
            <input type="radio" checked={chargeMode === 'bulk'} onChange={() => setChargeMode('bulk')} />
            Bulk by class
          </label>
        </div>

        {chargeMode === 'single' ? (
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Learner</div>
            <select
              value={chargeLearnerId}
              onChange={(e) => setChargeLearnerId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="">Select learner…</option>
              {learners.map((l) => {
                const id = pickLearnerId(l);
                if (!id) return null;
                return (
                  <option key={id} value={id}>
                    {pickLearnerName(l)} ({id})
                  </option>
                );
              })}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Class</div>
              <select
                value={chargeClassLabel}
                onChange={(e) => setChargeClassLabel(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="">All classes</option>
                {classLabels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">{bulkLearnerIds.length} selected</div>
              <button
                type="button"
                onClick={() => {
                  const allIds = bulkCandidates
                    .map((l) => pickLearnerId(l))
                    .filter((x) => x && x !== 'undefined' && x !== 'null');
                  const allSelected = bulkLearnerIds.length === allIds.length;
                  setBulkLearnerIds(allSelected ? [] : allIds);
                }}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Toggle all
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
              {bulkCandidates.map((l) => {
                const id = String(pickLearnerId(l) || '').trim();
                if (!id) return null;
                const checked = bulkLearnerIds.includes(id);

                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setBulkLearnerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                      }
                    />
                    <span className="text-sm">
                      {pickLearnerName(l)} <span className="text-xs text-slate-500">({id})</span>
                    </span>
                  </label>
                );
              })}

              {bulkCandidates.length === 0 && (
                <div className="p-2 text-sm text-slate-500">No learners found for this class.</div>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Amount</div>
            <input
              value={chargeAmount}
              onChange={(e) => setChargeAmount(e.target.value)}
              placeholder="e.g. 25.00"
              inputMode="decimal"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Currency</div>
            <select
              value={chargeCurrency}
              onChange={(e) => setChargeCurrency(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="USD">USD</option>
              <option value="KES">KES</option>
              <option value="QAR">QAR</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Description</div>
            <input
              value={chargeDesc}
              onChange={(e) => setChargeDesc(e.target.value)}
              placeholder="e.g. Tuition fee - Term 1"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Due date (optional)</div>
            <input
              value={chargeDueDate}
              onChange={(e) => setChargeDueDate(e.target.value)}
              type="date"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            Preview: <span className="font-semibold">{moneyFromCents(amount_cents, chargeCurrency)}</span>
          </div>
        </div>

        {saving && <div className="text-xs text-slate-500">Saving charge…</div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={
              (chargeMode === 'single' && !chargeLearnerId) ||
              (chargeMode === 'bulk' && bulkLearnerIds.length === 0) ||
              amount_cents <= 0 ||
              saving
            }
            onClick={async () => {
              if (amount_cents <= 0) return;
              setSaving(true);
              try {
                if (chargeMode === 'single') {
                  await onCharge(
                    {
                      learner_id: chargeLearnerId,
                      amount_cents,
                      currency: chargeCurrency,
                      description: chargeDesc || undefined,
                      class_label: chargeClassLabel || undefined,
                      due_date: chargeDueDate || undefined,
                    },
                    false,
                  );
                } else {
                  await onCharge(
                    {
                      learner_ids: bulkLearnerIds,
                      amount_cents,
                      currency: chargeCurrency,
                      description: chargeDesc || undefined,
                      class_label: chargeClassLabel || undefined,
                      due_date: chargeDueDate || undefined,
                    },
                    true,
                  );
                }
                setChargeAmount('');
                setChargeDesc('');
                setChargeDueDate('');
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className={cn(
              'w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700',
              'disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto',
            )}
          >
            {chargeMode === 'bulk' ? `Create charges (${bulkLearnerIds.length})` : 'Create charge'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ResponsivePaymentModal({
  title,
  onClose,
  learners,
  selectedLearnerId,
  onPayment,
}: {
  title: string;
  onClose: () => void;
  learners: LearnerLite[];
  selectedLearnerId: string;
  onPayment: (payload: any) => Promise<void>;
}) {
  const [payLearnerId, setPayLearnerId] = useState('');
  const [payCurrency, setPayCurrency] = useState('USD');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payReceivedAt, setPayReceivedAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedLearnerId) setPayLearnerId(selectedLearnerId);
  }, [selectedLearnerId]);

  const amount_cents = toCents(payAmount);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Learner</div>
            <select
              value={payLearnerId}
              onChange={(e) => setPayLearnerId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="">Select learner…</option>
              {learners.map((l) => {
                const id = pickLearnerId(l);
                if (!id) return null;
                return (
                  <option key={id} value={id}>
                    {pickLearnerName(l)} ({id})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Amount</div>
            <input
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="e.g. 10.00"
              inputMode="decimal"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Currency</div>
            <select
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="USD">USD</option>
              <option value="KES">KES</option>
              <option value="QAR">QAR</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Method</div>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="cash">Cash</option>
              <option value="pos">POS</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="mpesa">M-Pesa</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Reference (optional)</div>
            <input
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="Receipt number / transaction ref"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Note (optional)</div>
            <input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Any extra notes…"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Received at (optional)</div>
            <input
              value={payReceivedAt}
              onChange={(e) => setPayReceivedAt(e.target.value)}
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
            <div className="mt-1 text-[11px] text-slate-500">If blank, statement still uses created_at.</div>
          </div>

          <div className="md:col-span-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            Preview: <span className="font-semibold">{moneyFromCents(amount_cents, payCurrency)}</span>
          </div>
        </div>

        {saving && <div className="text-xs text-slate-500">Saving payment…</div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!payLearnerId || amount_cents <= 0 || saving}
            onClick={async () => {
              if (amount_cents <= 0) return;
              setSaving(true);
              try {
                await onPayment({
                  learner_id: payLearnerId,
                  amount_cents,
                  currency: payCurrency,
                  method: payMethod || undefined,
                  reference: payReference || undefined,
                  note: payNote || undefined,
                  received_at: payReceivedAt ? new Date(payReceivedAt).toISOString() : undefined,
                });
                setPayAmount('');
                setPayReference('');
                setPayNote('');
                setPayReceivedAt('');
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className={cn(
              'w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600',
              'disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto',
            )}
          >
            Record payment
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function StatementModal({
  title,
  onClose,
  learnerId,
  summary, // keep for compatibility even if unused
  charges,
  payments,
  loading,
  onOpenCharge,
  onOpenPayment,
  onPrint,
  onDownload,
}: {
  title: string;
  onClose: () => void;
  learnerId: string;
  summary: { total_charges: number; total_payments: number; balance: number };
  charges: any[];
  payments: any[];
  loading: boolean;
  onOpenCharge: () => void;
  onOpenPayment: () => void;
  onPrint: () => void;
  onDownload: () => void;
}) {
  const totals = useMemo(() => calcTotalsPerCurrency(charges || [], payments || []), [charges, payments]);
  const chargeRows = totals.map((t) => ({ currency: t.currency, value: t.charges }));
  const paymentRows = totals.map((t) => ({ currency: t.currency, value: t.payments }));
  const balanceRows = totals.map((t) => ({ currency: t.currency, value: t.balance }));

  return (
    <Modal title={title} onClose={onClose}>
      {!learnerId ? (
        <EmptyState title="Select a learner" body="Pick a learner from the Fees list first." />
      ) : loading ? (
        <div className="text-sm text-slate-500">Loading statement…</div>
      ) : (
        <div className="space-y-4">
          {/* ✅ totals per currency */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Charges</div>
              <div className="mt-2">
                <MoneyStack rows={chargeRows} />
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Payments</div>
              <div className="mt-2">
                <MoneyStack rows={paymentRows} />
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Balance</div>
              <div className="mt-2">
                <MoneyStack rows={balanceRows} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold">History</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenCharge}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Add charge
              </button>
              <button
                type="button"
                onClick={onOpenPayment}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                Add payment
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Statement PDF
              </button>
              <button
                type="button"
                onClick={onPrint}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Print
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-200">Charges</div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                {(charges || []).map((c: any) => (
                  <div key={`c-${c.id}`} className="border-b border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.description || 'Fee'}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {c.created_at ? new Date(c.created_at).toLocaleString() : '-'}
                          {c.class_label ? ` • ${c.class_label}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 font-semibold">
                        {moneyFromCents(Number(c.amount_cents || 0), c.currency)}
                      </div>
                    </div>
                  </div>
                ))}
                {(!charges || charges.length === 0) && <div className="p-3 text-sm text-slate-500">No charges yet.</div>}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-200">Payments</div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                {(payments || []).map((p: any) => (
                  <div key={`p-${p.id}`} className="border-b border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.method || 'payment'}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {p.received_at || p.created_at ? new Date(p.received_at || p.created_at).toLocaleString() : '-'}
                          {p.reference ? ` • ${p.reference}` : ''}
                        </div>
                        {p.note ? <div className="mt-1 truncate text-xs text-slate-500">{p.note}</div> : null}
                      </div>
                      <div className="shrink-0 font-semibold">
                        {moneyFromCents(Number(p.amount_cents || 0), p.currency)}
                      </div>
                    </div>
                  </div>
                ))}
                {(!payments || payments.length === 0) && <div className="p-3 text-sm text-slate-500">No payments yet.</div>}
              </div>
            </div>
          </div>

          {/* keep this for compatibility if other parts still read summary */}
          <div className="text-[11px] text-slate-500">Note: Totals above are computed per currency from line items.</div>
        </div>
      )}
    </Modal>
  );
}
