import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bike, CalendarDays, Filter, Headphones, LayoutDashboard, MapPinned, Search, TicketCheck } from 'lucide-react';
import { api, clearAuthSession, readAuthSession, saveAuthSession, type StoredAuthSession } from '@sokoeats/shared/api';
import './styles.css';

type AuthRole = 'customer' | 'rider' | 'vendor' | 'merchant' | 'support' | 'admin';
const googleClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || (import.meta as any).env?.VITE_GOOGLE_WEB_CLIENT_ID || '';

function AuthGate({ title, defaultRole, roles, onAuthenticated }: { title: string; defaultRole: AuthRole; roles: AuthRole[]; onAuthenticated: (session: StoredAuthSession) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<AuthRole>(defaultRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const complete = (session: StoredAuthSession) => {
    saveAuthSession(session);
    onAuthenticated(session);
  };

  const submit = async () => {
    setBusy(true);
    setMessage('');
    try {
      const payload = { role, email: email.trim().toLowerCase(), password, fullName: name.trim(), businessName: businessName.trim(), inviteCode: inviteCode.trim(), city: 'Nairobi', marketingOptIn: true };
      const session = await api<StoredAuthSession>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(mode === 'login' ? { role, email: payload.email, password } : payload),
      });
      complete(session);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'SokoEats sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!googleClientId) return;
    const init = () => (window as any).google?.accounts?.id?.initialize({
      client_id: googleClientId,
      callback: async (response: any) => {
        if (!response?.credential) return;
        setBusy(true);
        setMessage('');
        try {
          const session = await api<StoredAuthSession>('/api/auth/google', {
            method: 'POST',
            body: JSON.stringify({ role, idToken: response.credential, businessName: businessName.trim(), inviteCode: inviteCode.trim(), city: 'Nairobi', marketingOptIn: true }),
          });
          complete(session);
        } catch (err) {
          setMessage(err instanceof Error ? err.message : 'Google sign-in failed');
        } finally {
          setBusy(false);
        }
      },
    });
    if ((window as any).google?.accounts?.id) {
      init();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);
  }, [role, businessName, inviteCode]);

  const google = () => {
    if (!googleClientId) {
      setMessage('Google web client ID is not configured for this dashboard.');
      return;
    }
    (window as any).google?.accounts?.id?.prompt();
  };

  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">SokoEats secure access</p><h1>{title}</h1><p className="muted">Use your SokoEats account or continue with Google. Platform support/admin accounts require an invite code when created.</p><div className="tabs">{['login','register'].map((item) => <button key={item} className={mode === item ? 'tab active' : 'tab'} onClick={() => setMode(item as 'login' | 'register')}>{item === 'login' ? 'Login' : 'Create account'}</button>)}</div><div className="tabs">{roles.map((item) => <button key={item} className={role === item ? 'tab active' : 'tab'} onClick={() => setRole(item)}>{item === 'merchant' ? 'Merchant Admin' : item}</button>)}</div>{mode === 'register' && <input className="auth-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />}<input className="auth-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" type="email" /><input className="auth-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />{mode === 'register' && (role === 'vendor' || role === 'merchant') && <input className="auth-input" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Business or store name" />}{mode === 'register' && (role === 'support' || role === 'admin') && <input className="auth-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Private invite code" />}{message && <div className="auth-error">{message}</div>}<button className="google-btn" onClick={google} disabled={busy}><b>G</b> Continue with Google</button><button className="primary auth-submit" onClick={submit} disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create SokoEats Account'}</button></section></main>;
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


type Dashboard = { agent: any; header: any; metrics: { label: string; value: string; delta: string }[]; priorityTickets: any[]; orderAlerts: any[]; fleet: any; sourceFiles: string[] };

function App() {
  const [session, setSession] = useState<StoredAuthSession | null>(() => readAuthSession());
  const [maps, setMaps] = useState<MapsManifest | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  useEffect(() => {
    api<{ maps: MapsManifest }>('/api/maps/manifest').then((r) => setMaps(r.maps)).catch(() => {}); api<{ dashboard: Dashboard }>('/api/support/dashboard').then((r) => setDashboard(r.dashboard)).catch(() => {}); }, []);
  if (!session) return <AuthGate title="Support access" defaultRole="support" roles={['support','admin']} onAuthenticated={setSession} />;
  if (!dashboard) return <div className="empty">Loading support queues...</div>;
  return <main className="app">
    <aside className="sidebar"><div className="brand"><Headphones /> <span>SokoEats Support</span></div>{['Dashboard','Tickets','Orders','Customers','Analytics','New Ticket','Settings','Logout'].map((item, index) => <button className={index === 0 ? 'nav-btn active' : 'nav-btn'} key={item}><LayoutDashboard size={17} /> {item}</button>)}</aside>
    <section className="page">
      <div className="topbar"><input className="search" placeholder="Search orders, tickets, or customers..." /><button className="action" onClick={() => { clearAuthSession(); setSession(null); }}>Logout</button><div className="user"><img className="avatar" src={dashboard.agent.avatarUrl} /><div><b>{dashboard.agent.name}</b><div className="muted">{dashboard.agent.role}</div></div></div></div>
      <div className="hero"><div><p className="eyebrow">Customer Support</p><h1>{dashboard.header.title}</h1><p>{dashboard.header.subtitle}</p></div><div className="actions"><button className="action"><CalendarDays size={17} /> {dashboard.header.dateLabel}</button><button className="action"><Filter size={17} /> Filter</button></div></div>
      <div className="metrics">{dashboard.metrics.map((metric) => <article className="metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><em>{metric.delta}</em></article>)}</div>
      <div className="grid">
        <section className="panel"><h2><TicketCheck /> Priority Tickets</h2>{dashboard.priorityTickets.map((ticket) => <div className="row" key={ticket.code}><div><b>{ticket.code}</b><span className="muted">{ticket.customer} - {ticket.issue}</span></div><div className="actions"><span className={ticket.priority === 'Urgent' ? 'pill red' : 'pill'}>{ticket.priority}</span><span className="muted">{ticket.age}</span></div></div>)}</section>
        <section className="panel"><h2><MapPinned /> {dashboard.fleet.title}</h2><img className="map" src={dashboard.fleet.mapUrl} /><h1 style={{ fontSize: 28, margin: '14px 0 0' }}>{dashboard.fleet.value}</h1></section>
        <section className="panel"><h2><MapPinned /> Support dispatch map</h2><MapPreview title={maps?.support?.fleet?.title || 'Fleet coverage'} map={maps?.support?.fleet?.map} href={maps?.support?.fleet?.dispatchUrl} meta="Live rider coverage, tickets, and dispatch lanes" /><MapPreview title={maps?.support?.incident?.title || 'Incident response'} map={maps?.support?.incident?.map} href={maps?.support?.incident?.dispatchUrl} meta="Nearest response location for safety incidents" /></section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}><h2><Bike /> Order Alerts</h2>{dashboard.orderAlerts.map((alert) => <article className="alert" key={alert.code}><div className="row"><div><b>{alert.code}</b><span className="muted">{alert.body}</span></div><div className="actions"><span className={alert.label === 'High Risk' ? 'pill red' : 'pill'}>{alert.label}</span><span className="pill">{alert.status}</span></div></div><div className="row"><span className="muted">{alert.meta}</span><button className="action">{alert.action}</button></div></article>)}</section>
      <div className="source">Built from: {dashboard.sourceFiles.join(' | ')}</div>
    </section>
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
