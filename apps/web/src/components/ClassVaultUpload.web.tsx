// apps/web/src/components/ClassVaultUpload.tsx
import React, { useState, ChangeEvent, FormEvent, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import { useShopContext } from '@mytutorapp/shared/context';
import { uploadClassVaultAsset, UploadResult } from '@mytutorapp/shared/api/classVaultUploadApi';
import useUploadClassVault, {
  CreateRecordedVideoPayload,
} from '@mytutorapp/shared/hooks/useUploadClassVault';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';

/* ───────────────────────── Minimal subjects (major categories) ───────────────────────── */
const SUBJECT_CATEGORIES = [
  'Mathematics',
  'Sciences',
  'Languages',
  'Arts',
  'Social Studies',
  'Technology & Computing',
  'Business & Economics',
  'Wellness & PE',
] as const;
type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

/* ───────────────────────── Local storage for country ───────────────────────── */
const COUNTRY_KEY = 'classvault:country';
function loadCountry(): string | null {
  try {
    return localStorage.getItem(COUNTRY_KEY) || null;
  } catch {
    return null;
  }
}
function saveCountry(c: string) {
  try {
    localStorage.setItem(COUNTRY_KEY, c);
  } catch {}
}

/* ───────────────────────── Small helpers ───────────────────────── */
const inputBase =
  'w-full p-3 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] text-[#0d141c] dark:text-darkTextPrimary';
const labelTone = 'text-base sm:text-lg text-[#49739c] dark:text-darkTextSecondary';
const subtleTone = 'text-sm text-[#49739c] dark:text-darkTextSecondary';
const headingTone = 'text-2xl font-bold text-center text-pink-600';
const toggleBtn = (active: boolean) =>
  `px-4 py-2 rounded focus:outline-none transition ring-1 ${
    active
      ? 'bg-pink-600 text-white ring-pink-500'
      : 'bg-[#e7edf4] text-[#49739c] dark:bg-[#172534] dark:text-darkTextSecondary ring-transparent hover:opacity-90'
  }`;

/** slugify for auto-tag from manual grade text (optional, simple) */
function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/* ───────────────────────── Component ───────────────────────── */
export default function ClassVaultUpload() {
  const navigate = useNavigate();
  const { role, backendUrl, token } = useShopContext();
  const { uploading: uploadingMeta, handleSubmitMetadata } = useUploadClassVault();

  // Country only (no region). Default to persisted choice if available.
  const [country, setCountry] = useState<string>(() => loadCountry() || '');

  // File-upload
  const [fileType, setFileType] = useState<'video' | 'pdf'>('video');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Metadata
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectCategory | ''>('');
  const [gradeLevel, setGradeLevel] = useState(''); // ← manual grade/level text
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [tags, setTags] = useState('');

  // Countries list from shared util (normalize keys safely)
  const countries = useMemo(
    () =>
      (Array.isArray(COUNTRIES) ? COUNTRIES : [])
        .map((c: any) => ({
          code: String(c.code || c.iso2 || c.alpha2 || c.id || '').toLowerCase(),
          label: String(c.name || c.label || c.country || c.title || ''),
        }))
        .filter((c) => c.code && c.label),
    []
  );

  // Persist country
  React.useEffect(() => {
    if (country) saveCountry(country);
  }, [country]);

  /* ── Upload handlers ── */
  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !backendUrl || !token) return;
    try {
      setProgress(0);
      setUploadedUrl('');
      setUploadingFile(true);
      const { url }: UploadResult = await uploadClassVaultAsset(
        backendUrl,
        token,
        file,
        fileType,
        (pct) => setProgress(pct)
      );
      setProgress(100);
      setUploadedUrl(url);
    } catch (err: any) {
      alert('Upload failed: ' + (err.message || err));
      setProgress(0);
      setUploadedUrl('');
    } finally {
      setUploadingFile(false);
    }
  };

  /* ── Auto-tags (no region; include simple grade tag from manual input) ── */
  function deriveAutoTags(): string[] {
    const t: string[] = [];
    if (country) t.push(`country:${country}`);
    if (subject) t.push(`subject:${subject}`);
    if (gradeLevel.trim()) {
      const g = slugify(gradeLevel);
      if (g) t.push(`grade:${g}`);
    }
    return t;
  }

  /* ── Submit ── */
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!country || !title || !subject || !gradeLevel.trim() || !price || !uploadedUrl) {
      alert('Please fill all required fields and select a file.');
      return;
    }

    const userTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const hidden = deriveAutoTags();
    const allTags = Array.from(new Set([...userTags, ...hidden]));

    const payload: CreateRecordedVideoPayload = {
      title,
      subject, // major category
      grade_level: gradeLevel, // manual human label
      price: Number(price),
      duration: duration ? Number(duration) : undefined,
      tags: allTags,
      video_url: fileType === 'video' ? uploadedUrl : '',
      pdf_url: fileType === 'pdf' ? uploadedUrl : '',
    };

    try {
      await handleSubmitMetadata(payload);
      alert('Success! Your content is now uploaded.');
      setProgress(0);
      setUploadedUrl('');
      navigate(-1);
    } catch (err: any) {
      alert('Submission failed: ' + (err.message || err));
    }
  };

  if (role === null) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-darkBg">
        <p className="text-[#49739c] dark:text-darkTextSecondary">Checking permissions…</p>
      </div>
    );
  }
  if (role !== 'tutor') {
    return (
      <div className="flex items-center justify-center h-64 p-4 bg-slate-50 dark:bg-darkBg">
        <p className="text-red-600 dark:text-red-400 text-center text-lg">
          Access Denied
          <br />
          Only tutors can upload content.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg py-10 sm:py-16 px-3 sm:px-4">
      <form
        onSubmit={onSubmit}
        className="relative max-w-2xl mx-auto p-4 sm:p-6 space-y-6 rounded-2xl border border-[#cedbe8]
                   dark:border-darkCard bg-white dark:bg-[#0f1821] shadow-sm
                   text-[#0d141c] dark:text-darkTextPrimary overflow-visible" /* ensure dropdown not clipped */
      >
        <h2 className={headingTone}>Upload To Earn!</h2>

        {/* Country */}
        <div>
          <label className={`${labelTone} block mb-1`}>Country *</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputBase}
            required
          >
            <option value="" disabled>
              Select your country…
            </option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <p className={`${subtleTone} mt-1`}>
            We’ll add <span className="text-pink-600">country:{country || '...'}</span> to your tags
            automatically.
          </p>
        </div>

        {/* Title */}
        <div>
          <label className={`${labelTone} block mb-1`}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputBase}
            placeholder="Enter class title"
            required
          />
        </div>

        {/* Subject (major category) */}
        <div>
          <label className={`${labelTone} block mb-1`}>Subject Category *</label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value as SubjectCategory)}
            className={inputBase}
            required
          >
            <option value="" disabled>
              Select category…
            </option>
            {SUBJECT_CATEGORIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className={`${subtleTone} mt-1`}>
            Keep it broad—specific topics can go in tags (e.g.,{' '}
            <span className="text-pink-600">algebra, optics, essay</span>).
          </p>
        </div>

        {/* Grade / Level (manual) */}
        <div>
          <label className={`${labelTone} block mb-1`}>Grade / Level *</label>
          <input
            type="text"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className={inputBase}
            placeholder="e.g., Primary 5, Junior Secondary 2, Year 10, A-Levels, University"
            required
          />
          <p className={`${subtleTone} mt-1`}>
            We’ll add a tag like{' '}
            <span className="text-pink-600">grade:{slugify(gradeLevel) || '...'}</span>.
          </p>
        </div>

        {/* Price */}
        <div>
          <label className={`${labelTone} block mb-1`}>Price in Tokens (1 Token = $1) *</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputBase}
            placeholder="e.g. 5"
            min={1}
            required
          />
        </div>

        {/* Duration */}
        <div>
          <label className={`${labelTone} block mb-1`}>Duration (mins)</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={inputBase}
            placeholder="Optional"
            min={0}
          />
        </div>

        {/* Tags (free text) */}
        <div>
          <label className={`${labelTone} block mb-1`}>Tags</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className={inputBase}
            placeholder="comma-separated keywords (e.g., algebra, photosynthesis, essay)"
          />
          <p className={`${subtleTone} mt-1`}>
            We’ll auto-add: <span className="text-pink-600">country:{country || '...'}</span>
            {subject && (
              <>
                {' '}
                , <span className="text-pink-600">subject:{subject}</span>
              </>
            )}
            {gradeLevel.trim() && (
              <>
                {' '}
                , <span className="text-pink-600">grade:{slugify(gradeLevel)}</span>
              </>
            )}
          </p>
        </div>

        {/* File Type Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setFileType('video');
              setUploadedUrl('');
              setProgress(0);
            }}
            className={toggleBtn(fileType === 'video')}
          >
            Video
          </button>
          <span className="text-[#49739c] dark:text-darkTextSecondary font-medium">or</span>
          <button
            type="button"
            onClick={() => {
              setFileType('pdf');
              setUploadedUrl('');
              setProgress(0);
            }}
            className={toggleBtn(fileType === 'pdf')}
          >
            Class Notes
          </button>
        </div>

        {/* File Picker */}
        <div>
          <label className={`${labelTone} block mb-1`}>
            {uploadingFile
              ? 'Uploading…'
              : uploadedUrl
                ? `✅ ${fileType === 'video' ? 'Video uploaded' : 'PDF selected'}`
                : `Select ${fileType === 'video' ? 'Video' : 'PDF'} *`}
          </label>

          <div className="flex items-center mb-2">
            <FontAwesomeIcon
              icon={faCloudUploadAlt as IconProp}
              className="mr-2 text-[#49739c] dark:text-darkTextSecondary"
            />
            <input
              type="file"
              accept={fileType === 'video' ? 'video/*' : 'application/pdf'}
              onChange={onFileChange}
              disabled={uploadingFile}
              className="focus:outline-none text-[#0d141c] dark:text-darkTextPrimary"
              required={!uploadedUrl}
            />
          </div>

          {/* Progress Bar */}
          {uploadingFile && (
            <div className="space-y-1">
              <div className="w-full h-2 rounded overflow-hidden bg-[#e7edf4] dark:bg-[#172534]">
                <div
                  className="h-full bg-pink-600 transition-all duration-300 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-right text-sm text-[#49739c] dark:text-darkTextSecondary">
                {progress}%
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={uploadingMeta}
          className="w-full py-3 rounded-lg text-white bg-[#3d99f5] hover:brightness-110 transition disabled:opacity-50"
        >
          {uploadingMeta ? 'Submitting…' : 'Submit ClassVault'}
        </button>

        {/* Dev-only: Auto-tags preview */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="text-xs text-[#49739c] dark:text-darkTextSecondary pt-2">
            <strong>Auto-tags preview:</strong>{' '}
            {[
              ...new Set([
                ...deriveAutoTags(),
                ...tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              ]),
            ].join(', ') || '(none)'}
          </div>
        )}
      </form>
    </div>
  );
}
