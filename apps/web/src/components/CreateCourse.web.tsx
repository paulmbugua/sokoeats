// apps/web/src/pages/CreateCourse.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCourses } from '@mytutorapp/shared/hooks/useCourses';
import { useShopContext } from '@mytutorapp/shared/context';
import type { CoursePayload, SyllabusItem } from '@mytutorapp/shared/types';
import { uploadClassVaultAsset } from '@mytutorapp/shared/api/classVaultUploadApi';
import SeoHead from './seo/SeoHead';

const steps = ['Basic Info', 'Details', 'Syllabus', 'Review'] as const;

// Parse "8 weeks", "8w", "8" → clamp 1..52
function parseWeeks(input: string): number {
  const m = String(input || '').match(/(\d{1,2})/);
  const n = m ? Number(m[1]) : 0;
  return Math.max(1, Math.min(52, Number.isFinite(n) ? n : 1));
}

// Safe extractor for tutorId from profile
function deriveTutorId(profile: unknown): number {
  if (profile && typeof profile === 'object') {
    const p = profile as { user_id?: unknown; userId?: unknown; id?: unknown };
    const tryNum = (v: unknown) => (typeof v === 'number' ? v : undefined);
    const tryStr = (v: unknown) =>
      typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined;

    return (
      tryNum(p.user_id) ??
      tryNum(p.userId) ??
      tryNum(p.id) ??
      tryStr(p.user_id) ??
      tryStr(p.userId) ??
      tryStr(p.id) ??
      0
    );
  }
  return 0;
}

// ---------- Draft persistence ----------
const DRAFT_KEY = 'mt_create_course_draft_v1';

type CreateCourseDraft = {
  step: number;
  priceInput: string; // tokens as string input
  formData: CoursePayload;
  /** Whether the course is free (disables price requirement) */
  freeCourse?: boolean;
};

function isDraft(obj: unknown): obj is CreateCourseDraft {
  if (!obj || typeof obj !== 'object') return false;
  const d = obj as Partial<CreateCourseDraft>;
  return (
    typeof d.step === 'number' &&
    typeof d.priceInput === 'string' &&
    typeof d.formData === 'object' &&
    d.formData !== null
  );
}

type EditableSyllabusField = 'topic' | 'assignment' | 'videoUrl' | 'notesUrl';
type FieldName = 'title' | 'description' | 'level' | 'duration' | 'prerequisites';

export default function CreateCoursePage() {
  const location = useLocation();
  const { backendUrl, token, profile } = useShopContext();
  const { addCourse, loading, error } = useCourses({ backendUrl, token });

  const [uploadPct, setUploadPct] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);

  // priceInput now represents Tokens (integer)
  const [priceInput, setPriceInput] = useState<string>('');
  const [freeCourse, setFreeCourse] = useState<boolean>(false);

  const [formData, setFormData] = useState<CoursePayload>({
    tutorId: deriveTutorId(profile),
    title: '',
    description: '',
    level: 'Beginner',
    duration: '',
    price: 0, // tokens
    prerequisites: '',
    syllabus: [],
  });

  // --- Upload progress helpers ---
  const setCappedPct = (key: string, pct: number) =>
    setUploadPct((prev) => ({
      ...prev,
      [key]: Math.min(95, Math.max(prev[key] ?? 0, Math.round(pct))),
    }));

  const markUploadDone = (key: string) => {
    setUploadPct((prev) => ({ ...prev, [key]: 100 }));
    setTimeout(() => {
      setUploadPct((prev) => ({ ...prev, [key]: 0 }));
    }, 600);
  };

  // ---------- Load draft on mount ----------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!isDraft(parsed)) return;

      const resolvedTutorId = deriveTutorId(profile);
      const fd = parsed.formData;
      const mergedForm: CoursePayload = {
        ...fd,
        tutorId: resolvedTutorId || fd.tutorId || 0,
        syllabus: Array.isArray(fd.syllabus) ? fd.syllabus : [],
      };

      setFormData(mergedForm);
      setPriceInput(parsed.priceInput);
      setStep(Number.isFinite(parsed.step) ? parsed.step : 0);
      setFreeCourse(Boolean((parsed as any).freeCourse));
    } catch {
      // ignore corrupt draft
    }
  }, [profile]);

  // ---------- Keep tutorId in sync ----------
  useEffect(() => {
    const tid = deriveTutorId(profile);
    if (tid && tid !== formData.tutorId) {
      setFormData((prev) => ({ ...prev, tutorId: tid }));
    }
  }, [profile, formData.tutorId]);

  // ---------- Auto-size syllabus from duration ----------
  useEffect(() => {
    const weeks = parseWeeks(formData.duration ?? '');
    setFormData((prev) => {
      const current = prev.syllabus ?? [];
      const trimmed = current.slice(0, weeks).map((s, i) => ({ ...s, week: i + 1 }));
      const next: SyllabusItem[] = [...trimmed];
      for (let i = trimmed.length; i < weeks; i++) {
        next.push({ week: i + 1, topic: '', assignment: '' });
      }
      return { ...prev, syllabus: next };
    });
  }, [formData.duration]);

  // ---------- Persist draft ----------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const draft: CreateCourseDraft = { step, priceInput, formData, freeCourse };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage may be full or blocked
    }
  }, [step, priceInput, formData, freeCourse]);

  // ---------- Change handlers ----------
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const key = name as FieldName;
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSyllabusChange = (index: number, field: EditableSyllabusField, value: string) => {
    setFormData((prev) => {
      const base = prev.syllabus ?? [];
      const next = base.map((w, i) => (i === index ? { ...w, [field]: value } : w));
      return { ...prev, syllabus: next };
    });
  };

  // --- Uploaders ---
  const guardUpload = () => {
    if (!backendUrl || !token) {
      alert('Missing backend URL or auth token.');
      return false;
    }
    return true;
  };

  const handleVideoFileUpload = async (index: number, file: File | null) => {
    if (!file) return;
    if (!guardUpload()) return;
    const key = `v-${index}`;
    try {
      const onProgress = (p: number) => setCappedPct(key, p);
      const { url } = await uploadClassVaultAsset(backendUrl!, token!, file, 'video', onProgress, {
        folder: 'courses',
      });

      setFormData((prev) => {
        const base = prev.syllabus ?? [];
        const next = base.map((w, i) => (i === index ? { ...w, videoUrl: url } : w));
        return { ...prev, syllabus: next };
      });

      markUploadDone(key);
    } catch (e) {
      console.error('[CreateCourse] video upload failed', e);
      alert('Video upload failed. Please try again.');
      setUploadPct((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  const handleNotesPdfUpload = async (index: number, file: File | null) => {
    if (!file) return;
    if (!guardUpload()) return;
    const key = `n-${index}`;
    try {
      const onProgress = (p: number) => setCappedPct(key, p);
      const { url } = await uploadClassVaultAsset(backendUrl!, token!, file, 'pdf', onProgress, {
        folder: 'courses',
      });

      setFormData((prev) => {
        const base = prev.syllabus ?? [];
        const next = base.map((w, i) => (i === index ? { ...w, notesUrl: url } : w));
        return { ...prev, syllabus: next };
      });

      markUploadDone(key);
    } catch (e) {
      console.error('[CreateCourse] PDF upload failed', e);
      alert('Notes upload failed. Please try again.');
      setUploadPct((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  // ---------- Upload indicators ----------
  const fileUploading = useMemo(
    () => Object.values(uploadPct).some((p) => (p ?? 0) > 0 && (p ?? 0) < 100),
    [uploadPct]
  );

  const overallUploadPct = useMemo(() => {
    const vals = Object.values(uploadPct)
      .map((p) => p ?? 0)
      .filter((p) => p > 0 && p <= 100);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [uploadPct]);

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (!formData.tutorId) {
      alert('Missing tutor id. Please sign in again.');
      return;
    }

    let tokensToSend = 0;
    if (!freeCourse) {
      const trimmed = priceInput.trim();
      const parsed = trimmed === '' ? NaN : Number(trimmed);
      // Tokens must be a non-negative integer.
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        alert(
          'Please enter a valid non-negative whole number of tokens, or mark the course as Free.'
        );
        return;
      }
      tokensToSend = parsed;
    }

    const cleanSyllabus = (formData.syllabus ?? [])
      .filter(
        (s) =>
          (s.topic?.trim().length ?? 0) > 0 ||
          (s.assignment?.trim().length ?? 0) > 0 ||
          (s.videoUrl?.trim().length ?? 0) > 0 ||
          (s.notesUrl?.trim().length ?? 0) > 0
      )
      .map((s, i) => ({ ...s, week: i + 1 }));

    const payload: CoursePayload = {
      ...formData,
      price: tokensToSend, // tokens (0 for free)
      syllabus: cleanSyllabus,
    };

    try {
      await addCourse(payload);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      setFormData({
        tutorId: deriveTutorId(profile),
        title: '',
        description: '',
        level: 'Beginner',
        duration: '',
        price: 0,
        prerequisites: '',
        syllabus: [],
      });
      setFreeCourse(false);
      setPriceInput('');
      setUploadPct({});
      setStep(0);
      alert('✅ Course created successfully!');
    } catch (err) {
      type MaybeAxios = {
        message?: string;
        response?: { data?: { error?: string; message?: string } };
      };
      const e = err as MaybeAxios;
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        'Failed to create course.';
      console.error('[CreateCourse] submit error', err);
      alert(msg);
    }
  };

  // ---------- Validation for Next ----------
  const canNext = useMemo(() => {
    if (step === 0) {
      return formData.title.trim().length > 3 && !!formData.description?.trim();
    }
    if (step === 1) {
      const weeksOk = parseWeeks(formData.duration ?? '') >= 1;
      if (freeCourse) return weeksOk;
      const trimmed = priceInput.trim();
      const parsed = trimmed === '' ? NaN : Number(trimmed);
      const priceOk = Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed);
      return weeksOk && priceOk;
    }
    if (step === 2) {
      return (formData.syllabus ?? []).some(
        (w) =>
          (w.topic?.trim().length ?? 0) > 0 ||
          (w.assignment?.trim().length ?? 0) > 0 ||
          (w.videoUrl?.trim().length ?? 0) > 0 ||
          (w.notesUrl?.trim().length ?? 0) > 0
      );
    }
    return true;
  }, [step, formData, priceInput, freeCourse]);

  const tokensForDisplay = freeCourse
    ? 0
    : priceInput.trim() !== '' && Number.isFinite(Number(priceInput))
      ? Number(priceInput)
      : formData.price;

  // Display helper: "X Tokens (≈ $X USD)"
  const priceFmtTokens = `${Number(tokensForDisplay || 0)} Tokens (≈ $${Number(tokensForDisplay || 0)} USD)`;

  const progressPct = ((step + 1) / steps.length) * 100;

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setPriceInput('');
    setFreeCourse(false);
    setFormData((prev) => ({
      ...prev,
      title: '',
      description: '',
      level: 'Beginner',
      duration: '',
      prerequisites: '',
      syllabus: [],
    }));
    setStep(0);
  };

  // ---------- UI ----------
  return (
    <div
      className="min-h-[100dvh] bg-slate-50 dark:bg-[#0b121a]"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <SeoHead
        title="Create Course | DayBreak"
        description="Create a new course with AI-ready lessons and resources."
        canonicalPath={location.pathname}
        noindex
      />
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/60 dark:border-white/10 backdrop-blur bg-white/70 dark:bg-[#0b121a]/70">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
              {/* book icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M6 4h9a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H6v-1h10V7a1 1 0 0 0-1-1H6z"
                />
                <path
                  fill="currentColor"
                  d="M5 6h9a1 1 0 0 1 1 1v11H7a2 2 0 0 0-2 2z"
                  opacity=".3"
                />
              </svg>
            </span>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                Create a New Course
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Autosaves locally •{' '}
                <button
                  type="button"
                  onClick={clearDraft}
                  className="underline decoration-dotted hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Clear draft
                </button>
              </p>
            </div>
          </div>

          {/* Stepper summary */}
          <div className="hidden sm:flex items-center gap-3">
            {steps.map((label, idx) => {
              const active = idx === step;
              const done = idx < step;
              return (
                <div key={label} className="flex items-center">
                  <div
                    className={[
                      'h-8 w-8 rounded-full grid place-items-center text-sm font-semibold',
                      done
                        ? 'bg-green-600 text-white'
                        : active
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
                    ].join(' ')}
                    title={label}
                  >
                    {idx + 1}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="mx-2 h-[2px] w-8 rounded bg-slate-200 dark:bg-slate-700" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-slate-200/60 dark:bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* Card */}
          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1821] shadow-sm">
            <div className="p-5 sm:p-6">
              {/* Mobile step labels */}
              <div className="sm:hidden mb-4 text-sm font-medium text-slate-700 dark:text-slate-2 00">
                {steps[step]}
              </div>

              {/* Step 0: Basic Info */}
              {step === 0 && (
                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Course Title
                    </label>
                    <input
                      name="title"
                      placeholder="e.g., Calculus I: Limits to Derivatives"
                      value={formData.title}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Description
                    </label>
                    <textarea
                      name="description"
                      placeholder="What will learners achieve? Who is it for?"
                      value={formData.description ?? ''}
                      onChange={handleChange}
                      rows={5}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-y"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Level
                    </label>
                    <select
                      name="level"
                      value={formData.level}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                      <option>All Levels</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step 1: Details */}
              {step === 1 && (
                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Duration
                    </label>
                    <input
                      name="duration"
                      placeholder="e.g., 8 weeks"
                      value={formData.duration ?? ''}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tip: type <code>8 weeks</code>, <code>8weeks</code>, or <code>8w</code>. We’ll
                      size the syllabus automatically.
                    </p>
                  </div>

                  {/* Free course toggle */}
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-emerald-600"
                      checked={freeCourse}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setFreeCourse(next);
                        if (next) setPriceInput('');
                      }}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        This is a free course
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Learners will enroll at no cost. The price field will be disabled and saved
                        as <strong>0 Tokens</strong>.
                      </p>
                    </div>
                  </label>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Price (Tokens){' '}
                      {freeCourse && <span className="text-xs">(disabled for Free)</span>}
                    </label>
                    <input
                      name="price"
                      type="number"
                      min={0}
                      step={1}
                      placeholder={freeCourse ? 'Free course selected' : 'e.g., 5 (Tokens)'}
                      value={freeCourse ? '' : priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      disabled={freeCourse}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      1 Token = 1 USD (charged in tokens, shown here as whole numbers).
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Prerequisites (optional)
                    </label>
                    <textarea
                      name="prerequisites"
                      placeholder="e.g., Basic algebra, comfort with functions"
                      value={formData.prerequisites ?? ''}
                      onChange={handleChange}
                      rows={4}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-y"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Syllabus */}
              {step === 2 && (
                <div className="grid gap-4">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Syllabus for <strong>{parseWeeks(formData.duration ?? '')}</strong> week
                      {parseWeeks(formData.duration ?? '') === 1 ? '' : 's'} (auto-sized from
                      duration)
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {(formData.syllabus ?? []).map((item, index) => (
                      <details
                        key={index}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1821] [&_summary::-webkit-details-marker]:hidden"
                        open={index < 2}
                      >
                        <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600/10 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                              {item.week}
                            </span>
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {item.topic?.trim() ? item.topic : `Week ${item.week}`}
                            </span>
                          </div>
                          <svg
                            className="h-4 w-4 text-slate-500 transition group-open:rotate-180"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.23 7.21a.75.75 0 011.06.02L10 11.106l3.71-3.875a.75.75 0 111.08 1.04l-4.24 4.43a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </summary>

                        <div className="grid gap-3 px-4 pb-4">
                          <input
                            placeholder="Topic (e.g., Limits & Continuity)"
                            value={item.topic ?? ''}
                            onChange={(e) => handleSyllabusChange(index, 'topic', e.target.value)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          />

                          <textarea
                            placeholder="Notes/Assignment"
                            value={item.assignment ?? ''}
                            onChange={(e) =>
                              handleSyllabusChange(index, 'assignment', e.target.value)
                            }
                            rows={4}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-y"
                          />

                          <div className="grid gap-3 sm:grid-cols-2">
                            {/* Video URL / Upload */}
                            <div className="grid gap-2">
                              <input
                                placeholder="Optional: Video URL (YouTube/Vimeo/MP4)"
                                value={item.videoUrl ?? ''}
                                onChange={(e) =>
                                  handleSyllabusChange(index, 'videoUrl', e.target.value)
                                }
                                inputMode="url"
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                              />
                              <label className="block">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-600 dark:text-slate-300">
                                    Or upload video file
                                  </span>
                                  {(uploadPct[`v-${index}`] ?? 0) > 0 && (
                                    <span className="text-xs text-slate-500">
                                      Uploading… {Math.round(uploadPct[`v-${index}`])}%
                                    </span>
                                  )}
                                </div>
                                <input
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) =>
                                    handleVideoFileUpload(index, e.target.files?.[0] ?? null)
                                  }
                                  className="mt-1 w-full cursor-pointer rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-[#132133] px-3 py-2 text-slate-700 dark:text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-blue-700"
                                />
                                {item.videoUrl && item.videoUrl.length > 0 && (
                                  <a
                                    className="mt-1 inline-block text-xs text-blue-600 hover:underline break-all"
                                    href={item.videoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View uploaded video
                                  </a>
                                )}
                              </label>
                            </div>

                            {/* Notes URL / Upload */}
                            <div className="grid gap-2">
                              <input
                                placeholder="Optional: Notes URL (PDF/Doc)"
                                value={item.notesUrl ?? ''}
                                onChange={(e) =>
                                  handleSyllabusChange(index, 'notesUrl', e.target.value)
                                }
                                inputMode="url"
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 text-slate-900 dark:text-darkTextPrimary outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                              />
                              <label className="block">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-600 dark:text-slate-300">
                                    Or upload notes (PDF)
                                  </span>
                                  {(uploadPct[`n-${index}`] ?? 0) > 0 && (
                                    <span className="text-xs text-slate-500">
                                      Uploading… {Math.round(uploadPct[`n-${index}`])}%
                                    </span>
                                  )}
                                </div>
                                <input
                                  type="file"
                                  accept=".pdf"
                                  onChange={(e) =>
                                    handleNotesPdfUpload(index, e.target.files?.[0] ?? null)
                                  }
                                  className="mt-1 w-full cursor-pointer rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-[#132133] px-3 py-2 text-slate-700 dark:text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-indigo-700"
                                />
                                {item.notesUrl && item.notesUrl.length > 0 && (
                                  <a
                                    className="mt-1 inline-block text-xs text-blue-600 hover:underline break-all"
                                    href={item.notesUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View uploaded notes
                                  </a>
                                )}
                              </label>
                            </div>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {step === 3 &&
                (() => {
                  const cleanSyllabus = (formData.syllabus ?? [])
                    .filter(
                      (s) =>
                        (s.topic?.trim().length ?? 0) > 0 ||
                        (s.assignment?.trim().length ?? 0) > 0 ||
                        (s.videoUrl?.trim().length ?? 0) > 0 ||
                        (s.notesUrl?.trim().length ?? 0) > 0
                    )
                    .map((s, i) => ({ ...s, week: i + 1 }));

                  return (
                    <div className="grid gap-5">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-4">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Title</p>
                          <p className="font-semibold break-words text-slate-900 dark:text-white">
                            {formData.title || '—'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-4">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Level</p>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {formData.level}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-4">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Duration</p>
                          <p className="font-semibold break-words text-slate-900 dark:text-white">
                            {formData.duration || '—'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-4">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Price</p>
                          {freeCourse ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-600/10 text-emerald-700 dark:text-emerald-300">
                                Free
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                (saved as 0 Tokens)
                              </span>
                            </span>
                          ) : (
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {priceFmtTokens}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Prerequisites
                        </p>
                        <p className="whitespace-pre-wrap break-words text-slate-900 dark:text-white">
                          {formData.prerequisites || '—'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                          Syllabus ({cleanSyllabus.length} week
                          {cleanSyllabus.length === 1 ? '' : 's'})
                        </p>
                        {cleanSyllabus.length === 0 ? (
                          <p className="text-slate-700 dark:text-slate-300">—</p>
                        ) : (
                          <ol className="space-y-3 list-decimal pl-5">
                            {cleanSyllabus.map((w) => (
                              <li key={w.week} className="max-w-full">
                                <p className="font-medium break-words text-slate-900 dark:text-white">
                                  {w.topic || 'Untitled topic'}
                                </p>

                                {w.assignment && (
                                  <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                                    <span className="font-medium">Assignment:</span>{' '}
                                    <span className="break-all">{w.assignment}</span>
                                  </div>
                                )}

                                {w.videoUrl && (
                                  <div className="text-sm text-slate-700 dark:text-slate-300">
                                    <span className="font-medium">Video:</span>{' '}
                                    <span className="break-all">{w.videoUrl}</span>
                                  </div>
                                )}

                                {w.notesUrl && (
                                  <div className="text-sm text-slate-700 dark:text-slate-300">
                                    <span className="font-medium">Notes:</span>{' '}
                                    <span className="break-all">{w.notesUrl}</span>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  );
                })()}
            </div>

            {/* Global upload banner */}
            {fileUploading && (
              <div
                className="mx-5 mb-5 rounded-xl border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50 dark:bg-[#1b2a3a] p-3"
                aria-busy="true"
                aria-live="polite"
              >
                <p className="text-sm text-yellow-900 dark:text-yellow-100 mb-2">
                  Uploading files… {overallUploadPct}%
                </p>
                <div className="w-full h-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 ease-linear"
                    style={{ width: `${overallUploadPct}%` }}
                  />
                </div>
              </div>
            )}
          </section>

          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm px-1" role="alert">
              {String(error)}
            </p>
          )}
        </div>
      </main>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-30 border-t border-slate-200 dark:border-white/10 backdrop-blur bg-white/80 dark:bg-[#0b121a]/80">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Step {step + 1} of {steps.length} • {steps[step]}
          </div>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M12.78 4.22a.75.75 0 010 1.06L8.56 9.5l4.22 4.22a.75.75 1 11-1.06 1.06l-4.75-4.75a.75.75 0 010-1.06l4.75-4.75a.75.75 0 011.06 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Back
              </button>
            )}

            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => canNext && !fileUploading && setStep(step + 1)}
                disabled={!canNext || fileUploading}
                className={[
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-white shadow-sm',
                  canNext && !fileUploading
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-slate-400 cursor-not-allowed',
                ].join(' ')}
              >
                {fileUploading ? (
                  'Uploading…'
                ) : (
                  <>
                    Next
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M7.22 4.22a.75.75 0 011.06 0l4.75 4.75a.75.75 0 010 1.06l-4.75 4.75a.75.75 0 11-1.06-1.06l4.22-4.22-4.22-4.22a.75.75 0 010-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || fileUploading || !formData.tutorId}
                className={[
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-white shadow-sm',
                  loading || fileUploading || !formData.tutorId
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700',
                ].join(' ')}
              >
                {fileUploading ? 'Uploading…' : loading ? 'Saving…' : 'Create Course'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
