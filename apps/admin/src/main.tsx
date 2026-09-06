import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Banknote, Bike, CheckCircle2, ChevronRight, CircleAlert, Clock3, Headphones,
  Eye, EyeOff, KeyRound, LayoutDashboard, LogOut, Map, Menu, PackageCheck, Search,
  ShieldCheck, Store, TicketCheck, UsersRound, WalletCards, X,
} from 'lucide-react';
import { api, clearAuthSession, readAuthSession, saveAuthSession, type StoredAuthSession } from '@sokoeats/shared/api';
import type { DashboardMetric, Order, Ticket, Vendor } from '@sokoeats/shared/types';
import './styles.css';
import './password.css';
import { CustomerCareInbox } from './CustomerCareInbox';

type StaffRole = 'admin' | 'support';
type View = 'overview' | 'dispatch' | 'tickets' | 'vendors' | 'settlements' | 'coverage' | 'care';
type ComplianceSubmission = { vendorId: string; vendorName: string; applicationReference?: string; ownerName?: string; ownerEmail?: string; legalBusinessName: string; registrationNumber: string; kraPinMasked: string; directorName: string; directorNationalIdMasked: string; settlementMethod: string; settlementAccountMasked: string; commissionRateBps: number; verificationStatus: string; payoutStatus: string; riskTier: string };
type FinancePayout = { reference: string; beneficiary_type: string; vendor_name?: string; rider_name?: string; amount: number; status: string; scheduled_for: string; failure_reason?: string };
type FinanceDashboard = { accounts: Array<{ code: string; name: string; balance: number }>; settlementSummary: Array<{ state: string; count: number; exposure: number }>; payoutSummary: Array<{ status: string; beneficiary_type: string; count: number; amount: number }>; vendorSubmissions: ComplianceSubmission[]; payouts: FinancePayout[]; payoutBatches: Array<FinancePayout & { payout_method: string; estimated_provider_fee: number }> };
type CoverageCity = { id: string; name: string; county: string; status: 'coming_soon' | 'onboarding' | 'active' | 'paused'; delivery_mode: string; zones: Array<{ id: string; name: string; status: string; radiusKm: number }> };
type MapPoint = { label: string; lat: number; lng: number };
type MapViewport = { center?: MapPoint; markers?: MapPoint[]; path?: MapPoint[] };
type MapsManifest = Record<string, any>;

const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;

function AuthGate({ onAuthenticated }: { onAuthenticated: (session: StoredAuthSession) => void }) {
  const [staffRole,setStaffRole]=useState<StaffRole>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async () => {
    setBusy(true); setMessage('');
    try {
      const session = await api<StoredAuthSession>('/api/auth/login', { method: 'POST', body: JSON.stringify({ role: staffRole, email, password }) });
      if (!['admin','support'].includes(session.user.role)) throw new Error('This dashboard is restricted to authorised platform staff.');
      saveAuthSession(session); onAuthenticated(session);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Staff sign-in failed'); }
    finally { setBusy(false); }
  };
  return <main className="authPage">
    <section className="authBrand"><div className="brandMark"><ShieldCheck /></div><p>SokoEats platform</p><h1>Marketplace control, risk, finance and compliance.</h1><span>Platform administrator accounts are provisioned by the backend and audited. Public account creation is disabled.</span></section>
    <section className="authForm">
      <p className="eyebrow">Restricted access</p><h2>Platform admin sign in</h2>
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@sokoeats.co.ke" /></label>
      <label>Workspace<select value={staffRole} onChange={event=>setStaffRole(event.target.value as StaffRole)}><option value="admin">Platform admin</option><option value="support">Customer care</option></select></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 8 characters" /></label>
      {message && <p className="formError">{message}</p>}
      <button className="primaryAction" disabled={busy} onClick={submit}>{busy ? 'Checking access...' : 'Sign in securely'}<ChevronRight size={18}/></button>
      <small>No Google sign-in or public registration is enabled for platform administrators.</small>
    </section>
  </main>;
}

const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }> = [
  { id: 'overview', label: 'Control center', icon: LayoutDashboard },
  { id: 'dispatch', label: 'Order dispatch', icon: Bike },
  { id: 'tickets', label: 'Ticket desk', icon: Headphones },
  { id: 'care', label: 'Customer care', icon: Headphones },
  { id: 'vendors', label: 'Vendor review', icon: Store },
  { id: 'settlements', label: 'Settlements', icon: WalletCards, adminOnly: true },
  { id: 'coverage', label: 'Coverage map', icon: Map },
];

function Status({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) { return <span className={`status ${tone}`}>{children}</span>; }

function ChangePasswordDialog({ forced, onClose, onChanged }: { forced: boolean; onClose: () => void; onChanged: (user: StoredAuthSession['user']) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    if (newPassword !== confirmPassword) return setMessage('New password and confirmation do not match.');
    setBusy(true);
    try {
      const result = await api<{ user: StoredAuthSession['user']; message: string }>('/api/auth/password', {
        method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }),
      });
      onChanged(result.user);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Password change failed.'); }
    finally { setBusy(false); }
  };
  return <div className="passwordBackdrop" role="presentation" onMouseDown={() => { if (!forced) onClose(); }}>
    <form className="passwordDialog" role="dialog" aria-modal="true" aria-labelledby="password-title" onMouseDown={event => event.stopPropagation()} onSubmit={submit}>
      <div className="passwordHeading"><div className="passwordIcon"><KeyRound/></div><div><p>{forced ? 'Secure your account' : 'Account security'}</p><h2 id="password-title">Change password</h2></div>{!forced && <button type="button" className="dialogClose" onClick={onClose} aria-label="Close"><X/></button>}</div>
      <p className="passwordIntro">{forced ? 'Replace the temporary password before starting customer-care work.' : 'Enter your current password, then choose a strong replacement.'}</p>
      <label>Current password<div className="passwordField"><input autoFocus type={showCurrent ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} required/><button type="button" onClick={()=>setShowCurrent(value=>!value)} aria-label={showCurrent?'Hide current password':'Show current password'}>{showCurrent?<EyeOff/>:<Eye/>}</button></div></label>
      <label>New password<div className="passwordField"><input type={showNew ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} minLength={12} required/><button type="button" onClick={()=>setShowNew(value=>!value)} aria-label={showNew?'Hide new password':'Show new password'}>{showNew?<EyeOff/>:<Eye/>}</button></div></label>
      <label>Confirm new password<div className="passwordField"><input type={showNew ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} minLength={12} required/></div></label>
      <small>Use at least 12 characters with uppercase, lowercase, a number and a special character.</small>
      {message && <p className="formError" role="alert">{message}</p>}
      <div className="passwordActions">{!forced && <button type="button" onClick={onClose}>Cancel</button>}<button className="savePassword" disabled={busy}>{busy?'Changing password...':'Change password'}</button></div>
    </form>
  </div>;
}

function App() {
  const [session, setSession] = useState<StoredAuthSession | null>(() => readAuthSession());
  const [view, setView] = useState<View>(() => readAuthSession()?.user.role==='support'?'care':'overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [maps, setMaps] = useState<MapsManifest | null>(null);
  const [coverage, setCoverage] = useState<CoverageCity[]>([]);
  const [notice, setNotice] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const role = session?.user.role as StaffRole | undefined;

  useEffect(() => {
    const handleExpiredSession = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      setNotice(message || 'Your session has expired. Please sign in again.');
      setSession(null);
    };
    window.addEventListener('sokoeats:session-expired', handleExpiredSession);
    return () => window.removeEventListener('sokoeats:session-expired', handleExpiredSession);
  }, []);

  const load = async () => {
    if (!session) return;
    if (session.user.role === 'support') {
      try { setTickets((await api<{tickets:Ticket[]}>('/api/tickets')).tickets); } catch (error) { setNotice(error instanceof Error ? error.message : 'Ticket desk unavailable.'); }
      return;
    }
    const results = await Promise.allSettled([
      api<{ metrics: DashboardMetric[] }>('/api/admin/overview'), api<{ orders: Order[] }>('/api/orders'),
      api<{ tickets: Ticket[] }>('/api/tickets'), api<{ vendors: Vendor[] }>('/api/vendors'),
      api<FinanceDashboard>('/api/admin/finance'), api<{ maps: MapsManifest }>('/api/maps/manifest'), api<{ cities: CoverageCity[] }>('/api/coverage'),
    ]);
    if (results[0].status === 'fulfilled') setMetrics(results[0].value.metrics);
    if (results[1].status === 'fulfilled') setOrders(results[1].value.orders);
    if (results[2].status === 'fulfilled') setTickets(results[2].value.tickets);
    if (results[3].status === 'fulfilled') setVendors(results[3].value.vendors);
    if (results[4].status === 'fulfilled') setFinance(results[4].value);
    if (results[5].status === 'fulfilled') setMaps(results[5].value.maps);
    if (results[6].status === 'fulfilled') setCoverage(results[6].value.cities);
  };
  useEffect(() => { void load(); }, [session?.user.id]);
  useEffect(() => { if (session?.user.profile?.mustChangePassword === true) setPasswordOpen(true); }, [session?.user.id, session?.user.profile?.mustChangePassword]);

  const filteredOrders = useMemo(() => orders.filter((item) => `${item.code} ${item.customerName} ${item.vendorName}`.toLowerCase().includes(query.toLowerCase())), [orders, query]);
  const filteredTickets = useMemo(() => tickets.filter((item) => `${item.code} ${item.subject} ${item.priority}`.toLowerCase().includes(query.toLowerCase())), [tickets, query]);
  const filteredVendors = useMemo(() => vendors.filter((item) => `${item.name} ${item.cuisine} ${item.status}`.toLowerCase().includes(query.toLowerCase())), [vendors, query]);
  const ticketAction = async (id: string, status: 'pending' | 'resolved') => { setNotice('Updating ticket...'); try { await api(`/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); setNotice(`Ticket marked ${status}.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Ticket update failed'); } };
  const reviewVendor = async (vendorId: string, status: 'verified' | 'under_review' | 'rejected' | 'suspended', riskTier?: 'new' | 'standard' | 'trusted' | 'restricted') => { setNotice('Saving review...'); try { const result = await api<{ emailNotification?: { status: string } }>(`/api/admin/vendors/${vendorId}/compliance`, { method: 'PATCH', body: JSON.stringify({ status, riskTier, note: 'Reviewed in the SokoEats staff portal.' }) }); await load(); setNotice(status === 'verified' ? result.emailNotification?.status === 'sent' ? 'Partner approved and notification email sent.' : result.emailNotification?.status === 'queued' ? 'Partner approved. The notification email is queued for automatic retry.' : 'Partner approval saved.' : 'Vendor review saved.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Review failed'); } };
  const processDue = async () => { setNotice('Creating eligible payouts...'); try { const result = await api<{ created: number }>('/api/finance/process-due', { method: 'POST' }); await load(); setNotice(`${result.created} payout instruction(s) created.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Payout processing failed'); } };
  const executePayout = async (reference: string) => { setNotice('Submitting payout...'); try { await api(`/api/finance/payouts/${reference}/execute`, { method: 'POST' }); await load(); setNotice('Payout submitted to the provider.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Payout failed'); } };
  const setCityStatus = async (city: CoverageCity, status: CoverageCity['status']) => { setNotice(`Updating ${city.name}...`); try { await api(`/api/admin/coverage/cities/${city.id}`, { method: 'PATCH', body: JSON.stringify({ status, deliveryMode: city.delivery_mode }) }); await load(); setNotice(`${city.name} is now ${status.replaceAll('_', ' ')}.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Coverage update failed'); } };

  if (!session) return <AuthGate onAuthenticated={next=>{setSession(next);setView(next.user.role==='support'?'care':'overview');}}/>;
  if (!['admin','support'].includes(session.user.role)) return <main className="authPage"><section className="authForm"><p className="eyebrow">Access denied</p><h2>Platform staff account required</h2><p>This account belongs in its assigned SokoEats workspace.</p><button className="primaryAction" onClick={() => { clearAuthSession(); setSession(null); }}>Return to sign in</button></section></main>;
  const availableNav = navItems.filter((item) => role === 'admin' || ['care','tickets'].includes(item.id));
  const title = availableNav.find((item) => item.id === view)?.label || 'Control center';
  const signOut = () => { clearAuthSession(); setSession(null); };
  return <main className="staffShell">
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="staffBrand"><div className="brandMark small"><PackageCheck/></div><div><b>SokoEats</b><span>Staff operations</span></div><button className="mobileClose" onClick={() => setMobileNav(false)} aria-label="Close menu"><X/></button></div>
      <nav>{availableNav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); setMobileNav(false); }}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="staffIdentity"><span>{role === 'admin' ? 'Operations admin' : 'Support specialist'}</span><b>{session.user.name}</b><small>{session.user.email}</small><button onClick={() => setPasswordOpen(true)}><KeyRound size={17}/>Change password</button><button onClick={signOut}><LogOut size={17}/>Sign out</button></div>
    </aside>
    <section className="workspace">
      <header className="workspaceHeader"><button className="menuButton" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu/></button><div><p>{role === 'admin' ? 'Marketplace operations' : 'Customer operations'}</p><h1>{title}</h1></div><label className="search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search current workspace"/></label></header>
      {view === 'care' && <CustomerCareInbox user={session.user}/>}

      {view === 'overview' && <>
        <div className="metricStrip">{metrics.map((metric, index) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small className={index === 3 ? 'attention' : ''}>{metric.delta || 'Live'}</small></article>)}</div>
        <div className="overviewGrid">
          <section className="panel wide"><div className="panelHeader"><div><p>Live marketplace</p><h2>Orders needing attention</h2></div><button onClick={() => setView('dispatch')}>Open dispatch<ChevronRight size={16}/></button></div><DataOrders items={orders.slice(0, 6)}/></section>
          <section className="panel"><div className="panelHeader"><div><p>Service desk</p><h2>Priority queue</h2></div><button onClick={() => setView('tickets')}>Open desk</button></div>{tickets.slice(0, 5).map((ticket) => <div className="compactRow" key={ticket.id}><div><b>{ticket.code}</b><span>{ticket.subject}</span></div><Status tone={ticket.priority === 'urgent' ? 'danger' : ticket.priority === 'high' ? 'warn' : 'neutral'}>{ticket.priority}</Status></div>)}</section>
          <section className="panel"><div className="panelHeader"><div><p>Partner supply</p><h2>Vendor readiness</h2></div><button onClick={() => setView('vendors')}>Review</button></div>{vendors.slice(0, 5).map((vendor) => <div className="compactRow" key={vendor.id}><div><b>{vendor.name}</b><span>{vendor.cuisine}</span></div><Status tone={vendor.status === 'active' ? 'good' : 'warn'}>{vendor.status}</Status></div>)}</section>
        </div>
      </>}

      {view === 'dispatch' && <section className="panel full"><div className="panelHeader"><div><p>Dispatch board</p><h2>Paid orders and delivery progress</h2></div><Status tone="good">{filteredOrders.length} orders</Status></div><DataOrders items={filteredOrders}/></section>}

      {view === 'tickets' && <section className="panel full"><div className="panelHeader"><div><p>Ticket desk</p><h2>Customer and delivery cases</h2></div><Status tone={filteredTickets.some((item) => item.priority === 'urgent') ? 'danger' : 'good'}>{filteredTickets.filter((item) => item.status !== 'resolved').length} open</Status></div><div className="dataTable"><div className="tableHead"><span>Case</span><span>Issue</span><span>Queue</span><span>Status</span><span>Action</span></div>{filteredTickets.map((ticket) => <div className="tableRow" key={ticket.id}><b>{ticket.code}</b><div><strong>{ticket.subject}</strong><small>{ticket.priority} priority</small></div><span>{ticket.assignedTeam}</span><Status tone={ticket.status === 'resolved' ? 'good' : ticket.priority === 'urgent' ? 'danger' : 'warn'}>{ticket.status}</Status><div className="rowActions"><button onClick={() => ticketAction(ticket.id, 'pending')}>Pending</button><button className="positive" onClick={() => ticketAction(ticket.id, 'resolved')}><CheckCircle2 size={15}/>Resolve</button></div></div>)}</div></section>}

      {view === 'vendors' && <section className="panel full"><div className="panelHeader"><div><p>Vendor compliance</p><h2>Identity, tax and settlement review</h2></div><Status>{finance?.vendorSubmissions.length || 0} submissions</Status></div>{finance?.vendorSubmissions.filter(entry => `${entry.applicationReference || ''} ${entry.vendorName} ${entry.ownerEmail || ''}`.toLowerCase().includes(query.toLowerCase())).map((entry) => <div className="vendorReview" key={entry.vendorId}><div className="vendorIdentity"><div className="vendorAvatar"><Store/></div><div><h3>{entry.vendorName}</h3><p>{entry.legalBusinessName} · {entry.registrationNumber}</p><p>{entry.applicationReference}</p><span>{entry.ownerName} · {entry.ownerEmail}</span></div></div><dl><div><dt>KRA PIN</dt><dd>{entry.kraPinMasked}</dd></div><div><dt>Settlement</dt><dd>{entry.settlementMethod} {entry.settlementAccountMasked}</dd></div><div><dt>Commission</dt><dd>{entry.commissionRateBps / 100}%</dd></div><div><dt>Risk tier</dt><dd>{entry.riskTier}</dd></div></dl><div className="reviewActions"><Status tone={entry.verificationStatus === 'verified' ? 'good' : 'warn'}>{entry.verificationStatus}</Status><button onClick={() => reviewVendor(entry.vendorId, 'under_review')}>Request review</button><button className="positive" onClick={() => reviewVendor(entry.vendorId, 'verified', 'standard')}>Verify</button>{role === 'admin' && <button className="danger" onClick={() => reviewVendor(entry.vendorId, 'suspended', 'restricted')}>Freeze</button>}</div></div>)}{!finance?.vendorSubmissions.length && <Empty icon={UsersRound} title="No compliance submissions" body="New vendor applications will appear here for review."/>}</section>}

      {view === 'settlements' && role === 'admin' && <div className="settlementGrid"><section className="panel full"><div className="panelHeader"><div><p>Settlement engine</p><h2>Lifecycle exposure</h2></div><button className="filled" onClick={processDue}><Banknote size={17}/>Create daily batches</button></div><div className="lifecycle">{finance?.settlementSummary.map((entry) => <article key={entry.state}><span>{entry.state.replaceAll('_', ' ')}</span><strong>{entry.count}</strong><small>{money(entry.exposure)}</small></article>)}</div></section><section className="panel full"><div className="panelHeader"><div><p>Paystack transfer queue</p><h2>Daily vendor and rider batches</h2></div></div><div className="dataTable"><div className="tableHead payout"><span>Reference</span><span>Beneficiary</span><span>Amount</span><span>Scheduled</span><span>Action</span></div>{finance?.payoutBatches.map((item) => <div className="tableRow payout" key={item.reference}><b>{item.reference}</b><div><strong>{item.vendor_name || item.rider_name || item.beneficiary_type}</strong><small>{item.payout_method} · est. fee {money(item.estimated_provider_fee)}</small></div><strong>{money(item.amount)}</strong><span>{new Date(item.scheduled_for).toLocaleString()}</span>{['scheduled','failed'].includes(item.status) ? <button className="positive" onClick={() => executePayout(item.reference)}>Pay batch</button> : <Status tone={item.status === 'paid' ? 'good' : 'warn'}>{item.status}</Status>}</div>)}</div></section></div>}

      {view === 'coverage' && <section className="panel full"><div className="panelHeader"><div><p>Kenya operations</p><h2>Activate delivery city by city</h2></div><a href={maps?.admin?.commandCenter?.dispatchUrl} target="_blank" rel="noreferrer">Open dispatch map</a></div><div className="dataTable"><div className="tableHead"><span>City</span><span>County</span><span>Mode</span><span>Status</span><span>Action</span></div>{coverage.map((city) => <div className="tableRow" key={city.id}><b>{city.name}</b><span>{city.county}</span><span>{city.delivery_mode}</span><Status tone={city.status === 'active' ? 'good' : city.status === 'paused' ? 'danger' : 'warn'}>{city.status.replaceAll('_', ' ')}</Status><div className="rowActions"><button onClick={() => setCityStatus(city, 'onboarding')}>Onboard</button>{city.status === 'active' ? <button className="danger" onClick={() => setCityStatus(city, 'paused')}>Pause</button> : <button className="positive" onClick={() => setCityStatus(city, 'active')}>Activate</button>}</div></div>)}</div></section>}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
    </section>
    {passwordOpen && <ChangePasswordDialog
      forced={session.user.profile?.mustChangePassword === true}
      onClose={() => setPasswordOpen(false)}
      onChanged={(user) => {
        const next = { ...session, user };
        saveAuthSession(next);
        setSession(next);
        setPasswordOpen(false);
        setNotice('Password changed. Other signed-in devices were logged out.');
      }}
    />}
  </main>;
}

function DataOrders({ items }: { items: Order[] }) { return <div className="dataTable"><div className="tableHead orders"><span>Order</span><span>Customer</span><span>Vendor</span><span>Total</span><span>Status</span></div>{items.map((order) => <div className="tableRow orders" key={order.id}><b>{order.code}</b><span>{order.customerName}</span><span>{order.vendorName}</span><strong>{money(order.total)}</strong><Status tone={order.status === 'delivered' ? 'good' : order.status === 'cancelled' ? 'danger' : 'warn'}>{order.status}</Status></div>)}</div>; }
function Empty({ icon: Icon, title, body }: { icon: typeof CircleAlert; title: string; body: string }) { return <div className="emptyState"><Icon/><h3>{title}</h3><p>{body}</p></div>; }

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
