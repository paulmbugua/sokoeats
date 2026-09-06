import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ChevronRight, ShieldCheck, Store } from 'lucide-react';
import { api, clearAuthSession, readAuthSession, saveAuthSession, type StoredAuthSession } from '@sokoeats/shared/api';
import { PartnerPortal } from '../../web/src/PartnerPortal';
import { CustomerCareChat } from '../../web/src/CustomerCareChat';
import '../../web/src/PartnerPortal.css';
import './styles.css';

type PartnerRole = 'vendor' | 'merchant';

function SignIn({ onAuthenticated }: { onAuthenticated: (session: StoredAuthSession) => void }) {
  const [role, setRole] = useState<PartnerRole>('vendor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (!email.trim()) return setMessage('Enter the email used in your store application.');
    if (!password) return setMessage('Enter your password.');
    setBusy(true); setMessage('');
    try {
      const session = await api<StoredAuthSession>('/api/auth/login', { method: 'POST', body: JSON.stringify({ role, email, password }) });
      if (!['vendor', 'merchant'].includes(session.user.role)) throw new Error('Use a vendor or merchant account for Store Operations.');
      saveAuthSession(session); onAuthenticated(session);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Store sign-in failed.'); }
    finally { setBusy(false); }
  };

  return <main className="operationsAuth">
    <section className="operationsIntro"><div className="operationsMark"><Store /></div><p>SokoEats Store Operations</p><h1>Run your catalogue from one focused workspace.</h1><span>Publish products, upload customer-ready images, manage availability and see exactly how your shop appears.</span></section>
    <section className="operationsForm"><ShieldCheck/><p>Verified partner access</p><h2>Sign in to your store</h2><div className="operationsRoles"><button className={role === 'vendor' ? 'active' : ''} onClick={() => setRole('vendor')}>Vendor</button><button className={role === 'merchant' ? 'active' : ''} onClick={() => setRole('merchant')}>Merchant</button></div><label>Email<input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@business.co.ke"/></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your account password" onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}/></label>{message && <div className="operationsError">{message}</div>}<button className="operationsSubmit" disabled={busy} onClick={submit}>{busy ? 'Opening store...' : 'Open Store Operations'}<ChevronRight/></button><small>New partners apply through SokoEats web or mobile. Store access opens after platform verification.</small></section>
  </main>;
}

function App() {
  const [session, setSession] = useState<StoredAuthSession | null>(() => {
    const stored = readAuthSession();
    return stored && ['vendor', 'merchant'].includes(stored.user.role) ? stored : null;
  });
  useEffect(() => {
    const handleExpiredSession = () => setSession(null);
    window.addEventListener('sokoeats:session-expired', handleExpiredSession);
    return () => window.removeEventListener('sokoeats:session-expired', handleExpiredSession);
  }, []);
  if (!session) return <SignIn onAuthenticated={setSession}/>;
  return <><PartnerPortal session={session} onSignOut={() => { clearAuthSession(); setSession(null); }}/><CustomerCareChat user={session.user}/></>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
