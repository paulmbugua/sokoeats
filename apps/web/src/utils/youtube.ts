// utils/youtube.ts
export function parseYouTubeId(url = ''): string | null {
  // supports watch?v=, youtu.be/, and /embed/
  const m =
    url.match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/^([A-Za-z0-9_-]{11})$/);
  return m?.[1] || null;
}

export function buildAutoplayEmbed(url = '', { nocookie = true } = {}): string | null {
  const id = parseYouTubeId(url);
  if (!id) return null;
  const base = nocookie
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : `https://www.youtube.com/embed/${id}`;
  // loop requires playlist param = same video id
  const qs = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    playsinline: '1',
    modestbranding: '1',
    rel: '0',
    loop: '1',
    playlist: id,
    iv_load_policy: '3',
  }).toString();
  return `${base}?${qs}`;
}
