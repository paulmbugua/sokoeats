// ResultsPage.tsx (web)
// Full file with client-side logs to explain "No transcripts yet."

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
import {
  useAICertificates,
  useAiCourseEntitlements,
} from '@mytutorapp/shared/hooks';
import { downloadCertificateFile, downloadTranscriptFile } from '@mytutorapp/shared/api';

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
      return `${u.origin}${left}/upload/pg_1/${right.replace(
        /\.pdf$/i,
        '.jpg',
      )}`;
    } catch {
      return null;
    }
  }, [title, certId, backendUrl, pdfUrl]);

  return (
    <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/5">
      <div className="px-3 pt-3">
        <div className="text-white font-semibold">{title}</div>
        <div className="text-white/60 text-xs mb-2">
          Preview (watermarked)
        </div>
      </div>

      <div className="relative">
        <div className="aspect-[4/3] bg-black/30 flex items-center justify-center">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`${title} preview`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-white/60 text-sm">No preview available</div>
          )}
        </div>

        {/* Watermark overlay */}
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          style={{ mixBlendMode: 'multiply' }}
        >
          <div className="rotate-12 text-4xl sm:text-6xl md:text-7xl font-black tracking-widest text-white/20">
            PREVIEW
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 text-white/60 text-xs">
        Downloads are clean (no watermark) after certificate payment.
      </div>
    </div>
  );
}

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
      return;
    }
    if (!cid) {
      warnR('[Results][genTrans] missing courseId', { rid, cid, source });
      return;
    }

    const op = mkRid('genTrans');
    setGenTransState({ courseId: cid, loading: true, error: null, last: null });

    logR('[Results][genTrans] enter', { rid, op, cid, source });

    try {
      const resp = await api(`/api/transcripts/generate`, {
        method: 'POST',
        body: JSON.stringify({ courseId: cid }),
      });

      logR('[Results][genTrans] ok', { rid, op, resp: safeJson(resp) });

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

      // ✅ THIS is where the alert belongs
      if (e?.status === 402 && e?.data?.error === 'EXTENDED_REQUIRED') {
        alert(e?.data?.message || 'Transcript requires Extended certificate.');
      }

      setGenTransState({ courseId: cid, loading: false, error: payload, last: null });
    }
  },
  [api, rid, token, backendUrl, courseId]
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

  // Only auto-attempt if it looks Extended; otherwise don’t spam the endpoint.
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

  return (
    <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-4 sm:py-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
              {libraryView ? 'My Documents' : 'Results & Documents'}
            </h1>
            <div className="text-white/70 text-sm sm:text-base">
              {libraryView
                ? 'Your AI certificates & transcripts'
                : `${courseTitle ? courseTitle : 'Course'} • Your quiz results & downloads`}
            </div>
          </div>

          <button
            onClick={() => (libraryView ? navigate(-1) : navigate('/results'))}
            className="rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 text-sm"
            title={libraryView ? 'Back' : 'Back to documents'}
          >
            {libraryView ? 'Back' : 'All documents'}
          </button>
        </div>

        {/* ✅ Library section */}
        {libraryView ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
            <div>
              <div className="text-white font-semibold mb-2">My Certificates</div>
              {allCerts.length === 0 ? (
                <div className="text-white/60 text-sm">No certificates yet.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
{(allCerts || []).map((c) => {
  const hasTranscript = Boolean(transByCourse.get(String(c.course_id)));

  return (
    <div key={c.id} className="rounded-xl bg-black/20 ring-1 ring-white/10 p-3">
      <div className="text-white font-semibold text-sm truncate">
        {c.course_title || c.title || c.course_id || 'Course'}
      </div>
      <div className="text-white/60 text-xs mt-1">Certificate</div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => navigate(`/results?courseId=${encodeURIComponent(c.course_id)}`)}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
        >
          Open
        </button>

        <button
          onClick={() => downloadCertificateFile(backendUrl, token || '', c.id)}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
        >
          Download
        </button>

        {/* ✅ NEW: attempt transcript generation (prints exact reason in logs) */}
        <button
          onClick={() => generateTranscriptForCourse(String(c.course_id), 'library_button')}
          disabled={hasTranscript || genTransState.loading}
          className={`px-3 py-2 rounded-lg text-sm ${
            hasTranscript
              ? 'bg-white/5 ring-1 ring-white/10 cursor-not-allowed'
              : 'bg-white/10 hover:bg-white/20'
          }`}
          title={
            hasTranscript
              ? 'Transcript already exists'
              : 'Attempt transcript generation (will show exact server reason in logs)'
          }
        >
          {hasTranscript
            ? 'Transcript Ready'
            : genTransState.loading
            ? 'Generating…'
            : 'Generate Transcript'}
        </button>
      </div>
    </div>
  );
})}

                </div>
              )}
            </div>

            <div>
              <div className="text-white font-semibold mb-2">My Transcripts</div>
              {allTrans.length === 0 ? (
                <div className="text-white/60 text-sm">No transcripts yet.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {(allTrans || []).map((t) => (
                    <div key={t.id} className="rounded-xl bg-black/20 ring-1 ring-white/10 p-3">
                      <div className="text-white font-semibold text-sm truncate">
                        {t.course_title || t.title || t.course_id || 'Course'}
                      </div>
                      <div className="text-white/60 text-xs mt-1">Transcript</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() =>
                            navigate(`/results?courseId=${encodeURIComponent(t.course_id)}`)
                          }
                          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => downloadTranscriptFile(backendUrl, token || '', t.id)}
                          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Optional: extra debug lines (keep minimal; remove if you hate it) */}
            {DEBUG_RESULTS ? (
              <div className="text-[11px] text-white/40 pt-2 border-t border-white/10">
                debug rid={rid} loading={String(docsLoading)} certErr={certErr?.status || '—'} transErr={transErr?.status || '—'}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ✅ Course-specific view */}
        {!libraryView ? (
          <>
            {/* Score card */}
            <div
              className={`rounded-2xl p-4 ring-1 ${
                passed
                  ? 'bg-emerald-500/10 ring-emerald-500/40'
                  : 'bg-red-500/10 ring-red-500/40'
              }`}
            >
              <div className="text-white/80 text-sm">Score</div>
              <div className="text-2xl font-semibold">
                {grade ? `${grade.scorePct}%` : '—'}
                <span className="text-white/60 text-sm ml-2">
                  (Pass mark {grade?.passMark ?? 70}%)
                </span>
              </div>
              <div className="mt-1 text-white/70">
                {passed
                  ? 'You have documents available. You can download them anytime.'
                  : 'Review the lesson and try again to pass.'}
              </div>
            </div>

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
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div>
                  <div className="text-white font-semibold">Purchased AI courses</div>
                  <div className="text-white/60 text-sm">
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
                        className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-white font-semibold truncate">{item.title}</div>
                            <div className="text-white/60 text-xs">
                              Lessons used {item.lessons_used}/{item.max_lessons}
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/80">
                            {status}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {!item.completion?.passed ? (
                            <Link
                              to={`/courses/${item.course_id}`}
                              className="text-sm px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                            >
                              Continue course
                            </Link>
                          ) : (
                            <Link
                              to={`/results?courseId=${encodeURIComponent(item.course_id)}`}
                              className="text-sm px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                            >
                              View certificate
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="rounded-2xl p-4 ring-1 ring-white/10 bg-white/5">
              <div className="text-white font-semibold mb-2">Downloads</div>
              <div className="text-white/70 text-sm mb-3">
                Pay the certificate fee once to download both the{' '}
                <span className="font-medium">Certificate</span> and{' '}
                <span className="font-medium">Transcript</span> without watermark.
              </div>

              {/* Tokens-first block */}
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
                <div className="text-white font-medium text-sm">Claim with Tokens</div>
                <div className="text-white/70 text-xs mb-2">
                  No processor fees for AI certificates.
                </div>

                {aiCertLoading && <div className="text-xs text-white/60">Loading…</div>}
                {aiCertError && <div className="text-xs text-red-300">{aiCertError}</div>}
                {aiCertMsg && <div className="text-xs text-emerald-300">{aiCertMsg}</div>}

                <div className="space-y-2">
                  {(skus || []).map((sku) => (
                    <div
                      key={sku.code}
                      className="flex items-center justify-between rounded-lg ring-1 ring-white/15 p-2 bg-white/5"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{sku.title}</div>
                        <div className="text-[11px] text-white/60">{sku.code}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {sku.price_tokens} Tokens
                        </span>

                        <button
                          disabled={!passed}
                          title={!passed ? 'Pass the quiz first' : 'Claim & generate'}
                          onClick={async () => {
                            if (!token || !courseId) {
                              warnR('[Results][claim] missing token/courseId', { rid, hasToken: !!token, courseId });
                              return;
                            }

                            logR('[Results][claim] click', {
                              rid,
                              courseId,
                              sku: { code: sku.code, title: sku.title },
                              passed,
                            });

                            try {
                              logR('[Results][claim] claim start', { rid, sku: sku.code, courseId });
                              await claim(sku.code, courseId);
                              logR('[Results][claim] claim ok', { rid, sku: sku.code, courseId });

                              logR('[Results][claim] generate cert start', { rid, courseId });
                              const doc = await generate();
                              logR('[Results][claim] generate cert ok', { rid, doc: safeJson(doc) });

                              if ((doc as any)?.id) {
                                const next = {
                                  id: (doc as any).id,
                                  url: (doc as any).url,
                                  download_url:
                                    (doc as any).download_url ||
                                    `${backendUrl.replace(/\/+$/, '')}/api/certificates/${(doc as any).id}/download`,
                                };
                                setCert(next);
                                logR('[Results][claim] setCert', { rid, certId: next.id });

                                // refresh all-certs list so library always reflects latest
                                try {
                                  logR('[Results][claim] refresh cert list start', { rid });
                                  const cs = await api('/api/certificates/me');
                                  const arr = Array.isArray(cs) ? cs : [];
                                  setAllCerts(arr);
                                  logR('[Results][claim] refresh cert list ok', { rid, count: arr.length });
                                } catch (e: any) {
                                  warnR('[Results][claim] refresh cert list fail', { rid, status: e?.status, msg: e?.message });
                                }

                                // If extended SKU, also generate transcript and refresh list
                                if (looksExtendedSku(sku)) {
                                  try {
                                    logR('[Results][transcript.generate] start', { rid, courseId, sku: sku.code });

                                    const t = await api(`/api/transcripts/generate`, {
                                      method: 'POST',
                                      body: JSON.stringify({ courseId }),
                                    });

                                    logR('[Results][transcript.generate] ok', { rid, t: safeJson(t) });

                                    if ((t as any)?.id) {
                                      setTrans({
                                        id: (t as any).id,
                                        url: (t as any).url,
                                        download_url:
                                          (t as any).download_url ||
                                          `${backendUrl.replace(/\/+$/, '')}/api/transcripts/${(t as any).id}/download`,
                                      });
                                      logR('[Results][transcript.generate] setTrans', { rid, transId: (t as any).id });
                                    }

                                    try {
                                      logR('[Results][transcript.generate] refresh list start', { rid });
                                      const ts = await api('/api/transcripts/me');
                                      const arr = Array.isArray(ts) ? ts : [];
                                      setAllTrans(arr);
                                      logR('[Results][transcript.generate] refresh list ok', { rid, count: arr.length });
                                    } catch (e: any) {
                                      warnR('[Results][transcript.generate] refresh list fail', { rid, status: e?.status, msg: e?.message });
                                    }

                                    if ((t as any)?.download_url) {
                                      logR('[Results][transcript.generate] redirect to download_url', { rid });
                                      window.location.href = (t as any).download_url;
                                    }
                                  } catch (e: any) {
                                    errR('[Results][transcript.generate] fail', {
                                      rid,
                                      status: e?.status,
                                      msg: e?.message,
                                      data: safeJson(e?.data),
                                    });
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
                            }
                          }}
                          className={`px-3 py-1.5 rounded text-sm ${
                            passed
                              ? 'bg-emerald-600 hover:bg-emerald-500'
                              : 'bg-emerald-600/50 cursor-not-allowed'
                          } text-white`}
                        >
                          Claim &amp; Generate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    logR('[Results][pay] open widget', { rid, passed });
                    setPaymentOpen(true);
                  }}
                  disabled={!passed}
                  className={`h-10 px-4 rounded-lg text-sm font-semibold ${
                    passed
                      ? 'bg-indigo-600 hover:bg-indigo-500'
                      : 'bg-indigo-600/40 cursor-not-allowed'
                  }`}
                  title={passed ? 'Open payment panel' : 'Pass the quiz to unlock payment'}
                >
                  Pay certificate fee
                </button>

                <button
                  onClick={async () => {
                    if (!cert?.id) {
                      logR('[Results][download cert] missing cert -> open payment', { rid });
                      setPaymentOpen(true);
                      return;
                    }
                    const fileName = `${(courseTitle || 'certificate')
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')}-${cert.id}.pdf`;
                    try {
                      logR('[Results][download cert] start', { rid, certId: cert.id, fileName });
                      await downloadCertificateFile(backendUrl, token || '', cert.id, fileName);
                      logR('[Results][download cert] ok', { rid, certId: cert.id });
                    } catch (e: any) {
                      warnR('[Results][download cert] fail -> open payment', { rid, msg: e?.message });
                      setPaymentOpen(true);
                    }
                  }}
                  className={`h-10 px-4 rounded-lg text-sm font-semibold ${
                    cert?.id
                      ? 'bg-white/10 hover:bg-white/20 ring-1 ring-white/20'
                      : 'bg-white/5 ring-1 ring-white/10'
                  }`}
                >
                  Download Certificate (PDF)
                </button>

                <button
                  onClick={async () => {
                    if (!trans?.id) {
                      logR('[Results][download transcript] missing trans -> open payment', { rid });
                      setPaymentOpen(true);
                      return;
                    }
                    const fileName = `${(courseTitle || 'transcript')
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')}-${trans.id}.pdf`;
                    try {
                      logR('[Results][download transcript] start', { rid, transId: trans.id, fileName });
                      await downloadTranscriptFile(backendUrl, token || '', trans.id, fileName);
                      logR('[Results][download transcript] ok', { rid, transId: trans.id });
                    } catch (e: any) {
                      warnR('[Results][download transcript] fail -> open payment', { rid, msg: e?.message });
                      setPaymentOpen(true);
                    }
                  }}
                  className={`h-10 px-4 rounded-lg text-sm font-semibold ${
                    trans?.id
                      ? 'bg-white/10 hover:bg-white/20 ring-1 ring-white/20'
                      : 'bg-white/5 ring-1 ring-white/10'
                  }`}
                >
                  Download Transcript (PDF)
                </button>
              </div>

              {!passed && (
                <div className="mt-3 text-[12px] text-white/60">
                  Tip: Revisit the lesson and retry the quiz to reach the pass mark.
                </div>
              )}
            </div>

            <PaymentWidget
              isOpen={paymentOpen}
              onClose={async () => {
                logR('[Results][PaymentWidget] onClose', { rid });
                setPaymentOpen(false);

                // refresh lists so the library is always accurate
                try {
                  logR('[Results][PaymentWidget] refresh cert list start', { rid });
                  const cs = await api('/api/certificates/me');
                  const arr = Array.isArray(cs) ? cs : [];
                  setAllCerts(arr);
                  logR('[Results][PaymentWidget] refresh cert list ok', { rid, count: arr.length });
                } catch (e: any) {
                  warnR('[Results][PaymentWidget] refresh cert list fail', { rid, status: e?.status, msg: e?.message });
                }

                try {
                  logR('[Results][PaymentWidget] refresh transcript list start', { rid });
                  const ts = await api('/api/transcripts/me');
                  const arr = Array.isArray(ts) ? ts : [];
                  setAllTrans(arr);
                  logR('[Results][PaymentWidget] refresh transcript list ok', { rid, count: arr.length });
                } catch (e: any) {
                  warnR('[Results][PaymentWidget] refresh transcript list fail', { rid, status: e?.status, msg: e?.message });
                }

                await checkPaymentStatus();
              }}
              title="Unlock Certificate"
              showTutorPreview={false}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ResultsPage;
