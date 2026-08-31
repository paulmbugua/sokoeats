import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Banknote, Bike, CheckCircle2, ChevronRight, CircleAlert, Clock3, Headphones,
  LayoutDashboard, LogOut, Map, Menu, PackageCheck, Search, ShieldCheck, Store,
  TicketCheck, UsersRound, WalletCards, X,
} from 'lucide-react';
import { api, clearAuthSession, readAuthSession, saveAuthSession, type StoredAuthSession } from '@sokoeats/shared/api';
import type { DashboardMetric, Order, Ticket, Vendor } from '@sokoeats/shared/types';
import './styles.css';

type StaffRole = 'admin' | 'support';
type View = 'overview' | 'dispatch' | 'tickets' | 'vendors' | 'settlements' | 'coverage';
type ComplianceSubmission = { vendorId: string; vendorName: string; ownerName?: string; ownerEmail?: string; legalBusinessName: string; registrationNumber: string; kraPinMasked: string; directorName: string; directorNationalIdMasked: string; settlementMethod: string; settlementAccountMasked: string; commissionRateBps: number; verificationStatus: string; payoutStatus: string; riskTier: string };
type FinancePayout = { reference: string; beneficiary_type: string; vendor_name?: string; rider_name?: string; amount: number; status: string; scheduled_for: string; failure_reason?: string };
type FinanceDashboard = { accounts: Array<{ code: string; name: string; balance: number }>; settlementSummary: Array<{ state: string; count: number; exposure: number }>; payoutSummary: Array<{ status: string; beneficiary_type: string; count: number; amount: number }>; vendorSubmissions: ComplianceSubmission[]; payouts: FinancePayout[] };
type MapPoint = { label: string; lat: number; lng: number };
type MapViewport = { center?: MapPoint; markers?: MapPoint[]; path?: MapPoint[] };
type MapsManifest = Record<string, any>;

const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;

function AuthGate({ onAuthenticated }: { onAuthenticated: (session: StoredAuthSession) => void }) {
  const [role, setRole] = useState<StaffRole>('admin');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async () => {
    setBusy(true); setMessage('');
    try {
      const body = mode === 'login' ? { role, email, password } : { role, email, password, inviteCode, city: 'Nairobi', department: role === 'admin' ? 'Marketplace Operations' : 'Customer Operations' };
      const session = await api<StoredAuthSession>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
      saveAuthSession(session); onAuthenticated(session);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Staff sign-in failed'); }
    finally { setBusy(false); }
  };
  return <main className="authPage">
    <section className="authBrand"><div className="brandMark"><ShieldCheck /></div><p>SokoEats staff</p><h1>One secure workspace for marketplace operations.</h1><span>Accounts are invitation-only. Access is limited by staff role and recorded against every operational action.</span></section>
    <section className="authForm">
      <p className="eyebrow">Restricted access</p><h2>{mode === 'login' ? 'Staff sign in' : 'Accept your invitation'}</h2>
      <div className="segmented"><button className={role === 'admin' ? 'selected' : ''} onClick={() => setRole('admin')}>Operations admin</button><button className={role === 'support' ? 'selected' : ''} onClick={() => setRole('support')}>Support specialist</button></div>
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@sokoeats.co.ke" /></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 8 characters" /></label>
      {mode === 'register' && <label>Private invitation code<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Provided by a platform administrator" /></label>}
      {message && <p className="formError">{message}</p>}
      <button className="primaryAction" disabled={busy} onClick={submit}>{busy ? 'Checking access...' : mode === 'login' ? 'Sign in securely' : 'Create staff account'}<ChevronRight size={18}/></button>
      <button className="textAction" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Have an invitation? Create staff account' : 'Already enrolled? Sign in'}</button>
      <small>No Google sign-in is enabled for staff dashboards.</small>
    </section>
  </main>;
}

const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }> = [
  { id: 'overview', label: 'Control center', icon: LayoutDashboard },
  { id: 'dispatch', label: 'Order dispatch', icon: Bike },
  { id: 'tickets', label: 'Ticket desk', icon: Headphones },
  { id: 'vendors', label: 'Vendor review', icon: Store },
  { id: 'settlements', label: 'Settlements', icon: WalletCards, adminOnly: true },
  { id: 'coverage', label: 'Coverage map', icon: Map },
];

function Status({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) { return <span className={`status ${tone}`}>{children}</span>; }

function App() {
  const [session, setSession] = useState<StoredAuthSession | null>(() => readAuthSession());
  const [view, setView] = useState<View>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [maps, setMaps] = useState<MapsManifest | null>(null);
  const [notice, setNotice] = useState('');
  const role = session?.user.role as StaffRole | undefined;

  const load = async () => {
    if (!session) return;
    const results = await Promise.allSettled([
      api<{ metrics: DashboardMetric[] }>('/api/admin/overview'), api<{ orders: Order[] }>('/api/orders'),
      api<{ tickets: Ticket[] }>('/api/tickets'), api<{ vendors: Vendor[] }>('/api/vendors'),
      api<FinanceDashboard>('/api/admin/finance'), api<{ maps: MapsManifest }>('/api/maps/manifest'),
    ]);
    if (results[0].status === 'fulfilled') setMetrics(results[0].value.metrics);
    if (results[1].status === 'fulfilled') setOrders(results[1].value.orders);
    if (results[2].status === 'fulfilled') setTickets(results[2].value.tickets);
    if (results[3].status === 'fulfilled') setVendors(results[3].value.vendors);
    if (results[4].status === 'fulfilled') setFinance(results[4].value);
    if (results[5].status === 'fulfilled') setMaps(results[5].value.maps);
  };
  useEffect(() => { void load(); }, [session?.user.id]);
  useEffect(() => { if (role === 'support' && view === 'settlements') setView('overview'); }, [role, view]);

  const filteredOrders = useMemo(() => orders.filter((item) => `${item.code} ${item.customerName} ${item.vendorName}`.toLowerCase().includes(query.toLowerCase())), [orders, query]);
  const filteredTickets = useMemo(() => tickets.filter((item) => `${item.code} ${item.subject} ${item.priority}`.toLowerCase().includes(query.toLowerCase())), [tickets, query]);
  const filteredVendors = useMemo(() => vendors.filter((item) => `${item.name} ${item.cuisine} ${item.status}`.toLowerCase().includes(query.toLowerCase())), [vendors, query]);
  const ticketAction = async (id: string, status: 'pending' | 'resolved') => { setNotice('Updating ticket...'); try { await api(`/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); setNotice(`Ticket marked ${status}.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Ticket update failed'); } };
  const reviewVendor = async (vendorId: string, status: 'verified' | 'under_review' | 'rejected' | 'suspended', riskTier?: 'new' | 'standard' | 'trusted' | 'restricted') => { setNotice('Saving review...'); try { await api(`/api/admin/vendors/${vendorId}/compliance`, { method: 'PATCH', body: JSON.stringify({ status, riskTier, note: 'Reviewed in the SokoEats staff portal.' }) }); await load(); setNotice('Vendor review saved.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Review failed'); } };
  const processDue = async () => { setNotice('Creating eligible payouts...'); try { const result = await api<{ created: number }>('/api/finance/process-due', { method: 'POST' }); await load(); setNotice(`${result.created} payout instruction(s) created.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Payout processing failed'); } };
  const executePayout = async (reference: string) => { setNotice('Submitting payout...'); try { await api(`/api/finance/payouts/${reference}/execute`, { method: 'POST' }); await load(); setNotice('Payout submitted to the provider.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Payout failed'); } };

  if (!session) return <AuthGate onAuthenticated={setSession}/>;
  const availableNav = navItems.filter((item) => !item.adminOnly || role === 'admin');
  const title = availableNav.find((item) => item.id === view)?.label || 'Control center';
  const signOut = () => { clearAuthSession(); setSession(null); };
  return <main className="staffShell">
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="staffBrand"><div className="brandMark small"><PackageCheck/></div><div><b>SokoEats</b><span>Staff operations</span></div><button className="mobileClose" onClick={() => setMobileNav(false)} aria-label="Close menu"><X/></button></div>
      <nav>{availableNav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); setMobileNav(false); }}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="staffIdentity"><span>{role === 'admin' ? 'Operations admin' : 'Support specialist'}</span><b>{session.user.name}</b><small>{session.user.email}</small><button onClick={signOut}><LogOut size={17}/>Sign out</button></div>
    </aside>
    <section className="workspace">
      <header className="workspaceHeader"><button className="menuButton" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu/></button><div><p>{role === 'admin' ? 'Marketplace operations' : 'Customer operations'}</p><h1>{title}</h1></div><label className="search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search current workspace"/></label></header>

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

      {view === 'vendors' && <section className="panel full"><div className="panelHeader"><div><p>Vendor compliance</p><h2>Identity, tax and settlement review</h2></div><Status>{finance?.vendorSubmissions.length || 0} submissions</Status></div>{finance?.vendorSubmissions.map((entry) => <div className="vendorReview" key={entry.vendorId}><div className="vendorIdentity"><div className="vendorAvatar"><Store/></div><div><h3>{entry.vendorName}</h3><p>{entry.legalBusinessName} · {entry.registrationNumber}</p><span>{entry.ownerName} · {entry.ownerEmail}</span></div></div><dl><div><dt>KRA PIN</dt><dd>{entry.kraPinMasked}</dd></div><div><dt>Settlement</dt><dd>{entry.settlementMethod} {entry.settlementAccountMasked}</dd></div><div><dt>Commission</dt><dd>{entry.commissionRateBps / 100}%</dd></div><div><dt>Risk tier</dt><dd>{entry.riskTier}</dd></div></dl><div className="reviewActions"><Status tone={entry.verificationStatus === 'verified' ? 'good' : 'warn'}>{entry.verificationStatus}</Status><button onClick={() => reviewVendor(entry.vendorId, 'under_review')}>Request review</button><button className="positive" onClick={() => reviewVendor(entry.vendorId, 'verified', 'standard')}>Verify</button>{role === 'admin' && <button className="danger" onClick={() => reviewVendor(entry.vendorId, 'suspended', 'restricted')}>Freeze</button>}</div></div>)}{!finance?.vendorSubmissions.length && <Empty icon={UsersRound} title="No compliance submissions" body="New vendor applications will appear here for review."/>}</section>}

      {view === 'settlements' && role === 'admin' && <div className="settlementGrid"><section className="panel full"><div className="panelHeader"><div><p>Settlement engine</p><h2>Lifecycle exposure</h2></div><button className="filled" onClick={processDue}><Banknote size={17}/>Create due payouts</button></div><div className="lifecycle">{finance?.settlementSummary.map((entry) => <article key={entry.state}><span>{entry.state.replaceAll('_', ' ')}</span><strong>{entry.count}</strong><small>{money(entry.exposure)}</small></article>)}</div></section><section className="panel full"><div className="panelHeader"><div><p>Provider queue</p><h2>Vendor and rider payouts</h2></div></div><div className="dataTable"><div className="tableHead payout"><span>Reference</span><span>Beneficiary</span><span>Amount</span><span>Scheduled</span><span>Action</span></div>{finance?.payouts.map((item) => <div className="tableRow payout" key={item.reference}><b>{item.reference}</b><div><strong>{item.vendor_name || item.rider_name || item.beneficiary_type}</strong><small>{item.beneficiary_type}</small></div><strong>{money(item.amount)}</strong><span>{new Date(item.scheduled_for).toLocaleString()}</span>{['scheduled','failed'].includes(item.status) ? <button className="positive" onClick={() => executePayout(item.reference)}>Pay</button> : <Status tone={item.status === 'paid' ? 'good' : 'warn'}>{item.status}</Status>}</div>)}</div></section></div>}

      {view === 'coverage' && <section className="panel full mapWorkspace"><div className="panelHeader"><div><p>Coverage intelligence</p><h2>Vendors, riders and active demand</h2></div><a href={maps?.admin?.commandCenter?.dispatchUrl} target="_blank" rel="noreferrer">Open Google Maps</a></div><div className="mapCanvas"><Map size={44}/><h3>{maps?.admin?.commandCenter?.title || 'Nairobi marketplace coverage'}</h3><p>Operational coordinates and route links are supplied by the backend Maps manifest.</p><div className="mapLegend"><span><i className="vendorDot"/>Vendors</span><span><i className="riderDot"/>Riders</span><span><i className="incidentDot"/>Incidents</span></div></div></section>}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
    </section>
  </main>;
}

function DataOrders({ items }: { items: Order[] }) { return <div className="dataTable"><div className="tableHead orders"><span>Order</span><span>Customer</span><span>Vendor</span><span>Total</span><span>Status</span></div>{items.map((order) => <div className="tableRow orders" key={order.id}><b>{order.code}</b><span>{order.customerName}</span><span>{order.vendorName}</span><strong>{money(order.total)}</strong><Status tone={order.status === 'delivered' ? 'good' : order.status === 'cancelled' ? 'danger' : 'warn'}>{order.status}</Status></div>)}</div>; }
function Empty({ icon: Icon, title, body }: { icon: typeof CircleAlert; title: string; body: string }) { return <div className="emptyState"><Icon/><h3>{title}</h3><p>{body}</p></div>; }

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
