import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import {
  BadgeCheck, BriefcaseBusiness, CalendarClock, Camera, CheckCircle2, ChevronRight,
  FileCheck2, Hammer, Home, ImagePlus, Loader2, LogOut, MapPin, MessageCircle,
  Navigation, Phone, RefreshCw, Send, ShieldCheck, Sparkles, Star, UploadCloud, WalletCards, XCircle,
} from 'lucide-react';
import { API_BASE } from './config';

const CENTER = { latitude: -1.286389, longitude: 36.817223 };
const DEFAULT_PROMPTS = ['Share the issue clearly', 'Add when it started', 'Mention access or materials needed'];
const PROVIDER_FREE_SERVICE_LIMIT = 2;
const EXTRA_SERVICE_CERTIFICATE_STATUSES = new Set(['pending', 'approved']);
const promptMap: Record<string, string[]> = {
  plumbing: ['Where is the leak or blockage?', 'Is the main water supply affected?', 'Do you need parts supplied?'],
  electrical: ['Which socket, light, or appliance is affected?', 'Is power tripping?', 'Is it urgent or scheduled?'],
  cleaning: ['How many rooms or surfaces?', 'Do you need deep cleaning?', 'Any delicate items to avoid?'],
  painting: ['How many rooms or walls?', 'Do you have paint already?', 'Any repair before painting?'],
  carpentry: ['What item needs repair or fitting?', 'Share measurements if known', 'Do you need materials included?'],
};

type Role = 'client' | 'handyman';
type User = { id?: string | number; userId?: string | number; name?: string; email?: string; phone?: string | null; role?: string; profileComplete?: boolean; preferredCity?: string | null; preferredEstate?: string | null; contactPreference?: string | null };
type Category = { id: string; name: string; description?: string };
type Job = { id: string; categoryId?: string; categoryName?: string; serviceName?: string; description: string; photoUrls?: string[]; estate: string; city: string; address?: string | null; latitude?: number | null; longitude?: number | null; scheduleType?: string; scheduledFor?: string | null; budgetMin?: number | null; budgetMax?: number | null; quoteCount?: number; status?: string; distanceKm?: number | null; discountPercent?: number; client?: { name?: string; phone?: string | null }; booking?: { id?: string; quoteId?: string | null; status?: string | null; providerName?: string | null; review?: { rating?: number | null; comment?: string; reviewedAt?: string | null } | null } | null };
type ProviderReview = { rating?: number | null; comment?: string; reviewedAt?: string | null };
type Quote = { id: string; jobId?: string; total: number; labor: number; materials: number; transport: number; discountAmount?: number; status?: string; etaMinutes?: number; durationHours?: number | null; message?: string; pro?: { name?: string; phone?: string | null; ratingAvg?: number; ratingCount?: number; jobsCompleted?: number; profileImageUrl?: string | null; verifiedId?: boolean; profileImageStatus?: string; certificateStatus?: string; goodConductStatus?: string; fullyVerified?: boolean; reviews?: ProviderReview[] }; job?: { description?: string; estate?: string; city?: string; status?: string }; booking?: { id?: string; status?: string } | null; commission?: { percent?: number; amount?: number; handymanNet?: number } };
type Verification = { profileImageUrl?: string | null; idDocumentUrl?: string | null; certificateUrl?: string | null; goodConductUrl?: string | null; profileImageStatus?: string; idDocumentStatus?: string; certificateStatus?: string; goodConductStatus?: string; verified?: boolean; fullyVerified?: boolean; status?: string };
type HandymanProfileData = { business_name?: string; businessName?: string; bio?: string; estate?: string; city?: string; address?: string; latitude?: number | null; longitude?: number | null; service_radius_km?: number; serviceRadiusKm?: number; categories?: string[]; verified?: boolean; profile_image_url?: string | null; id_document_url?: string | null; certificate_url?: string | null; good_conduct_url?: string | null; profile_image_status?: string; id_document_status?: string; certificate_status?: string; good_conduct_status?: string; verification?: Verification };
type Conversation = { id: string; bookingId?: string; job?: { description?: string; estate?: string; city?: string }; otherUser?: { name?: string; phone?: string | null; role?: string }; lastMessage?: string; lastAt?: string; unreadCount?: number };
type ChatMessage = { id: string; body: string; sender?: string; mine?: boolean; createdAt?: string };
type ApiInit = { method?: string; body?: unknown; headers?: Record<string, string> };

const money = (value?: number | null) => `KES ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
const roleOf = (role?: string): Role => role === 'tutor' || role === 'handyman' ? 'handyman' : 'client';
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const extraServiceQualificationReady = (verification?: Verification | null, profile?: HandymanProfileData | null) => {
  const status = String(verification?.certificateStatus || profile?.certificate_status || '').toLowerCase();
  return Boolean(verification?.certificateUrl || profile?.certificate_url || EXTRA_SERVICE_CERTIFICATE_STATUSES.has(status));
};

const POLICY_LINKS: Array<[string, string]> = [
  ['Privacy Policy', '/privacy-policy'],
  ['Terms of Service', '/terms'],
  ['Anti-Spam Policy', '/anti-spam-policy'],
  ['Complaints & Feedback', '/complaints-feedback'],
  ['Refund & Cancellation Policy', '/refunds'],
  ['Fulfillment & Delivery Policy', '/fulfillment'],
  ['How Payments Work', '/payment-flow'],
];

const LEGAL_PAGES: Record<string, { title: string; updated: string; intro: string; sections: Array<{ heading: string; body: string }> }> = {
  '/privacy-policy': {
    title: 'Privacy Policy',
    updated: 'July 30, 2026',
    intro: 'Ekazi respects your privacy. This policy explains how Ekazi Connect Solutions Ltd collects, uses, protects, and shares information when clients and providers use Ekazi.',
    sections: [
      { heading: 'Information we collect', body: 'We collect account details such as name, phone number, email address, role, profile photo, service location, job requests, quote details, messages, ratings, payment references, and provider verification documents where applicable.' },
      { heading: 'How we use information', body: 'We use this information to create accounts, connect clients with nearby providers, process quotes and bookings, support payments, verify providers, prevent fraud, deliver notifications, improve support, and comply with Kenyan legal and safety obligations.' },
      { heading: 'Location and job details', body: 'Clients may share job location, photos, descriptions, schedule, and contact details so providers can quote and complete work. Exact address details are only used for service delivery and platform safety.' },
      { heading: 'Provider verification', body: 'Providers may upload identity documents, profile images, certificates, and good conduct documents. Ekazi uses these records for review, trust, fraud prevention, and marketplace safety.' },
      { heading: 'Sharing of information', body: 'We share relevant booking details between the client and accepted provider. We may also share data with payment processors, hosting providers, messaging and notification providers, regulators, or law enforcement where required.' },
      { heading: 'Security and retention', body: 'We use reasonable technical and organizational safeguards to protect user data. We retain information for as long as needed to provide Ekazi services, resolve disputes, prevent fraud, and meet legal or accounting obligations.' },
      { heading: 'Your choices', body: 'Users can update profile details, request account deletion, or request partial or full data deletion from the account area or by contacting Ekazi support.' },
      { heading: 'Contact', body: 'For privacy questions or deletion requests, contact Ekazi through the Complaints & Feedback page or official support channels on ekazi.co.ke.' },
    ],
  },
  '/terms': {
    title: 'Terms of Service',
    updated: 'July 30, 2026',
    intro: 'These terms govern use of Ekazi by clients and providers in Kenya.',
    sections: [
      { heading: 'Marketplace role', body: 'Ekazi helps clients discover, request, compare, book, message, and pay providers. Providers are independent service providers and are responsible for the quality, safety, pricing, and delivery of their services.' },
      { heading: 'User responsibilities', body: 'Users must provide accurate account information, use lawful content, communicate respectfully, honour accepted bookings, and avoid fraud, harassment, spam, or unsafe conduct.' },
      { heading: 'Bookings and payments', body: 'Clients may pay using available methods. Cash is paid directly to the provider. Card or supported digital payments may be processed through Ekazi and released according to the platform payment flow.' },
      { heading: 'Provider commission', body: 'Ekazi may charge providers a platform commission on labour charges. Commission rules are shown to providers before or during quote submission.' },
      { heading: 'Suspension and enforcement', body: 'Ekazi may warn, restrict, suspend, or ban accounts for repeated cancellations, poor conduct, fraud, safety issues, abuse, or breach of these terms.' },
    ],
  },
  '/anti-spam-policy': {
    title: 'Anti-Spam Policy',
    updated: 'July 30, 2026',
    intro: 'Ekazi does not allow spam, abusive messaging, fake requests, or unsolicited promotional activity.',
    sections: [
      { heading: 'Prohibited activity', body: 'Users may not send repeated unwanted messages, fake quotes, phishing links, abusive content, misleading promotions, or unrelated advertising through Ekazi.' },
      { heading: 'Enforcement', body: 'Ekazi may limit messaging, remove content, suspend accounts, or report abusive activity where necessary to protect users and the platform.' },
    ],
  },
  '/complaints-feedback': {
    title: 'Complaints & Feedback',
    updated: 'July 30, 2026',
    intro: 'Ekazi welcomes complaints, safety reports, provider feedback, and user suggestions.',
    sections: [
      { heading: 'How to complain', body: 'Include your account email or phone, booking or quote reference if available, a clear description of the issue, screenshots or evidence where relevant, and the outcome you are requesting.' },
      { heading: 'Review process', body: 'Ekazi reviews complaints involving poor workmanship, unsafe conduct, harassment, fraud, payment disputes, cancellations, and platform abuse. Serious issues may lead to warnings, suspensions, or bans.' },
    ],
  },
  '/refunds': {
    title: 'Refund & Cancellation Policy',
    updated: 'July 30, 2026',
    intro: 'This policy explains how cancellations, refunds, and disputes are handled on Ekazi.',
    sections: [
      { heading: 'Cancellations', body: 'Clients and providers may cancel accepted bookings but must provide a reason. Repeated or unfair cancellations can affect ratings, access, or account standing.' },
      { heading: 'Refunds', body: 'Refund eligibility depends on payment method, booking status, service progress, evidence provided, and whether the provider has started or completed the work.' },
      { heading: 'Disputes', body: 'Ekazi may review messages, job details, payment records, photos, ratings, and cancellation reasons when handling a dispute.' },
    ],
  },
  '/fulfillment': {
    title: 'Fulfillment & Delivery Policy',
    updated: 'July 30, 2026',
    intro: 'Ekazi services are fulfilled by independent providers after a client accepts a quote.',
    sections: [
      { heading: 'Service delivery', body: 'The provider attends the agreed location, performs the accepted service scope, marks arrival and completion, and communicates with the client through the app where needed.' },
      { heading: 'Client confirmation', body: 'After completion, clients can rate the provider and leave feedback. Ekazi uses ratings and reports to maintain marketplace quality.' },
    ],
  },
  '/payment-flow': {
    title: 'How Payments Work',
    updated: 'July 30, 2026',
    intro: 'Ekazi supports clear payment flows for clients and providers.',
    sections: [
      { heading: 'Cash bookings', body: 'When cash is selected, the client pays the provider directly. Provider commission may accrue separately and can affect cash job availability when unpaid balances reach the platform threshold.' },
      { heading: 'Card bookings', body: 'When card payment is selected, the client pays securely in the app through the supported payment provider. Provider payouts are calculated after applicable platform commission and outstanding balances.' },
      { heading: 'Provider payouts', body: 'Provider balances may be paid out according to Ekazi payout schedules and the payment method configured for the provider.' },
    ],
  },
};

function readJson<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

async function api<T>(path: string, init: ApiInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Request failed (${response.status})`);
  return data as T;
}

async function uploadFile(file: File, token: string, kind: 'image' | 'doc') {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${API_BASE}/api/profile/upload/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) throw new Error(data?.message || 'Upload failed.');
  return String(data.url);
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ekazi_web_token') || '');
  const [user, setUser] = useState<User | null>(() => readJson<User | null>('ekazi_web_user', null));
  const [notice, setNotice] = useState('');
  useEffect(() => { if (!notice) return undefined; const id = window.setTimeout(() => setNotice(''), 4500); return () => window.clearTimeout(id); }, [notice]);
  const onAuth = useCallback((nextToken: string, nextUser: User) => {
    const normalized = { ...nextUser, role: roleOf(nextUser.role) };
    localStorage.setItem('ekazi_web_token', nextToken);
    localStorage.setItem('ekazi_web_user', JSON.stringify(normalized));
    setToken(nextToken);
    setUser(normalized);
  }, []);
  const updateUser = useCallback((nextUser: User) => {
    const normalized = { ...nextUser, role: roleOf(nextUser.role) };
    const serialized = JSON.stringify(normalized);
    localStorage.setItem('ekazi_web_user', serialized);
    setUser((prev) => {
      if (prev && JSON.stringify(prev) === serialized) return prev;
      return normalized;
    });
  }, []);
  const logout = useCallback(() => {
    localStorage.removeItem('ekazi_web_token');
    localStorage.removeItem('ekazi_web_user');
    setToken('');
    setUser(null);
  }, []);
  const publicPage = typeof window !== 'undefined' ? LEGAL_PAGES[window.location.pathname] : undefined;
  if (publicPage) return <PublicLegalPage page={publicPage} />;
  return <div className="app">{notice ? <div className="toast">{notice}</div> : null}{token && user ? <Workspace token={token} user={user} updateUser={updateUser} logout={logout} setNotice={setNotice} /> : <AuthPage onAuth={onAuth} setNotice={setNotice} />}</div>;
}

function AuthPage({ onAuth, setNotice }: { onAuth: (token: string, user: User) => void; setNotice: (message: string) => void }) {
  const [mode, setMode] = useState<'signin' | 'create'>('create');
  const [role, setRole] = useState<Role>('client');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async () => {
    setLoading(true);
    try {
      if (mode === 'create' && form.password !== form.confirmPassword) throw new Error('Passwords do not match.');
      const body = mode === 'create'
        ? { name: form.name, email: form.email, phone: form.phone || undefined, password: form.password, role }
        : { phone: form.phone || form.email, email: form.email || undefined, password: form.password };
      const data = await api<{ token: string; user: User }>(mode === 'create' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body });
      onAuth(data.token, data.user);
    } catch (error) { setNotice(messageOf(error)); } finally { setLoading(false); }
  };
  const googleAuth = async (credential?: string) => {
    if (!credential) return setNotice('Google did not return a credential.');
    setLoading(true);
    try {
      const data = await api<{ token: string; user: User }>('/api/auth/google', { method: 'POST', body: { idToken: credential, role, phone: form.phone || undefined } });
      onAuth(data.token, data.user);
    } catch (error) { setNotice(messageOf(error)); } finally { setLoading(false); }
  };
  return <main className="auth-shell">
    <section className="brand-panel">
      <div className="logo-lockup"><div className="logo-mark">E</div><span>Ekazi</span></div>
      <div className="hero-copy"><p className="eyebrow light">Kenyan service provider marketplace</p><h1>Home jobs, real quotes, verified pros.</h1><p className="lead">Request a service, share photos, compare quotes, message after booking, and work with providers whose identity is approved by Ekazi.</p></div>
      <div className="hero-illustration" aria-hidden="true"><div className="iso-card a"><Hammer size={42} /><span>Fix</span></div><div className="iso-card b"><MapPin size={36} /><span>Near you</span></div><div className="iso-card c"><ShieldCheck size={36} /><span>Verified</span></div></div>
    </section>
    <section className="auth-card">
      <div className="mode-row"><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create account</button><button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign in</button></div>
      <div className="role-row"><button className={role === 'client' ? 'role active' : 'role'} onClick={() => setRole('client')}><Home size={18} /> Client</button><button className={role === 'handyman' ? 'role active' : 'role'} onClick={() => setRole('handyman')}><Hammer size={18} /> Provider</button></div>
      <div className="google-box"><GoogleLogin onSuccess={(res) => void googleAuth(res.credential)} onError={() => setNotice('Google sign-in could not start.')} useOneTap={false} text={mode === 'create' ? 'continue_with' : 'signin_with'} /></div>
      <div className="divider"><span>or use email, phone and password</span></div>
      {mode === 'create' ? <><Field label="Full name" value={form.name} onChange={(v) => update('name', v)} /><Field label="Email" value={form.email} onChange={(v) => update('email', v)} /></> : null}
      <Field label={mode === 'signin' ? 'Phone or email' : 'Phone number'} value={form.phone} placeholder="+2547xx xxx xxx" onChange={(v) => update('phone', v)} />
      <Field label="Password" type="password" value={form.password} onChange={(v) => update('password', v)} />
      {mode === 'create' ? <Field label="Confirm password" type="password" value={form.confirmPassword} onChange={(v) => update('confirmPassword', v)} /> : null}
      <button className="primary full" disabled={loading} onClick={() => void submit()}>{loading ? 'Working...' : mode === 'create' ? 'Create account' : 'Sign in'}</button>
      <PolicyFooter compact />
    </section>
  </main>;
}

function Workspace({ token, user, updateUser, logout, setNotice }: { token: string; user: User; updateUser: (user: User) => void; logout: () => void; setNotice: (message: string) => void }) {
  const role = roleOf(user.role);
  const isHandyman = role === 'handyman';
  const [tab, setTab] = useState(isHandyman ? 'jobs' : 'home');
  const [categories, setCategories] = useState<Category[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [handymanJobs, setHandymanJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote[]>>({});
  const [handymanQuotes, setHandymanQuotes] = useState<Quote[]>([]);
  const [promo, setPromo] = useState<{ eligible?: boolean; description?: string } | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const authApi = useCallback(<T,>(path: string, init?: ApiInit) => api<T>(path, init, token), [token]);
  const refreshAccount = useCallback(async () => {
    const data = await authApi<{ user: User; profileComplete?: boolean }>('/api/auth/me');
    updateUser({ ...data.user, profileComplete: data.profileComplete ?? data.user.profileComplete });
  }, [authApi, updateUser]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const catalog = await api<{ categories: Category[] }>('/api/categories');
      setCategories(catalog.categories || []);
      await refreshAccount().catch(() => undefined);
      const conv = await authApi<{ conversations: Conversation[] }>('/api/conversations').catch(() => ({ conversations: [] }));
      setConversations(conv.conversations || []);
      if (isHandyman) {
        const [openJobs, ownQuotes, profile] = await Promise.all([
          authApi<{ jobs: Job[]; verification?: Verification; blocked?: boolean; message?: string }>('/api/handyman/jobs'),
          authApi<{ quotes: Quote[] }>('/api/handyman/quotes'),
          authApi<{ profile: HandymanProfileData | null; verification?: Verification }>('/api/handyman/profile'),
        ]);
        setHandymanJobs(openJobs.jobs || []); setHandymanQuotes(ownQuotes.quotes || []);
        setVerification(openJobs.verification || profile.verification || profile.profile?.verification || null);
        setBlockedMessage(openJobs.blocked ? openJobs.message || 'Complete verification to receive nearby jobs.' : '');
      } else {
        const [clientJobs, clientCompletedJobs, promotion] = await Promise.all([authApi<{ jobs: Job[] }>('/api/jobs?status=active'), authApi<{ jobs: Job[] }>('/api/jobs?status=completed'), authApi<{ eligible?: boolean; description?: string }>('/api/promotions/first-job')]);
        setJobs(clientJobs.jobs || []); setCompletedJobs(clientCompletedJobs.jobs || []); setPromo(promotion);
      }
    } catch (error) { setNotice(messageOf(error)); } finally { setRefreshing(false); }
  }, [authApi, isHandyman, refreshAccount, setNotice]);
  useEffect(() => { void refresh(); }, [refresh]);
  const loadQuotes = async (jobId: string) => { const data = await authApi<{ quotes: Quote[] }>(`/api/jobs/${jobId}/quotes`); setQuotes((prev) => ({ ...prev, [jobId]: data.quotes || [] })); };
  const deleteJob = async (jobId: string) => {
    if (!window.confirm('Delete this request? Open provider quotes will be closed.')) return;
    await authApi(`/api/jobs/${jobId}`, { method: 'DELETE' });
    setJobs((current) => current.filter((job) => job.id !== jobId));
    setQuotes((current) => {
      const nextQuotes = { ...current };
      delete nextQuotes[jobId];
      return nextQuotes;
    });
    setNotice('Request deleted.');
  };
  const navItems = isHandyman
    ? [['jobs', 'Nearby jobs', BriefcaseBusiness], ['quotes', 'Quotes', WalletCards], ['messages', 'Messages', MessageCircle], ['profile', 'Profile', ShieldCheck]]
    : [['home', 'Home', Home], ['request', 'Request', Send], ['quotes', 'Quotes', WalletCards], ['messages', 'Messages', MessageCircle], ['profile', 'Profile', ShieldCheck]];
  return <main className="workspace">
    <aside className="sidebar"><div className="side-brand"><div className="logo-mark small">E</div><strong>Ekazi</strong></div><nav>{navItems.map(([id, label, Icon]) => <button key={id as string} className={tab === id ? 'active' : ''} onClick={() => setTab(id as string)}><Icon size={18} /><span>{label as string}</span></button>)}</nav><button className="ghost logout" onClick={logout}><LogOut size={18} /> Logout</button></aside>
    <section className="content"><header className="topbar"><div><p className="eyebrow">{isHandyman ? 'Provider workspace' : 'Client workspace'}</p><h2>{user.name || 'Ekazi user'}</h2><p className="muted"><Phone size={15} /> {user.phone || 'Contact pending'}</p></div><button className="ghost" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />} Refresh</button></header>
      {!user.profileComplete || !user.phone ? <CompleteProfile user={user} role={role} categories={categories} authApi={authApi} updateUser={updateUser} setNotice={setNotice} /> : null}
      {!isHandyman && tab === 'home' ? <ClientHome jobs={jobs} promo={promo} quotes={quotes} loadQuotes={loadQuotes} deleteJob={deleteJob} /> : null}
      {!isHandyman && tab === 'request' ? <RequestJob token={token} categories={categories} authApi={authApi} onCreated={refresh} setNotice={setNotice} /> : null}
      {!isHandyman && tab === 'quotes' ? <ClientQuotes jobs={jobs} completedJobs={completedJobs} quotes={quotes} loadQuotes={loadQuotes} authApi={authApi} setNotice={setNotice} refresh={refresh} /> : null}
      {isHandyman && tab === 'jobs' ? <HandymanJobs jobs={handymanJobs} verification={verification} blockedMessage={blockedMessage} authApi={authApi} setNotice={setNotice} refresh={refresh} /> : null}
      {isHandyman && tab === 'quotes' ? <HandymanQuotes quotes={handymanQuotes} authApi={authApi} setNotice={setNotice} refresh={refresh} /> : null}
      {tab === 'messages' ? <Messages conversations={conversations} authApi={authApi} setNotice={setNotice} refresh={refresh} /> : null}
      {tab === 'profile' ? <ProfilePanel role={role} user={user} token={token} categories={categories} authApi={authApi} setNotice={setNotice} refresh={refresh} logout={logout} /> : null}
      <PolicyFooter />
    </section>
  </main>;
}

function CompleteProfile({ user, role, categories, authApi, updateUser, setNotice }: { user: User; role: Role; categories: Category[]; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; updateUser: (user: User) => void; setNotice: (message: string) => void }) {
  const [form, setForm] = useState({ name: user.name || '', phone: user.phone || '', city: user.preferredCity || 'Nairobi', estate: user.preferredEstate || '', emergencyContact: '', contactPreference: user.contactPreference || 'phone', businessName: user.name ? `${user.name} Services` : '', bio: '', serviceRadiusKm: '20' });
  const [selected, setSelected] = useState<string[]>(categories[0] ? [categories[0].id] : []);
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      const data = await authApi<{ user: User }>('/api/auth/profile/complete', { method: 'PATCH', body: { ...form, serviceRadiusKm: Number(form.serviceRadiusKm), categories: selected } });
      updateUser(data.user); setNotice('Profile completed. You can now continue.');
    } catch (error) { setNotice(messageOf(error)); } finally { setSaving(false); }
  };
  return <section className="panel attention"><div className="section-head"><div><p className="eyebrow">Required setup</p><h3>Add your contact details</h3><p className="muted">Google accounts need a Kenyan phone number before jobs, quotes, and messages are unlocked.</p></div><ShieldCheck size={34} /></div><div className="form-grid"><Field label="Full name" value={form.name} onChange={(v) => update('name', v)} /><Field label="Phone" value={form.phone} placeholder="+2547xx xxx xxx" onChange={(v) => update('phone', v)} /><Field label="City" value={form.city} onChange={(v) => update('city', v)} /><Field label="Estate" value={form.estate} onChange={(v) => update('estate', v)} /><Field label="Emergency contact" value={form.emergencyContact} placeholder="Optional" onChange={(v) => update('emergencyContact', v)} /><label className="field"><span>Contact preference</span><select value={form.contactPreference} onChange={(e) => update('contactPreference', e.target.value)}><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>{role === 'handyman' ? <Field label="Business name" value={form.businessName} onChange={(v) => update('businessName', v)} /> : null}{role === 'handyman' ? <Field label="Service radius km" value={form.serviceRadiusKm} onChange={(v) => update('serviceRadiusKm', v)} /> : null}{role === 'handyman' ? <Field label="Short bio" value={form.bio} onChange={(v) => update('bio', v)} textarea /> : null}</div>{role === 'handyman' ? <><CategoryPicker categories={categories} selected={selected} setSelected={setSelected} maxSelection={PROVIDER_FREE_SERVICE_LIMIT} onLimitReached={() => setNotice('Choose up to 2 services for now. Upload a qualification certificate from Profile before adding a third service.')} /><p className="muted service-rule">Start with 1 or 2 core services. Extra services unlock after your qualification certificate is submitted.</p></> : null}<button className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save and continue'}</button></section>;
}

function ClientHome({ jobs, promo, quotes, loadQuotes, deleteJob }: { jobs: Job[]; promo: { eligible?: boolean; description?: string } | null; quotes: Record<string, Quote[]>; loadQuotes: (jobId: string) => Promise<void>; deleteJob: (jobId: string) => Promise<void> }) {
  return <div className="grid two"><section className="panel offer"><p className="eyebrow">First booking</p><h3>FIRST5 {promo?.eligible ? 'available' : 'status'}</h3><p>{promo?.description || 'Eligible first jobs receive the live promotion from the backend.'}</p></section><section className="panel stats"><p className="eyebrow">Requests</p><h3>{jobs.length} active</h3><p>Only real requests and quote counts are shown here.</p></section><section className="panel wide"><div className="section-head"><h3>Recent requests</h3><Sparkles size={26} /></div><div className="list">{jobs.map((job) => <JobRow key={job.id} job={job} actionLabel={`View ${job.quoteCount || 0} quotes`} onAction={() => void loadQuotes(job.id)} onDelete={['active', 'quoted'].includes(String(job.status || '').toLowerCase()) && !job.booking?.id ? () => void deleteJob(job.id) : undefined} />)}{!jobs.length ? <Empty text="No active requests yet. Create a job to start receiving quotes." /> : null}</div>{Object.entries(quotes).map(([jobId, list]) => <QuoteList key={jobId} quotes={list} />)}</section></div>;
}

function RequestJob({ token, categories, authApi, onCreated, setNotice }: { token: string; categories: Category[]; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; onCreated: () => Promise<void>; setNotice: (message: string) => void }) {
  const [form, setForm] = useState({ categoryId: '', description: '', estate: 'Kilimani', city: 'Nairobi', address: '', latitude: String(CENTER.latitude), longitude: String(CENTER.longitude), scheduleType: 'soon', scheduledFor: '', budgetMin: '1500', budgetMax: '8000', providerBringsMaterials: true, notes: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const selectedCategory = categories.find((item) => item.id === form.categoryId) || categories[0];
  const prompts = useMemo(() => dynamicPrompts(selectedCategory?.name || form.categoryId), [selectedCategory, form.categoryId]);
  useEffect(() => { if (!form.categoryId && categories[0]) setForm((prev) => ({ ...prev, categoryId: categories[0].id })); }, [categories, form.categoryId]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  const update = (key: keyof typeof form, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));
  const chooseFiles = (picked: FileList | null) => { const next = Array.from(picked || []).slice(0, 6); previews.forEach((url) => URL.revokeObjectURL(url)); setFiles(next); setPreviews(next.map((file) => URL.createObjectURL(file))); };
  const submit = async () => {
    setSaving(true);
    try {
      const created = await authApi<{ job: Job }>('/api/jobs', { method: 'POST', body: { ...form, categoryName: selectedCategory?.name, latitude: Number(form.latitude) || null, longitude: Number(form.longitude) || null, budgetMin: Number(form.budgetMin) || null, budgetMax: Number(form.budgetMax) || null, discountCode: 'FIRST5' } });
      if (files.length && created.job?.id) { const urls = await Promise.all(files.map((file) => uploadFile(file, token, 'image'))); await authApi(`/api/jobs/${created.job.id}/photos`, { method: 'POST', body: { photoUrls: urls } }); }
      setNotice('Job posted. Nearby verified providers can now send quotes.'); setForm((prev) => ({ ...prev, description: '', notes: '' })); setFiles([]); setPreviews([]); await onCreated();
    } catch (error) { setNotice(messageOf(error)); } finally { setSaving(false); }
  };
  return <section className="panel wide"><div className="section-head"><div><p className="eyebrow">Request flow</p><h3>Request a quote</h3></div><Send size={28} /></div><CategoryPicker categories={categories} selected={[form.categoryId]} setSelected={(next) => update('categoryId', next[next.length - 1] || '')} single /><div className="prompt-strip">{prompts.map((prompt) => <button key={prompt} onClick={() => update('description', `${form.description}${form.description ? '\n' : ''}${prompt}: `)}>{prompt}</button>)}</div><div className="form-grid"><Field label="Describe the job" value={form.description} onChange={(v) => update('description', v)} textarea /><Field label="Estate" value={form.estate} onChange={(v) => update('estate', v)} /><Field label="City" value={form.city} onChange={(v) => update('city', v)} /><Field label="Address or landmark" value={form.address} onChange={(v) => update('address', v)} /><Field label="Latitude" value={form.latitude} onChange={(v) => update('latitude', v)} /><Field label="Longitude" value={form.longitude} onChange={(v) => update('longitude', v)} /><label className="field"><span>Schedule type</span><select value={form.scheduleType} onChange={(e) => update('scheduleType', e.target.value)}><option value="soon">As soon as possible</option><option value="scheduled">Scheduled</option><option value="flexible">Flexible</option></select></label><Field label="Scheduled for" type="datetime-local" value={form.scheduledFor} onChange={(v) => update('scheduledFor', v)} /><Field label="Minimum budget" value={form.budgetMin} onChange={(v) => update('budgetMin', v)} /><Field label="Maximum budget" value={form.budgetMax} onChange={(v) => update('budgetMax', v)} /><Field label="Notes" value={form.notes} onChange={(v) => update('notes', v)} textarea /></div><LocationPreview lat={Number(form.latitude)} lng={Number(form.longitude)} label={`${form.estate}, ${form.city}`} /><label className="upload-box"><input type="file" accept="image/*" multiple onChange={(e) => chooseFiles(e.target.files)} /><ImagePlus size={22} /> Add photos with preview</label>{previews.length ? <div className="preview-grid">{previews.map((url) => <img key={url} src={url} alt="Job preview" />)}</div> : null}<label className="check"><input type="checkbox" checked={form.providerBringsMaterials} onChange={(e) => update('providerBringsMaterials', e.target.checked)} /> Ask the provider to include materials.</label><button className="primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Posting...' : 'Post request'}</button></section>;
}


function ClientQuotes({ jobs, completedJobs, quotes, loadQuotes, authApi, setNotice, refresh }: { jobs: Job[]; completedJobs: Job[]; quotes: Record<string, Quote[]>; loadQuotes: (jobId: string) => Promise<void>; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const accept = async (quoteId: string) => {
    try { await authApi(`/api/quotes/${quoteId}/accept`, { method: 'POST' }); setNotice('Quote accepted. Messaging is now available from Messages.'); await refresh(); }
    catch (error) { setNotice(messageOf(error)); }
  };
  const decline = async (quoteId: string) => {
    try { const result = await authApi<{ forwardedTo?: number }>(`/api/quotes/${quoteId}/decline`, { method: 'POST', body: { reason: 'Price or fit did not work for me', reasonCode: 'price_or_fit' } }); setNotice(result.forwardedTo ? 'Quote declined. The next nearby provider has been alerted.' : 'Quote declined. Ekazi will keep looking for another provider.'); await refresh(); }
    catch (error) { setNotice(messageOf(error)); }
  };
  const completedBookings = completedJobs.filter((job) => job.booking?.id);
  return <section className="panel wide"><div className="section-head"><h3>Quotes received</h3><WalletCards size={26} /></div><div className="list">{jobs.map((job) => <div key={job.id} className="quote-group"><JobRow job={job} actionLabel="Load real quotes" onAction={() => void loadQuotes(job.id)} /><QuoteList quotes={quotes[job.id] || []} onAccept={accept} onDecline={decline} /></div>)}{completedBookings.map((job) => <ClientBookingRating key={job.booking?.id || job.id} job={job} authApi={authApi} setNotice={setNotice} refresh={refresh} />)}{!jobs.length && !completedBookings.length ? <Empty text="No requests yet. Quotes and completed bookings will appear here from real provider activity." /> : null}</div></section>;
}

function ClientBookingRating({ job, authApi, setNotice, refresh }: { job: Job; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const bookingId = job.booking?.id;
  const savedRating = Number(job.booking?.review?.rating || 0);
  const submit = async () => {
    if (!bookingId) return;
    if (!rating) return setNotice('Choose 1 to 5 stars before submitting.');
    setSaving(true);
    try {
      await authApi(`/api/bookings/${bookingId}/rating`, { method: 'POST', body: { rating, comment: comment.trim() || undefined } });
      setNotice('Provider rating saved. Thank you for helping keep Ekazi reliable.');
      await refresh();
    } catch (error) { setNotice(messageOf(error)); } finally { setSaving(false); }
  };
  return <article className="quote-card rating-card"><div className="quote-body"><p className="eyebrow">Completed booking #{bookingId}</p><h4>{job.booking?.providerName || 'Ekazi Provider'}</h4><p className="muted">{job.description}</p><p className="muted"><MapPin size={14} /> {job.estate}, {job.city}</p>{savedRating ? <p className="saving">You rated this provider {savedRating}/5.</p> : <><div className="star-row">{[1, 2, 3, 4, 5].map((value) => <button key={value} className={value <= rating ? 'star active' : 'star'} onClick={() => setRating(value)} aria-label={`Rate ${value} stars`}><Star size={18} fill="currentColor" /></button>)}</div><textarea className="inline-textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment for the provider and Ekazi" rows={3} /></>}</div><div className="quote-actions">{savedRating ? <span className="status">Reviewed</span> : <button className="primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Saving...' : 'Submit rating'}</button>}</div></article>;
}

function HandymanJobs({ jobs, verification, blockedMessage, authApi, setNotice, refresh }: { jobs: Job[]; verification: Verification | null; blockedMessage: string; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const canReceiveJobs = Boolean(verification?.verified);
  const visibleJobs = canReceiveJobs ? jobs : [];
  const lockMessage = blockedMessage || 'Profile photo and national ID must be approved by Ekazi admin before nearby jobs or quote tools unlock.';
  useEffect(() => { if (!canReceiveJobs && activeJob) setActiveJob(null); }, [canReceiveJobs, activeJob]);
  return <div className="grid two">
    <VerificationGate verification={verification} message={canReceiveJobs ? 'Account active for nearby jobs and quotes.' : lockMessage} />
    <section className="panel">
      <div className="section-head"><h3>{canReceiveJobs ? 'Nearest open jobs' : 'Nearby jobs locked'}</h3><Navigation size={25} /></div>
      {!canReceiveJobs ? <Empty text="Upload your profile photo and National ID from Profile. Nearby work only appears after both are approved." /> : null}
      <div className="list">{visibleJobs.map((job) => <JobRow key={job.id} job={job} actionLabel="Send quote" onAction={() => setActiveJob(job)} />)}{canReceiveJobs && !visibleJobs.length ? <Empty text="No nearby jobs in your categories and service radius right now." /> : null}</div>
    </section>
    {canReceiveJobs ? <QuoteForm job={activeJob} authApi={authApi} setNotice={setNotice} refresh={refresh} /> : <section className="panel locked-panel"><h3>Quote submission locked</h3><p className="muted">Ekazi unlocks quote submission only after your required identity documents are approved.</p></section>}
  </div>;
}

function QuoteForm({ job, quote, authApi, setNotice, refresh }: { job: Job | null; quote?: Quote | null; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const [form, setForm] = useState({ labor: '2500', materials: '0', transport: '500', etaMinutes: '60', durationHours: '2', message: '' });
  useEffect(() => {
    if (quote) {
      setForm({ labor: String(quote.labor || 0), materials: String(quote.materials || 0), transport: String(quote.transport || 0), etaMinutes: String(quote.etaMinutes || 60), durationHours: String(quote.durationHours || 2), message: quote.message || '' });
    } else if (job) {
      setForm({ labor: '2500', materials: '0', transport: '500', etaMinutes: '60', durationHours: '2', message: '' });
    }
  }, [job?.id, quote?.id]);
  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const subtotal = Number(form.labor || 0) + Number(form.materials || 0) + Number(form.transport || 0);
  const discountPreview = Number(form.labor || 0) * (Number(job?.discountPercent || 0) / 100);
  const commission = Math.max(0, Number(form.labor || 0) * 0.10 - discountPreview);
  const submit = async () => {
    if (!job) return;
    try { await authApi(`/api/handyman/jobs/${job.id}/quotes`, { method: 'POST', body: { labor: Number(form.labor), materials: Number(form.materials), transport: Number(form.transport), etaMinutes: Number(form.etaMinutes), durationHours: Number(form.durationHours), message: form.message.trim() || undefined } }); setNotice(quote ? 'Quote updated for the client.' : 'Quote sent to the client.'); await refresh(); }
    catch (error) { setNotice(messageOf(error)); }
  };
  return <section className="panel"><h3>{job ? (quote ? 'Edit quote' : 'Send quote') : 'Select a job'}</h3>{job ? <><p className="muted"><MapPin size={15} /> {job.estate}, {job.city}{job.distanceKm != null ? ` - ${job.distanceKm.toFixed(1)} km` : ''}</p><p>{job.description}</p></> : <Empty text="Pick a nearby job from the board to quote." />}<div className="form-grid single"><Field label="Labour" value={form.labor} onChange={(v) => update('labor', v)} /><Field label="Materials" value={form.materials} onChange={(v) => update('materials', v)} /><Field label="Transport" value={form.transport} onChange={(v) => update('transport', v)} /><Field label="ETA minutes" value={form.etaMinutes} onChange={(v) => update('etaMinutes', v)} /><Field label="Duration hours" value={form.durationHours} onChange={(v) => update('durationHours', v)} /><Field label="Message to client (optional)" value={form.message} onChange={(v) => update('message', v)} textarea placeholder="Optional: explain what is included and when you can start." /></div><div className="commission-box"><span>Ekazi net commission after platform discount</span><strong>{money(commission)}</strong><small>Estimated net: {money(subtotal - commission)}</small></div><button className="primary" disabled={!job} onClick={() => void submit()}><Send size={18} /> {quote ? 'Update quote' : 'Submit quote'}</button></section>;
}

function HandymanQuotes({ quotes, authApi, setNotice, refresh }: { quotes: Quote[]; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const editJob = editingQuote ? { id: editingQuote.jobId || editingQuote.id, description: editingQuote.job?.description || 'Submitted quote', estate: editingQuote.job?.estate || '', city: editingQuote.job?.city || '', discountPercent: 0 } as Job : null;
  return <section className="panel wide"><div className="section-head"><h3>My quotes</h3><WalletCards size={26} /></div><div className="quote-list">{quotes.map((quote) => <article className="quote-card" key={quote.id}><div className="quote-body"><p className="eyebrow">{quote.job?.description || 'Provider quote'}</p><h4>{money(quote.total)}</h4><p className="muted">Labour {money(quote.labor)} + materials {money(quote.materials)} + transport {money(quote.transport)}</p>{quote.message ? <p>{quote.message}</p> : null}</div><div className="quote-actions">{quote.status === 'open' && !quote.booking?.id ? <button className="secondary" onClick={() => setEditingQuote(quote)}>Edit</button> : <span className="status">{quote.status || 'open'}</span>}</div></article>)}</div>{editingQuote ? <QuoteForm job={editJob} quote={editingQuote} authApi={authApi} setNotice={setNotice} refresh={async () => { await refresh(); setEditingQuote(null); }} /> : null}{quotes.filter((quote) => quote.booking?.id).map((quote) => <ProviderBookingActions key={quote.booking?.id} quote={quote} authApi={authApi} setNotice={setNotice} refresh={refresh} />)}{!quotes.length ? <Empty text="Quotes you send to clients will appear here." /> : null}</section>;
}

function ProviderBookingActions({ quote, authApi, setNotice, refresh }: { quote: Quote; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const bookingId = quote.booking?.id;
  const status = quote.booking?.status || '';
  const [busy, setBusy] = useState('');
  const action = async (next: 'arrived' | 'complete') => {
    if (!bookingId) return;
    setBusy(next);
    try {
      await authApi(`/api/bookings/${bookingId}/${next}`, { method: 'POST' });
      setNotice(next === 'arrived' ? 'Arrival marked. The client can see that service is starting.' : 'Job completed. The client can now rate your service.');
      await refresh();
    } catch (error) { setNotice(messageOf(error)); } finally { setBusy(''); }
  };
  return <article className="row-card"><div className="row-main"><p className="eyebrow">Booking #{bookingId}</p><h4>{quote.job?.description || 'Accepted booking'}</h4><p className="muted"><MapPin size={14} /> {quote.job?.estate || 'Client location'}, {quote.job?.city || 'Kenya'}</p><p className="muted">Status: {status === 'in_progress' ? 'Provider arrived' : status === 'completed' ? 'Completed' : status || 'confirmed'}</p></div><div className="quote-actions">{status === 'confirmed' ? <button className="primary" disabled={Boolean(busy)} onClick={() => void action('arrived')}>{busy === 'arrived' ? 'Saving...' : 'Arrived'}</button> : null}{status === 'in_progress' ? <button className="primary" disabled={Boolean(busy)} onClick={() => void action('complete')}>{busy === 'complete' ? 'Completing...' : 'Mark Complete'}</button> : null}{status === 'completed' ? <span className="status">Waiting for client rating</span> : null}</div></article>;
}

function ProfilePanel({ role, user, token, categories, authApi, setNotice, refresh, logout }: { role: Role; user: User; token: string; categories: Category[]; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void>; logout: () => void }) {
  return role === 'handyman' ? <HandymanProfile token={token} categories={categories} authApi={authApi} setNotice={setNotice} refresh={refresh} logout={logout} /> : <ClientProfile user={user} authApi={authApi} setNotice={setNotice} logout={logout} />;
}

function ClientProfile({ user, authApi, setNotice, logout }: { user: User; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; logout: () => void }) {
  return <section className="panel wide"><div className="profile-hero"><div><p className="eyebrow">Client profile</p><h3>{user.name}</h3><p>{user.email}</p><p><Phone size={15} /> {user.phone || 'Phone missing'}</p></div><BadgeCheck size={36} /></div><div className="grid two"><div className="mini-card"><strong>Preferred estate</strong><span>{user.preferredEstate || 'Not set'}</span></div><div className="mini-card"><strong>Contact</strong><span>{user.contactPreference || 'phone'}</span></div></div><AccountControls authApi={authApi} setNotice={setNotice} logout={logout} /></section>;
}

function HandymanProfile({ token, categories, authApi, setNotice, refresh, logout }: { token: string; categories: Category[]; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void>; logout: () => void }) {
  const [profile, setProfile] = useState<HandymanProfileData | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [form, setForm] = useState({ address: 'Nairobi CBD', estate: 'Kilimani', city: 'Nairobi', latitude: String(CENTER.latitude), longitude: String(CENTER.longitude), serviceRadiusKm: '20' });
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const data = await authApi<{ profile: HandymanProfileData | null; verification?: Verification }>('/api/handyman/profile');
    setProfile(data.profile); setVerification(data.verification || data.profile?.verification || null);
    if (data.profile) {
      setForm({ address: data.profile.address || 'Nairobi CBD', estate: data.profile.estate || 'Kilimani', city: data.profile.city || 'Nairobi', latitude: String(data.profile.latitude ?? CENTER.latitude), longitude: String(data.profile.longitude ?? CENTER.longitude), serviceRadiusKm: String(data.profile.serviceRadiusKm || data.profile.service_radius_km || 20) });
      setSelected(data.profile.categories || []);
    }
  }, [authApi]);
  useEffect(() => { void load(); }, [load]);
  const saveLocation = async () => {
    try { await authApi('/api/handyman/profile/location', { method: 'PUT', body: { ...form, latitude: Number(form.latitude), longitude: Number(form.longitude), serviceRadiusKm: Number(form.serviceRadiusKm), categories: selected } }); setNotice('Service profile saved.'); await load(); await refresh(); }
    catch (error) { setNotice(messageOf(error)); }
  };
  const uploadVerification = async (documentType: 'profile_image' | 'id_document' | 'certificate' | 'good_conduct', file: File | null) => {
    if (!file) return; setBusy(documentType);
    try { const uploadKind = file.type?.startsWith('image/') ? 'image' : documentType === 'profile_image' ? 'image' : 'doc'; const url = await uploadFile(file, token, uploadKind); const data = await authApi<{ profile: HandymanProfileData; verification?: Verification }>('/api/handyman/profile/verification', { method: 'PUT', body: { documentType, url } }); setProfile(data.profile); setVerification(data.verification || data.profile?.verification || null); setNotice('Document submitted for admin review.'); await load(); await refresh(); }
    catch (error) { setNotice(messageOf(error)); } finally { setBusy(''); }
  };
  const currentVerification = verification || profileVerification(profile);
  const canAddExtraServices = extraServiceQualificationReady(currentVerification, profile);
  return <section className="panel wide"><div className="section-head"><div><p className="eyebrow">Provider profile</p><h3>Service area and verification</h3></div><ShieldCheck size={30} /></div><div className="profile-grid"><div><div className="form-grid"><Field label="Address" value={form.address} onChange={(v) => setForm((p) => ({ ...p, address: v }))} /><Field label="Estate" value={form.estate} onChange={(v) => setForm((p) => ({ ...p, estate: v }))} /><Field label="City" value={form.city} onChange={(v) => setForm((p) => ({ ...p, city: v }))} /><Field label="Service radius km" value={form.serviceRadiusKm} onChange={(v) => setForm((p) => ({ ...p, serviceRadiusKm: v }))} /><Field label="Latitude" value={form.latitude} onChange={(v) => setForm((p) => ({ ...p, latitude: v }))} /><Field label="Longitude" value={form.longitude} onChange={(v) => setForm((p) => ({ ...p, longitude: v }))} /></div><CategoryPicker categories={categories} selected={selected} setSelected={setSelected} maxSelection={PROVIDER_FREE_SERVICE_LIMIT} canExceedLimit={canAddExtraServices} onLimitReached={() => setNotice('Upload a qualification certificate before adding a third service.')} /><p className="muted service-rule">Two services are available immediately. A submitted or approved qualification certificate unlocks extra service categories.</p><LocationPreview lat={Number(form.latitude)} lng={Number(form.longitude)} label={form.estate} /><button className="primary" onClick={() => void saveLocation()}><CheckCircle2 size={18} /> Save service profile</button></div><div><VerificationGate verification={currentVerification} message="Profile photo and national ID must be approved before nearby jobs and quote submission unlock." />{currentVerification?.profileImageUrl ? <img className="verification-avatar" src={currentVerification.profileImageUrl} alt="Approved or submitted profile" /> : null}<DocumentUploader title="Profile photo" required description="Required for active provider status. Use a clear face photo." status={currentVerification?.profileImageStatus || profile?.profile_image_status} currentUrl={currentVerification?.profileImageUrl || profile?.profile_image_url || null} busy={busy === 'profile_image'} accept="image/*" onPick={(file) => void uploadVerification('profile_image', file)} icon={<Camera size={20} />} /><DocumentUploader title="National ID" required description="Required. Upload a clear photo or PDF of your Kenyan ID." status={currentVerification?.idDocumentStatus || profile?.id_document_status} currentUrl={currentVerification?.idDocumentUrl || profile?.id_document_url || null} busy={busy === 'id_document'} accept="image/*,.pdf" onPick={(file) => void uploadVerification('id_document', file)} icon={<ShieldCheck size={20} />} /><DocumentUploader title="Qualification certificate" description="Optional trust badge shown to clients after approval." status={currentVerification?.certificateStatus || profile?.certificate_status} currentUrl={currentVerification?.certificateUrl || profile?.certificate_url || null} busy={busy === 'certificate'} accept="image/*,.pdf" onPick={(file) => void uploadVerification('certificate', file)} icon={<FileCheck2 size={20} />} /><DocumentUploader title="Good conduct" description="Optional trust badge shown to clients after approval." status={currentVerification?.goodConductStatus || profile?.good_conduct_status} currentUrl={currentVerification?.goodConductUrl || profile?.good_conduct_url || null} busy={busy === 'good_conduct'} accept="image/*,.pdf" onPick={(file) => void uploadVerification('good_conduct', file)} icon={<BadgeCheck size={20} />} /><p className={currentVerification?.verified ? 'verify-note ok' : 'verify-note danger'}>{currentVerification?.verified ? 'Account active for nearby jobs and quotes.' : 'Account not active for jobs until profile photo and National ID are approved.'}</p>{currentVerification?.fullyVerified ? <p className="verify-note ok">Fully verified: ID, profile, certificate and good conduct approved.</p> : null}</div></div><AccountControls authApi={authApi} setNotice={setNotice} logout={logout} /></section>;
}

function AccountControls({ authApi, setNotice, logout }: { authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; logout: () => void }) {
  const requestDeletion = async (scope: 'partial' | 'all') => {
    const area = scope === 'all' ? 'All personal data' : window.prompt('Which data should Ekazi review for deletion?', 'Profile, uploads, or optional activity data') || '';
    if (!area) return;
    try { const data = await authApi<{ message?: string }>('/api/user/data-deletion-request', { method: 'POST', body: { scope, area } }); setNotice(data.message || 'Deletion request received.'); }
    catch (error) { setNotice(messageOf(error)); }
  };
  const deleteAccount = async () => {
    if (!window.confirm('Delete your Ekazi account? Your account will be anonymized and you will be signed out.')) return;
    try { await authApi('/api/user/account', { method: 'DELETE' }); logout(); }
    catch (error) { setNotice(messageOf(error)); }
  };
  return <div className="account-controls"><span>Privacy and account controls</span><button onClick={() => void requestDeletion('partial')}>Request data deletion</button><button onClick={() => void requestDeletion('all')}>Request all data deletion</button><button className="danger-link" onClick={() => void deleteAccount()}>Delete account</button></div>;
}

function Messages({ conversations, authApi, setNotice, refresh }: { conversations: Conversation[]; authApi: <T>(path: string, init?: ApiInit) => Promise<T>; setNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const [active, setActive] = useState<Conversation | null>(conversations[0] || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  useEffect(() => { if (!active && conversations[0]) setActive(conversations[0]); }, [active, conversations]);
  useEffect(() => { if (!active) return; authApi<{ messages: ChatMessage[] }>(`/api/conversations/${active.id}/messages`).then((data) => setMessages(data.messages || [])).catch((e) => setNotice(messageOf(e))); }, [active, authApi, setNotice]);
  const send = async () => {
    if (!active || !body.trim()) return;
    try { const data = await authApi<{ message: ChatMessage }>(`/api/conversations/${active.id}/messages`, { method: 'POST', body: { body } }); setMessages((prev) => [...prev, data.message]); setBody(''); await refresh(); }
    catch (error) { setNotice(messageOf(error)); }
  };
  return <section className="panel wide messages-panel"><div className="conversation-list">{conversations.map((item) => <button key={item.id} className={active?.id === item.id ? 'active' : ''} onClick={() => setActive(item)}><strong>{item.otherUser?.name || 'Ekazi chat'}</strong><span>{item.job?.description || item.lastMessage || 'Booking conversation'}</span></button>)}{!conversations.length ? <Empty text="Messages open after a quote is accepted and a booking conversation starts." /> : null}</div><div className="chat-pane"><h3>{active?.otherUser?.name || 'Messages'}</h3><div className="chat-messages">{messages.map((message) => <div key={message.id} className={message.mine || message.sender === 'user' ? 'bubble mine' : 'bubble'}>{message.body}</div>)}{active && !messages.length ? <Empty text="No messages yet. Send the first update." /> : null}</div><div className="chat-input"><input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message" /><button className="primary" onClick={() => void send()}><Send size={17} /></button></div></div></section>;
}

function JobRow({ job, actionLabel, onAction, onDelete }: { job: Job; actionLabel: string; onAction: () => void; onDelete?: () => void }) {
  return <article className="row-card"><div className="row-main"><p className="eyebrow">{job.categoryName || job.serviceName || 'Ekazi job'}</p><h4>{job.description}</h4><p className="muted"><MapPin size={14} /> {job.estate}, {job.city}{job.distanceKm != null ? ` - ${job.distanceKm.toFixed(1)} km` : ''}</p><p className="muted"><CalendarClock size={14} /> {job.scheduleType || 'soon'} {job.scheduledFor ? `- ${new Date(job.scheduledFor).toLocaleString()}` : ''}</p>{job.client?.phone ? <p className="contact-line"><Phone size={14} /> Client: {job.client.phone}</p> : null}{job.photoUrls?.length ? <div className="thumb-strip">{job.photoUrls.slice(0, 4).map((url) => <img key={url} src={url} alt="Job" />)}</div> : null}</div><div className="row-actions"><button className="secondary" onClick={onAction}>{actionLabel}<ChevronRight size={16} /></button>{onDelete ? <button className="danger-link" onClick={onDelete}>Delete</button> : null}</div></article>;
}

function QuoteList({ quotes, onAccept, onDecline }: { quotes: Quote[]; onAccept?: (id: string) => Promise<void>; onDecline?: (id: string) => Promise<void> }) {
  if (!quotes.length) return <Empty text="No real quotes received yet." />;
  return <div className="quote-list">{quotes.map((quote) => <article className="quote-card" key={quote.id}>{quote.pro?.profileImageUrl ? <img className="avatar" src={quote.pro.profileImageUrl} alt={quote.pro.name || 'Provider'} /> : <div className="avatar fallback"><Hammer size={22} /></div>}<div className="quote-body"><p className="eyebrow">{quote.pro?.name || quote.job?.description || 'Provider quote'}</p><h4>{money(quote.total)}</h4><p className="muted">Labour {money(quote.labor)} + materials {money(quote.materials)} + transport {money(quote.transport)}</p>{quote.discountAmount ? <p className="saving">FIRST5 saving: {money(quote.discountAmount)}</p> : null}{quote.message ? <p>{quote.message}</p> : null}<TrustBadges quote={quote} /><ProviderReputation quote={quote} /></div><div className="quote-actions">{quote.pro?.phone ? <a className="secondary" href={`tel:${quote.pro.phone}`}><Phone size={16} /> Call</a> : null}{onAccept && quote.status === 'open' ? <><button className="secondary" onClick={() => void onDecline?.(quote.id)}>Decline</button><button className="primary" onClick={() => void onAccept(quote.id)}>Accept</button></> : <span className="status">{quote.status || 'open'}</span>}</div></article>)}</div>;
}

function ProviderReputation({ quote }: { quote: Quote }) {
  const ratingCount = Number(quote.pro?.ratingCount || 0);
  const ratingAvg = Number(quote.pro?.ratingAvg || 0);
  const reviews = Array.isArray(quote.pro?.reviews) ? quote.pro.reviews.filter((item) => item?.comment).slice(0, 2) : [];
  return <div className="provider-reputation"><strong>{ratingCount > 0 ? `${ratingAvg.toFixed(1)}/5 from ${ratingCount} completed review${ratingCount === 1 ? '' : 's'}` : 'New provider - no completed client ratings yet'}</strong>{reviews.map((review, index) => <p key={review.reviewedAt || index}>"{review.comment}" <span>{review.rating}/5</span></p>)}</div>;
}

function TrustBadges({ quote }: { quote: Quote }) {
  const badges = [quote.pro?.verifiedId ? 'ID verified' : '', quote.pro?.profileImageStatus === 'approved' ? 'Photo verified' : '', quote.pro?.certificateStatus === 'approved' ? 'Certificate' : '', quote.pro?.goodConductStatus === 'approved' ? 'Good conduct' : '', quote.pro?.fullyVerified ? 'Fully verified' : ''].filter(Boolean);
  return badges.length ? <div className="badge-row">{badges.map((badge) => <span key={badge}><BadgeCheck size={13} /> {badge}</span>)}</div> : null;
}

function VerificationGate({ verification, message }: { verification: Verification | null; message: string }) {
  const active = Boolean(verification?.verified);
  return <section className={active ? 'verify-card active' : 'verify-card'}><div><p className="eyebrow">Verification</p><h3>{active ? 'Active for jobs' : 'Action required'}</h3><p>{message}</p></div><div className="verify-status"><StatusPill status={verification?.profileImageStatus} label="Photo" /><StatusPill status={verification?.idDocumentStatus} label="ID" /><StatusPill status={verification?.certificateStatus} label="Certificate" /><StatusPill status={verification?.goodConductStatus} label="Good conduct" /></div></section>;
}

function DocumentUploader({ title, status, required, busy, accept, onPick, icon, currentUrl, description }: { title: string; status?: string; required?: boolean; busy: boolean; accept: string; onPick: (file: File | null) => void; icon: React.ReactNode; currentUrl?: string | null; description?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isImage = Boolean(currentUrl && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(currentUrl));
  return <div className="document-row rich"><div className="document-main">{isImage ? <img className="document-thumb" src={currentUrl || ''} alt={title} /> : <span className="document-icon">{icon}</span>}<div><strong>{title}{required ? ' *' : ''}</strong>{description ? <p>{description}</p> : null}{currentUrl ? <a href={currentUrl} target="_blank" rel="noreferrer">Open submitted document</a> : null}</div></div><div className="document-actions"><StatusPill status={status} /><input ref={inputRef} type="file" accept={accept} onChange={(e) => onPick(e.target.files?.[0] || null)} /><button className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />} {status && status !== 'missing' ? 'Replace' : 'Upload'}</button></div></div>;
}

function StatusPill({ status, label }: { status?: string; label?: string }) {
  const value = status || 'missing';
  const Icon = value === 'approved' ? CheckCircle2 : value === 'rejected' ? XCircle : value === 'pending' ? Loader2 : ShieldCheck;
  return <span className={`pill ${value}`}><Icon size={13} /> {label ? `${label}: ` : ''}{value.replace('_', ' ')}</span>;
}

function CategoryPicker({ categories, selected, setSelected, single = false, maxSelection, canExceedLimit = false, onLimitReached }: { categories: Category[]; selected: string[]; setSelected: (next: string[]) => void; single?: boolean; maxSelection?: number; canExceedLimit?: boolean; onLimitReached?: () => void }) {
  const choose = (categoryId: string) => {
    const next = single ? [categoryId] : selected.includes(categoryId) ? selected.filter((id) => id !== categoryId) : [...selected, categoryId];
    if (!single && maxSelection && next.length > maxSelection && !canExceedLimit) {
      onLimitReached?.();
      return;
    }
    setSelected(next);
  };
  return <div className="category-grid">{categories.map((category) => <button key={category.id} className={selected.includes(category.id) ? 'chip active' : 'chip'} onClick={() => choose(category.id)}>{category.name}</button>)}</div>;
}

function LocationPreview({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const ok = Number.isFinite(lat) && Number.isFinite(lng);
  const src = ok ? `https://www.google.com/maps?q=${lat},${lng}&z=14&output=embed` : '';
  return <div className="map-card">{ok ? <iframe title="Ekazi location map" src={src} loading="lazy" /> : <div className="map-placeholder"><MapPin /> Add coordinates to preview the map.</div>}<span>{label}</span></div>;
}

function Field({ label, value, onChange, type = 'text', textarea = false, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; textarea?: boolean; placeholder?: string }) {
  return <label className={textarea ? 'field span' : 'field'}><span>{label}</span>{textarea ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder} /> : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}</label>;
}

function PublicLegalPage({ page }: { page: (typeof LEGAL_PAGES)[string] }) {
  return <main className="legal-shell">
    <nav className="legal-nav"><a className="logo-lockup" href="/"><span className="logo-mark small">E</span><span>Ekazi</span></a><a className="ghost" href="/">Open Ekazi</a></nav>
    <article className="legal-card">
      <p className="eyebrow">Ekazi policy</p>
      <h1>{page.title}</h1>
      <p className="legal-updated">Last updated: {page.updated}</p>
      <p className="lead legal-lead">{page.intro}</p>
      {page.sections.map((section) => <section key={section.heading} className="legal-section"><h2>{section.heading}</h2><p>{section.body}</p></section>)}
    </article>
    <PolicyFooter />
  </main>;
}

function PolicyFooter({ compact = false }: { compact?: boolean }) {
  return <footer className={compact ? 'policy-footer compact' : 'policy-footer'}>{POLICY_LINKS.map(([label, url]) => <a key={url} href={url}>{label}</a>)}</footer>;
}

function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }

function dynamicPrompts(category: string) {
  const key = Object.keys(promptMap).find((item) => category.toLowerCase().includes(item));
  return key ? promptMap[key] : DEFAULT_PROMPTS;
}

function profileVerification(profile: HandymanProfileData | null): Verification | null {
  if (!profile) return null;
  return { profileImageUrl: profile.profile_image_url, idDocumentUrl: profile.id_document_url, certificateUrl: profile.certificate_url, goodConductUrl: profile.good_conduct_url, profileImageStatus: profile.profile_image_status || 'missing', idDocumentStatus: profile.id_document_status || 'missing', certificateStatus: profile.certificate_status || 'missing', goodConductStatus: profile.good_conduct_status || 'missing', verified: Boolean(profile.verified), fullyVerified: Boolean(profile.verified && profile.certificate_status === 'approved' && profile.good_conduct_status === 'approved') };
}
