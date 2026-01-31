import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/appOrigin';

const buildQuery = (params?: Record<string, string | string[] | undefined>) => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (Array.isArray(value)) value.forEach((item) => item != null && qs.append(key, item));
    else if (value != null) qs.set(key, value);
  }
  const queryString = qs.toString();
  return queryString ? `?${queryString}` : '';
};

export default function PaystackCallbackRedirect({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  redirect(appUrl(`/paystack/callback${buildQuery(searchParams)}`));
}
