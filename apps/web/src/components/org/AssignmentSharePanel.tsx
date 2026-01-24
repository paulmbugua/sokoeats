import React from 'react';
import { createOrgAssignment, getOrgUsage } from '@mytutorapp/shared/api/orgApi';
import type { CreateAssignmentBody } from '@mytutorapp/shared/api/orgApi';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

type Props = {
  courseId: string;
  /** Optional UI prefill */
  suggestedTitle?: string;
  /** Optional override seeds (fallback to org defaults server-side anyway) */
  defaultPassMark?: number | null;
  defaultTimerS?: number | null;
};

export default function AssignmentSharePanel({
  courseId,
  suggestedTitle = '',
  defaultPassMark = null,
  defaultTimerS = null,
}: Props) {
  const { backendUrl, orgToken } = useShopContext();
  const bearer = orgToken;
  const { activeOrgId, org, orgSeats, orgTier } = useOrg();

  const [titleOverride, setTitleOverride] = React.useState(suggestedTitle);
  const [passMark, setPassMark] = React.useState<number | ''>(defaultPassMark ?? '');
  const [timerS, setTimerS] = React.useState<number | ''>(defaultTimerS ?? '');
  const [dueAt, setDueAt] = React.useState<string>(''); // ISO (from <input type="datetime-local">)
  const [maxAttempts, setMaxAttempts] = React.useState<number>(1);

  const [creating, setCreating] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string>('');
  const [err, setErr] = React.useState<string>('');
  const [qrDataUrl, setQrDataUrl] = React.useState<string>('');
  const [seatsUsed, setSeatsUsed] = React.useState<number | null>(null);

  const orgName = org?.name || 'Your organization';
  const inviteBase = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/org/join`;
  }, []);

  // Seat usage hint (nice UX)
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!backendUrl || !orgToken || !activeOrgId) return;
      try {
        const { seats_used } = await getOrgUsage(backendUrl, orgToken, activeOrgId);
        if (mounted) setSeatsUsed(seats_used);
      } catch {
        // non-blocking
      }
    })();
    return () => {
      mounted = false;
    };
  }, [backendUrl, orgToken, activeOrgId]);

  async function makeQr(url: string) {
    try {
      const mod = await import('qrcode'); // optional dep
      const dataUrl = await mod.toDataURL(url, { margin: 0 });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl('');
    }
  }

  const onCreate = async () => {
    setErr('');
    setShareUrl('');
    setQrDataUrl('');
    if (!bearer || !activeOrgId) {
      setErr('You must be signed in and have an active organization.');
      return;
    }
    if (!courseId) {
      setErr('Missing courseId.');
      return;
    }
    setCreating(true);
    try {
      const body: CreateAssignmentBody & { max_attempts?: number | null } = {
        courseId,
        title_override: titleOverride || null,
        pass_mark: passMark === '' ? null : Number(passMark),
        timer_s: timerS === '' ? null : Number(timerS),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        max_attempts: maxAttempts ?? 1,
      };
      const resp = await createOrgAssignment(backendUrl, bearer, activeOrgId, body);
      const url = `${inviteBase}/${resp.invite_code}`;
      setShareUrl(url);
      await makeQr(url);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to create assignment.');
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore
    }
  };

  const mailto = React.useMemo(() => {
    if (!shareUrl) return '#';
    const subject = encodeURIComponent(`You're invited to ${orgName}`);
    const body = encodeURIComponent(
      `Hi,\n\nYou've been assigned a course by ${orgName}.\n\nOpen this link to start:\n${shareUrl}\n\nGood luck!`
    );
    return `mailto:?subject=${subject}&body=${body}`;
  }, [shareUrl, orgName]);

  const wa = React.useMemo(() => {
    if (!shareUrl) return '#';
    const text = encodeURIComponent(`You're invited to a course by ${orgName}: ${shareUrl}`);
    return `https://wa.me/?text=${text}`;
  }, [shareUrl, orgName]);

  return (
    <section className="w-full max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 text-white">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">Share with learners</h2>
          <p className="text-white/70 text-sm">
            Create an assignment → get a magic link → share via link, email, WhatsApp, or QR.
          </p>
        </div>
        <BadgeSeats tier={orgTier} used={seatsUsed} total={orgSeats} />
      </header>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label="Assignment title (optional)"
          value={titleOverride}
          onChange={setTitleOverride}
          placeholder="e.g., Safety 101 – Team A"
        />
        <NumberField
          label="Pass mark % (optional)"
          value={passMark}
          onChange={setPassMark}
          placeholder={`${org?.default_pass_mark ?? 70}`}
          min={1}
          max={100}
        />
        <NumberField
          label="Timer (seconds, optional)"
          value={timerS}
          onChange={setTimerS}
          placeholder={`${org?.quiz_time_limit_s ?? 900}`}
          min={60}
          step={30}
        />
        <DateTimeField label="Due at (optional)" value={dueAt} onChange={setDueAt} />
        <NumberField
          label="Max attempts"
          value={maxAttempts}
          onChange={(v) => setMaxAttempts(Number(v || 1))}
          min={1}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create invite'}
        </button>

        {shareUrl && (
          <>
            <button onClick={copy} className="px-4 py-2 rounded-xl bg-white/10">
              Copy link
            </button>
            <a href={mailto} className="px-4 py-2 rounded-xl bg-white/10">
              Email
            </a>
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-white/10"
            >
              WhatsApp
            </a>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-white/10"
            >
              Open link
            </a>
          </>
        )}
      </div>

      {shareUrl && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] items-center gap-4">
          <code className="block w-full text-xs sm:text-sm p-3 rounded-lg bg-black/40 overflow-x-auto">
            {shareUrl}
          </code>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Invite QR" className="h-28 w-28 rounded-lg bg-white p-2" />
          ) : (
            <div className="text-xs text-white/60">
              Install <code>qrcode</code> for QR
            </div>
          )}
        </div>
      )}

      {!!err && <p className="mt-3 text-amber-300 text-sm">{err}</p>}
    </section>
  );
}

/* ————— UI bits ————— */

function BadgeSeats({ tier, used, total }: { tier?: string; used: number | null; total?: number }) {
  const text =
    used == null
      ? `${tier ?? 'starter'}`
      : total
        ? `${tier ?? 'starter'} · ${used}/${total} seats`
        : `${tier ?? 'starter'} · ${used} seats used`;
  return <span className="px-2 py-1 rounded-full bg-white/10 text-xs">{text}</span>;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-white/70">{label}</span>
      <input
        className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 focus:outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-white/70">{label}</span>
      <input
        type="number"
        className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 focus:outline-none"
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange('');
          const n = Number(raw);
          if (Number.isNaN(n)) return;
          onChange(n);
        }}
      />
    </label>
  );
}

function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-white/70">{label}</span>
      <input
        type="datetime-local"
        className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
