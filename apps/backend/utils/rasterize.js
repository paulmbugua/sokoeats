// Rasterize remote SVGs to PNG via Cloudinary "image/fetch"
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME; // e.g. daybreak-xyz
const FETCH_BASE =
  process.env.CLOUDINARY_FETCH_BASE ||
  (CLOUD ? `https://res.cloudinary.com/${CLOUD}/image/fetch` : '');

function isSvg(u = '') {
  return /\.svg(\?.*)?$/i.test(String(u).trim());
}

/**
 * If url looks like an SVG, return a Cloudinary fetch PNG URL.
 * Otherwise return the original url.
 * You can also gate it behind `opts.enable` (e.g., ?raster=1).
 */
function looksProblematic(u = '') {
  const s = String(u).trim().toLowerCase();
  return (
    /\.svg(\?.*)?$/.test(s) ||
    /\.webp(\?.*)?$/.test(s) ||
    /\.avif(\?.*)?$/.test(s) ||
    /\/f_auto([,\/]|$)/.test(s)
  );
}
export function rasterizeIfSvg(url, opts = {}) {
  const enable = opts.enable ?? true;
  const width = Number(opts.w) || 800;
  const force = !!opts.force; // allow callers to force PNG
  if (!enable || !url || !FETCH_BASE) return url;
  if (!force && !looksProblematic(url)) return url;
  const trans = `f_png,q_auto:good,w_${width}`;
  return `${FETCH_BASE}/${trans}/${encodeURIComponent(url)}`;
}
