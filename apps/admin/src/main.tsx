import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bike, CheckCircle2, Clock, Headphones, PackageCheck, Store, TicketCheck, Utensils } from 'lucide-react';
import { adminAccountGuidance, adminRoleLabel, api, clearAuthSession, exchangeGoogleCredentialForFirebaseIdToken, googleWebClientId, readAuthSession, saveAuthSession, type StoredAuthSession } from '@sokoeats/shared/api';
import type { DashboardMetric, Order, Ticket, Vendor } from '@sokoeats/shared/types';
import './styles.css';

type AuthRole = 'support' | 'admin';
const googleClientId = googleWebClientId();
function AuthGate({ onAuthenticated }: { onAuthenticated: (session: StoredAuthSession) => void }) {
  const [role, setRole] = useState<AuthRole>('admin');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const complete = (session: StoredAuthSession) => { saveAuthSession(session); onAuthenticated(session); };
  const submit = async () => {
    try { const session = await api<StoredAuthSession>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify(mode === 'login' ? { role, email, password } : { role, email, password, inviteCode, city: 'Nairobi' }) }); complete(session); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'SokoEats sign-in failed'); }
  };
  useEffect(() => {
    if (!googleClientId) return;
    const init = () => (window as any).google?.accounts?.id?.initialize({ client_id: googleClientId, callback: async (response: any) => { try { const idToken = await exchangeGoogleCredentialForFirebaseIdToken(response.credential); complete(await api<StoredAuthSession>('/api/auth/google', { method: 'POST', body: JSON.stringify({ role, idToken, inviteCode, city: 'Nairobi' }) })); } catch (err) { setMessage(err instanceof Error ? err.message : 'Google sign-in failed'); } } });
    if ((window as any).google?.accounts?.id) { init(); return; }
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.onload = init; document.head.appendChild(script);
  }, [role, inviteCode]);
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">SokoEats secure access</p><h1>Platform admin access</h1><p className="muted">{adminAccountGuidance(role)}</p><div className="auth-guidance"><b>Standard access flow</b><span>Support/Admin accounts are created by invitation with a private code.</span><span>Google is preferred for daily dashboard login after the account exists.</span></div><div className="tabs"><button className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => setMode('login')}>Login</button><button className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => setMode('register')}>Create account</button></div><div className="tabs">{(['admin','support'] as AuthRole[]).map((item) => <button key={item} className={role === item ? 'tab active' : 'tab'} onClick={() => setRole(item)}>{adminRoleLabel(item)}</button>)}</div><input className="auth-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" type="email" /><input className="auth-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />{mode === 'register' && <input className="auth-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Private invite code" />}{message && <div className="auth-error">{message}</div>}<button className="google-btn" onClick={() => googleClientId ? (window as any).google?.accounts?.id?.prompt() : setMessage('Google web client ID is not configured. Add VITE_GOOGLE_WEB_CLIENT_ID or EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.') }><b>G</b> Continue with Google</button><button className="primary auth-submit" onClick={submit}>{mode === 'login' ? 'Login' : 'Create SokoEats Account'}</button></section></main>;
}
type MapPoint = { label: string; lat: number; lng: number };
type MapViewport = { center?: MapPoint; markers?: MapPoint[]; path?: MapPoint[] };
type MapsManifest = Record<string, any>;
const googleMapUrl = (map?: MapViewport) => {
  const markers = map?.markers?.length ? map.markers : [{ label: 'Nairobi CBD', lat: -1.286389, lng: 36.817223 }];
  const center = map?.center || markers[0];
  const params = [`center=${center.lat},${center.lng}`, 'zoom=13', 'size=900x420', 'scale=2', 'maptype=roadmap', ...markers.map((point, index) => `markers=${encodeURIComponent(`color:${index === 0 ? 'orange' : index === 1 ? 'green' : 'red'}|label:${String.fromCharCode(65 + index)}|${point.lat},${point.lng}`)}`)];
  if (map?.path?.length) params.push(`path=${encodeURIComponent('color:0x904d00ff|weight:5|' + map.path.map((point) => `${point.lat},${point.lng}`).join('|'))}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.join('&')}`;
};
const MapPreview = ({ title, map, href, meta }: { title: string; map?: MapViewport; href?: string; meta?: string }) => <div className="map-panel"><div className="row"><div><b>{title}</b>{meta && <span className="muted">{meta}</span>}</div>{href && <a className="map-link" href={href} target="_blank" rel="noreferrer">Open map</a>}</div><img className="map" src={googleMapUrl(map)} /></div>;


function App() {
  const [session, setSession] = useState<StoredAuthSession | null>(() => readAuthSession());
  const [maps, setMaps] = useState<MapsManifest | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  useEffect(() => {
    api<{ maps: MapsManifest }>('/api/maps/manifest').then((r) => setMaps(r.maps)).catch(() => {});
    api<{ metrics: DashboardMetric[] }>('/api/admin/overview').then((r) => setMetrics(r.metrics)).catch(() => {});
    api<{ orders: Order[] }>('/api/orders').then((r) => setOrders(r.orders)).catch(() => {});
    api<{ tickets: Ticket[] }>('/api/tickets').then((r) => setTickets(r.tickets)).catch(() => {});
    api<{ vendors: Vendor[] }>('/api/vendors').then((r) => setVendors(r.vendors)).catch(() => {});
  }, []);
  if (!session) return <AuthGate onAuthenticated={setSession} />;
  const mode: string = 'admin';
  const icon = mode === 'vendor' ? <Store /> : mode === 'tickets' ? <TicketCheck /> : mode === 'support' ? <Headphones /> : <Utensils />;
  return <main>
    <aside><div className="brand">{icon}<b>Sokoeats</b></div><button className="active">Dashboard</button><button>Orders</button><button>Tickets</button><button>Vendors</button><button onClick={() => { clearAuthSession(); setSession(null); }}>Logout</button></aside>
    <section className="page">
      <header><p>Marketplace admin</p><h1>Marketplace control</h1></header>
      <div className="metrics">{metrics.map((m) => <article key={m.label}><span>{m.label}</span><strong>{m.value}</strong><em>{m.delta || 'live'}</em></article>)}</div>
      <div className="grid">
        <section><h2><PackageCheck /> Live orders</h2>{orders.slice(0,6).map((o) => <div className="row" key={o.id}><div><b>{o.code}</b><span>{o.customerName} - {o.vendorName}</span></div><span className="pill">{o.status}</span></div>)}</section>
        <section><h2><TicketCheck /> Tickets</h2>{tickets.slice(0,6).map((t) => <div className="row" key={t.id}><div><b>{t.code}</b><span>{t.subject}</span></div><span className="pill">{t.priority}</span></div>)}</section>
        <section><h2><Store /> Vendors</h2>{vendors.slice(0,6).map((v) => <div className="row" key={v.id}><div><b>{v.name}</b><span>{v.cuisine}</span></div><span className="pill">{v.status}</span></div>)}</section>
        <section><h2><Clock /> Shift notes</h2><div className="note"><CheckCircle2 /> Keep menus lean, dispatch fast, and close the loop with customers before refunds escalate.</div><div className="note"><Bike /> Flag courier delays after 12 minutes without pickup.</div></section>
        <section><h2><Bike /> Command map</h2><MapPreview title={maps?.admin?.commandCenter?.title || 'Marketplace coverage'} map={maps?.admin?.commandCenter?.map} href={maps?.admin?.commandCenter?.dispatchUrl} meta="Vendors, riders, customer demand, and support incidents" /></section>
      </div>
    </section>
  </main>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
