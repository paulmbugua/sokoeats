import type { Metadata } from 'next';
import ProfilePage from '@/legacy-pages/Profile.web';
import { siteUrl } from '@/lib/site';

const title = 'My Profile | DayBreak';
const description = 'Manage your profile, wallet, courses, and settings.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/profile/me') },
  openGraph: {
    type: 'profile',
    url: siteUrl('/profile/me'),
    title,
    description,
  },
};

export default function ProfileMePage() {
  return <ProfilePage />;
}
