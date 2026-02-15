'use client';
import React, { useState, useRef } from 'react';
import { Link } from '@/lib/react-router-dom';

type RefundCenterProps = {
  backendUrl: string;
  token?: string | null;
  className?: string;
};

const RefundCenter: React.FC<RefundCenterProps> = ({ backendUrl, token, className }) => {
  const [isOpen, setIsOpen] = useState(false);

  // form states
  const [txId, setTxId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('accidental_purchase');
  const [details, setDetails] = useState('');
  const [resolution, setResolution] = useState<'original' | 'tokens'>('original');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [agree, setAgree] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const agreeRowRef = useRef<HTMLDivElement | null>(null);
  const [agreeErr, setAgreeErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const fmtErr = (e: unknown) =>
    typeof e === 'object' && e && (e as any).message
      ? (e as any).message
      : String(e ?? 'Request failed');

  // replace submit() with this version
  async function submit() {
    setMsg(null);
    setAgreeErr(false);

    if (!token) {
      setMsg({ kind: 'err', text: 'You must be logged in to request a refund.' });
      return;
    }
    if (!txId.trim()) {
      setMsg({ kind: 'err', text: 'Please enter your Transaction / Order ID.' });
      return;
    }
    if (!agree) {
      // make the control visible + prominent
      if (!isOpen) setIsOpen(true);
      setShowPolicy(true);
      setAgreeErr(true);
      // scroll focus to the checkbox row
      setTimeout(() => {
        agreeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // also move keyboard focus to the checkbox
        const input = agreeRowRef.current?.querySelector(
          'input[type="checkbox"]'
        ) as HTMLInputElement | null;
        input?.focus();
      }, 0);
      setMsg({ kind: 'err', text: 'Please acknowledge the refund policy.' });
      return;
    }

    setBusy(true);
    try {
      const r = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/payment/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transactionId: txId.trim(),
          amount: amount ? Number(amount) : undefined,
          reason,
          details,
          resolution,
          attachmentUrl: attachmentUrl || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);

      setMsg({
        kind: 'ok',
        text: 'Your refund request has been submitted. We’ll email you updates.',
      });
      setAmount('');
      setDetails('');
      setAttachmentUrl('');
      setAgree(false);
      setShowPolicy(false);
      setIsOpen(false); // collapse after success
    } catch (e) {
      const text =
        typeof e === 'object' && e && (e as any).message ? (e as any).message : 'Request failed';
      setMsg({ kind: 'err', text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 ${className || ''}`}
    >
      {!isOpen ? (
        <div className="flex items-center justify-end">
          <button
            onClick={() => setIsOpen(true)}
            className="rounded-xl h-10 px-4 bg-primary text-white font-semibold"
          >
            Request a refund
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Refund Request</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-sm px-3 py-1 rounded-lg bg-[#e7edf4] dark:bg-[#172534]"
            >
              Close ✕
            </button>
          </div>

          {showPolicy && (
            <div className="mt-3 rounded-xl p-3 bg-[#f6f9fc] dark:bg-[#0b1620] border border-[#cedbe8] dark:border-[#182430] text-sm leading-relaxed">
              <div className="font-semibold mb-1">Refund policy (summary)</div>
              <ul className="list-disc ml-5 space-y-1">
                <li>Requests within 7 days of purchase are usually eligible.</li>
                <li>We review course progress and usage to determine eligibility.</li>
                <li>Abuse, repeated refunds, or completed certificates may be ineligible.</li>
                <li>
                  Approved refunds are returned to the original method or as tokens (your choice).
                </li>
              </ul>
            </div>
          )}

          {msg && (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                msg.kind === 'ok'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Form */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col">
              <span className="text-sm font-medium mb-1">Transaction / Order ID</span>
              <input
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                className="h-11 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-sm font-medium mb-1">Amount (optional)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3"
                placeholder="Leave blank for full"
              />
            </label>
          </div>

          <label className="flex flex-col mt-3">
            <span className="text-sm font-medium mb-1">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-11 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3"
            >
              <option value="accidental_purchase">Accidental purchase</option>
              <option value="duplicate_charge">Duplicate charge</option>
              <option value="didnt_receive_service">Didn’t receive service</option>
              <option value="quality_issue">Quality issue</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="flex flex-col mt-3">
            <span className="text-sm font-medium mb-1">Additional details</span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="min-h-[80px] rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3 py-2"
            />
          </label>

          <label className="flex flex-col mt-3">
            <span className="text-sm font-medium mb-1">Attachment URL (optional)</span>
            <input
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              className="h-11 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3"
            />
          </label>

          <div className="mt-3 flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={agree} onChange={() => setAgree((v) => !v)} />
              <span>I agree to the refund policy</span>
            </label>
            <button
              onClick={() => setShowPolicy((v) => !v)}
              className="text-xs underline text-[#49739c]"
            >
              {showPolicy ? 'Hide policy' : 'View policy'}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              disabled={busy}
              onClick={submit}
              className="rounded-xl h-10 px-4 bg-primary text-white font-semibold disabled:opacity-60"
            >
              {busy ? 'Submitting…' : 'Submit refund request'}
            </button>
            <span className="text-xs text-[#49739c]">
              Need help?{' '}
              <Link to="/support" className="underline">
                Contact support
              </Link>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default RefundCenter;
