import { redirect } from 'next/navigation';

const appOrigin =
  process.env.NEXT_PUBLIC_APP_ORIGIN_DEV ||
  process.env.NEXT_PUBLIC_APP_ORIGIN ||
  '';

export default function LoginBridge({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();

  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(v)) v.forEach((vv) => vv != null && qs.append(k, vv));
    else if (v != null) qs.set(k, v);
  }

  const url = `${appOrigin}/login${qs.toString() ? `?${qs}` : ''}`;
  redirect(url);
}
