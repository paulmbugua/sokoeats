'use client';

import React from 'react';
import NextLink from 'next/link';
import {
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
  useParams as useNextParams,
} from 'next/navigation';
import { appUrl } from '@/lib/appOrigin';

type NavigateOptions = { replace?: boolean };

type LinkProps = Omit<React.ComponentProps<typeof NextLink>, 'href'> & {
  to?: string;
  href?: string;
};

const isNextRoute = (href: string) => {
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
    return true;
  }
  const [path] = href.split(/[?#]/);
  if (path === '/') return true;
  if (path === '/find-tutor') return true;
  if (path === '/resources') return true;
  if (path === '/courses') return true;
  if (path === '/help') return true;
  if (path.startsWith('/profile/') && path !== '/profile/me') return true;
  if (path.startsWith('/oer')) return true;
  if (path.startsWith('/verify')) return true;
  return false;
};

const resolveHref = (href: string) => (isNextRoute(href) ? href : appUrl(href));

export function Link({ to, href, ...props }: LinkProps) {
  const raw = (href || to || '/') as string;
  const nextHref = resolveHref(raw);
  return <NextLink href={nextHref} {...props} />;
}

export function useNavigate() {
  const router = useRouter();
  return (to: string | number, options?: NavigateOptions) => {
    if (typeof to === 'number') {
      if (to < 0) router.back();
      else router.forward();
      return;
    }
    const href = resolveHref(to);
    if (!isNextRoute(to)) {
      if (options?.replace) window.location.replace(href);
      else window.location.assign(href);
      return;
    }
    if (options?.replace) router.replace(href);
    else router.push(href);
  };
}

export function useLocation() {
  const pathname = usePathname() || '';
  const searchParams = useNextSearchParams();
  const search = searchParams?.toString() || '';
  return {
    pathname,
    search: search ? `?${search}` : '',
    hash: '',
    state: null,
    key: `${pathname}?${search}`,
  };
}

export function useSearchParams() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const nextParams = useNextSearchParams();
  const params = React.useMemo(
    () => new URLSearchParams(nextParams?.toString() || ''),
    [nextParams]
  );

  const setSearchParams = (
    next: URLSearchParams | Record<string, string> | string,
    options?: NavigateOptions
  ) => {
    let nextParamsToUse: URLSearchParams;
    if (typeof next === 'string') {
      nextParamsToUse = new URLSearchParams(next);
    } else if (next instanceof URLSearchParams) {
      nextParamsToUse = next;
    } else {
      nextParamsToUse = new URLSearchParams();
      Object.entries(next).forEach(([key, value]) => {
        if (value !== undefined && value !== null) nextParamsToUse.set(key, String(value));
      });
    }
    const search = nextParamsToUse.toString();
    const url = search ? `${pathname}?${search}` : pathname;
    if (options?.replace) router.replace(url);
    else router.push(url);
  };

  return [params, setSearchParams] as const;
}

export function useParams() {
  return useNextParams();
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter();
  React.useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [router, to, replace]);
  return null;
}
