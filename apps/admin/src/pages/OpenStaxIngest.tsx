import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Loader2, CheckCircle2, RefreshCw, Trash2, Pencil } from 'lucide-react';
import { useShopContext } from '@myhandymanapp/shared/context/ShopContext';

type Result = { ok: boolean; collectionId: string; items: number; courseId: string };

type ExistingBook = {
  courseId: string;
  collectionId: string | null;
  title: string;
  subject: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
  items: number | null;
  bookUrl: string | null;
  licenseText: string | null;
  licenseUrl: string | null;
};

export default function OpenStaxIngest() {
  const { backendUrl, adminToken } = useShopContext();

  const [title, setTitle] = useState('');
  const [bookUrl, setBookUrl] = useState('');
  const [subject, setSubject] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [licenseText, setLicenseText] = useState('CC BY 4.0');
  const [licenseUrl, setLicenseUrl] = useState('https://creativecommons.org/licenses/by/4.0/');
  const [desc, setDesc] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  const [existingBooks, setExistingBooks] = useState<ExistingBook[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const isEditing = Boolean(editingCourseId);

  /* ───────────────────── helpers for OpenStax URL ───────────────────── */

  // Accept /books/<slug> OR /details/books/<slug>
  const validOpenStax = (u: string) => {
    const s = (u || '').trim();
    if (!/^https?:\/\/([^/]+\.)?openstax\.org\//i.test(s)) return false;
    try {
      const url = new URL(s);
      return /^\/(?:details\/)?books\/[^/?#]+/i.test(url.pathname);
    } catch {
      return false;
    }
  };

  function canonicalizeOpenStax(u: string) {
    try {
      const url = new URL(u.trim());
      const m = url.pathname.match(/^\/(?:details\/)?books\/([^/?#]+)/i);
      if (m) {
        url.pathname = `/details/books/${m[1]}`;
        url.search = '';
        url.hash = '';
        return url.toString();
      }
    } catch {}
    return u.trim();
  }

  /* ───────────────────── cover upload helper ───────────────────── */

  async function uploadCoverIfNeeded(): Promise<string | null> {
    if (!coverFile) {
      return thumbnail?.trim() || null; // fall back to manual URL
    }

    try {
      setCoverUploading(true);
      const formData = new FormData();
      formData.append('file', coverFile);

      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/oer/upload-cover`, {
        method: 'POST',
        headers: {
          // NOTE: do NOT set Content-Type here; browser sets multipart boundary
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => 'Failed to upload cover image');
        throw new Error(txt);
      }

      const data = await res.json();
      if (!data?.url) {
        throw new Error('Upload did not return a URL');
      }

      return data.url as string;
    } finally {
      setCoverUploading(false);
    }
  }

  /* ───────────────────── existing uploads list ───────────────────── */

  const loadExisting = useCallback(async () => {
    if (!backendUrl) return;
    setListLoading(true);
    try {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/oer/openstax`, {
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => 'Failed to load OpenStax uploads');
        throw new Error(txt);
      }

      const data = await res.json();
      const items = (data?.items || []) as ExistingBook[];
      setExistingBooks(items);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to load OpenStax uploads');
    } finally {
      setListLoading(false);
    }
  }, [backendUrl, adminToken]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  /* ───────────────────── form helpers ───────────────────── */

  function resetForm() {
    setTitle('');
    setBookUrl('');
    setSubject('');
    setThumbnail('');
    setDesc('');
    setCoverFile(null);
    setResult(null);
    setEditingCourseId(null);
  }

  function loadBookIntoForm(book: ExistingBook) {
    setEditingCourseId(book.courseId);
    setTitle(book.title || '');
    setSubject(book.subject || '');
    setDesc(book.description || '');
    setThumbnail(book.thumbnailUrl || '');
    setBookUrl(book.bookUrl || '');
    setLicenseText(book.licenseText || 'CC BY 4.0');
    setLicenseUrl(book.licenseUrl || 'https://creativecommons.org/licenses/by/4.0/');
    setResult({
      ok: true,
      collectionId: book.collectionId || '',
      courseId: book.courseId,
      items: book.items ?? 0,
    });
    toast.info('Loaded book into form. Update fields and click "Save changes".');
  }

  async function handleDelete(book: ExistingBook) {
    if (!backendUrl) return;
    const confirmed = window.confirm(
      `Delete "${book.title}" from your Ekazi uploads?\n\n` +
        'This does NOT touch the original OpenStax site, only your course + collection.'
    );
    if (!confirmed) return;

    try {
      setDeleteBusyId(book.courseId);
      const res = await fetch(
        `${backendUrl.replace(/\/$/, '')}/api/oer/openstax/${encodeURIComponent(book.courseId)}`,
        {
          method: 'DELETE',
          headers: {
            ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => 'Failed to delete OpenStax upload');
        throw new Error(txt);
      }

      toast.success('OpenStax upload deleted');
      setExistingBooks((prev) => prev.filter((x) => x.courseId !== book.courseId));

      if (editingCourseId === book.courseId) {
        resetForm();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to delete OpenStax upload');
    } finally {
      setDeleteBusyId(null);
    }
  }

  /* ───────────────────── submit (create or edit) ───────────────────── */

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!validOpenStax(bookUrl)) {
      const fixed = canonicalizeOpenStax(bookUrl);
      if (!validOpenStax(fixed)) {
        toast.error(
          'Paste a valid OpenStax book URL, e.g. https://openstax.org/details/books/<slug>'
        );
        return;
      }
      setBookUrl(fixed);
    }

    try {
      setLoading(true);
      const cleaned = canonicalizeOpenStax(bookUrl);

      // upload cover if file was chosen, else fall back to URL field
      const finalThumb = await uploadCoverIfNeeded();

      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/oer/ingest/openstax`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        },
        body: JSON.stringify({
          collection: {
            title: title.trim(),
            description: desc || '',
            subject: subject || null,
            thumbnail_url: finalThumb || null,
          },
          license: {
            text: licenseText || undefined,
            url: licenseUrl || undefined,
          },
          bookUrl: cleaned,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => 'Failed to ingest');
        throw new Error(txt);
      }
      const data = (await res.json()) as Result;
      setResult(data);

      if (isEditing) {
        toast.success(`Updated ✔  ${data.items} chapters`);
      } else {
        toast.success(`Ingested ✔  ${data.items} chapters`);
      }

      // refresh list so new/updated record appears
      loadExisting();
      // stay in edit mode but you can also reset if you prefer:
      // resetForm();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to ingest OpenStax book');
    } finally {
      setLoading(false);
    }
  }

  /* ───────────────────── render ───────────────────── */

  return (
    <div className="max-w-4xl pr-4 space-y-8">
      {/* Header + mode pill */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold mb-1">OpenStax Ingest</h1>
          <p className="text-sm text-mutedGray dark:text-darkTextSecondary">
            Paste an OpenStax “View Online” URL and a title. We’ll scrape the HTML table of contents
            (no PDFs), create a free OER course + collection, and auto-discover the cover if you
            leave it blank.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={[
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
              isEditing
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
            ].join(' ')}
          >
            <span className="mr-1 h-2 w-2 rounded-full bg-current" />
            {isEditing ? 'Editing existing OpenStax upload' : 'New OpenStax upload'}
          </span>
          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-mutedGray hover:text-gray-900 dark:hover:text-gray-100 underline"
            >
              Cancel edit &amp; start new
            </button>
          )}
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-gray-200/70 dark:border-darkCard bg-white/80 dark:bg-[#0b1220] p-5 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4">
          <label className="text-sm font-medium">
            Title <span className="text-red-500">*</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
              placeholder="Algebra and Trigonometry 2e"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            {isEditing && (
              <p className="mt-1 text-[11px] text-mutedGray dark:text-darkTextSecondary">
                Changing the title will create a <b>new</b> OpenStax upload; the old one will stay
                until you delete it.
              </p>
            )}
          </label>

          <label className="text-sm font-medium">
            OpenStax Book URL (“View Online”) <span className="text-red-500">*</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
              placeholder="https://openstax.org/details/books/algebra-and-trigonometry-2e"
              value={bookUrl}
              onChange={(e) => setBookUrl(e.target.value)}
              required
            />
            <small className="text-xs text-mutedGray dark:text-darkTextSecondary">
              Must match <code>openstax.org/details/books/&lt;slug&gt;</code>
            </small>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm font-medium">
              Subject (optional)
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
                placeholder="Math"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Cover URL (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
                  placeholder="Leave blank to auto-discover from OpenStax"
                  value={thumbnail}
                  onChange={(e) => setThumbnail(e.target.value)}
                />
              </label>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Or upload cover image (PNG/JPG)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setCoverFile(file);
                  }}
                  className="block w-full text-xs text-mutedGray dark:text-darkTextSecondary
                            file:mr-2 file:py-1 file:px-2
                            file:rounded-md file:border-0
                            file:text-xs file:font-semibold
                            file:bg-indigo-50 file:text-indigo-700
                            hover:file:bg-indigo-100"
                />
                {coverFile && (
                  <span className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                    Selected: {coverFile.name} ({Math.round(coverFile.size / 1024)} KB)
                  </span>
                )}
                {coverUploading && (
                  <span className="text-[11px] text-indigo-500">Uploading cover…</span>
                )}
              </div>
            </div>
          </div>

          <label className="text-sm font-medium">
            Description (optional)
            <textarea
              className="mt-1 min-h-[90px] w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
              placeholder="Short blurb for the course card"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm font-medium">
              License Text
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
                value={licenseText}
                onChange={(e) => setLicenseText(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              License URL
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
                value={licenseUrl}
                onChange={(e) => setLicenseUrl(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading
              ? isEditing
                ? 'Saving changes…'
                : 'Ingesting…'
              : isEditing
                ? 'Save changes'
                : 'Ingest OpenStax Book'}
          </button>
          <span className="text-xs text-mutedGray dark:text-darkTextSecondary">
            We’ll scrape the HTML ToC and keep your course in sync with this URL.
          </span>
        </div>
      </form>

      {/* Result panel */}
      {result && (
        <div className="rounded-xl border border-gray-200 dark:border-darkCard p-4 bg-white dark:bg-[#0f1821]">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium mb-2">
            <CheckCircle2 className="w-5 h-5" /> Ingest complete
          </div>
          <div className="text-sm grid gap-1">
            <div>
              <b>Chapters:</b> {result.items}
            </div>
            <div>
              <b>Collection ID:</b> {result.collectionId}
            </div>
            <div>
              <b>Course ID:</b> {result.courseId}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <a
              className="underline"
              href={`${backendUrl.replace(/\/$/, '')}/api/oer/courses/${encodeURIComponent(
                result.courseId
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              View Course JSON
            </a>
            <a
              className="underline"
              href={`${backendUrl.replace(/\/$/, '')}/api/oer/collections/${encodeURIComponent(
                result.collectionId
              )}/items`}
              target="_blank"
              rel="noreferrer"
            >
              View Items JSON
            </a>
          </div>
        </div>
      )}

      {/* Existing uploads list */}
      <section className="rounded-2xl border border-gray-200/70 dark:border-darkCard bg-white/80 dark:bg-[#0b1220] p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold">Your OpenStax uploads</h2>
            <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
              Quickly jump into an existing book to edit metadata or remove it.
            </p>
          </div>
          <button
            type="button"
            onClick={loadExisting}
            disabled={listLoading}
            className="inline-flex items-center gap-1 rounded-full border border-gray-300/70 dark:border-gray-700 px-3 py-1 text-xs text-mutedGray hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-60"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>

        {listLoading && (
          <div className="text-xs text-mutedGray dark:text-darkTextSecondary">
            Loading OpenStax uploads…
          </div>
        )}

        {!listLoading && existingBooks.length === 0 && (
          <div className="text-xs text-mutedGray dark:text-darkTextSecondary">
            No OpenStax uploads yet — ingest your first book above.
          </div>
        )}

        {!listLoading && existingBooks.length > 0 && (
          <ul className="mt-2 space-y-2">
            {existingBooks.map((b) => (
              <li
                key={b.courseId}
                className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/80 dark:bg-[#0f1821] px-3 py-2"
              >
                <div className="flex gap-3 min-w-0">
                  {b.thumbnailUrl && (
                    <img
                      src={b.thumbnailUrl}
                      alt={b.title}
                      className="h-10 w-8 rounded-md object-cover flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{b.title}</p>
                      {editingCourseId === b.courseId && (
                        <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 px-2 py-[2px] text-[10px]">
                          editing
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
                      {b.subject || 'Subject not set'} ·{' '}
                      {b.items != null ? `${b.items} chapters` : 'chapters unknown'}
                    </p>
                    {b.createdAt && (
                      <p className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                        Added {new Date(b.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 items-end">
                  <button
                    type="button"
                    onClick={() => loadBookIntoForm(b)}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-1 text-[11px] hover:opacity-90"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit in form
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(b)}
                    disabled={deleteBusyId === b.courseId}
                    className="inline-flex items-center gap-1 rounded-full border border-red-500/40 text-red-500 px-3 py-1 text-[11px] hover:bg-red-50/60 dark:hover:bg-red-500/10 disabled:opacity-60"
                  >
                    <Trash2 className="w-3 h-3" />
                    {deleteBusyId === b.courseId ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
