// apps/web/src/admin/YouTubeIngest.tsx (path as in your project)

import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { toast } from 'react-toastify';
import {
  Loader2,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Pencil,
} from 'lucide-react';
import { useShopContext } from '@mytutorapp/shared/context/ShopContext';

type Result = { ok: boolean; collectionId: string; items: number };

type ExistingCollection = {
  collectionId: string;
  title: string;
  subject: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
  items: number | null;
};

function splitUrls(input: string): string[] {
  return String(input || '')
    .split(/[\n,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function YouTubeIngest() {
  const { backendUrl, adminToken } = useShopContext();

  const [title, setTitle] = useState('');
  const [urlsText, setUrlsText] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [desc, setDesc] = useState('');
  const [slugPrefix, setSlugPrefix] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const [existingCollections, setExistingCollections] = useState<ExistingCollection[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);

  const isEditing = Boolean(editingCollectionId);

  const urlCount = useMemo(() => splitUrls(urlsText).length, [urlsText]);

    /* ───────────────────── load existing collections ───────────────────── */

  const loadExisting = useCallback(async () => {
    if (!backendUrl) return;
    setListLoading(true);
    try {
      const res = await fetch(
        `${backendUrl.replace(/\/$/, '')}/api/oer/youtube`,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => 'Failed to load YouTube collections');
        throw new Error(txt);
      }

      const data = await res.json();
      const items = (data?.items || []) as ExistingCollection[];
      setExistingCollections(items);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to load YouTube collections');
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
    setUrlsText('');
    setSubject('');
    setGrade('');
    setThumbnail('');
    setDesc('');
    setSlugPrefix('');
    setResult(null);
    setEditingCollectionId(null);
  }

  function loadCollectionIntoForm(coll: ExistingCollection) {
    setEditingCollectionId(coll.collectionId);
    setTitle(coll.title || '');
    setSubject(coll.subject || '');
    setDesc(coll.description || '');
    setThumbnail(coll.thumbnailUrl || '');
    // We don't know the original URLs; admin can paste new ones to add/update
    setUrlsText('');
    setResult({
      ok: true,
      collectionId: coll.collectionId,
      items: coll.items ?? 0,
    });

    toast.info('Loaded collection into form. Update metadata or paste new videos, then save.');
  }

  async function handleDelete(coll: ExistingCollection) {
    if (!backendUrl) return;

    const confirmed = window.confirm(
      `Delete "${coll.title}" YouTube collection from your DayBreak catalog?\n\n` +
        'This does NOT delete the actual YouTube videos; only your local collection + links.'
    );
    if (!confirmed) return;

    try {
      setDeleteBusyId(coll.collectionId);
      const res = await fetch(
        `${backendUrl.replace(/\/$/, '')}/api/oer/youtube/${encodeURIComponent(
          coll.collectionId
        )}`,
        {
          method: 'DELETE',
          headers: {
            ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => 'Failed to delete YouTube collection');
        throw new Error(txt);
      }

      toast.success('YouTube collection deleted');
      setExistingCollections((prev) =>
        prev.filter((x) => x.collectionId !== coll.collectionId)
      );

      if (editingCollectionId === coll.collectionId) {
        resetForm();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to delete YouTube collection');
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

    const urls = splitUrls(urlsText);
    if (urls.length === 0) {
      toast.error('Paste at least one YouTube URL or ID');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(
        `${backendUrl.replace(/\/$/, '')}/api/oer/ingest/youtube`,
        {
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
              thumbnail_url: thumbnail || null,
            },
            grade_level: grade || null,
            urls,
            slug_prefix: slugPrefix || undefined,
          }),
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => 'Failed to ingest');
        throw new Error(txt);
      }

      const data = (await res.json()) as Result;
      setResult(data);

      toast.success(
        `${isEditing ? 'Updated' : 'Ingested'} ✔  ${data.items} video${
          data.items === 1 ? '' : 's'
        }`
      );

      // Refresh the side list so this collection shows latest metadata
      loadExisting();
      // You can keep editing mode or reset; keeping it feels similar to OpenStax
      // resetForm();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to ingest YouTube videos');
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
          <h1 className="text-2xl font-semibold mb-1">YouTube Ingest</h1>
          <p className="text-sm text-mutedGray dark:text-darkTextSecondary">
            Paste YouTube URLs or IDs (comma / newline separated). We’ll create or update a
            collection and upsert each video into your OER catalog.
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
            {isEditing ? 'Editing existing YouTube collection' : 'New YouTube collection'}
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

      {/* Form card */}
      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-gray-200/70 dark:border-darkCard bg-white/80 dark:bg-[#0b1220] p-5 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4">
          <label className="text-sm font-medium">
            Collection Title <span className="text-red-500">*</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
              placeholder="Middle school physics"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            {isEditing && (
              <p className="mt-1 text-[11px] text-mutedGray dark:text-darkTextSecondary">
                Changing the title may create a <b>new</b> collection; the old one will remain
                until you delete it.
              </p>
            )}
          </label>

          <label className="text-sm font-medium">
            YouTube URLs or IDs (comma/newline separated) <span className="text-red-500">*</span>
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
              placeholder="https://www.youtube.com/watch?v=79FTQY9LoQU, https://youtu.be/W6Ar0ls6tVA, nIGEp5x0Ab4"
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              required
            />
            <small className="text-xs text-mutedGray dark:text-darkTextSecondary">
              Detected: <b>{urlCount}</b> item{urlCount === 1 ? '' : 's'}
            </small>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm font-medium">
              Subject (optional)
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
                placeholder="Science"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>

            <label className="text-sm font-medium">
              Grade level (optional)
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
                placeholder="Middle school"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm font-medium">
              Collection Cover URL (optional)
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
                placeholder="Optional cover for the collection card"
                value={thumbnail}
                onChange={(e) => setThumbnail(e.target.value)}
              />
            </label>

            <label className="text-sm font-medium">
              Slug prefix (optional)
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
                placeholder="Defaults from title (e.g., 'msp')"
                value={slugPrefix}
                onChange={(e) => setSlugPrefix(e.target.value)}
              />
              <small className="text-xs text-mutedGray dark:text-darkTextSecondary">
                Final slug format: <code>yt-&lt;prefix&gt;-&lt;videoId&gt;</code> (if used).
              </small>
            </label>
          </div>

          <label className="text-sm font-medium">
            Description (optional)
            <textarea
              className="mt-1 min-h-[90px] w-full rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none"
              placeholder="Short blurb for the collection"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>
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
              : 'Ingest YouTube Videos'}
          </button>
          <span className="text-xs text-mutedGray dark:text-darkTextSecondary">
            We’ll upsert into <code>third_party_catalog</code> and link everything under this
            collection.
          </span>
        </div>
      </form>

      {/* Result card */}
      {result && (
        <div className="rounded-xl border border-gray-200 dark:border-darkCard p-4 bg-white dark:bg-[#0f1821]">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium mb-2">
            <CheckCircle2 className="w-5 h-5" /> Ingest complete
          </div>
          <div className="text-sm grid gap-1">
            <div>
              <b>Videos added/updated:</b> {result.items}
            </div>
            <div>
              <b>Collection ID:</b> {result.collectionId}
            </div>
          </div>
        </div>
      )}

      {/* Existing collections list */}
      <section className="rounded-2xl border border-gray-200/70 dark:border-darkCard bg-white/80 dark:bg-[#0b1220] p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold">Your YouTube collections</h2>
            <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
              Quickly open an existing collection to tweak metadata or remove it.
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
            Loading YouTube collections…
          </div>
        )}

        {!listLoading && existingCollections.length === 0 && (
          <div className="text-xs text-mutedGray dark:text-darkTextSecondary">
            No YouTube collections yet — ingest your first one above.
          </div>
        )}

        {!listLoading && existingCollections.length > 0 && (
          <ul className="mt-2 space-y-2">
            {existingCollections.map((c) => (
              <li
                key={c.collectionId}
                className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/80 dark:bg-[#0f1821] px-3 py-2"
              >
                <div className="flex gap-3 min-w-0">
                  {c.thumbnailUrl && (
                    <img
                      src={c.thumbnailUrl}
                      alt={c.title}
                      className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      {editingCollectionId === c.collectionId && (
                        <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 px-2 py-[2px] text-[10px]">
                          editing
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
                      {c.subject || 'Subject not set'} ·{' '}
                      {c.items != null ? `${c.items} video${c.items === 1 ? '' : 's'}` : 'count unknown'}
                    </p>
                    {c.createdAt && (
                      <p className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                        Added {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 items-end">
                  <button
                    type="button"
                    onClick={() => loadCollectionIntoForm(c)}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-1 text-[11px] hover:opacity-90"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit in form
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    disabled={deleteBusyId === c.collectionId}
                    className="inline-flex items-center gap-1 rounded-full border border-red-500/40 text-red-500 px-3 py-1 text-[11px] hover:bg-red-50/60 dark:hover:bg-red-500/10 disabled:opacity-60"
                  >
                    <Trash2 className="w-3 h-3" />
                    {deleteBusyId === c.collectionId ? 'Deleting…' : 'Delete'}
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
