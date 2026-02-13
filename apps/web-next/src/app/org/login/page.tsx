import { redirect } from 'next/navigation';

type Params = Record<string, string | string[] | undefined>;

const buildQuery = (searchParams?: Params) => {
  if (!searchParams) return '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (value) query.set(key, value);
  }
  const out = query.toString();
  return out ? `?${out}` : '';
};

export default async function OrgLoginBridge({
  searchParams,
}: {
  searchParams?: Promise<Params>;
}) {
  const params = searchParams ? await searchParams : undefined;
  redirect(`/institutions/login${buildQuery(params)}`);
}
