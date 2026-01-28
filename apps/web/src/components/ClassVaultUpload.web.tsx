// apps/web/src/components/ClassVaultUpload.web.tsx
import React, { useEffect, useMemo, useState, ChangeEvent, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';

import { useShopContext } from '@mytutorapp/shared/context';
import {
  uploadClassVaultAsset,
  type UploadResult,
} from '@mytutorapp/shared/api/classVaultUploadApi';
import useUploadClassVault, {
  type CreateRecordedVideoPayload,
} from '@mytutorapp/shared/hooks/useUploadClassVault';
import { useClassVault } from '@mytutorapp/shared/hooks/useClassVault';
import type { RecordedVideo } from '@mytutorapp/shared/types';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';
import SeoHead from './seo/SeoHead';

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

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
const norm = (s?: string) => (s || '').toLowerCase().trim();

function findTagValue(tags: unknown, key: string): string | null {
  if (!Array.isArray(tags)) return null;
  const want = norm(key);
  for (const t of tags) {
    const s = String(t || '');
    const [k, ...rest] = s.split(':');
    if (norm(k) === want) return rest.join(':').trim() || null;
  }
  return null;
}

/** Remove auto-tag keys so we can replace them cleanly */
function stripAutoTags(userTags: string[]) {
  const bannedKeys = new Set(['country', 'subject', 'grade']);
  return userTags.filter((t) => {
    const [k] = String(t || '').split(':');
    return !bannedKeys.has(norm(k));
  });
}

/* ───────────────────────── Component ───────────────────────── */
export default function ClassVaultUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role, backendUrl, token } = useShopContext();

  // Shared hooks
  const { uploading: uploadingMeta, handleSubmitMetadata } = useUploadClassVault();
  const { videos, loading: libraryLoading, error: libraryError, update } = useClassVault();

  // ----- edit mode params -----
  const editId = useMemo(() => {
    const raw = searchParams.get('edit');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  const kind = useMemo(() => {
    const k = (searchParams.get('kind') || '').toLowerCase().trim();
    if (k === 'video' || k === 'videos') return 'video' as const;
    if (k === 'note' || k === 'notes' || k === 'pdf') return 'pdf' as const;
    return null;
  }, [searchParams]);

  const returnTo = useMemo(() => searchParams.get('returnTo') || '', [searchParams]);
  const isEdit = Boolean(editId);

  const editItem = useMemo<RecordedVideo | null>(() => {
    if (!isEdit || !editId) return null;
    return (videos || []).find((v) => Number(v.id) === Number(editId)) ?? null;
  }, [videos, isEdit, editId]);

  // Country only (no region). Default to persisted choice if available.
  const [country, setCountry] = useState<string>(() => loadCountry() || '');

  // File-upload (main asset: video/pdf)
  const [fileType, setFileType] = useState<'video' | 'pdf'>('video');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0); // allows reset input

  // ✅ track selected names so UI can truncate instead of overflowing
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedThumbName, setSelectedThumbName] = useState('');

  // ✅ Thumbnail upload (required for pdf notes)
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbProgress, setThumbProgress] = useState(0);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [thumbInputKey, setThumbInputKey] = useState(0);
  const [replacingFile, setReplacingFile] = useState(false);

  // Metadata
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectCategory | ''>('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [tags, setTags] = useState('');

  const [prefilled, setPrefilled] = useState(false);

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
  useEffect(() => {
    if (country) saveCountry(country);
  }, [country]);

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

  // Prefill edit form from library item (no extra fetch, hook-only)
  useEffect(() => {
    if (!isEdit || !editItem || prefilled) return;

    const itemTitle = String(editItem.title ?? '');
    const itemSubject = String(editItem.subject ?? '');
    const itemGrade = String(editItem.grade_level ?? '');
    const itemPrice = editItem.price != null ? String(editItem.price) : '';
    const itemDuration = editItem.duration != null ? String(editItem.duration) : '';
    const itemTagsArr = Array.isArray(editItem.tags) ? editItem.tags : [];
    const itemTagsStr = itemTagsArr.map((t: any) => String(t)).join(', ');

    // country from tag country:xx
    const tagCountry = findTagValue(itemTagsArr, 'country');
    const resolvedCountry = (tagCountry && tagCountry.toLowerCase()) || '';

    // infer file type + url
    const videoUrl = String((editItem as any).video_url ?? '');
    const pdfUrl = String((editItem as any).pdf_url ?? '');

    const inferredType: 'video' | 'pdf' = pdfUrl
      ? 'pdf'
      : videoUrl
      ? 'video'
      : kind === 'pdf'
      ? 'pdf'
      : 'video';

    const inferredUrl = inferredType === 'pdf' ? pdfUrl : videoUrl;

    setTitle(itemTitle);

    const asCat = SUBJECT_CATEGORIES.includes(itemSubject as any)
      ? (itemSubject as SubjectCategory)
      : '';
    setSubject(asCat);

    setGradeLevel(itemGrade);
    setPrice(itemPrice);
    setDuration(itemDuration);
    setTags(itemTagsStr);

    setFileType(inferredType);
    setUploadedUrl(inferredUrl);
    setProgress(inferredUrl ? 100 : 0);

    // ✅ thumbnail prefill
    const turl = String((editItem as any).thumbnail_url ?? '');
    setThumbnailUrl(turl);
    setThumbProgress(turl ? 100 : 0);

    if (resolvedCountry) setCountry(resolvedCountry);

    // ✅ keep selected name labels clean in edit mode (optional)
    setSelectedFileName('');
    setSelectedThumbName('');

    setPrefilled(true);
  }, [isEdit, editItem, kind, prefilled]);

  /* ── Upload handlers ── */
  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !backendUrl || !token) return;

    // ✅ Store name so we can display a truncated label (prevents overflow)
    setSelectedFileName(file.name);

    try {
      setProgress(0);
      setUploadedUrl('');
      setUploadingFile(true);

      const { url }: UploadResult = await uploadClassVaultAsset(
        backendUrl,
        token,
        file,
        fileType, // 'video' | 'pdf'
        (pct) => setProgress(pct)
      );

      setProgress(100);
      setUploadedUrl(url);

      // ✅ user has now selected a replacement file successfully
      setReplacingFile(false);
    } catch (err: any) {
      alert('Upload failed: ' + (err?.message || err));
      setProgress(0);
      setUploadedUrl('');
      // keep selectedFileName; user may want to retry
    } finally {
      setUploadingFile(false);
    }
  };

  const onThumbChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !backendUrl || !token) return;

    // ✅ Store name so we can display a truncated label (prevents overflow)
    setSelectedThumbName(file.name);

    try {
      setThumbProgress(0);
      setThumbnailUrl('');
      setUploadingThumb(true);

      // ✅ Upload as "thumbnail"
      const { url }: UploadResult = await uploadClassVaultAsset(
        backendUrl,
        token,
        file,
        'thumbnail' as any,
        (pct) => setThumbProgress(pct)
      );

      setThumbProgress(100);
      setThumbnailUrl(url);
    } catch (err: any) {
      alert('Thumbnail upload failed: ' + (err?.message || err));
      setThumbProgress(0);
      setThumbnailUrl('');
      // keep selectedThumbName; user may want to retry
    } finally {
      setUploadingThumb(false);
    }
  };

  const goBack = () => {
    if (returnTo) navigate(returnTo);
    else navigate(-1);
  };

  const replaceFile = () => {
    setReplacingFile(true);
    setUploadedUrl('');
    setProgress(0);
    setSelectedFileName('');
    setFileInputKey((k) => k + 1);
  };

  const replaceThumb = () => {
    setThumbnailUrl('');
    setThumbProgress(0);
    setSelectedThumbName('');
    setThumbInputKey((k) => k + 1);
  };

  /* ── Submit ── */
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!country || !title || !subject || !gradeLevel.trim() || !price) {
      alert('Please fill all required fields.');
      return;
    }

    // In edit mode, allow submit without a new upload IF the item already has a main file
    // In edit mode, only require a file if user explicitly clicked "Replace file"
    if (!uploadedUrl) {
      if (!isEdit || replacingFile) {
        alert('Please select a file (or keep the existing one).');
        return;
      }
      // ✅ edit mode + not replacingFile => allow saving thumbnail/metadata only
    }

    // ✅ For Notes/PDF, thumbnail is required
    if (fileType === 'pdf' && !thumbnailUrl) {
      alert('Please upload a thumbnail image for your Notes (required).');
      return;
    }

    // Tags:
    const userTagsRaw = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const userTagsClean = stripAutoTags(userTagsRaw);
    const auto = deriveAutoTags();
    const allTags = Array.from(new Set([...userTagsClean, ...auto]));

    // Build a PATCH for update mode
    if (isEdit && editId) {
      const patch: Partial<CreateRecordedVideoPayload & { thumbnail_url?: string }> = {
        title,
        subject,
        grade_level: gradeLevel,
        price: Number(price),
        duration: duration ? Number(duration) : undefined,
        tags: allTags,
      };

      // ✅ Ensure backend always gets either video_url or pdf_url in edit mode
      const existingVideoUrl = String((editItem as any)?.video_url ?? '');
      const existingPdfUrl = String((editItem as any)?.pdf_url ?? '');

      if (fileType === 'video') {
        if (uploadedUrl) (patch as any).video_url = uploadedUrl;
        else if (existingVideoUrl) (patch as any).video_url = existingVideoUrl;
      }

      if (fileType === 'pdf') {
        if (uploadedUrl) (patch as any).pdf_url = uploadedUrl;
        else if (existingPdfUrl) (patch as any).pdf_url = existingPdfUrl;
      }

      // ✅ Always send thumbnail if present (especially for pdf notes)
      if (thumbnailUrl) (patch as any).thumbnail_url = thumbnailUrl;

      try {
        await update(Number(editId), patch as any);
        alert('Saved! Your changes were updated.');
        goBack();
      } catch (err: any) {
        alert('Update failed: ' + (err?.message || err));
      }
      return;
    }

    // Create mode: send full payload
    const payload: CreateRecordedVideoPayload & { thumbnail_url?: string } = {
      title,
      subject,
      grade_level: gradeLevel,
      price: Number(price),
      duration: duration ? Number(duration) : undefined,
      tags: allTags,
      video_url: fileType === 'video' ? uploadedUrl : '',
      pdf_url: fileType === 'pdf' ? uploadedUrl : '',
      // ✅ include thumbnail_url (required for pdf notes, optional for video)
      thumbnail_url: thumbnailUrl || undefined,
    };

    try {
      await handleSubmitMetadata(payload as any);
      alert('Success! Your content is now uploaded.');
      goBack();
    } catch (err: any) {
      alert('Submission failed: ' + (err?.message || err));
    }
  };

  // Permissions
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

  // Edit: wait for library
  const showEditLoading = isEdit && (libraryLoading || (!editItem && !libraryError));
  const showEditMissing = isEdit && !libraryLoading && !editItem;

  const submitLabel = isEdit ? 'Save Changes' : 'Submit ClassVault';
  const headerLabel = isEdit ? 'Edit ClassVault Item' : 'Upload To Earn!';

  const requiresThumb = fileType === 'pdf';
  const disableSubmit =
    uploadingMeta || uploadingFile || uploadingThumb || showEditLoading || showEditMissing;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg py-10 sm:py-16 px-3 sm:px-4">
      <SeoHead
        title="ClassVault Upload | DayBreak"
        description="Upload videos and notes to your ClassVault."
        canonicalPath="/class-vault/upload"
        noindex
      />
      <form
        onSubmit={onSubmit}
        className="relative max-w-2xl mx-auto p-4 sm:p-6 space-y-6 rounded-2xl border border-[#cedbe8]
                   dark:border-darkCard bg-white dark:bg-[#0f1821] shadow-sm
                   text-[#0d141c] dark:text-darkTextPrimary overflow-x-hidden"
      >
        <h1 className={headingTone}>{headerLabel}</h1>

        {isEdit && (
          <div className="rounded-xl bg-[#f0f7ff] dark:bg-[#0b2238] ring-1 ring-[#cedbe8] dark:ring-darkCard p-3">
            <p className="text-sm text-[#0d141c] dark:text-darkTextPrimary">
              Editing item <span className="font-semibold">#{editId}</span>
              {kind ? (
                <>
                  {' '}
                  • <span className="font-semibold">{kind === 'pdf' ? 'Class Notes' : 'Video'}</span>
                </>
              ) : null}
            </p>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl h-9 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
              >
                Back
              </button>

              <button
                type="button"
                onClick={replaceFile}
                className="rounded-xl h-9 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
              >
                Replace file
              </button>

              <button
                type="button"
                onClick={replaceThumb}
                className="rounded-xl h-9 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
              >
                Replace thumbnail
              </button>
            </div>
          </div>
        )}

        {showEditLoading && (
          <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">Loading item…</p>
        )}
        {libraryError && <p className="text-sm text-red-600 dark:text-red-400">{String(libraryError)}</p>}
        {showEditMissing && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not find that ClassVault item. It may have been deleted.
          </p>
        )}

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

        {/* Subject */}
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

        {/* Grade / Level */}
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

        {/* Tags */}
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
          <button type="button" onClick={() => setFileType('video')} className={toggleBtn(fileType === 'video')}>
            Video
          </button>
          <span className="text-[#49739c] dark:text-darkTextSecondary font-medium">or</span>
          <button type="button" onClick={() => setFileType('pdf')} className={toggleBtn(fileType === 'pdf')}>
            Class Notes
          </button>
        </div>

        {/* Current file display */}
        {uploadedUrl && (
          <div className="rounded-xl bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard p-3">
            <p className="text-sm font-semibold">Current file</p>
            <p className="text-xs text-[#49739c] dark:text-darkTextSecondary break-words overflow-hidden mt-1">
              {uploadedUrl}
            </p>
          </div>
        )}

        {/* File Picker */}
        <div>
          <label className={`${labelTone} block mb-1`}>
            {uploadingFile
              ? 'Uploading…'
              : uploadedUrl
              ? `✅ ${fileType === 'video' ? 'Video selected' : 'PDF selected'}`
              : `Select ${fileType === 'video' ? 'Video' : 'PDF'} *`}
          </label>

          <div className="flex items-center gap-2">
            <FontAwesomeIcon
              icon={faCloudUploadAlt as IconProp}
              className="shrink-0 text-[#49739c] dark:text-darkTextSecondary"
            />

            {/* ✅ wrapper prevents long filename overflow */}
            <div className="min-w-0 flex-1">
              <input
                key={fileInputKey}
                type="file"
                accept={fileType === 'video' ? 'video/*' : 'application/pdf'}
                onChange={onFileChange}
                disabled={uploadingFile}
                className="block w-full max-w-full text-sm text-[#0d141c] dark:text-darkTextPrimary
                           file:mr-3 file:rounded-lg file:border-0 file:bg-[#e7edf4] file:px-4 file:py-2
                           file:text-sm file:font-semibold file:text-[#0d141c]
                           dark:file:bg-[#172534] dark:file:text-darkTextPrimary
                           focus:outline-none"
                required={!uploadedUrl && (!isEdit || replacingFile)}
              />

              {selectedFileName ? (
                <p className="mt-1 text-xs text-[#49739c] dark:text-darkTextSecondary min-w-0 truncate">
                  Selected: <span className="font-semibold">{selectedFileName}</span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Progress Bar */}
          {uploadingFile && (
            <div className="space-y-1 mt-2">
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

        {/* ✅ Thumbnail upload (required for Notes/PDF) */}
        <div className="rounded-2xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Thumbnail image{requiresThumb ? ' *' : ''}</p>
              <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                This thumbnail is shown publicly in Explore / marketplace.
                {requiresThumb ? ' Required for Notes because PDFs are gated.' : ' Optional but recommended.'}
              </p>
            </div>
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt="Thumbnail"
                className="w-20 h-14 object-cover rounded-lg ring-1 ring-[#cedbe8] dark:ring-darkCard"
              />
            ) : null}
          </div>

          {thumbnailUrl && (
            <div className="mt-3 rounded-xl bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard p-3">
              <p className="text-sm font-semibold">Current thumbnail</p>
              <p className="text-xs text-[#49739c] dark:text-darkTextSecondary break-words overflow-hidden mt-1">
                {thumbnailUrl}
              </p>
            </div>
          )}

          <div className="mt-3">
            <label className={`${labelTone} block mb-1`}>
              {uploadingThumb
                ? 'Uploading thumbnail…'
                : thumbnailUrl
                ? '✅ Thumbnail uploaded'
                : requiresThumb
                ? 'Upload thumbnail image *'
                : 'Upload thumbnail image'}
            </label>

            <div className="flex items-center gap-2 mb-2">
              <FontAwesomeIcon
                icon={faCloudUploadAlt as IconProp}
                className="shrink-0 text-[#49739c] dark:text-darkTextSecondary"
              />

              {/* ✅ wrapper prevents long filename overflow */}
              <div className="min-w-0 flex-1">
                <input
                  key={thumbInputKey}
                  type="file"
                  accept="image/*"
                  onChange={onThumbChange}
                  disabled={uploadingThumb}
                  className="block w-full max-w-full text-sm text-[#0d141c] dark:text-darkTextPrimary
                             file:mr-3 file:rounded-lg file:border-0 file:bg-[#e7edf4] file:px-4 file:py-2
                             file:text-sm file:font-semibold file:text-[#0d141c]
                             dark:file:bg-[#172534] dark:file:text-darkTextPrimary
                             focus:outline-none"
                  required={requiresThumb && !thumbnailUrl}
                />

                {selectedThumbName ? (
                  <p className="mt-1 text-xs text-[#49739c] dark:text-darkTextSecondary min-w-0 truncate">
                    Selected: <span className="font-semibold">{selectedThumbName}</span>
                  </p>
                ) : null}
              </div>
            </div>

            {uploadingThumb && (
              <div className="space-y-1">
                <div className="w-full h-2 rounded overflow-hidden bg-[#e7edf4] dark:bg-[#172534]">
                  <div
                    className="h-full bg-pink-600 transition-all duration-300 ease-linear"
                    style={{ width: `${thumbProgress}%` }}
                  />
                </div>
                <div className="text-right text-sm text-[#49739c] dark:text-darkTextSecondary">
                  {thumbProgress}%
                </div>
              </div>
            )}

            {requiresThumb && !thumbnailUrl ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                Notes require a thumbnail so learners can preview the card without accessing the gated PDF.
              </p>
            ) : null}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={disableSubmit}
          className="w-full py-3 rounded-lg text-white bg-[#3d99f5] hover:brightness-110 transition disabled:opacity-50"
        >
          {uploadingMeta ? 'Submitting…' : submitLabel}
        </button>

        {/* Dev-only: Auto-tags preview */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="text-xs text-[#49739c] dark:text-darkTextSecondary pt-2">
            <strong>Auto-tags preview:</strong>{' '}
            {[
              ...new Set([
                ...deriveAutoTags(),
                ...stripAutoTags(
                  tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                ),
              ]),
            ].join(', ') || '(none)'}
          </div>
        )}
      </form>
    </div>
  );
}
