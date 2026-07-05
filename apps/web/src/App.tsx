import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Hammer,
  Home,
  LogOut,
  MapPin,
  RefreshCw,
  Send,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';

const API_BASE =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  'https://server.ekazi.co.ke';

type Role = 'client' | 'handyman';
type User = { id: string | number; name?: string; email?: string; phone?: string; role: Role };
type Category = { id: string; name: string };
type Job = {
  id: string;
  categoryId?: string;
  categoryName?: string;
  serviceName?: string;
  description: string;
  estate: string;
  city: string;
  address?: string | null;
  scheduleType?: string;
  scheduledFor?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  quoteCount?: number;
  status?: string;
};
type Quote = {
  id: string;
  total: number;
  labor: number;
  materials: number;
  transport: number;
  discountAmount?: number;
  message?: string;
  status?: string;
  etaMinutes?: number;
  durationHours?: number;
  pro?: { name?: string; ratingAvg?: number; ratingCount?: number; jobsCompleted?: number };
  job?: { description?: string; estate?: string; city?: string; status?: string };
};

const money = (value?: number | null) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ekazi_web_token') || '');
  const [user, setUser] = useState<User | null>(() => readJson<User | null>('ekazi_web_user', null));
  const [notice, setNotice] = useState('');

  const onAuth = (nextToken: string, nextUser: User) => {
    localStorage.setItem('ekazi_web_token', nextToken);
    localStorage.setItem('ekazi_web_user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  };

  const logout = () => {
    localStorage.removeItem('ekazi_web_token');
    localStorage.removeItem('ekazi_web_user');
    setToken('');
    setUser(null);
  };

  return (
    <div className="app">
      {notice ? <div className="toast">{notice}</div> : null}
      {token && user ? (
        <Workspace token={token} user={user} logout={logout} setNotice={setNotice} />
      ) : (
        <AuthPage onAuth={onAuth} setNotice={setNotice} />
      )}
    </div>
  );
}

function AuthPage({
  onAuth,
  setNotice,
}: {
  onAuth: (token: string, user: User) => void;
  setNotice: (message: string) => void;
}) {
  const [mode, setMode] = useState<'signin' | 'create'>('create');
  const [role, setRole] = useState<Role>('client');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '+254700000001',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === 'create' && form.password !== form.confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      const path = mode === 'create' ? '/api/auth/register' : '/api/auth/login';
      const body =
        mode === 'create'
          ? { name: form.name, email: form.email, phone: form.phone, password: form.password, role }
          : { phone: form.phone || form.email, password: form.password };
      const data = await api<{ token: string; user: User }>(path, { method: 'POST', body });
      onAuth(data.token, data.user);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const googleAuth = async (credential?: string) => {
    if (!credential) return setNotice('Google did not return a credential.');
    setLoading(true);
    try {
      const data = await api<{ token: string; user: User }>('/api/auth/google', {
        method: 'POST',
        body: { idToken: credential, role, phone: form.phone || undefined },
      });
      onAuth(data.token, data.user);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="brand-panel">
        <div className="logo-mark">E</div>
        <p className="eyebrow">Kenyan handyman marketplace</p>
        <h1>Ekazi</h1>
        <p className="lead">
          Request reliable local help, compare real quotes, and let verified handymen win work across Nairobi.
        </p>
        <div className="trust-grid">
          <span><ShieldCheck size={18} /> Google sign-in</span>
          <span><WalletCards size={18} /> FIRST10 quotes</span>
          <span><MapPin size={18} /> Estate-aware jobs</span>
        </div>
      </section>

      <section className="auth-card">
        <div className="mode-row">
          <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create account</button>
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign in</button>
        </div>

        <div className="role-row">
          <button className={role === 'client' ? 'role active' : 'role'} onClick={() => setRole('client')}>
            <Home size={18} /> I need help
          </button>
          <button className={role === 'handyman' ? 'role active' : 'role'} onClick={() => setRole('handyman')}>
            <Hammer size={18} /> I do jobs
          </button>
        </div>

        <div className="google-box">
          <GoogleLogin
            onSuccess={(response) => void googleAuth(response.credential)}
            onError={() => setNotice('Google sign-in could not start.')}
            useOneTap={false}
            text={mode === 'create' ? 'continue_with' : 'signin_with'}
          />
        </div>

        <div className="divider"><span>or use phone and password</span></div>

        {mode === 'create' ? (
          <>
            <Field label="Full name" value={form.name} onChange={(value) => update('name', value)} />
            <Field label="Email" value={form.email} onChange={(value) => update('email', value)} />
          </>
        ) : null}
        <Field label="Phone or email" value={form.phone} onChange={(value) => update('phone', value)} />
        <Field label="Password" type="password" value={form.password} onChange={(value) => update('password', value)} />
        {mode === 'create' ? (
          <Field
            label="Confirm password"
            type="password"
            value={form.confirmPassword}
            onChange={(value) => update('confirmPassword', value)}
          />
        ) : null}

        <button className="primary full" disabled={loading} onClick={() => void submit()}>
          {loading ? 'Working...' : mode === 'create' ? 'Create account' : 'Sign in'}
        </button>
      </section>
    </main>
  );
}

function Workspace({
  token,
  user,
  logout,
  setNotice,
}: {
  token: string;
  user: User;
  logout: () => void;
  setNotice: (message: string) => void;
}) {
  const isHandyman = user.role === 'handyman';
  const [tab, setTab] = useState(isHandyman ? 'jobs' : 'dashboard');
  const [categories, setCategories] = useState<Category[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [handymanJobs, setHandymanJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote[]>>({});
  const [handymanQuotes, setHandymanQuotes] = useState<Quote[]>([]);
  const [promo, setPromo] = useState<{ eligible?: boolean; description?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const authApi = useCallback(
    <T,>(path: string, init?: ApiInit) => api<T>(path, init, token),
    [token],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const catalog = await api<{ categories: Category[] }>('/api/categories');
      setCategories(catalog.categories || []);
      if (isHandyman) {
        const [openJobs, ownQuotes] = await Promise.all([
          authApi<{ jobs: Job[] }>('/api/handyman/jobs'),
          authApi<{ quotes: Quote[] }>('/api/handyman/quotes'),
        ]);
        setHandymanJobs(openJobs.jobs || []);
        setHandymanQuotes(ownQuotes.quotes || []);
      } else {
        const [clientJobs, promotion] = await Promise.all([
          authApi<{ jobs: Job[] }>('/api/jobs?status=active'),
          authApi<{ eligible?: boolean; description?: string }>('/api/promotions/first-job'),
        ]);
        setJobs(clientJobs.jobs || []);
        setPromo(promotion);
      }
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [authApi, isHandyman, setNotice]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadQuotes = async (jobId: string) => {
    try {
      const data = await authApi<{ quotes: Quote[] }>(`/api/jobs/${jobId}/quotes`);
      setQuotes((prev) => ({ ...prev, [jobId]: data.quotes || [] }));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const navItems = isHandyman
    ? [
        ['jobs', 'Job board', BriefcaseBusiness],
        ['quotes', 'My quotes', WalletCards],
        ['profile', 'Profile', ShieldCheck],
      ]
    : [
        ['dashboard', 'Dashboard', Home],
        ['request', 'Request job', Send],
        ['quotes', 'Quotes', WalletCards],
      ];

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="side-brand"><div className="logo-mark small">E</div><strong>Ekazi</strong></div>
        <nav>
          {navItems.map(([id, label, Icon]) => (
            <button key={id as string} className={tab === id ? 'active' : ''} onClick={() => setTab(id as string)}>
              <Icon size={18} /> {label as string}
            </button>
          ))}
        </nav>
        <button className="ghost" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{isHandyman ? 'Handyman workspace' : 'Client workspace'}</p>
            <h2>{user.name || 'Ekazi user'}</h2>
          </div>
          <button className="ghost" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw size={18} /> Refresh
          </button>
        </header>

        {!isHandyman && tab === 'dashboard' ? (
          <ClientDashboard jobs={jobs} promo={promo} loadQuotes={loadQuotes} quotes={quotes} />
        ) : null}
        {!isHandyman && tab === 'request' ? (
          <RequestJob categories={categories} authApi={authApi} onCreated={refresh} setNotice={setNotice} />
        ) : null}
        {!isHandyman && tab === 'quotes' ? (
          <ClientQuotes jobs={jobs} quotes={quotes} loadQuotes={loadQuotes} authApi={authApi} setNotice={setNotice} refresh={refresh} />
        ) : null}
        {isHandyman && tab === 'jobs' ? (
          <HandymanJobs jobs={handymanJobs} authApi={authApi} setNotice={setNotice} refresh={refresh} />
        ) : null}
        {isHandyman && tab === 'quotes' ? <HandymanQuotes quotes={handymanQuotes} /> : null}
        {isHandyman && tab === 'profile' ? (
          <HandymanProfile categories={categories} authApi={authApi} setNotice={setNotice} />
        ) : null}
      </section>
    </main>
  );
}

function ClientDashboard({
  jobs,
  promo,
  loadQuotes,
  quotes,
}: {
  jobs: Job[];
  promo: { eligible?: boolean; description?: string } | null;
  loadQuotes: (jobId: string) => Promise<void>;
  quotes: Record<string, Quote[]>;
}) {
  return (
    <div className="grid two">
      <section className="panel offer">
        <p className="eyebrow">First booking</p>
        <h3>FIRST10 {promo?.eligible ? 'is ready' : 'status'}</h3>
        <p>{promo?.description || '10% is deducted from your first accepted quote when eligible.'}</p>
      </section>
      <section className="panel">
        <p className="eyebrow">Active requests</p>
        <h3>{jobs.length} job{jobs.length === 1 ? '' : 's'}</h3>
        <p>Track quotes from verified handymen and accept the best fit.</p>
      </section>
      <section className="panel wide">
        <h3>Recent jobs</h3>
        <div className="list">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} actionLabel={`View ${job.quoteCount || 0} quotes`} onAction={() => void loadQuotes(job.id)} />
          ))}
          {!jobs.length ? <Empty text="No requests yet. Create a job to start receiving quotes." /> : null}
        </div>
        {Object.entries(quotes).map(([jobId, list]) => (
          <QuoteList key={jobId} quotes={list} />
        ))}
      </section>
    </div>
  );
}

function RequestJob({
  categories,
  authApi,
  onCreated,
  setNotice,
}: {
  categories: Category[];
  authApi: <T>(path: string, init?: ApiInit) => Promise<T>;
  onCreated: () => Promise<void>;
  setNotice: (message: string) => void;
}) {
  const [form, setForm] = useState({
    categoryId: '',
    description: '',
    estate: 'Kilimani',
    city: 'Nairobi',
    address: '',
    scheduleType: 'soon',
    scheduledFor: '',
    budgetMin: '1500',
    budgetMax: '8000',
    providerBringsMaterials: true,
    notes: '',
  });
  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === form.categoryId) || categories[0],
    [categories, form.categoryId],
  );

  useEffect(() => {
    if (!form.categoryId && categories[0]) setForm((prev) => ({ ...prev, categoryId: categories[0].id }));
  }, [categories, form.categoryId]);

  const update = (key: keyof typeof form, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    try {
      await authApi('/api/jobs', {
        method: 'POST',
        body: {
          categoryId: form.categoryId,
          categoryName: selectedCategory?.name,
          description: form.description,
          estate: form.estate,
          city: form.city,
          address: form.address,
          scheduleType: form.scheduleType,
          scheduledFor: form.scheduledFor || null,
          flexibleSchedule: form.scheduleType === 'flexible',
          budgetMin: Number(form.budgetMin) || null,
          budgetMax: Number(form.budgetMax) || null,
          providerBringsMaterials: form.providerBringsMaterials,
          notes: form.notes,
          discountCode: 'FIRST10',
        },
      });
      setNotice('Job posted. Handymen can now send real quotes.');
      setForm((prev) => ({ ...prev, description: '', notes: '' }));
      await onCreated();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  return (
    <section className="panel wide">
      <h3>Request a quote</h3>
      <div className="category-grid">
        {categories.map((category) => (
          <button
            key={category.id}
            className={form.categoryId === category.id ? 'chip active' : 'chip'}
            onClick={() => update('categoryId', category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <Field label="Describe the job" value={form.description} onChange={(value) => update('description', value)} textarea />
        <Field label="Estate" value={form.estate} onChange={(value) => update('estate', value)} />
        <Field label="City" value={form.city} onChange={(value) => update('city', value)} />
        <Field label="Address / landmark" value={form.address} onChange={(value) => update('address', value)} />
        <Field label="Schedule type" value={form.scheduleType} onChange={(value) => update('scheduleType', value)} />
        <Field label="Scheduled for" type="datetime-local" value={form.scheduledFor} onChange={(value) => update('scheduledFor', value)} />
        <Field label="Minimum budget" value={form.budgetMin} onChange={(value) => update('budgetMin', value)} />
        <Field label="Maximum budget" value={form.budgetMax} onChange={(value) => update('budgetMax', value)} />
        <Field label="Notes" value={form.notes} onChange={(value) => update('notes', value)} textarea />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={form.providerBringsMaterials}
          onChange={(event) => update('providerBringsMaterials', event.target.checked)}
        />
        Ask provider to include materials in the quote.
      </label>
      <button className="primary" onClick={() => void submit()}><Send size={18} /> Post job</button>
    </section>
  );
}

function ClientQuotes({
  jobs,
  quotes,
  loadQuotes,
  authApi,
  setNotice,
  refresh,
}: {
  jobs: Job[];
  quotes: Record<string, Quote[]>;
  loadQuotes: (jobId: string) => Promise<void>;
  authApi: <T>(path: string, init?: ApiInit) => Promise<T>;
  setNotice: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const accept = async (quoteId: string) => {
    try {
      await authApi(`/api/quotes/${quoteId}/accept`, { method: 'POST' });
      setNotice('Quote accepted. Your booking is confirmed.');
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  return (
    <section className="panel wide">
      <h3>Quotes received</h3>
      <div className="list">
        {jobs.map((job) => (
          <div key={job.id} className="quote-group">
            <JobRow job={job} actionLabel="Load quotes" onAction={() => void loadQuotes(job.id)} />
            <QuoteList quotes={quotes[job.id] || []} onAccept={accept} />
          </div>
        ))}
        {!jobs.length ? <Empty text="No jobs yet. Post a request and quotes will appear here." /> : null}
      </div>
    </section>
  );
}

function HandymanJobs({
  jobs,
  authApi,
  setNotice,
  refresh,
}: {
  jobs: Job[];
  authApi: <T>(path: string, init?: ApiInit) => Promise<T>;
  setNotice: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Available jobs</h3>
        <div className="list">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} actionLabel="Send quote" onAction={() => setActiveJob(job)} />
          ))}
          {!jobs.length ? <Empty text="No open jobs right now. Refresh after clients post new requests." /> : null}
        </div>
      </section>
      <QuoteForm job={activeJob} authApi={authApi} setNotice={setNotice} refresh={refresh} />
    </div>
  );
}

function QuoteForm({
  job,
  authApi,
  setNotice,
  refresh,
}: {
  job: Job | null;
  authApi: <T>(path: string, init?: ApiInit) => Promise<T>;
  setNotice: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    labor: '2500',
    materials: '0',
    transport: '500',
    etaMinutes: '60',
    durationHours: '2',
    message: '',
  });
  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!job) return;
    try {
      await authApi(`/api/handyman/jobs/${job.id}/quotes`, {
        method: 'POST',
        body: {
          labor: Number(form.labor),
          materials: Number(form.materials),
          transport: Number(form.transport),
          etaMinutes: Number(form.etaMinutes),
          durationHours: Number(form.durationHours),
          message: form.message,
        },
      });
      setNotice('Quote sent to the client.');
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  return (
    <section className="panel">
      <h3>{job ? 'Send quote' : 'Select a job'}</h3>
      {job ? <p className="muted">{job.description} in {job.estate}, {job.city}</p> : <Empty text="Pick a job from the board to quote." />}
      <div className="form-grid single">
        <Field label="Labour" value={form.labor} onChange={(value) => update('labor', value)} />
        <Field label="Materials" value={form.materials} onChange={(value) => update('materials', value)} />
        <Field label="Transport" value={form.transport} onChange={(value) => update('transport', value)} />
        <Field label="ETA minutes" value={form.etaMinutes} onChange={(value) => update('etaMinutes', value)} />
        <Field label="Duration hours" value={form.durationHours} onChange={(value) => update('durationHours', value)} />
        <Field label="Message" value={form.message} onChange={(value) => update('message', value)} textarea />
      </div>
      <button className="primary" disabled={!job} onClick={() => void submit()}><Send size={18} /> Submit quote</button>
    </section>
  );
}

function HandymanQuotes({ quotes }: { quotes: Quote[] }) {
  return (
    <section className="panel wide">
      <h3>My quotes</h3>
      <QuoteList quotes={quotes} />
      {!quotes.length ? <Empty text="Quotes you send to clients will appear here." /> : null}
    </section>
  );
}

function HandymanProfile({
  categories,
  authApi,
  setNotice,
}: {
  categories: Category[];
  authApi: <T>(path: string, init?: ApiInit) => Promise<T>;
  setNotice: (message: string) => void;
}) {
  const [form, setForm] = useState({
    address: 'Nairobi CBD',
    estate: 'Kilimani',
    city: 'Nairobi',
    latitude: '-1.2921',
    longitude: '36.8219',
  });
  const [selected, setSelected] = useState<string[]>([]);

  const save = async () => {
    try {
      await authApi('/api/handyman/profile/location', {
        method: 'PUT',
        body: {
          ...form,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          categories: selected,
        },
      });
      setNotice('Service location saved.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  return (
    <section className="panel wide">
      <h3>Service profile</h3>
      <div className="category-grid">
        {categories.map((category) => (
          <button
            key={category.id}
            className={selected.includes(category.id) ? 'chip active' : 'chip'}
            onClick={() =>
              setSelected((prev) =>
                prev.includes(category.id) ? prev.filter((id) => id !== category.id) : [...prev, category.id],
              )
            }
          >
            {category.name}
          </button>
        ))}
      </div>
      <div className="form-grid">
        {(['address', 'estate', 'city', 'latitude', 'longitude'] as const).map((key) => (
          <Field key={key} label={key} value={form[key]} onChange={(value) => setForm((prev) => ({ ...prev, [key]: value }))} />
        ))}
      </div>
      <button className="primary" onClick={() => void save()}><CheckCircle2 size={18} /> Save profile</button>
    </section>
  );
}

function JobRow({ job, actionLabel, onAction }: { job: Job; actionLabel: string; onAction: () => void }) {
  return (
    <article className="row-card">
      <div>
        <p className="eyebrow">{job.categoryName || job.serviceName || 'Ekazi job'}</p>
        <h4>{job.description}</h4>
        <p className="muted"><MapPin size={14} /> {job.estate}, {job.city}</p>
        <p className="muted"><CalendarClock size={14} /> {job.scheduleType || 'soon'} {job.scheduledFor ? `- ${new Date(job.scheduledFor).toLocaleString()}` : ''}</p>
      </div>
      <button className="secondary" onClick={onAction}>{actionLabel}</button>
    </article>
  );
}

function QuoteList({ quotes, onAccept }: { quotes: Quote[]; onAccept?: (id: string) => Promise<void> }) {
  if (!quotes.length) return null;
  return (
    <div className="quote-list">
      {quotes.map((quote) => (
        <article className="quote-card" key={quote.id}>
          <div>
            <p className="eyebrow">{quote.pro?.name || quote.job?.description || 'Handyman quote'}</p>
            <h4>{money(quote.total)}</h4>
            <p className="muted">
              Labour {money(quote.labor)} + materials {money(quote.materials)} + transport {money(quote.transport)}
            </p>
            {quote.discountAmount ? <p className="saving">FIRST10 saving: {money(quote.discountAmount)}</p> : null}
            {quote.message ? <p>{quote.message}</p> : null}
          </div>
          {onAccept ? <button className="primary" onClick={() => void onAccept(quote.id)}>Accept</button> : <span className="status">{quote.status || 'open'}</span>}
        </article>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <label className={textarea ? 'field span' : 'field'}>
      <span>{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

type ApiInit = { method?: string; body?: unknown };

async function api<T>(path: string, init: ApiInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `Request failed (${response.status})`);
  return data as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default App;
