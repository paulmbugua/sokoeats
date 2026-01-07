// apps/web/src/components/org/OrgShareDialog.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { createOrgAssignment, ensureOrgShareableAssignment } from '@mytutorapp/shared/api/orgApi';

type Props = {
  open: boolean;
  onClose: () => void;
  onCancel?: () => void;
  courseId: string | null | undefined;
  onResolvedCourseId?: (courseId: string) => void;
  courseTitle?: string | null;
  totalLessons?: number;
  quizCount?: number;
  minutes?: number;

  /**
   * quiz  = full quiz-style options (timer, question type, attempts)
   * homework = simplified “school assignment” flow (due date + submissions + optional pass mark)
   */
  kind?: 'quiz' | 'homework';
};

const STARTER_MAX_TIMER = 1800;
const ORG_PORTAL_PATH = '/org/portal';

const PLAN_DEFAULTS: Record<string, { pass: number; time: number }> = {
  start: { pass: 70, time: STARTER_MAX_TIMER },
  starter: { pass: 70, time: STARTER_MAX_TIMER },
  pro: { pass: 75, time: 1200 },
  enterprise: { pass: 80, time: 1500 },
};

function todayDateInput(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function endOfDayIso(localDateYmd: string | null): string | null {
  if (!localDateYmd) return null;
  const d = new Date(localDateYmd);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

const hmToSeconds = (h: number, m: number) => {
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return Math.max(0, hh * 3600 + mm * 60);
};

export default function OrgShareDialog({
  open,
  onClose,
  onCancel,
  courseId,
  courseTitle,
  totalLessons,
  quizCount,
  minutes,
  onResolvedCourseId,
  kind = 'quiz',
}: Props) {
  const nav = useNavigate();
  const { backendUrl, token, orgToken } = useShopContext();
  const { org, activeOrgId, orgTier } = useOrg();

  const assignmentKind = kind || 'quiz';
  const isHomework = assignmentKind === 'homework';

  const planKey = (
    orgTier ||
    (org as any)?.subscription?.tier ||
    (org as any)?.tier ||
    (org as any)?.plan ||
    ''
  )
    .toString()
    .toLowerCase();

  const isStarter = planKey === 'start' || planKey === 'starter';
  const planDefaults = PLAN_DEFAULTS[planKey] || PLAN_DEFAULTS.starter;

  const fixedPass = Number.isFinite(Number(org?.default_pass_mark))
    ? Number(org?.default_pass_mark)
    : planDefaults.pass;

  const baseTime = Number.isFinite(Number(org?.quiz_time_limit_s))
    ? Number(org?.quiz_time_limit_s)
    : planDefaults.time;
  const fixedTime = isStarter
    ? Math.min(baseTime || STARTER_MAX_TIMER, STARTER_MAX_TIMER)
    : baseTime;

  const lockTimer = isStarter && !isHomework; // homework: timer is hidden/ignored
  const lockPass = false;
  const lockAttempts = isStarter;

  const [titleOverride, setTitleOverride] = React.useState('');
  const [passMark, setPassMark] = React.useState<number | ''>(fixedPass);
  const [timerH, setTimerH] = React.useState<number>(0);
  const [timerM, setTimerM] = React.useState<number>(30);
  const [maxAttempts, setMaxAttempts] = React.useState<number>(isStarter ? 1 : 2);
  const [dueDate, setDueDate] = React.useState<string>(todayDateInput());
  const [inviteLink, setInviteLink] = React.useState('');
  const [createdCourseId, setCreatedCourseId] = React.useState<string | null>(null);
  const cidForLink = (createdCourseId ?? courseId ?? null) as string | null;

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [quizType, setQuizType] = React.useState<'mcq' | 'short'>('mcq');

  // Drag state
  const modalRef = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [hasDragged, setHasDragged] = React.useState(false);
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
  } | null>(null);

  const pickCourseId = (obj: any): string | null => {
    return (
      obj?.assignment?.courseId ??
      obj?.assignment?.course_id ??
      obj?.courseId ??
      obj?.course_id ??
      null
    );
  };

  React.useEffect(() => {
    if (!open) {
      setInviteLink('');
      setErr('');
      setBusy(false);
      setTitleOverride('');
      setDueDate(todayDateInput());
    }

    setPassMark(fixedPass);

    // For homework, timer is hidden & we always send 0
    if (isHomework) {
      setTimerH(0);
      setTimerM(0);
      setMaxAttempts((prev) => prev || 2);
      return;
    }

    const initH = Math.floor((fixedTime || 0) / 3600);
    const initM = Math.floor(((fixedTime || 0) % 3600) / 60);

    if (isStarter) {
      setTimerH(0);
      setTimerM(30);
      setMaxAttempts(1);
    } else {
      setTimerH(initH);
      setTimerM(initM);
      setMaxAttempts((prev) => (prev === 1 ? 2 : prev));
    }
  }, [open, fixedPass, fixedTime, isStarter, isHomework]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    setHasDragged(false);
    setPos(null);
  }, [open]);

  function clampToViewport(next: { x: number; y: number }) {
    const margin = 12;
    const w = modalRef.current?.offsetWidth || 420;
    const h = modalRef.current?.offsetHeight || 260;
    const minX = margin + w / 2;
    const maxX = window.innerWidth - margin - w / 2;
    const minY = margin + h / 2;
    const maxY = window.innerHeight - margin - h / 2;
    return {
      x: Math.max(minX, Math.min(next.x, maxX)),
      y: Math.max(minY, Math.min(next.y, maxY)),
    };
  }

  const onDragStart: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, select, textarea, [role="button"], [role="radio"]')) return;
    const centerSeed = {
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
    };
    const startPos = pos ?? centerSeed;
    setPos((p) => p ?? centerSeed);
    setHasDragged(true);
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos };
  };

  const onDragMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(
      clampToViewport({
        x: dragRef.current.startPos.x + dx,
        y: dragRef.current.startPos.y + dy,
      })
    );
  };

  const onDragEnd: React.PointerEventHandler<HTMLDivElement> = (e) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
    setDragging(false);
  };

  if (!open) return null;

  const resetLocal = () => {
    setInviteLink('');
    setErr('');
    setBusy(false);
    setTitleOverride('');
    setDueDate(todayDateInput());
    setCreatedCourseId(null);
  };

  const handleCancelIcon = () => {
    resetLocal();
    onCancel ? onCancel() : onClose();
  };

  const handleBackdropClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (dragging) return;
    if (e.target === e.currentTarget) onClose();
  };

  const canCreate = !!courseId || !!(courseTitle && courseTitle.trim());

  const handleShare = async () => {
    setErr('');
    const bearer = orgToken || token;
    if (!bearer) {
      return nav('/org/login', {
        state: {
          next: window.location.pathname + window.location.search,
          reason: 'org_share',
        },
      });
    }
    if (!activeOrgId) return setErr('You are not in an organization.');
    if (!canCreate) return setErr('Select a course or type a topic first.');

    const dueAtISO = endOfDayIso(dueDate);

    // For homework, we always send 0 timer (no countdown)
    let effectiveTimer = 0;
    if (!isHomework) {
      const pickedSeconds = hmToSeconds(timerH || 0, timerM || 0);
      const requestedTimer = pickedSeconds === 0 ? 0 : pickedSeconds;
      effectiveTimer = isStarter
        ? Math.min(requestedTimer || STARTER_MAX_TIMER, STARTER_MAX_TIMER)
        : requestedTimer;
    }

    const effectivePass = passMark === '' ? null : Number(passMark);
    const effectiveAttempts = isStarter ? 1 : Math.max(1, Math.min(10, Number(maxAttempts) || 1));

    const locked_config: any = {
      totalLessons: typeof totalLessons === 'number' ? totalLessons : undefined,
      quizSize: typeof quizCount === 'number' ? quizCount : undefined,
      minutes: typeof minutes === 'number' ? minutes : undefined,
    };

    if (isHomework) {
      locked_config.assignmentKind = 'homework';
    } else {
      locked_config.quizType = quizType;
    }

    setBusy(true);
    try {
      const assignOpts = {
        title_override: titleOverride.trim() || null,
        pass_mark: effectivePass, // may be null → optional
        timer_s: effectiveTimer,
        max_attempts: effectiveAttempts,
        due_at: dueAtISO,
        locked_config,
      };

      const payload = {
        ...(courseId ? { courseId } : { title: courseTitle!.trim() }),
        ...(typeof minutes === 'number' ? { minutes } : {}),
        ...assignOpts,
      };

      if (import.meta.env.DEV) {
        console.log('[org-share] locked_config →', assignOpts.locked_config);
      }

      const resp = await ensureOrgShareableAssignment(
        backendUrl,
        bearer,
        activeOrgId,
        payload as any
      );
      const code =
        resp.assignment?.invite_code ?? resp.assignment?.inviteCode ?? resp.assignment?.code;
      if (!code) throw new Error('Invite code missing');
      const cid = pickCourseId(resp);
      if (cid) {
        onResolvedCourseId?.(cid);
        setCreatedCourseId(cid);
      }
      setInviteLink(`${window.location.origin}/org/join/${code}`);
    } catch (e: any) {
      const status = e?.response?.status;
      const canFallback = !!courseId && (status === 404 || status === 501 || status === 400);
      if (canFallback) {
        try {
          const legacy = await createOrgAssignment(backendUrl, bearer, activeOrgId, {
            courseId,
            title_override: titleOverride.trim() || null,
            pass_mark: effectivePass,
            timer_s: effectiveTimer,
            max_attempts: effectiveAttempts,
            due_at: dueAtISO,
             locked_config,
          } as any);
          const link = `${window.location.origin}/org/join/${
            legacy.invite_code || legacy.inviteCode || legacy.code
          }`;
          setInviteLink(link);
          const cid2 = pickCourseId(legacy);
          if (cid2) {
            onResolvedCourseId?.(cid2);
            setCreatedCourseId(cid2);
          }
        } catch (e2: any) {
          setErr(e2?.response?.data?.message || e2?.message || 'Failed to create invite.');
        }
      } else {
        setErr(e?.response?.data?.message || e?.message || 'Failed to share course.');
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {}
  };

  const modalStyle: React.CSSProperties =
    hasDragged && pos
      ? { left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }
      : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  const primaryCtaLabel = isHomework ? 'Share assignment link' : 'Create invite';
  const passLabel = isHomework ? 'Pass mark (%) (optional)' : 'Pass mark (%)';
  const attemptsLabel = isHomework ? 'Maximum submissions allowed' : 'Max quiz attempts';

  return (
    <div
      className="fixed inset-0 z-50 p-2 sm:p-3 bg-black/60"
      onClick={handleBackdropClick}
      aria-label="Overlay"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          isHomework ? 'Share course as a homework assignment' : 'Share course with learners'
        }
        className="
          fixed w-[95vw] max-w-sm sm:max-w-md
          rounded-lg bg-white text-gray-900 shadow-xl
          dark:bg-[#0f1821] dark:text-white dark:ring-1 dark:ring-white/10
          text-[13px]
        "
        style={modalStyle}
      >
        {/* Header (draggable) */}
        <div
          className="
            px-3 py-2 border-b border-gray-200
            dark:border-white/10 flex items-start justify-between gap-2
            cursor-move select-none touch-none
          "
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          aria-roledescription="draggable"
        >
          <div className="min-w-0">
            <div className="text-[11px] text-gray-500 dark:text-white/70">
              {isHomework ? 'Share as homework / holiday assignment' : 'Share course with learners'}
            </div>
            <div className="font-semibold truncate text-sm">{courseTitle || 'Selected course'}</div>
            {(typeof totalLessons === 'number' || typeof quizCount === 'number') && (
              <div className="text-[10px] text-gray-500 dark:text-white/60 mt-0.5">
                {typeof totalLessons === 'number' ? `${totalLessons} lessons` : '—'}
                {typeof quizCount === 'number' ? ` • ${quizCount} questions` : ''}
              </div>
            )}
            {isHomework && (
              <div className="mt-1 text-[10px] text-gray-500 dark:text-white/60">
                Set a due date and how many times learners can submit. Great for holiday work or
                weekly homework.
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label="Cancel"
            title="Cancel"
            onClick={handleCancelIcon}
            className="
              h-7 w-7 shrink-0 rounded-md ring-1 ring-gray-300
              grid place-items-center
              bg-transparent hover:bg-gray-50
              dark:bg-transparent dark:text-white dark:ring-white/20 dark:hover:bg-white/10
            "
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path
                fillRule="evenodd"
                d="M11.414 10l4.95-4.95-1.414-1.414L10 8.586 5.05 3.636 3.636 5.05 8.586 10l-4.95 4.95 1.414 1.414L10 11.414l4.95 4.95 1.414-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5">
          {!inviteLink ? (
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="text-[12px] text-gray-600 dark:text-white/70">
                  Title (optional override)
                </span>
                <input
                  className="input !py-1.5 !px-2.5 text-[13px]"
                  placeholder={
                    isHomework
                      ? 'e.g., Form 2 Holiday Assignment — Algebra'
                      : 'e.g., Algebra Essentials — Cohort A'
                  }
                  value={titleOverride}
                  onChange={(e) => setTitleOverride(e.target.value)}
                />
                {isHomework && (
                  <span className="text-[10px] text-gray-500 dark:text-white/60">
                    Learners will see this as the assignment name in their portal.
                  </span>
                )}
              </label>

              {/* Pass mark / Timer (timer hidden for homework) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-[12px] text-gray-600 dark:text-white/70">{passLabel}</span>
                  <input
                    className={`input !py-1.5 !px-2.5 text-[13px] ${
                      lockPass ? 'bg-gray-100 cursor-not-allowed dark:bg-white/10' : ''
                    }`}
                    type="number"
                    min={0}
                    max={100}
                    value={passMark}
                    onChange={(e) =>
                      setPassMark(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    disabled={lockPass}
                    readOnly={lockPass}
                    placeholder={isHomework ? 'Optional' : undefined}
                    title={lockPass ? 'Managed by your plan; cannot be changed.' : undefined}
                  />
                  <span className="text-[10px] text-gray-500 dark:text-white/60">
                    {isHomework
                      ? 'Leave blank if you’re just collecting submissions without a strict pass mark.'
                      : 'Learners must meet or exceed this score to pass.'}
                  </span>
                </label>

                {/* Timer only for quiz-style assignments */}
                {!isHomework && (
                  <label className="grid gap-1">
                    <span className="text-[12px] text-gray-600 dark:text-white/70">
                      Timer (duration){' '}
                      {isStarter && (
                        <em className="text-[10px] text-gray-500">• Starter fixed at 30 min</em>
                      )}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <select
                        className={`input !py-1.5 !px-2.5 text-[13px] w-[100px] ${
                          lockTimer ? 'bg-gray-100 cursor-not-allowed dark:bg-white/10' : ''
                        }`}
                        value={timerH}
                        onChange={(e) =>
                          setTimerH(Math.max(0, parseInt(e.target.value || '0', 10)))
                        }
                        disabled={lockTimer}
                      >
                        {Array.from({ length: 13 }).map((_, h) => (
                          <option key={h} value={h}>
                            {h} {h === 1 ? 'hour' : 'hours'}
                          </option>
                        ))}
                      </select>

                      <select
                        className={`input !py-1.5 !px-2.5 text-[13px] w-[115px] ${
                          lockTimer ? 'bg-gray-100 cursor-not-allowed dark:bg-white/10' : ''
                        }`}
                        value={timerM}
                        onChange={(e) =>
                          setTimerM(Math.max(0, parseInt(e.target.value || '0', 10)))
                        }
                        disabled={lockTimer}
                      >
                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                          <option key={m} value={m}>
                            {m} {m === 1 ? 'minute' : 'minutes'}
                          </option>
                        ))}
                      </select>

                      <span className="text-[10px] text-gray-600 dark:text-white/60">
                        {(timerH ?? 0).toString().padStart(2, '0')}:
                        {(timerM ?? 0).toString().padStart(2, '0')}:00
                      </span>
                    </div>

                    <span className="text-[10px] text-gray-500 dark:text-white/60">
                      Set both to 0 for no time limit.
                    </span>
                  </label>
                )}
              </div>

              {/* Max attempts → submissions */}
              <label className="grid gap-1">
                <span className="text-[12px] text-gray-600 dark:text-white/70">
                  {attemptsLabel}
                  {isStarter && (
                    <em className="ml-1 text-[10px] text-gray-500">• Starter locked to 1</em>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    className={`input !py-1.5 !px-2.5 text-[13px] w-24 ${
                      lockAttempts ? 'bg-gray-100 cursor-not-allowed dark:bg-white/10' : ''
                    }`}
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) =>
                      setMaxAttempts(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                    }
                    disabled={lockAttempts}
                    readOnly={lockAttempts}
                  />
                  <span className="text-[10px] text-gray-600 dark:text-white/60">
                    {isHomework
                      ? 'Learners can submit this assignment up to this number of times (e.g., 1 for a single final submission).'
                      : 'Learners can retry the quiz up to this number of times.'}
                  </span>
                </div>
              </label>

              {/* Question type – only for quiz-style assignments */}
              {!isHomework && (
                <div className="grid gap-1">
                  <div className="text-[12px] text-gray-600 dark:text-white/70">Question type</div>

                  <div
                    role="radiogroup"
                    aria-label="Question type"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        setQuizType((t) => (t === 'mcq' ? 'short' : 'mcq'));
                      }
                    }}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={quizType === 'mcq'}
                      onClick={() => setQuizType('mcq')}
                      className={`text-left rounded-md p-2.5 transition ring-1
                      ${
                        quizType === 'mcq'
                          ? 'bg-emerald-50 ring-emerald-400 dark:bg-emerald-600/15 dark:ring-emerald-500'
                          : 'bg-white ring-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:ring-white/10 dark:hover:bg-white/10'
                      }
                    `}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`h-7 w-7 rounded-md grid place-items-center text-white
                          ${
                            quizType === 'mcq'
                              ? 'bg-emerald-600'
                              : 'bg-gray-400/70 dark:bg-white/20'
                          }
                        `}
                          aria-hidden
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7 5h14v2H7V5zm0 6h14v2H7v-2zm0 6h14v2H7v-2zM3 5h2v2H3V5zm0 6h2v2H3v-2zm0 6h2v2H3v-2z" />
                          </svg>
                        </span>
                        <div>
                          <div className="font-medium text-[13px]">Multiple choice (MCQ)</div>
                          <div className="text-[10px] text-gray-600 dark:text-white/60">
                            Learners choose one of four options.
                          </div>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={quizType === 'short'}
                      onClick={() => setQuizType('short')}
                      className={`text-left rounded-md p-2.5 transition ring-1
                      ${
                        quizType === 'short'
                          ? 'bg-emerald-50 ring-emerald-400 dark:bg-emerald-600/15 dark:ring-emerald-500'
                          : 'bg-white ring-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:ring-white/10 dark:hover:bg-white/10'
                      }
                    `}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`h-7 w-7 rounded-md grid place-items-center text-white
                          ${
                            quizType === 'short'
                              ? 'bg-emerald-600'
                              : 'bg-gray-400/70 dark:bg-white/20'
                          }
                        `}
                          aria-hidden
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 5H4c-1.1 0-2 .9-2 2v8a2 2 0 002 2h16a2 2 0 002-2V7c0-1.1-.9-2-2-2zm0 10H4V7h16v8zM6 9h2v2H6V9zm3 0h2v2H9V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zM6 12h8v2H6v-2zm9 0h3v2h-3v-2z" />
                          </svg>
                        </span>
                        <div>
                          <div className="font-medium text-[13px]">Short answers (typed)</div>
                          <div className="text-[10px] text-gray-600 dark:text-white/60">
                            Great for formulas (e.g., H₂SO₄). We’ll auto-mark.
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>

                  <span className="text-[10px] text-gray-500 dark:text-white/60">
                    You can change this later per assignment if needed.
                  </span>
                </div>
              )}

              {isStarter && (
                <div className="text-[10px] text-gray-500 dark:text-white/60">
                  <strong>Starter Plan:</strong>{' '}
                  {isHomework
                    ? 'Learners are limited to 1 submission per assignment.'
                    : 'Quiz timer is limited to 30 minutes and attempts are limited to 1.'}
                </div>
              )}

              {/* Date picker */}
              <label className="grid gap-1">
                <span className="text-[12px] text-gray-600 dark:text-white/70">Due date</span>
                <input
                  className="input !py-1.5 !px-2.5 text-[13px]"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <span className="text-[10px] text-gray-500 dark:text-white/60">
                  Learners will see this as the deadline. Submissions after this may still come in,
                  but you’ll know the official cut-off.
                </span>
              </label>

              {!!err && <div className="text-amber-600 dark:text-amber-300 text-[12px]">{err}</div>}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <div className="text-[12px] text-gray-600 dark:text-white/70">Invite link</div>
              <div className="flex items-stretch gap-1.5">
                <input
                  className="input flex-1 !py-1.5 !px-2.5 text-[13px]"
                  readOnly
                  value={inviteLink}
                />
                <button className="btn px-3 py-1.5 text-[13px]" onClick={copy}>
                  Copy
                </button>
              </div>
              <div className="text-[10px] text-gray-500 dark:text-white/60">
                Share this link with your learners (WhatsApp groups, SMS, noticeboard, etc.).
              </div>
              {cidForLink && (
                <div className="mt-2">
                  <button
                    className="btn px-3 py-1.5 text-[13px] inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500"
                    onClick={() => {
                      onClose();
                      try {
                        sessionStorage.setItem('ai:lastCourseId', cidForLink);
                        if (inviteLink) sessionStorage.setItem('ai:lastInviteLink', inviteLink);
                      } catch {}
                      nav(
                        `${ORG_PORTAL_PATH}?tab=assign&from=share&courseId=${encodeURIComponent(
                          cidForLink
                        )}`
                      );
                    }}
                  >
                    Open Assign pane
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!inviteLink && (
          <div className="px-3 py-2 border-t border-gray-200 dark:border-white/10 flex items-center justify-end">
            <button
              type="button"
              onClick={handleShare}
              disabled={busy || !canCreate}
              className="btn px-3 py-1.5 text-[13px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {busy ? 'Creating…' : primaryCtaLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
