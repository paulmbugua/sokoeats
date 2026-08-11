import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BadgeDollarSign, CheckCircle2, CreditCard, Headphones, MessageSquare, PhoneCall, TicketCheck, Truck } from 'lucide-react';
import { adminAccountGuidance, adminRoleLabel, api, clearAuthSession, exchangeGoogleCredentialForFirebaseIdToken, googleWebClientId, readAuthSession, saveAuthSession, type StoredAuthSession } from '@sokoeats/shared/api';
import './styles.css';

type AuthRole = 'customer' | 'rider' | 'vendor' | 'merchant' | 'support' | 'admin';
const googleClientId = googleWebClientId();

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
          const firebaseIdToken = await exchangeGoogleCredentialForFirebaseIdToken(response.credential);
          const session = await api<StoredAuthSession>('/api/auth/google', {
            method: 'POST',
            body: JSON.stringify({ role, idToken: firebaseIdToken, businessName: businessName.trim(), inviteCode: inviteCode.trim(), city: 'Nairobi', marketingOptIn: true }),
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
      setMessage('Google web client ID is not configured. Add VITE_GOOGLE_WEB_CLIENT_ID or EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to this dashboard env.');
      return;
    }
    (window as any).google?.accounts?.id?.prompt();
  };

  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">SokoEats secure access</p><h1>{title}</h1><p className="muted">{adminAccountGuidance(role)}</p><div className="auth-guidance"><b>Standard access flow</b><span>Support/Admin: operations invite code required.</span><span>Vendor/Merchant: self-register, complete business profile, then review approval.</span></div><div className="tabs">{['login','register'].map((item) => <button key={item} className={mode === item ? 'tab active' : 'tab'} onClick={() => setMode(item as 'login' | 'register')}>{item === 'login' ? 'Login' : 'Create account'}</button>)}</div><div className="tabs">{roles.map((item) => <button key={item} className={role === item ? 'tab active' : 'tab'} onClick={() => setRole(item)}>{adminRoleLabel(item)}</button>)}</div>{mode === 'register' && <input className="auth-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />}<input className="auth-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" type="email" /><input className="auth-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />{mode === 'register' && (role === 'vendor' || role === 'merchant') && <input className="auth-input" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Business or store name" />}{mode === 'register' && (role === 'support' || role === 'admin') && <input className="auth-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Private invite code" />}{message && <div className="auth-error">{message}</div>}<button className="google-btn" onClick={google} disabled={busy}><b>G</b> Continue with Google</button><button className="primary auth-submit" onClick={submit} disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create SokoEats Account'}</button></section></main>;
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


type TicketDetails = { ticket: any; agent: any; customer: any; order: any; rider: any; messages: any[]; activity: any[]; sourceFiles: string[] };

function App() {
  const [session, setSession] = useState<StoredAuthSession | null>(() => readAuthSession());
  const [maps, setMaps] = useState<MapsManifest | null>(null);
  const [details, setDetails] = useState<TicketDetails | null>(null);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const load = () => api<{ ticketDetails: TicketDetails }>('/api/support/tickets/SKO-9214').then((r) => setDetails(r.ticketDetails)).catch(() => {});
  useEffect(() => {
    api<{ maps: MapsManifest }>('/api/maps/manifest').then((r) => setMaps(r.maps)).catch(() => {}); void load(); }, []);
  const send = async () => { if (!body.trim()) return; const next = await api<{ ticketDetails: TicketDetails }>('/api/support/tickets/SKO-9214/messages', { method: 'POST', body: JSON.stringify({ body, internal }) }); setBody(''); setInternal(false); setDetails(next.ticketDetails); };
  const resolve = async () => { const next = await api<{ ticketDetails: TicketDetails }>('/api/support/tickets/SKO-9214/resolve', { method: 'POST', body: JSON.stringify({ note: 'Resolved from admin tickets dashboard.' }) }); setDetails(next.ticketDetails); };
  if (!session) return <AuthGate title="Tickets access" defaultRole="support" roles={['support','admin']} onAuthenticated={setSession} />;
  if (!details) return <div className="empty">Loading ticket SKO-9214...</div>;
  return <main className="app">
    <aside className="sidebar"><div className="brand"><TicketCheck /> <span>SokoEats Tickets</span></div>{['Dashboard','Tickets','Orders','Customers','Analytics','Settings'].map((item, index) => <button className={index === 1 ? 'nav-btn active' : 'nav-btn'} key={item}><Headphones size={17} /> {item}</button>)}</aside>
    <section className="page">
      <div className="topbar"><input className="search" placeholder="Search orders, tickets, or customers..." /><button className="action" onClick={() => { clearAuthSession(); setSession(null); }}>Logout</button><div className="user"><img className="avatar" src={details.agent.avatarUrl} /><b>Agent {details.agent.name}</b></div></div>
      <div className="split">
        <aside className="profile-card"><div className="row"><img className="avatar" src={details.customer.avatarUrl} /><div><b>{details.customer.name}</b><div className="muted">{details.customer.tier}</div></div></div><p className="muted">{details.customer.email}<br />{details.customer.location}</p><div className="kpi-row"><article className="metric"><span>Total Orders</span><strong>{details.customer.totalOrders}</strong></article><article className="metric"><span>Total Spend</span><strong>{details.customer.totalSpend}</strong></article></div><h2>Order #{details.order.code}</h2><span className="pill">{details.order.status}</span>{details.order.items.map((item: any) => <div className="seller" key={item.name}><img className="thumb" src={item.imageUrl} /><div><b>{item.name}</b><div className="muted">{item.note}</div></div><b>{item.price}</b></div>)}<div className="row"><b>Total</b><b>{details.order.total}</b></div><h2><Truck /> Rider: {details.rider.name}</h2><img className="map" src={details.rider.mapUrl} /><p className="muted">Current status: {details.rider.status}</p><MapPreview title={maps?.tickets?.ticketDetail?.title || 'Ticket route map'} map={maps?.tickets?.ticketDetail?.map} href={maps?.tickets?.ticketDetail?.navigationUrl} meta="Customer, vendor, and rider route context" /></aside>
        <main className="panel"><div className="ticket-head"><div><p className="eyebrow">Ticket #{details.ticket.code}</p><h1>{details.ticket.title}</h1><p>{details.ticket.issue}</p><div className="actions"><span className="pill red">Priority {details.ticket.priority}</span><span className="pill">{details.ticket.opened}</span><span className={details.ticket.status === 'resolved' ? 'pill green' : 'pill red'}>SLA: {details.ticket.sla}</span></div></div><button className="primary" onClick={resolve}><CheckCircle2 size={17} /> Resolve Ticket</button></div>
          <div className="actions" style={{ margin: '18px 0' }}><button className="action"><BadgeDollarSign size={17} /> Issue Refund</button><button className="action"><CreditCard size={17} /> Apply Credit (KSh 200)</button><button className="action"><PhoneCall size={17} /> Escalate</button></div>
          <h2><MessageSquare /> Communication Log</h2>{details.messages.map((message, index) => <article className={message.tone === 'agent' ? 'message agent' : 'message'} key={index}><b>{message.sender}</b><div>{message.body}</div><span className="muted">{message.time}</span></article>)}
          <div className="composer"><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Reply to customer or add an internal note..." /><button className="primary" onClick={send}>Send</button></div><label className="muted"><input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} /> Internal note</label>
          <h2 style={{ marginTop: 20 }}>Recent Agent Activity</h2>{details.activity.map((entry) => <div className="activity" key={entry.label}><b>{entry.label}</b><div className="muted">{entry.body}</div></div>)}
        </main>
      </div>
      <div className="source">Built from: {details.sourceFiles.join(' | ')}</div>
    </section>
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
