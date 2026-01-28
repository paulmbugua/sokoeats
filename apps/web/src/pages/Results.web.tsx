// ResultsPage.tsx (web)
// Theme-aware, modern "My Documents" library + course-specific results/documents view.
// Drop-in replacement preserving your existing logic + debug logs.

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  Link,
  useNavigate,
  useLocation,
  useSearchParams,
} from 'react-router-dom';

import { useShopContext } from '@mytutorapp/shared/context';
import PaymentWidget from '../components/PaymentWidget.web';
import ThemeToggle from '../components/ThemeToggle.web';
import {
  useAICertificates,
  useAiCourseEntitlements,
} from '@mytutorapp/shared/hooks';
import {
  downloadCertificateFile,
  downloadTranscriptFile,
} from '@mytutorapp/shared/api';
import SeoHead from '../components/seo/SeoHead';

// Icons (same style as Profile.web.tsx)
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowLeft,
  faArrowRight,
  faCertificate,
  faFileLines,
  faFilePdf,
  faDownload,
  faRotateRight,
  faWandMagicSparkles,
  faTriangleExclamation,
  faMagnifyingGlass,
  faFolderOpen,
} from '@fortawesome/free-solid-svg-icons';

type GradeLike = {
  scorePct: number;
  passMark: number;
  passed: boolean;
};

function looksExtendedMeta(meta: any): boolean {
  const s = (v: any) => (typeof v === 'string' ? v.toLowerCase() : '');
  const title = s(meta?.title || meta?.course_title || meta?.name);
  const code = s(meta?.code || meta?.sku_code || meta?.tier_code);
  const tier = s(meta?.tier || meta?.plan || meta?.level || meta?.kind);
  const tags = Array.isArray(meta?.tags) ? meta.tags.map(s) : [];
  return (
    tier.includes('extended') ||
    title.includes('extended') ||
    title.includes('transcript') ||
    /\b(ext|extended|xtra|plus)\b/.test(code) ||
    tags.includes('extended') ||
    tags.includes('transcript')
  );
}

/* -------------------------- DEBUG HELPERS -------------------------- */
const DEBUG_RESULTS = true;

function mkRid(prefix = 'results') {
  return `${prefix}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function safeJson(x: any) {
  try {
    return JSON.parse(JSON.stringify(x));
  } catch {
    return String(x);
  }
}

function logR(tag: string, payload?: any) {
  if (!DEBUG_RESULTS) return;
  // eslint-disable-next-line no-console
  console.log(tag, payload ?? '');
}
function warnR(tag: string, payload?: any) {
  if (!DEBUG_RESULTS) return;
  // eslint-disable-next-line no-console
  console.warn(tag, payload ?? '');
}
function errR(tag: string, payload?: any) {
  if (!DEBUG_RESULTS) return;
  // eslint-disable-next-line no-console
  console.error(tag, payload ?? '');
}

function looksExtendedSku(sku: any): boolean {
  const s = (v: any) => (typeof v === 'string' ? v.toLowerCase() : '');
  const title = s(sku?.title);
  const code = s(sku?.code);
  const tier = s(sku?.tier || sku?.plan || sku?.level || sku?.kind);
  const tags = Array.isArray(sku?.tags) ? sku.tags.map(s) : [];
  return (
    tier.includes('extended') ||
    title.includes('extended') ||
    title.includes('transcript') ||
    /\b(ext|extended|xtra|plus)\b/.test(code) ||
    tags.includes('extended') ||
    tags.includes('transcript')
  );
}

/* -------------------------- UI HELPERS -------------------------- */

const cn = (...xs: Array<string | false | null | undefined>) =>
  xs.filter(Boolean).join(' ');

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <div
    className={cn(
      'rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821]',
      className
    )}
  >
    {children}
  </div>
);

const Chip: React.FC<{
  children: React.ReactNode;
  tone?: 'neutral' | 'info' | 'success' | 'warn';
  className?: string;
}> = ({ children, tone = 'neutral', className }) => {
  const toneCls =
    tone === 'success'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 border-emerald-200/60 dark:border-emerald-500/20'
      : tone === 'info'
      ? 'bg-blue-500/10 text-blue-700 dark:text-blue-200 border-blue-200/60 dark:border-blue-500/20'
      : tone === 'warn'
      ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-200/60 dark:border-amber-500/20'
      : 'bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white/80 border-[#cedbe8] dark:border-white/10';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border',
        toneCls,
        className
      )}
    >
      {children}
    </span>
  );
};

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: 'primary' | 'soft' | 'ghost' | 'danger';
  className?: string;
  type?: 'button' | 'submit';
}> = ({
  children,
  onClick,
  disabled,
  title,
  variant = 'soft',
  className,
  type = 'button',
}) => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl h-9 px-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed';
  const styles =
    variant === 'primary'
      ? 'bg-[#3d99f5] text-white hover:brightness-105'
      : variant === 'ghost'
      ? 'bg-transparent hover:bg-[#e7edf4] dark:hover:bg-[#172534] border border-[#cedbe8] dark:border-darkCard'
      : variant === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-500'
      : 'bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white hover:brightness-105';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(base, styles, className)}
    >
      {children}
    </button>
  );
};

const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={cn(
      'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70',
      className
    )}
    aria-hidden
  />
);

function WatermarkPreview({
  title,
  pdfUrl,
  certId,
  backendUrl,
}: {
  title: string;
  pdfUrl?: string | null;
  certId?: string | null;
  backendUrl?: string;
}) {
  const previewUrl = useMemo(() => {
    // Prefer brand-aware OG image for certificate preview
    if (title === 'Certificate' && certId && backendUrl) {
      return `${backendUrl.replace(/\/+$/, '')}/api/certificates/${certId}/og`;
    }

    // Fallback to first-page JPG from raw PDF URL (Cloudinary)
    if (!pdfUrl) return null;
    try {
      const u = new URL(pdfUrl);
      const [left, right] = u.pathname.split('/upload/');
      if (!right) return null;
      return `${u.origin}${left}/upload/pg_1/${right.replace(/\.pdf$/i, '.jpg')}`;
    } catch {
      return null;
    }
  }, [title, certId, backendUrl, pdfUrl]);

  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-bold text-[15px]">{title}</div>
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
              Preview (watermarked)
            </div>
          </div>
          <Chip tone="neutral">Preview</Chip>
        </div>
      </div>

      <div className="mt-3 relative">
        <div className="aspect-[4/3] bg-[#f6f9fc] dark:bg-[#0b1620] flex items-center justify-center">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`${title} preview`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-sm text-[#49739c] dark:text-darkTextSecondary">
              No preview available
            </div>
          )}
        </div>

        {/* Watermark overlay */}
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          style={{ mixBlendMode: 'multiply' }}
        >
          <div className="rotate-12 text-4xl sm:text-6xl md:text-7xl font-black tracking-widest text-[#0d141c]/10 dark:text-white/15">
            PREVIEW
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 text-xs text-[#49739c] dark:text-darkTextSecondary">
        Downloads are clean (no watermark) after certificate payment.
      </div>
    </Card>
  );
}

/* ---------------------------------- Page ---------------------------------- */

const ResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { backendUrl, token } = useShopContext();

  // Correlation id for this page instance
  const ridRef = useRef<string>(mkRid());
  const rid = ridRef.current;

  // ✅ state OR query params
  const state = (location.state as any) || {};
  const courseId = (state.courseId ||
    searchParams.get('courseId') ||
    undefined) as string | undefined;
  const courseTitle = (state.courseTitle ||
    searchParams.get('courseTitle') ||
    undefined) as string | undefined;
  const grade = (state.grade || undefined) as GradeLike | undefined;

  const [paymentOpen, setPaymentOpen] = useState(false);

  const [cert, setCert] = useState<{
    id: string;
    url: string;
    download_url?: string;
  } | null>(null);

  const [trans, setTrans] = useState<{
    id: string;
    url: string;
    download_url?: string;
  } | null>(null);

  // ✅ New: all docs
  const [allCerts, setAllCerts] = useState<any[]>([]);
  const [allTrans, setAllTrans] = useState<any[]>([]);

  // ✅ Debugging fetch status
  const [docsLoading, setDocsLoading] = useState(false);
  const [certErr, setCertErr] = useState<any>(null);
  const [transErr, setTransErr] = useState<any>(null);

  const [paymentOk, setPaymentOk] = useState(false);

  // ✅ UX: lightweight toast
  const [toast, setToast] = useState<null | { tone: 'info' | 'success' | 'warn' | 'error'; msg: string }>(null);
  const toastTimer = useRef<any>(null);

  const pushToast = useCallback((tone: 'info' | 'success' | 'warn' | 'error', msg: string) => {
    setToast({ tone, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Mount log
  useEffect(() => {
    logR('[Results][mount]', {
      rid,
      backendUrl,
      hasToken: Boolean(token),
      tokenLen: token ? token.length : 0,
      courseId,
      courseTitle,
      grade: grade
        ? { scorePct: grade.scorePct, passMark: grade.passMark, passed: grade.passed }
        : null,
      locationPath: location.pathname,
      locationSearch: location.search,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useCallback(
    async function <T = any>(path: string, init?: RequestInit): Promise<T> {
      const url = `${backendUrl}${path}`;
      const method = init?.method || 'GET';
      const started = performance.now();

      logR('[Results][api] ->', {
        rid,
        method,
        path,
        hasToken: Boolean(token),
      });

      const r = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const ms = Math.round((performance.now() - started) * 100) / 100;

      if (r.status === 204) {
        logR('[Results][api] <-', { rid, path, status: r.status, ok: r.ok, ms, note: '204 no content' });
        return null as any;
      }

      const raw = await r.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { __parseError: true, raw: raw?.slice(0, 500) };
      }

      logR('[Results][api] <-', {
        rid,
        path,
        status: r.status,
        ok: r.ok,
        ms,
        shape: Array.isArray(data) ? `array(len=${data.length})` : typeof data,
        sample: Array.isArray(data) ? data.slice(0, 1) : data,
      });

      if (!r.ok) {
        const e: any = new Error((data as any)?.error || `Request failed: ${r.status}`);
        e.status = r.status;
        e.data = data;
        throw e;
      }
      return data as T;
    },
    [backendUrl, token, rid]
  );

  const genOnceRef = useRef<Record<string, boolean>>({});
  const [genTransState, setGenTransState] = useState<{
    courseId?: string;
    loading: boolean;
    error?: any;
    last?: any;
  }>({ loading: false });

  const transByCourse = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of allTrans || []) m.set(String(t.course_id), t);
    return m;
  }, [allTrans]);

  const generateTranscriptForCourse = useCallback(
    async (cid: string, source: string) => {
      if (!token) {
        warnR('[Results][genTrans] no token', { rid, cid, source });
        pushToast('warn', 'Please sign in again to generate your transcript.');
        return;
      }
      if (!cid) {
        warnR('[Results][genTrans] missing courseId', { rid, cid, source });
        pushToast('warn', 'Missing course id. Please open the course results page.');
        return;
      }

      const op = mkRid('genTrans');
      setGenTransState({ courseId: cid, loading: true, error: null, last: null });

      logR('[Results][genTrans] enter', { rid, op, cid, source });
      pushToast('info', 'Generating transcript…');

      try {
        const resp = await api(`/api/transcripts/generate`, {
          method: 'POST',
          body: JSON.stringify({ courseId: cid }),
        });

        logR('[Results][genTrans] ok', { rid, op, resp: safeJson(resp) });
        pushToast('success', 'Transcript generated!');

        // refresh list
        const ts = await api('/api/transcripts/me');
        const arr = Array.isArray(ts) ? ts : [];
        setAllTrans(arr);

        // if the response includes the new transcript, set it for course view
        if (resp?.id && String(cid) === String(courseId)) {
          setTrans({
            id: resp.id,
            url: resp.url,
            download_url:
              resp.download_url ||
              `${backendUrl.replace(/\/+$/, '')}/api/transcripts/${resp.id}/download`,
          });
        }

        setGenTransState({ courseId: cid, loading: false, error: null, last: resp });
      } catch (e: any) {
        const payload = { status: e?.status, msg: e?.message, data: safeJson(e?.data) };
        errR('[Results][genTrans] fail', { rid, op, cid, source, ...payload });

        // ✅ EXTENDED gating
        if (e?.status === 402 && e?.data?.error === 'EXTENDED_REQUIRED') {
          pushToast('warn', e?.data?.message || 'Transcript requires Extended certificate.');
        } else {
          pushToast('error', 'Failed to generate transcript. Try again in a moment.');
        }

        setGenTransState({ courseId: cid, loading: false, error: payload, last: null });
      }
    },
    [api, rid, token, backendUrl, courseId, pushToast]
  );

  // ✅ Fetch all certificates + transcripts (always available on this page)
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!token) {
        warnR('[Results][docs] skip: no token', { rid });
        return;
      }

      setDocsLoading(true);
      setCertErr(null);
      setTransErr(null);

      logR('[Results][docs] fetch start', { rid });

      try {
        const cs = await api('/api/certificates/me');
        const arr = Array.isArray(cs) ? cs : [];
        if (!abort) setAllCerts(arr);
        logR('[Results][docs] certs ok', {
          rid,
          count: arr.length,
          ids: arr.slice(0, 5).map((x: any) => x?.id),
          sample: arr.slice(0, 1),
        });
      } catch (e: any) {
        if (!abort) setAllCerts([]);
        if (!abort) setCertErr({ status: e?.status, msg: e?.message, data: e?.data });
        warnR('[Results][docs] certs fail', { rid, status: e?.status, msg: e?.message, data: safeJson(e?.data) });
      }

      try {
        const ts = await api('/api/transcripts/me');
        const arr = Array.isArray(ts) ? ts : [];
        if (!abort) setAllTrans(arr);
        logR('[Results][docs] transcripts ok', {
          rid,
          count: arr.length,
          ids: arr.slice(0, 5).map((x: any) => x?.id),
          sample: arr.slice(0, 1),
        });
      } catch (e: any) {
        if (!abort) setAllTrans([]);
        if (!abort) setTransErr({ status: e?.status, msg: e?.message, data: e?.data });
        warnR('[Results][docs] transcripts fail', { rid, status: e?.status, msg: e?.message, data: safeJson(e?.data) });
      }

      if (!abort) {
        setDocsLoading(false);
        logR('[Results][docs] fetch done', { rid });
      }
    })();

    return () => {
      abort = true;
      logR('[Results][docs] abort', { rid });
    };
  }, [api, token, rid]);

  // ✅ When courseId changes, pick matching cert/trans from the "all docs" lists
  useEffect(() => {
    logR('[Results][pick] start', {
      rid,
      courseId,
      allCertsLen: allCerts.length,
      allTransLen: allTrans.length,
    });

    if (!courseId) {
      setCert(null);
      setTrans(null);
      logR('[Results][pick] no courseId -> reset', { rid });
      return;
    }

    const c = (allCerts || []).find((x) => String(x.course_id) === String(courseId));
    const t = (allTrans || []).find((x) => String(x.course_id) === String(courseId));

    // compute download_url client-side for convenience (backend /me may not include it)
    const certDl = c?.id
      ? `${backendUrl.replace(/\/+$/, '')}/api/certificates/${c.id}/download`
      : undefined;
    const transDl = t?.id
      ? `${backendUrl.replace(/\/+$/, '')}/api/transcripts/${t.id}/download`
      : undefined;

    const nextCert = c ? { id: c.id, url: c.url, download_url: c.download_url || certDl } : null;
    const nextTrans = t ? { id: t.id, url: t.url, download_url: t.download_url || transDl } : null;

    setCert(nextCert);
    setTrans(nextTrans);

    logR('[Results][pick] chosen', {
      rid,
      courseId,
      certFound: Boolean(nextCert?.id),
      transFound: Boolean(nextTrans?.id),
      certId: nextCert?.id,
      transId: nextTrans?.id,
      certUrl: nextCert?.url ? 'yes' : 'no',
      transUrl: nextTrans?.url ? 'yes' : 'no',
    });
  }, [courseId, allCerts, allTrans, backendUrl, rid]);

  // ✅ Auto attempt transcript generation only when cert looks extended
  useEffect(() => {
    if (!courseId) return;
    if (trans?.id) return; // already have transcript
    if (!cert?.id) {
      logR('[Results][autoGen] skip: no cert selected', { rid, courseId });
      return;
    }

    const likelyExtended = looksExtendedMeta(cert);
    logR('[Results][autoGen] check', {
      rid,
      courseId,
      certId: cert.id,
      likelyExtended,
    });

    if (!likelyExtended) return;

    if (genOnceRef.current[String(courseId)]) {
      logR('[Results][autoGen] already attempted', { rid, courseId });
      return;
    }

    genOnceRef.current[String(courseId)] = true;
    generateTranscriptForCourse(String(courseId), 'auto_course_view');
  }, [courseId, cert?.id, trans?.id, rid, generateTranscriptForCourse, cert]);

  // ✅ If user already has docs, treat as passed so UI doesn’t lock when opened via library
  const passed = Boolean(grade?.passed || cert?.id || trans?.id);

  useEffect(() => {
    logR('[Results][passed]', {
      rid,
      passed,
      gradePassed: grade?.passed,
      certId: cert?.id,
      transId: trans?.id,
    });
  }, [rid, passed, grade?.passed, cert?.id, trans?.id]);

  const checkPaymentStatus = useCallback(async () => {
    logR('[Results][payment] check start', { rid, courseId });
    try {
      if (courseId) {
        const s = await api<{ paid?: boolean }>(
          `/api/certificates/status?courseId=${encodeURIComponent(courseId)}`
        ).catch(() => null);

        logR('[Results][payment] status resp', { rid, courseId, s });

        if (s && typeof s.paid === 'boolean') {
          setPaymentOk(s.paid);
          logR('[Results][payment] setPaymentOk from status', { rid, paid: s.paid });
          return;
        }
      }
    } catch (e: any) {
      warnR('[Results][payment] status error', {
        rid,
        status: e?.status,
        msg: e?.message,
        data: safeJson(e?.data),
      });
    }

    const fallback = Boolean(cert?.download_url || trans?.download_url);
    setPaymentOk(fallback);
    logR('[Results][payment] setPaymentOk fallback', {
      rid,
      fallback,
      certDl: Boolean(cert?.download_url),
      transDl: Boolean(trans?.download_url),
    });
  }, [api, courseId, cert?.download_url, trans?.download_url, rid]);

  useEffect(() => {
    checkPaymentStatus();
  }, [checkPaymentStatus]);

  // 🔗 Tokens-first hook
  const {
    skus,
    loading: aiCertLoading,
    error: aiCertError,
    message: aiCertMsg,
    claim,
    generate,
  } = useAICertificates({ backendUrl, token: token || '', courseId });

  const { items: aiCourses } = useAiCourseEntitlements({
    backendUrl,
    token: token || '',
  });

  // ✅ Library view when no courseId
  const libraryView = !courseId;

  // Library UI state
  const [tab, setTab] = useState<'all' | 'certs' | 'trans'>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!libraryView) return;
    // preserve a “nice default”: if user has certs but no transcripts, keep All
    setTab('all');
    setQ('');
  }, [libraryView]);

  const norm = (s: any) => String(s ?? '').toLowerCase().trim();

  const filteredCerts = useMemo(() => {
    const arr = Array.isArray(allCerts) ? allCerts : [];
    const qq = norm(q);
    if (!qq) return arr;
    return arr.filter((c) => {
      const title = c.course_title || c.title || c.course_id || '';
      return norm(title).includes(qq);
    });
  }, [allCerts, q]);

  const filteredTrans = useMemo(() => {
    const arr = Array.isArray(allTrans) ? allTrans : [];
    const qq = norm(q);
    if (!qq) return arr;
    return arr.filter((t) => {
      const title = t.course_title || t.title || t.course_id || '';
      return norm(title).includes(qq);
    });
  }, [allTrans, q]);

  const docsCount = {
    certs: Array.isArray(allCerts) ? allCerts.length : 0,
    trans: Array.isArray(allTrans) ? allTrans.length : 0,
  };

  // Log the exact reason the UI will show "No transcripts yet."
  useEffect(() => {
    if (!libraryView) return;

    const reason =
      !token
        ? 'no_token'
        : docsLoading
        ? 'loading'
        : transErr
        ? `error:${transErr?.status || 'unknown'}`
        : Array.isArray(allTrans) && allTrans.length === 0
        ? 'empty_array'
        : 'has_items';

    logR('[Results][library] transcripts_state', {
      rid,
      token: Boolean(token),
      docsLoading,
      transErr,
      allTransLen: allTrans?.length,
      reason,
      sample: (allTrans || []).slice(0, 1),
    });
  }, [libraryView, token, docsLoading, transErr, allTrans, rid]);

  const headerTitle = libraryView ? 'My Documents' : 'Results & Documents';
  const headerSub = libraryView
    ? 'Your AI certificates & transcripts'
    : `${courseTitle ? courseTitle : 'Course'} • Your quiz results & downloads`;

  const LibraryEmpty: React.FC<{ kind: 'cert' | 'trans' | 'all' }> = ({ kind }) => {
    const title =
      kind === 'cert'
        ? 'No certificates yet'
        : kind === 'trans'
        ? 'No transcripts yet'
        : 'No documents yet';

    const msg =
      kind === 'trans'
        ? 'Transcripts appear after you generate them (Extended certificate).'
        : kind === 'cert'
        ? 'Your certificates will show up here after you claim & generate.'
        : 'Complete a course and generate your certificate to get started.';

    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-[#e7edf4] dark:bg-[#172534] grid place-items-center">
            <FontAwesomeIcon icon={faFolderOpen as IconProp} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-[16px]">{title}</div>
            <div className="text-sm text-[#49739c] dark:text-darkTextSecondary mt-1">
              {msg}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => navigate('/courses')}
                title="Go to courses"
              >
                Go to Courses <FontAwesomeIcon icon={faArrowRight as IconProp} />
              </Button>
              <Button variant="soft" onClick={() => navigate(-1)}>
                <FontAwesomeIcon icon={faArrowLeft as IconProp} /> Back
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const DocCard: React.FC<{
    kind: 'cert' | 'trans';
    row: any;
  }> = ({ kind, row }) => {
    const title = row?.course_title || row?.title || row?.course_id || 'Course';
    const cid = String(row?.course_id ?? '');
    const id = String(row?.id ?? '');

    const tRow = transByCourse.get(cid);
    const transcriptReady =
      Boolean(tRow && (tRow.has_url || String(tRow.url || '').trim()));
    const transcriptExists = Boolean(tRow);

    const isBusy = genTransState.loading && String(genTransState.courseId) === cid;

    return (
      <div className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-[#f6f9fc] dark:bg-[#0b1620] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'size-9 rounded-xl grid place-items-center border',
                  kind === 'cert'
                    ? 'bg-blue-500/10 border-blue-200/60 dark:border-blue-500/20'
                    : 'bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20'
                )}
              >
                <FontAwesomeIcon
                  icon={(kind === 'cert' ? faCertificate : faFileLines) as IconProp}
                />
              </div>

              <div className="min-w-0">
                <div className="font-semibold truncate">{title}</div>
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-0.5">
                  {kind === 'cert' ? 'Certificate' : 'Transcript'}
                </div>
              </div>
            </div>

            {/* subtle status row */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone="neutral">
                <FontAwesomeIcon icon={faFilePdf as IconProp} />
                PDF
              </Chip>

              {kind === 'cert' && (
                <Chip tone={transcriptReady ? 'success' : transcriptExists ? 'info' : 'neutral'}>
                  <FontAwesomeIcon icon={faFileLines as IconProp} />
                  {transcriptReady ? 'Transcript ready' : transcriptExists ? 'Transcript exists' : 'No transcript yet'}
                </Chip>
              )}
            </div>
          </div>

          {/* right-side helper */}
          <div className="flex flex-col items-end gap-2">
            <Chip tone="neutral" className="hidden sm:inline-flex">
              #{id.slice(0, 6)}
            </Chip>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="soft"
            onClick={() => navigate(`/results?courseId=${encodeURIComponent(cid)}`)}
            title="Open course documents view"
          >
            Open <FontAwesomeIcon icon={faArrowRight as IconProp} />
          </Button>

          <Button
            variant="ghost"
            onClick={async () => {
              try {
                if (kind === 'cert') {
                  await downloadCertificateFile(backendUrl, token || '', id);
                } else {
                  await downloadTranscriptFile(backendUrl, token || '', id);
                }
                pushToast('success', 'Download started.');
              } catch (e: any) {
                pushToast('warn', 'Download locked. Open the course to unlock / pay.');
              }
            }}
            title="Download PDF"
          >
            <FontAwesomeIcon icon={faDownload as IconProp} />
            Download
          </Button>

          {/* Certificate-only: transcript generation */}
          {kind === 'cert' ? (
            <Button
              variant="primary"
              onClick={() => generateTranscriptForCourse(cid, 'library_button')}
              disabled={isBusy || transcriptReady}
              title={
                transcriptReady
                  ? 'Transcript already ready'
                  : 'Generate transcript (Extended required)'
              }
              className="min-w-[170px]"
            >
              {isBusy ? (
                <>
                  <Spinner /> Generating…
                </>
              ) : transcriptReady ? (
                <>Transcript Ready</>
              ) : transcriptExists ? (
                <>
                  <FontAwesomeIcon icon={faRotateRight as IconProp} />
                  Regenerate Transcript
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faWandMagicSparkles as IconProp} />
                  Generate Transcript
                </>
              )}
            </Button>
          ) : null}
        </div>

        {/* inline error */}
        {genTransState.error && String(genTransState.courseId) === cid ? (
          <div className="mt-3 text-xs text-red-600 dark:text-red-400">
            Failed: {genTransState.error?.msg || 'Unknown error'}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <SeoHead
        title="Results & Certificates | DayBreak"
        description="View your results, certificates, and transcripts."
        canonicalPath={location.pathname}
        noindex
      />
      {/* toast */}
      {toast ? (
        <div className="fixed z-[60] top-4 right-4">
          <div
            className={cn(
              'rounded-2xl border px-4 py-3 shadow-lg max-w-[320px]',
              toast.tone === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-100'
                : toast.tone === 'warn'
                ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-100'
                : toast.tone === 'error'
                ? 'bg-red-50 border-red-200 text-red-900 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-100'
                : 'bg-white border-[#cedbe8] text-[#0d141c] dark:bg-[#0f1821] dark:border-darkCard dark:text-white'
            )}
          >
            <div className="text-sm font-semibold">{toast.msg}</div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-center py-5 px-4 sm:px-6 lg:px-10">
        <div className="w-full max-w-[1200px] space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[26px] sm:text-[30px] font-bold">{headerTitle}</h1>
              <div className="text-sm sm:text-base text-[#49739c] dark:text-darkTextSecondary">
                {headerSub}
              </div>

              {/* chips */}
              {libraryView ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip tone="info">
                    <FontAwesomeIcon icon={faCertificate as IconProp} />
                    {docsCount.certs} certificates
                  </Chip>
                  <Chip tone="success">
                    <FontAwesomeIcon icon={faFileLines as IconProp} />
                    {docsCount.trans} transcripts
                  </Chip>
                  {docsLoading ? <Chip tone="neutral">Loading…</Chip> : null}
                  {certErr || transErr ? (
                    <Chip tone="warn">
                      <FontAwesomeIcon icon={faTriangleExclamation as IconProp} />
                      Some data failed
                    </Chip>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>

              <Button
                variant="soft"
                onClick={() => (libraryView ? navigate(-1) : navigate('/results'))}
                title={libraryView ? 'Back' : 'Back to documents'}
              >
                <FontAwesomeIcon icon={faArrowLeft as IconProp} />
                {libraryView ? 'Back' : 'All documents'}
              </Button>
            </div>
          </div>

          {/* ✅ Library section */}
          {libraryView ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
              {/* Main library */}
              <div className="space-y-4">
                {/* Controls */}
                <Card className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={tab === 'all' ? 'primary' : 'soft'}
                        onClick={() => setTab('all')}
                      >
                        All
                      </Button>
                      <Button
                        variant={tab === 'certs' ? 'primary' : 'soft'}
                        onClick={() => setTab('certs')}
                      >
                        Certificates
                      </Button>
                      <Button
                        variant={tab === 'trans' ? 'primary' : 'soft'}
                        onClick={() => setTab('trans')}
                      >
                        Transcripts
                      </Button>
                    </div>

                    <div className="relative w-full sm:w-[320px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70">
                        <FontAwesomeIcon icon={faMagnifyingGlass as IconProp} />
                      </span>
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by course title…"
                        className="w-full h-10 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] pl-9 pr-3 text-sm"
                      />
                    </div>
                  </div>

                  {/* tiny helper line */}
                  <div className="mt-3 text-xs text-[#49739c] dark:text-darkTextSecondary">
                    Tip: Open a document to see previews, unlock downloads, and manage payment.
                  </div>
                </Card>

                {/* Content */}
                {docsLoading ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-xl bg-[#e7edf4] dark:bg-[#172534]" />
                          <div className="flex-1">
                            <div className="h-3 w-2/3 rounded bg-[#e7edf4] dark:bg-[#172534]" />
                            <div className="mt-2 h-3 w-1/3 rounded bg-[#e7edf4] dark:bg-[#172534]" />
                          </div>
                        </div>
                        <div className="mt-4 h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534]" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {tab === 'all' ? (
                      <div className="space-y-4">
                        {/* Certificates */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-bold text-[16px]">Certificates</div>
                            <Chip tone="info">{filteredCerts.length}</Chip>
                          </div>

                          {filteredCerts.length === 0 ? (
                            <LibraryEmpty kind="cert" />
                          ) : (
                            <div className="grid sm:grid-cols-2 gap-3">
                              {filteredCerts.map((c) => (
                                <DocCard key={c.id} kind="cert" row={c} />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Transcripts */}
                        <div className="pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-bold text-[16px]">Transcripts</div>
                            <Chip tone="success">{filteredTrans.length}</Chip>
                          </div>

                          {filteredTrans.length === 0 ? (
                            <LibraryEmpty kind="trans" />
                          ) : (
                            <div className="grid sm:grid-cols-2 gap-3">
                              {filteredTrans.map((t) => (
                                <DocCard key={t.id} kind="trans" row={t} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : tab === 'certs' ? (
                      filteredCerts.length === 0 ? (
                        <LibraryEmpty kind="cert" />
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-3">
                          {filteredCerts.map((c) => (
                            <DocCard key={c.id} kind="cert" row={c} />
                          ))}
                        </div>
                      )
                    ) : filteredTrans.length === 0 ? (
                      <LibraryEmpty kind="trans" />
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-3">
                        {filteredTrans.map((t) => (
                          <DocCard key={t.id} kind="trans" row={t} />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {DEBUG_RESULTS ? (
                  <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary opacity-70 pt-2">
                    debug rid={rid} loading={String(docsLoading)} certErr={certErr?.status || '—'} transErr={transErr?.status || '—'}
                  </div>
                ) : null}
              </div>

              {/* Side panel (quick help / status) */}
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="font-bold">How it works</div>
                  <div className="mt-2 text-sm text-[#49739c] dark:text-darkTextSecondary space-y-2">
                    <p>• Certificates appear after you claim & generate.</p>
                    <p>• Transcripts require an <span className="font-semibold">Extended</span> certificate.</p>
                    <p>• Downloads are clean after payment/unlock.</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => navigate('/courses')}>
                      Go to Courses <FontAwesomeIcon icon={faArrowRight as IconProp} />
                    </Button>
                    <Button variant="ghost" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                      Top
                    </Button>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="font-bold">Quick actions</div>
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      variant="soft"
                      onClick={async () => {
                        try {
                          setDocsLoading(true);
                          const cs = await api('/api/certificates/me');
                          const arr = Array.isArray(cs) ? cs : [];
                          setAllCerts(arr);

                          const ts = await api('/api/transcripts/me');
                          const arrT = Array.isArray(ts) ? ts : [];
                          setAllTrans(arrT);

                          pushToast('success', 'Refreshed documents.');
                        } catch {
                          pushToast('warn', 'Refresh failed. Try again.');
                        } finally {
                          setDocsLoading(false);
                        }
                      }}
                    >
                      <FontAwesomeIcon icon={faRotateRight as IconProp} />
                      Refresh
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          ) : null}

          {/* ✅ Course-specific view */}
          {!libraryView ? (
            <>
              {/* Score card */}
              <Card
                className={cn(
                  'p-4',
                  passed
                    ? 'border-emerald-200/60 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/10'
                    : 'border-red-200/60 dark:border-red-500/20 bg-red-50/60 dark:bg-red-500/10'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                      Score
                    </div>
                    <div className="text-2xl font-extrabold tracking-tight">
                      {grade ? `${grade.scorePct}%` : '—'}
                      <span className="text-sm font-semibold ml-2 text-[#49739c] dark:text-darkTextSecondary">
                        (Pass mark {grade?.passMark ?? 70}%)
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-[#49739c] dark:text-darkTextSecondary">
                      {passed
                        ? 'You have documents available. You can download them anytime.'
                        : 'Review the lesson and try again to pass.'}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Chip tone={paymentOk ? 'success' : 'neutral'}>
                      {paymentOk ? 'Unlocked' : 'Locked'}
                    </Chip>
                    <div className="hidden sm:block">
                      <ThemeToggle />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Two-column previews */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <WatermarkPreview
                  title="Certificate"
                  pdfUrl={cert?.url || null}
                  certId={cert?.id || null}
                  backendUrl={backendUrl}
                />
                <WatermarkPreview
                  title="Transcript"
                  pdfUrl={trans?.url || null}
                  backendUrl={backendUrl}
                />
              </div>

              {/* Purchased AI courses */}
              {aiCourses.length > 0 && (
                <Card className="p-4 space-y-3">
                  <div>
                    <div className="font-bold">Purchased AI courses</div>
                    <div className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                      Certificate purchases unlock up to 60 lessons
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {aiCourses.map((item) => {
                      const status = item.completion?.passed
                        ? 'Completed'
                        : item.completion?.attempted
                        ? 'In progress'
                        : 'Not started';
                      return (
                        <div
                          key={item.course_id}
                          className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-[#f6f9fc] dark:bg-[#0b1620] p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">{item.title}</div>
                              <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                                Lessons used {item.lessons_used}/{item.max_lessons}
                              </div>
                            </div>
                            <Chip tone="neutral">{status}</Chip>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {!item.completion?.passed ? (
                              <Link
                                to={`/courses/${item.course_id}`}
                                className="text-sm px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] font-semibold"
                              >
                                Continue course
                              </Link>
                            ) : (
                              <Link
                                to={`/results?courseId=${encodeURIComponent(item.course_id)}`}
                                className="text-sm px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 font-semibold"
                              >
                                View certificate
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Actions */}
              <Card className="p-4">
                <div className="font-bold mb-1">Downloads</div>
                <div className="text-sm text-[#49739c] dark:text-darkTextSecondary mb-3">
                  Pay the certificate fee once to download both the{' '}
                  <span className="font-semibold">Certificate</span> and{' '}
                  <span className="font-semibold">Transcript</span> without watermark.
                </div>

                {/* Tokens-first block */}
                <div className="mb-4 p-4 rounded-2xl border border-emerald-200/60 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm">Claim with Tokens</div>
                      <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                        No processor fees for AI certificates.
                      </div>
                    </div>
                    <Chip tone="success">Tokens</Chip>
                  </div>

                  {aiCertLoading && (
                    <div className="mt-2 text-xs text-[#49739c] dark:text-darkTextSecondary">
                      Loading…
                    </div>
                  )}
                  {aiCertError && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {aiCertError}
                    </div>
                  )}
                  {aiCertMsg && (
                    <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-200">
                      {aiCertMsg}
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    {(skus || []).map((sku) => (
                      <div
                        key={sku.code}
                        className="flex items-center justify-between rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white/70 dark:bg-[#0f1821] p-3"
                      >
                        <div>
                          <div className="text-sm font-bold">{sku.title}</div>
                          <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                            {sku.code}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Chip tone="neutral">{sku.price_tokens} Tokens</Chip>

                          <Button
                            variant="primary"
                            disabled={!passed}
                            title={!passed ? 'Pass the quiz first' : 'Claim & generate'}
                            onClick={async () => {
                              if (!token || !courseId) {
                                warnR('[Results][claim] missing token/courseId', {
                                  rid,
                                  hasToken: !!token,
                                  courseId,
                                });
                                pushToast('warn', 'Missing token/course id.');
                                return;
                              }

                              logR('[Results][claim] click', {
                                rid,
                                courseId,
                                sku: { code: sku.code, title: sku.title },
                                passed,
                              });

                              try {
                                pushToast('info', 'Claiming…');
                                await claim(sku.code, courseId);

                                pushToast('info', 'Generating certificate…');
                                const doc = await generate();

                                if ((doc as any)?.id) {
                                  const next = {
                                    id: (doc as any).id,
                                    url: (doc as any).url,
                                    download_url:
                                      (doc as any).download_url ||
                                      `${backendUrl.replace(/\/+$/, '')}/api/certificates/${(doc as any).id}/download`,
                                  };
                                  setCert(next);
                                  pushToast('success', 'Certificate ready!');

                                  // refresh all-certs list
                                  try {
                                    const cs = await api('/api/certificates/me');
                                    const arr = Array.isArray(cs) ? cs : [];
                                    setAllCerts(arr);
                                  } catch {}

                                  // If extended SKU, also generate transcript
                                  if (looksExtendedSku(sku)) {
                                    try {
                                      pushToast('info', 'Generating transcript…');
                                      const t = await api(`/api/transcripts/generate`, {
                                        method: 'POST',
                                        body: JSON.stringify({ courseId }),
                                      });

                                      if ((t as any)?.id) {
                                        setTrans({
                                          id: (t as any).id,
                                          url: (t as any).url,
                                          download_url:
                                            (t as any).download_url ||
                                            `${backendUrl.replace(/\/+$/, '')}/api/transcripts/${(t as any).id}/download`,
                                        });
                                        pushToast('success', 'Transcript ready!');
                                      }

                                      try {
                                        const ts = await api('/api/transcripts/me');
                                        const arr = Array.isArray(ts) ? ts : [];
                                        setAllTrans(arr);
                                      } catch {}

                                      if ((t as any)?.download_url) {
                                        window.location.href = (t as any).download_url;
                                      }
                                    } catch (e: any) {
                                      errR('[Results][transcript.generate] fail', {
                                        rid,
                                        status: e?.status,
                                        msg: e?.message,
                                        data: safeJson(e?.data),
                                      });
                                      pushToast('warn', 'Transcript generation failed.');
                                    }
                                  }
                                }
                              } catch (e: any) {
                                errR('[Results][claim] token claim/generate failed', {
                                  rid,
                                  status: e?.status,
                                  msg: e?.message,
                                  data: safeJson(e?.data),
                                });
                                pushToast('error', 'Claim failed. Try again.');
                              }
                            }}
                          >
                            Claim &amp; Generate
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={() => {
                      logR('[Results][pay] open widget', { rid, passed });
                      setPaymentOpen(true);
                    }}
                    disabled={!passed}
                    title={passed ? 'Open payment panel' : 'Pass the quiz to unlock payment'}
                  >
                    Pay certificate fee
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!cert?.id) {
                        setPaymentOpen(true);
                        return;
                      }
                      const fileName = `${(courseTitle || 'certificate')
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')}-${cert.id}.pdf`;
                      try {
                        await downloadCertificateFile(backendUrl, token || '', cert.id, fileName);
                        pushToast('success', 'Certificate download started.');
                      } catch (e: any) {
                        pushToast('warn', 'Download locked. Please unlock first.');
                        setPaymentOpen(true);
                      }
                    }}
                    title="Download certificate PDF"
                  >
                    <FontAwesomeIcon icon={faDownload as IconProp} />
                    Download Certificate
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!trans?.id) {
                        setPaymentOpen(true);
                        return;
                      }
                      const fileName = `${(courseTitle || 'transcript')
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')}-${trans.id}.pdf`;
                      try {
                        await downloadTranscriptFile(backendUrl, token || '', trans.id, fileName);
                        pushToast('success', 'Transcript download started.');
                      } catch (e: any) {
                        pushToast('warn', 'Download locked. Please unlock first.');
                        setPaymentOpen(true);
                      }
                    }}
                    title="Download transcript PDF"
                  >
                    <FontAwesomeIcon icon={faDownload as IconProp} />
                    Download Transcript
                  </Button>
                </div>

                {!passed && (
                  <div className="mt-3 text-xs text-[#49739c] dark:text-darkTextSecondary">
                    Tip: Revisit the lesson and retry the quiz to reach the pass mark.
                  </div>
                )}
              </Card>

              <PaymentWidget
                isOpen={paymentOpen}
                onClose={async () => {
                  logR('[Results][PaymentWidget] onClose', { rid });
                  setPaymentOpen(false);

                  // refresh lists so the library is always accurate
                  try {
                    const cs = await api('/api/certificates/me');
                    const arr = Array.isArray(cs) ? cs : [];
                    setAllCerts(arr);
                  } catch {}

                  try {
                    const ts = await api('/api/transcripts/me');
                    const arr = Array.isArray(ts) ? ts : [];
                    setAllTrans(arr);
                  } catch {}

                  await checkPaymentStatus();
                }}
                title="Unlock Certificate"
                showTutorPreview={false}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ResultsPage;
