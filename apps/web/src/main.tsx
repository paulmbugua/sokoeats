import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  ArrowLeft, Check, ChevronRight, Clock3, Download, Headphones, LockKeyhole,
  LogIn, MapPin, Menu, Minus, Plus, Search, ShieldCheck, ShoppingBag, Smartphone,
  Star, Store, Trash2, UserRound, Utensils, X,
} from 'lucide-react';
import { API_BASE, api, clearAuthSession, readAuthSession, saveAuthSession } from '@sokoeats/shared/api';
import type { MenuItem, Vendor } from '@sokoeats/shared/types';
import { PartnerPortal } from './PartnerPortal';
import './styles.css';

type Session = ReturnType<typeof readAuthSession>;
type Line = { item: MenuItem; quantity: number };
type LiveVendor = Vendor & { category?: string; tagline?: string; address?: string; sections?: Array<{ title: string }> };
type Payment = { reference: string; method: 'mpesa' | 'card'; status: string; actionUrl?: string; providerMessage?: string; promptMessage?: string };
type PricingQuote = { id: string; subtotal: number; deliveryFee: number; serviceFee: number; surgeFee: number; discountAmount: number; total: number; distanceKm: number; durationMin: number };
type Page = 'landing' | 'browse' | 'profile';

const CART_KEY = 'sokoeats.web.basket.v2';
const PAYMENT_KEY = 'sokoeats.web.payment.v2';
const APP_URL = import.meta.env.VITE_ANDROID_APP_URL || 'https://play.google.com/store/apps/details?id=com.paulmbugua2.sokoeats';
const HERO_IMAGE = 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1800&q=88';
const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;
const categories = ['All', 'Restaurants', 'Groceries', 'Pharmacy', 'Gas', 'Electronics'];

function readBasket(): { vendorId: string; lines: Line[] } {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '{"vendorId":"","lines":[]}'); }
  catch { return { vendorId: '', lines: [] }; }
}

function App() {
  const saved = useMemo(readBasket, []);
  const [page, setPage] = useState<Page>('landing');
  const [mobileNav, setMobileNav] = useState(false);
  const [vendors, setVendors] = useState<LiveVendor[]>([]);
  const [selected, setSelected] = useState(saved.vendorId);
  const [category, setCategory] = useState('All');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Line[]>(saved.lines || []);
  const [query, setQuery] = useState('');
  const [session, setSession] = useState<Session>(() => readAuthSession());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authRole, setAuthRole] = useState<'customer' | 'vendor' | 'merchant'>('customer');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card'>('mpesa');
  const [pendingPayment, setPendingPayment] = useState<Payment | null>(() => {
    try { return JSON.parse(localStorage.getItem(PAYMENT_KEY) || 'null'); } catch { return null; }
  });
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [focused, setFocused] = useState<MenuItem | null>(null);
  const [similar, setSimilar] = useState<MenuItem[]>([]);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ confirmation: '', password: '', reason: '' });
  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '', city: 'Nairobi', defaultAddress: '' });

  useEffect(() => {
    api<{ vendors: LiveVendor[] }>('/api/vendors').then(({ vendors: next }) => {
      setVendors(next);
      setSelected((current) => current && next.some((vendor) => vendor.id === current) ? current : next[0]?.id || '');
    }).catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    api<{ items: MenuItem[] }>(`/api/menu?vendorId=${encodeURIComponent(selected)}`)
      .then(({ items }) => setMenu(items)).catch((error) => setStatus(error.message));
  }, [selected]);

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify({ vendorId: selected, lines: cart })); }, [selected, cart]);
  useEffect(() => {
    if (pendingPayment) localStorage.setItem(PAYMENT_KEY, JSON.stringify(pendingPayment));
    else localStorage.removeItem(PAYMENT_KEY);
  }, [pendingPayment]);

  useEffect(() => {
    if (!session?.user) return;
    setForm((current) => ({ ...current, fullName: session.user.name || current.fullName, email: session.user.email || current.email, phone: session.user.phone || current.phone, city: session.user.city || current.city, defaultAddress: session.user.defaultAddress || String(session.user.profile?.defaultAddress || current.defaultAddress) }));
  }, [session?.user.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('auth_code');
    const error = params.get('auth_error');
    if (error) { setAuthError(error); setAuthOpen(true); }
    if (!code) return;
    api<NonNullable<Session>>('/api/auth/google/web/exchange', { method: 'POST', body: JSON.stringify({ code }) })
      .then((next) => { saveAuthSession(next); setSession(next); setPage('browse'); if (cart.length) setCheckoutOpen(true); })
      .catch((nextError) => { setAuthError(nextError.message); setAuthOpen(true); })
      .finally(() => window.history.replaceState({}, '', window.location.pathname));
  }, []);

  const vendor = vendors.find((entry) => entry.id === selected);
  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const basketCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const previewTotal = subtotal + Number(vendor?.deliveryFee || 0) + Math.round(subtotal * 0.04);
  const filteredVendors = vendors.filter((entry) => category === 'All' || entry.category?.toLowerCase() === category.toLowerCase());
  const visibleMenu = menu.filter((item) => `${item.name} ${item.description || ''} ${item.category}`.toLowerCase().includes(query.toLowerCase()));

  const openBrowse = (vendorId?: string) => {
    if (vendorId) chooseVendor(vendorId);
    setPage('browse'); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const chooseVendor = (id: string) => {
    if (id === selected) return;
    if (cart.length && !window.confirm('Starting a basket from another shop will clear your current basket. Continue?')) return;
    setCart([]); setFocused(null); setSimilar([]); setSelected(id); setQuote(null); setPendingPayment(null);
  };
  const add = (item: MenuItem) => setCart((lines) => {
    const current = lines.find((line) => line.item.id === item.id);
    return current ? lines.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { item, quantity: 1 }];
  });
  const change = (id: string, delta: number) => { setQuote(null); setPendingPayment(null); setCart((lines) => lines.map((line) => line.item.id === id ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0)); };
  const inspectItem = (item: MenuItem) => {
    setFocused(item);
    api<{ similar: MenuItem[] }>(`/api/menu/${item.id}/similar`).then((result) => setSimilar(result.similar)).catch(() => setSimilar([]));
  };
  const beginCheckout = () => {
    if (!cart.length) return;
    if (!session) { setAuthMode('login'); setAuthOpen(true); return; }
    if (session.user.role !== 'customer') { setStatus('Use a buyer account to place an order.'); return; }
    setCheckoutOpen(true);
  };
  const submitAuth = async () => {
    setAuthBusy(true); setAuthError('');
    try {
      const body = authMode === 'login' ? { role: authRole, email: form.email, password: form.password } : { ...form, role: authRole, marketingOptIn: true };
      const next = await api<NonNullable<Session>>(authMode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
      saveAuthSession(next); setSession(next); setAuthOpen(false); setPage('browse'); if (cart.length) setCheckoutOpen(true);
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Unable to sign in'); }
    finally { setAuthBusy(false); }
  };
  const continueGoogle = () => {
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    window.location.assign(`${API_BASE}/api/auth/google/web/start?returnTo=${encodeURIComponent(returnTo)}`);
  };
  const saveProfile = async () => {
    const result = await api<{ user: NonNullable<Session>['user'] }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: form.fullName, phone: form.phone, city: form.city, defaultAddress: form.defaultAddress }) });
    if (!session) return;
    const next = { ...session, user: result.user }; saveAuthSession(next); setSession(next); setStatus('Profile saved.');
  };
  const createQuote = async () => {
    if (!vendor || !session) throw new Error('Choose a shop and sign in before checkout.');
    if (!form.phone.trim() || !form.defaultAddress.trim()) throw new Error('Add a mobile number and delivery address before payment.');
    await saveProfile();
    const result = await api<{ quote: PricingQuote }>('/api/orders/quote', { method: 'POST', body: JSON.stringify({ vendorId: vendor.id, deliveryAddress: form.defaultAddress, items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity, notes: null })) }) });
    setQuote(result.quote); return result.quote;
  };
  const startPayment = async () => {
    if (!session?.user || !vendor) return;
    setCheckoutBusy(true); setStatus('Calculating your live delivery route...');
    try {
      const currentQuote = quote || await createQuote();
      const result = await api<{ payment: Payment }>('/api/payments/checkout', { method: 'POST', body: JSON.stringify({ pricingQuoteId: currentQuote.id, method: paymentMethod, amount: currentQuote.total, currency: 'KES', phone: form.phone, email: session.user.email, customerName: session.user.name }) });
      setPendingPayment(result.payment); setStatus(result.payment.providerMessage || result.payment.promptMessage || 'Payment started.');
      if (paymentMethod === 'card' && result.payment.actionUrl) window.location.assign(result.payment.actionUrl);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Payment could not be started.'); }
    finally { setCheckoutBusy(false); }
  };
  const confirmAndOrder = async () => {
    if (!pendingPayment || !vendor || !quote) return;
    setCheckoutBusy(true);
    try {
      const confirmed = await api<{ payment: Payment }>(`/api/payments/${pendingPayment.reference}/confirm`, { method: 'POST' });
      if (confirmed.payment.status !== 'paid') { setStatus(confirmed.payment.providerMessage || 'Payment is still pending. Complete the M-Pesa or card prompt first.'); return; }
      const result = await api<{ order: { code: string } }>('/api/orders', { method: 'POST', body: JSON.stringify({ phone: form.phone, vendorId: vendor.id, deliveryAddress: form.defaultAddress, paymentMethod, paymentReference: pendingPayment.reference, pricingQuoteId: quote.id, items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })) }) });
      setCart([]); setQuote(null); setPendingPayment(null); setCheckoutOpen(false); setStatus(`Order ${result.order.code} was placed successfully.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Order could not be completed.'); }
    finally { setCheckoutBusy(false); }
  };
  const signOut = () => { clearAuthSession(); setSession(null); setPendingPayment(null); setQuote(null); setPage('landing'); };
  const deleteAccount = async () => {
    setAuthBusy(true); setAuthError('');
    try {
      await api('/api/auth/account', { method: 'DELETE', body: JSON.stringify(deleteForm) });
      clearAuthSession(); localStorage.removeItem(PAYMENT_KEY); setSession(null); setPendingPayment(null); setQuote(null); setDeleteOpen(false); setPage('landing'); setStatus('Your account and personal profile were deleted.');
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Account could not be deleted.'); }
    finally { setAuthBusy(false); }
  };

  const Header = () => <header className="siteHeader">
    <button className="brand" onClick={() => setPage('landing')}><span className="brandMark"><Utensils size={21}/></span>SokoEats</button>
    <button className="mobileMenu" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X/> : <Menu/>}</button>
    <nav className={mobileNav ? 'navOpen' : ''}>
      <button onClick={() => openBrowse()}>Browse shops</button><button onClick={() => { setPage('landing'); setTimeout(() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>How it works</button><a href="mailto:support@sokoeats.co.ke">Help</a>
      {session ? <button onClick={() => { setPage('profile'); setMobileNav(false); }}><UserRound size={17}/> {session.user.name}</button> : <button onClick={() => { setAuthMode('login'); setAuthOpen(true); }}><LogIn size={17}/> Log in</button>}
      <button className="navBasket" onClick={() => { openBrowse(); setTimeout(beginCheckout, 0); }}><ShoppingBag size={17}/> {basketCount}</button>
    </nav>
  </header>;

  const Footer = () => <footer className="siteFooter"><div><button className="footerBrand" onClick={() => setPage('landing')}><Utensils/> SokoEats</button><p>Everyday essentials from trusted Kenyan businesses, delivered with accountable local riders.</p></div><div><h3>Order</h3><button onClick={() => openBrowse()}>Browse shops</button><a href={APP_URL}>Get the app</a><a href="mailto:support@sokoeats.co.ke">Help centre</a></div><div><h3>Partners</h3><button onClick={() => { setAuthRole('vendor'); setAuthMode('login'); setAuthOpen(true); }}>Partner sign in</button><a href="mailto:partners@sokoeats.co.ke">List your shop</a><a href="mailto:riders@sokoeats.co.ke">Become a rider</a></div><div><h3>Legal</h3><button onClick={() => setLegal('terms')}>Terms of service</button><button onClick={() => setLegal('privacy')}>Privacy policy</button><a href="mailto:privacy@sokoeats.co.ke">Privacy requests</a></div><small>© {new Date().getFullYear()} SokoEats Kenya. All rights reserved.</small></footer>;

  if (session && (session.user.role === 'vendor' || session.user.role === 'merchant')) return <PartnerPortal session={session} onSignOut={signOut}/>;

  return <main><Header/>
    {page === 'landing' && <>
      <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(8,26,18,.9), rgba(8,26,18,.34)), url(${HERO_IMAGE})` }}><div className="heroCopy"><span>Made for Kenya</span><h1>SokoEats</h1><p>Food, groceries, pharmacy, gas and electronics from shops you know. One basket, live delivery pricing and secure checkout.</p><div className="heroActions"><button onClick={() => openBrowse()}><ShoppingBag/> Start an order</button><a href={APP_URL}><Download/> Get app</a><button className="secondary" onClick={() => { setAuthMode('register'); setAuthOpen(true); }}>Create account</button></div></div></section>
      <section className="categoryStrip">{categories.slice(1).map((entry) => <button key={entry} onClick={() => { setCategory(entry); openBrowse(); }}><Store/><span>{entry}</span></button>)}</section>
      <section id="how" className="contentBand"><div className="sectionHeading"><span>A simpler local marketplace</span><h2>From nearby shelf to your door</h2></div><div className="steps"><article><Search/><b>Choose locally</b><p>Compare verified shops and clear product details.</p></article><article><LockKeyhole/><b>Pay securely</b><p>M-Pesa or card payment is confirmed before ordering.</p></article><article><MapPin/><b>Follow delivery</b><p>Distance-aware pricing and accountable order updates.</p></article></div></section>
      <section className="featuredBand"><div className="sectionHeading"><span>Popular now</span><h2>Shops ready to deliver</h2></div><div className="landingVendors">{vendors.slice(0, 4).map((entry) => <button key={entry.id} onClick={() => openBrowse(entry.id)}>{entry.imageUrl ? <img src={entry.imageUrl} alt=""/> : <div className="vendorImageFallback"><Store/></div>}<div><b>{entry.name}</b><span>{entry.tagline || entry.cuisine}</span><small><Star size={14}/> {entry.rating} · {entry.prepMinutes} min</small></div><ChevronRight/></button>)}</div></section>
      <section className="appBand"><div><Smartphone/><span>Order wherever the day takes you</span><h2>SokoEats in your pocket</h2><p>Save addresses, receive order updates and manage your deliveries from the Android app.</p><a href={APP_URL}><Download/> Get the app</a></div></section><Footer/>
    </>}

    {page === 'browse' && <>
      <section className="browseHead"><div><span>Delivery marketplace</span><h1>What do you need today?</h1><p>Browse freely. We only ask you to sign in when you check out.</p></div><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this shop"/></label></section>
      <section className="filterBar">{categories.map((entry) => <button className={category === entry ? 'active' : ''} key={entry} onClick={() => setCategory(entry)}>{entry}</button>)}</section>
      <section className="vendors">{filteredVendors.map((entry) => <button key={entry.id} className={entry.id === selected ? 'vendor active' : 'vendor'} onClick={() => chooseVendor(entry.id)}>{entry.imageUrl ? <img src={entry.imageUrl} alt=""/> : <div className="vendorImageFallback"><Store/></div>}<strong>{entry.name}</strong><span>{entry.tagline || entry.cuisine}</span><em><Star size={14}/> {entry.rating} <Clock3 size={14}/> {entry.prepMinutes}m</em></button>)}</section>
      <section className="shopHeading">{vendor && <><div><small><Store size={15}/> {vendor.category || 'Shop'}</small><h2>{vendor.name}</h2><p><MapPin size={16}/> {vendor.address}</p></div><strong>From {money(vendor.deliveryFee)} delivery</strong></>}</section>
      <section className="shopShell"><div className="menuGrid">{visibleMenu.map((item) => <article key={item.id} onClick={() => inspectItem(item)}>{item.imageUrl ? <img src={item.imageUrl} alt={item.name}/> : <div className="itemImageFallback"><Utensils/></div>}<div><small>{item.category}{item.popular ? ' · popular' : ''}</small><h3>{item.name}</h3><p>{item.description}</p><strong>{money(item.price)}</strong></div><button aria-label={`Add ${item.name}`} onClick={(event) => { event.stopPropagation(); add(item); }}><Plus/></button></article>)}</div><aside><h2><ShoppingBag/> Basket</h2>{cart.length ? cart.map((line) => <div className="cartline" key={line.item.id}><div><b>{line.item.name}</b><span>{money(line.item.price * line.quantity)}</span></div><div className="stepper"><button onClick={() => change(line.item.id, -1)}><Minus/></button><strong>{line.quantity}</strong><button onClick={() => change(line.item.id, 1)}><Plus/></button></div></div>) : <p className="empty">Add products from this shop to begin.</p>}<div className="totals"><span>Basket</span><b>{money(subtotal)}</b><span>Estimated total</span><b>{money(previewTotal)}</b></div><button className="primary" onClick={beginCheckout} disabled={!cart.length}>Continue to checkout <ChevronRight/></button>{status && <p className="notice">{status}</p>}</aside></section>
      {focused && <section className="similar"><button className="textButton" onClick={() => setFocused(null)}><ArrowLeft/> Back to shop</button><h2>More like {focused.name}</h2><div>{similar.map((item) => <article key={item.id} onClick={() => inspectItem(item)}>{item.imageUrl ? <img src={item.imageUrl} alt={item.name}/> : <div className="itemImageFallback"><Store/></div>}<h3>{item.name}</h3><p>{item.description}</p><strong>{money(item.price)}</strong><button onClick={() => add(item)}><Plus/> Add</button></article>)}</div></section>}
      <Footer/>
    </>}

    {page === 'profile' && session && <><section className="profilePage"><button className="textButton" onClick={() => openBrowse()}><ArrowLeft/> Back to shopping</button><header><div className="profileAvatar"><UserRound/></div><div><span>Buyer profile</span><h1>{session.user.name}</h1><p>{session.user.email}</p></div></header><section className="profileForm"><h2>Delivery details</h2><p>These details are used for checkout and delivery updates.</p><label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}/></label><label>Mobile number<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/></label><label>City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}/></label><label>Default delivery address<textarea value={form.defaultAddress} onChange={(e) => setForm({ ...form, defaultAddress: e.target.value })}/></label><button className="primary" onClick={saveProfile}>Save profile</button></section><section className="securityPanel"><ShieldCheck/><div><h2>Account security</h2><p>Signed in as {session.user.email}. Signing out does not clear your basket.</p></div><button onClick={signOut}>Sign out</button></section><section className="dangerPanel"><Trash2/><div><h2>Delete account</h2><p>Permanently removes your personal profile and disables access. Financial and order records required by law remain anonymised.</p></div><button onClick={() => setDeleteOpen(true)}>Delete account</button></section></section><Footer/></>}

    {authOpen && <div className="overlay"><section className="dialog"><button className="close" onClick={() => setAuthOpen(false)}><X/></button><h2>{authRole === 'customer' ? (authMode === 'login' ? 'Log in to SokoEats' : 'Create your buyer account') : 'Partner Studio sign in'}</h2><p>{authRole === 'customer' ? (cart.length ? 'Your basket is saved. Continue where you left off after signing in.' : 'Save addresses, order securely and receive delivery updates.') : 'Use the verified vendor or merchant account created during partner onboarding.'}</p>{authRole === 'customer' && <><button className="google" onClick={continueGoogle}><LogIn/> Continue with Google</button><div className="divider">or use email</div></>}{authRole !== 'customer' && <div className="paymentChoice"><button className={authRole === 'vendor' ? 'active' : ''} onClick={() => setAuthRole('vendor')}>Vendor</button><button className={authRole === 'merchant' ? 'active' : ''} onClick={() => setAuthRole('merchant')}>Merchant admin</button></div>}{authMode === 'register' && <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}/>}<input type="email" placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/><input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/>{authMode === 'register' && <><input placeholder="Mobile number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/><input placeholder="Delivery address" value={form.defaultAddress} onChange={(e) => setForm({ ...form, defaultAddress: e.target.value })}/></>}{authError && <p className="error">{authError}</p>}<button className="primary" disabled={authBusy} onClick={submitAuth}>{authBusy ? 'Please wait...' : authMode === 'login' ? 'Log in' : 'Create account'}</button>{authRole === 'customer' ? <button className="textButton switchMode" onClick={() => { setAuthError(''); setAuthMode(authMode === 'login' ? 'register' : 'login'); }}>{authMode === 'login' ? 'New to SokoEats? Create account' : 'Already registered? Log in'}</button> : <button className="textButton switchMode" onClick={() => { setAuthRole('customer'); setAuthMode('login'); }}>Back to buyer login</button>}</section></div>}

    {checkoutOpen && session && <div className="overlay"><section className="dialog checkoutDialog"><button className="close" onClick={() => setCheckoutOpen(false)}><X/></button><h2>Delivery and payment</h2><p>Payment is confirmed before your order reaches the shop.</p><label>Order updates number<input placeholder="07..." value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setQuote(null); setPendingPayment(null); }}/></label><label>Delivery address<textarea value={form.defaultAddress} onChange={(e) => { setForm({ ...form, defaultAddress: e.target.value }); setQuote(null); setPendingPayment(null); }}/></label><div className="paymentChoice"><button className={paymentMethod === 'mpesa' ? 'active' : ''} onClick={() => { setPaymentMethod('mpesa'); setPendingPayment(null); }}>M-Pesa</button><button className={paymentMethod === 'card' ? 'active' : ''} onClick={() => { setPaymentMethod('card'); setPendingPayment(null); }}>Debit / credit card</button></div><div className="quoteBox"><span>Basket <b>{money(quote?.subtotal ?? subtotal)}</b></span><span>Delivery <b>{quote ? money(quote.deliveryFee + quote.surgeFee) : 'Calculated live'}</b></span><span>Service <b>{quote ? money(quote.serviceFee) : 'Calculated live'}</b></span>{quote && <small><MapPin/> {quote.distanceKm.toFixed(1)} km · about {quote.durationMin} min</small>}<strong>Total <b>{money(quote?.total ?? previewTotal)}</b></strong></div>{!pendingPayment ? <button className="primary" disabled={checkoutBusy} onClick={startPayment}>{checkoutBusy ? 'Preparing secure payment...' : `Pay with ${paymentMethod === 'mpesa' ? 'M-Pesa' : 'card'}`}</button> : <button className="primary" disabled={checkoutBusy} onClick={confirmAndOrder}><Check/> {checkoutBusy ? 'Checking payment...' : 'Confirm payment and place order'}</button>}{status && <p className="notice">{status}</p>}</section></div>}

    {deleteOpen && <div className="overlay"><section className="dialog dangerDialog"><button className="close" onClick={() => setDeleteOpen(false)}><X/></button><Trash2 className="dangerIcon"/><h2>Delete your SokoEats account?</h2><p>This cannot be undone. Type <b>DELETE</b> to confirm.</p><textarea placeholder="Reason (optional)" value={deleteForm.reason} onChange={(e) => setDeleteForm({ ...deleteForm, reason: e.target.value })}/><input placeholder="Type DELETE" value={deleteForm.confirmation} onChange={(e) => setDeleteForm({ ...deleteForm, confirmation: e.target.value.toUpperCase() })}/><input type="password" placeholder="Password (required for email accounts)" value={deleteForm.password} onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })}/>{authError && <p className="error">{authError}</p>}<button className="deleteConfirm" disabled={authBusy || deleteForm.confirmation !== 'DELETE'} onClick={deleteAccount}>{authBusy ? 'Deleting...' : 'Permanently delete account'}</button><button className="textButton switchMode" onClick={() => setDeleteOpen(false)}>Keep my account</button></section></div>}

    {legal && <div className="overlay"><section className="dialog legalDialog"><button className="close" onClick={() => setLegal(null)}><X/></button><h2>{legal === 'terms' ? 'Terms of service' : 'Privacy policy'}</h2>{legal === 'terms' ? <><p>SokoEats connects customers with independent shops and riders. Prices, availability, delivery estimates and fees are confirmed at checkout.</p><p>Orders are sent to a shop only after payment confirmation. Refunds follow the original payment provider and may be held while a delivery dispute is reviewed.</p><p>Customers must provide accurate contact and delivery information and use the service lawfully.</p></> : <><p>We use account, order, payment reference and location data to operate delivery, prevent fraud, provide support and comply with Kenyan law.</p><p>Payment card details are handled by the payment provider. SokoEats stores payment references and settlement records, not raw card numbers.</p><p>You can correct or delete your profile from Account. Legally required transaction records are retained in anonymised form.</p></>}<a className="primary legalContact" href="mailto:legal@sokoeats.co.ke"><Headphones/> Contact SokoEats</a></section></div>}
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
