import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Pencil, X, BadgePercent, Plus, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import { useShopContext } from '@mytutorapp/shared/context/ShopContext';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';

type Currency = 'USD' | 'KES';

type RawPkg = {
  id: number;
  credits: number;
  price: number;
  currency: Currency;
  offer: string | null;
};

type PkgRow = {
  key: string;
  credits: number;
  priceUSD: number;
  priceKES: number;
  offer?: string;
  idUSD?: number;
  idKES?: number;
};

export default function PackagesManage() {
  // ⬇️ Prefer adminToken; fall back to token for legacy paths
  const { backendUrl, adminToken, token } = useShopContext();
  const authToken = adminToken || token || '';
  const base = useMemo(() => (backendUrl || '').replace(/\/+$/, ''), [backendUrl]);
  const navigate = useNavigate();

  const [list, setList] = useState<PkgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<PkgRow | null>(null);
  const [isNew, setIsNew] = useState(false);

  const headers = useMemo(() => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const mergeRows = (rows: RawPkg[]): PkgRow[] => {
    const map = new Map<number, PkgRow>();
    for (const r of rows) {
      const curr = map.get(r.credits) || {
        key: String(r.credits),
        credits: r.credits,
        priceUSD: 0,
        priceKES: 0,
        offer: undefined,
      };
      if (r.currency === 'USD') {
        curr.priceUSD = Number(r.price) || 0;
        curr.idUSD = r.id;
      }
      if (r.currency === 'KES') {
        curr.priceKES = Number(r.price) || 0;
        curr.idKES = r.id;
      }
      if (r.offer != null && r.offer !== '') curr.offer = r.offer;
      map.set(r.credits, curr);
    }
    return Array.from(map.values()).sort((a, b) => a.credits - b.credits);
  };

  const fetchPackages = useCallback(async () => {
    if (!base || !authToken) return;
    try {
      setLoading(true);
      const { data } = await axios.get<{ success: boolean; packages: RawPkg[] }>(
        `${base}/api/admin/packages`,
        { headers }
      );
      if (data?.success === false) throw new Error('Failed to load packages');
      setList(mergeRows(data.packages || []));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || err?.message || 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, [base, authToken, headers]);

  useEffect(() => {
    void fetchPackages();
  }, [fetchPackages]);

  const openNew = () => {
    setIsNew(true);
    setEditing({
      key: 'new',
      credits: 10,
      priceUSD: 10,
      priceKES: 1000,
      offer: '',
    });
  };

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing || !base || !authToken) return;

    const form = new FormData(e.currentTarget);
    const credits = Number(form.get('credits') || editing.credits);
    const priceUSD = Number(form.get('priceUSD') || editing.priceUSD);
    const priceKES = Number(form.get('priceKES') || editing.priceKES);
    const offer = (String(form.get('offer') || '').trim() || null) as string | null;

    if (!Number.isFinite(credits) || credits <= 0) {
      toast.error('Credits must be a positive number');
      return;
    }
    if (priceUSD < 0 || priceKES < 0) {
      toast.error('Prices must be non-negative');
      return;
    }

    try {
      await axios.post(
        `${base}/api/admin/packages/pair`,
        { credits, priceUSD, priceKES, offer },
        { headers: { ...headers, 'Content-Type': 'application/json' } }
      );
      toast.success(isNew ? 'Package added' : 'Package updated');
      setEditing(null);
      setIsNew(false);
      await fetchPackages();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || err?.message || 'Save failed');
    }
  };

  const onDelete = async (row: PkgRow) => {
    if (!base || !authToken) return;
    if (!window.confirm(`Delete the ${row.credits}-credit package (both USD & KES)?`)) return;
    try {
      const calls: Promise<any>[] = [];
      if (row.idUSD)
        calls.push(axios.delete(`${base}/api/admin/packages/${row.idUSD}`, { headers }));
      if (row.idKES)
        calls.push(axios.delete(`${base}/api/admin/packages/${row.idKES}`, { headers }));
      if (!calls.length) {
        toast.error('Missing package ids for deletion.');
        return;
      }
      await Promise.all(calls);
      toast.success('Package deleted');
      setList((prev) => prev.filter((p) => p.credits !== row.credits));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || err?.message || 'Delete failed');
    }
  };

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/'); // safe fallback
    }
  };

  // === Modal helpers: lock scroll & ESC to close ===
  useEffect(() => {
    if (!editing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [editing]);

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="chip flex items-center gap-2"
            aria-label="Go back"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <p className="app-heading">Token Packages</p>
        </div>

        <button className="btn flex items-center gap-2" onClick={openNew}>
          <Plus className="w-4 h-4" />
          New package
        </button>
      </div>

      <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_1fr_1fr] items-center py-2 px-3 border bg-gray-100 dark:bg-white/10 text-sm rounded-t">
        <b>Credits</b>
        <b>Price USD</b>
        <b>Price KES</b>
        <b>Offer</b>
        <b className="text-center">Action</b>
      </div>

      {loading ? (
        <div className="panel flex items-center gap-2 p-4 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading packages…
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((p) => (
            <div
              key={p.key}
              className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] items-center gap-2 py-2 px-3 border text-sm panel"
            >
              <p>{p.credits}</p>
              <p>${p.priceUSD.toFixed(2)}</p>
              <p>KSh {p.priceKES.toLocaleString()}</p>
              <p className="flex items-center gap-2">
                {p.offer ? (
                  <>
                    <BadgePercent className="w-4 h-4" /> {p.offer}
                  </>
                ) : (
                  '—'
                )}
              </p>

              <div className="flex justify-end md:justify-center gap-4">
                <button
                  onClick={() => {
                    setEditing(p);
                    setIsNew(false);
                  }}
                  title="Edit"
                  className="link inline-flex items-center gap-1"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(p)}
                  title="Remove"
                  className="text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {!list.length && (
            <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
              No packages yet.
            </div>
          )}
        </div>
      )}

      {/* === EDITOR MODAL (Portal + fixed + high z-index) === */}
      {editing &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setEditing(null)}
            aria-hidden={false}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pkgEditorTitle"
              className="w-full sm:max-w-lg sm:w-[90vw] max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl p-4 sm:p-6 m-0 sm:m-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="pkgEditorTitle" className="app-heading">
                  {isNew ? 'Add Package' : `Edit Package (${editing.credits} credits)`}
                </h3>
                <button aria-label="Close" className="chip" onClick={() => setEditing(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={onSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm">Credits</span>
                  <input
                    name="credits"
                    className="input mt-1"
                    type="number"
                    min={1}
                    defaultValue={editing.credits}
                    disabled={!isNew}
                    required
                    autoFocus
                  />
                </label>

                <label className="block">
                  <span className="text-sm">Price USD</span>
                  <input
                    name="priceUSD"
                    className="input mt-1"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={editing.priceUSD}
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm">Price KES</span>
                  <input
                    name="priceKES"
                    className="input mt-1"
                    type="number"
                    step="1"
                    min={0}
                    defaultValue={editing.priceKES}
                    required
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-sm">Offer (optional)</span>
                  <input
                    name="offer"
                    className="input mt-1"
                    placeholder="Starter Pack / Premium Pack / …"
                    defaultValue={editing.offer || ''}
                  />
                </label>

                <div className="flex justify-between sm:col-span-2 mt-2">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      setEditing(null);
                      setIsNew(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn" type="submit">
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
