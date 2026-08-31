import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ArrowLeft, Check, ChevronRight, Clock3, ImagePlus, LogIn, MapPin, Minus, PackagePlus, Plus, Search, ShoppingBag, Star, Store, UserRound, Utensils } from 'lucide-react';
import { API_BASE, api, clearAuthSession, readAuthSession, saveAuthSession } from '@sokoeats/shared/api';
import type { MenuItem, Vendor } from '@sokoeats/shared/types';
import './styles.css';

type Line = { item: MenuItem; quantity: number };
type Session = ReturnType<typeof readAuthSession>;
type Payment = { reference: string; method: 'mpesa' | 'card'; status: string; actionUrl?: string; providerMessage?: string; promptMessage?: string };
type LiveVendor = Vendor & { slug?: string; category?: string; tagline?: string; address?: string; imageUrl?: string; sections?: Array<{ title: string }> };
const CART_KEY = 'sokoeats.web.basket.v1';
const PAYMENT_KEY = 'sokoeats.web.payment.v1';
const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;

function readBasket(): { vendorId: string; lines: Line[] } {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '{"vendorId":"","lines":[]}'); } catch { return { vendorId: '', lines: [] }; }
}

type MerchantMenu = { vendor: { id: string; name: string; slug: string; shopType?: string; address?: string }; sections: Array<{ id: string; title: string; description?: string; items: MenuItem[] }>; items: MenuItem[] };
type SignedUpload = { uploadUrl: string; publicUrl: string; headers?: Record<string, string> };
type VendorCompliance = { legalBusinessName: string; registrationNumber: string; kraPinMasked: string; directorName: string; directorNationalIdMasked: string; settlementMethod: string; settlementAccountMasked: string; pspSubaccountId?: string; pspRecipientCode?: string; verificationStatus: string; payoutStatus: string; commissionRateBps: number; commissionAgreementVersion: string };

function MerchantManager({ session, onSignOut }: { session: NonNullable<Session>; onSignOut: () => void }) {
  const [menu, setMenu] = useState<MerchantMenu | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState({ title: '', description: '' });
  const [item, setItem] = useState({ name: '', description: '', price: '', sectionTitle: '', unitLabel: '' });
  const [compliance, setCompliance] = useState<VendorCompliance | null>(null);
  const [complianceForm, setComplianceForm] = useState({ legalBusinessName: '', registrationNumber: '', kraPin: '', directorName: '', directorNationalId: '', settlementMethod: 'mpesa_wallet', settlementBankCode: '', settlementAccount: '', pspSubaccountId: '', commissionAccepted: false });
  const load = () => api<{ menu: MerchantMenu }>('/api/vendor/menu').then((result) => setMenu(result.menu)).catch((error) => setMessage(error.message));
  const loadCompliance = () => api<{ compliance: VendorCompliance | null }>('/api/vendor/compliance').then((result) => { setCompliance(result.compliance); if (result.compliance) setComplianceForm((current) => ({ ...current, legalBusinessName: result.compliance?.legalBusinessName || '', registrationNumber: result.compliance?.registrationNumber || '', directorName: result.compliance?.directorName || '', settlementMethod: result.compliance?.settlementMethod || 'mpesa_wallet', pspSubaccountId: result.compliance?.pspSubaccountId || '', commissionAccepted: true })); }).catch((error) => setMessage(error.message));
  useEffect(() => { void load(); void loadCompliance(); }, []);
  const createCategory = async () => {
    if (!category.title.trim()) return setMessage('Enter a category name.');
    setBusy(true); setMessage('');
    try {
      const result = await api<{ menu: MerchantMenu }>('/api/vendor/menu/categories', { method: 'POST', body: JSON.stringify(category) });
      setMenu(result.menu); setItem((current) => ({ ...current, sectionTitle: category.title })); setCategory({ title: '', description: '' }); setMessage('Category saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save category'); } finally { setBusy(false); }
  };
  const uploadImage = async () => {
    if (!file) return '';
    const result = await api<{ upload: SignedUpload }>('/api/vendor/media/presign', { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type }) });
    const response = await fetch(result.upload.uploadUrl, { method: 'PUT', headers: result.upload.headers || { 'Content-Type': file.type }, body: file });
    if (!response.ok) throw new Error('Image upload failed. Check the R2 CORS policy and try again.');
    return result.upload.publicUrl;
  };
  const createItem = async () => {
    if (!item.name.trim() || !item.sectionTitle.trim() || Number(item.price) <= 0) return setMessage('Product name, category, and a valid price are required.');
    setBusy(true); setMessage(file ? 'Uploading image...' : 'Saving product...');
    try {
      const imageUrl = await uploadImage();
      const result = await api<{ menu: MerchantMenu }>('/api/vendor/menu/items', { method: 'POST', body: JSON.stringify({ ...item, price: Number(item.price), imageUrl: imageUrl || undefined, available: true }) });
      setMenu(result.menu); setItem((current) => ({ ...current, name: '', description: '', price: '', unitLabel: '' })); setFile(null); setMessage('Product published to your shop.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to publish product'); } finally { setBusy(false); }
  };
  const saveCompliance = async () => {
    const required = [complianceForm.legalBusinessName, complianceForm.registrationNumber, complianceForm.kraPin, complianceForm.directorName, complianceForm.directorNationalId, complianceForm.settlementAccount];
    if (required.some((value) => !value.trim()) || !complianceForm.commissionAccepted) return setMessage('Complete every legal, tax, director, settlement, and commission agreement field.');
    setBusy(true); setMessage('Creating your secure payout profile...');
    try {
      const result = await api<{ compliance: VendorCompliance }>('/api/vendor/compliance', { method: 'PUT', body: JSON.stringify({ ...complianceForm, commissionRateBps: 1000, commissionAgreementVersion: 'marketplace-v1' }) });
      setCompliance(result.compliance); setComplianceForm((current) => ({ ...current, kraPin: '', directorNationalId: '', settlementAccount: '' })); setMessage('Compliance submitted. Payouts activate after SokoEats verification.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to submit compliance'); } finally { setBusy(false); }
  };
  const toggle = async (entry: MenuItem) => {
    try {
      await api('/api/vendor/menu/' + entry.id + '/availability', { method: 'PATCH', body: JSON.stringify({ available: entry.available === false }) });
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update availability'); }
  };
  return <main className="merchantApp">
    <header className="topbar"><button className="brand"><Utensils/> SokoEats Merchant</button><div className="account"><span>{session.user.name}</span><button onClick={onSignOut}>Sign out</button></div></header>
    <section className="merchantHead"><div><small>Authenticated catalogue</small><h1>{menu?.vendor.name || 'Your shop'}</h1><p>{menu?.vendor.address || 'Complete your store profile to publish a location.'}</p></div><span>{menu?.items.length || 0} products</span></section>
    <section className="merchantGrid">
      <div className="managerPanel compliancePanel"><h2>Business verification and payouts</h2><p>Legal and settlement details are encrypted. Only masked values are returned after submission.</p><div className="statusRow"><span className={compliance?.verificationStatus === 'verified' ? 'on' : 'off'}>{compliance?.verificationStatus || 'not submitted'}</span><span className={compliance?.payoutStatus === 'active' ? 'on' : 'off'}>{compliance?.payoutStatus || 'payout setup required'}</span></div><input placeholder="Legal business name" value={complianceForm.legalBusinessName} onChange={(e) => setComplianceForm({ ...complianceForm, legalBusinessName: e.target.value })}/><input placeholder="Business registration number" value={complianceForm.registrationNumber} onChange={(e) => setComplianceForm({ ...complianceForm, registrationNumber: e.target.value })}/><input placeholder={compliance?.kraPinMasked || 'KRA PIN e.g. A123456789B'} value={complianceForm.kraPin} onChange={(e) => setComplianceForm({ ...complianceForm, kraPin: e.target.value.toUpperCase() })}/><input placeholder="Director or proprietor legal name" value={complianceForm.directorName} onChange={(e) => setComplianceForm({ ...complianceForm, directorName: e.target.value })}/><input placeholder={compliance?.directorNationalIdMasked || 'Director national ID'} value={complianceForm.directorNationalId} onChange={(e) => setComplianceForm({ ...complianceForm, directorNationalId: e.target.value })}/><select value={complianceForm.settlementMethod} onChange={(e) => setComplianceForm({ ...complianceForm, settlementMethod: e.target.value })}><option value="mpesa_wallet">M-Pesa wallet</option><option value="mpesa_till">M-Pesa till</option><option value="mpesa_paybill">M-Pesa paybill</option><option value="bank">Kenyan bank account</option></select>{complianceForm.settlementMethod === 'bank' && <input placeholder="Paystack bank code" value={complianceForm.settlementBankCode} onChange={(e) => setComplianceForm({ ...complianceForm, settlementBankCode: e.target.value })}/>}<input placeholder={compliance?.settlementAccountMasked || 'Settlement account or M-Pesa number'} value={complianceForm.settlementAccount} onChange={(e) => setComplianceForm({ ...complianceForm, settlementAccount: e.target.value })}/><input placeholder="PSP subaccount ID optional" value={complianceForm.pspSubaccountId} onChange={(e) => setComplianceForm({ ...complianceForm, pspSubaccountId: e.target.value })}/><label className="agreement"><input type="checkbox" checked={complianceForm.commissionAccepted} onChange={(e) => setComplianceForm({ ...complianceForm, commissionAccepted: e.target.checked })}/><span>I accept marketplace-v1 and the 10% launch product-sales commission.</span></label><button className="checkout" disabled={busy} onClick={saveCompliance}>{busy ? 'Working...' : compliance ? 'Resubmit for verification' : 'Submit for verification'}</button></div>
      <div className="managerPanel"><h2>Create category</h2><p>Use clear customer-facing groups such as Meals, Drinks, Medicine, Fresh Produce, Gas Refills, or Electronics.</p><input placeholder="Category name" value={category.title} onChange={(e) => setCategory({ ...category, title: e.target.value })}/><textarea placeholder="What belongs in this category?" value={category.description} onChange={(e) => setCategory({ ...category, description: e.target.value })}/><button className="checkout" disabled={busy} onClick={createCategory}><Plus size={18}/> Save category</button></div>
      <div className="managerPanel"><h2><PackagePlus size={22}/> Add a product</h2><select value={item.sectionTitle} onChange={(e) => setItem({ ...item, sectionTitle: e.target.value })}><option value="">Choose category</option>{menu?.sections.map((section) => <option key={section.id} value={section.title}>{section.title}</option>)}</select><input placeholder="Specific product name" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })}/><textarea placeholder="Short description, size, ingredients, or important details" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })}/><div className="inputRow"><input type="number" min="1" placeholder="Price in KES" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })}/><input placeholder="Unit e.g. plate, 1kg" value={item.unitLabel} onChange={(e) => setItem({ ...item, unitLabel: e.target.value })}/></div><label className="filePicker"><ImagePlus size={20}/><span>{file ? file.name : 'Choose product image'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setFile(e.target.files?.[0] || null)}/></label><button className="checkout" disabled={busy} onClick={createItem}>{busy ? 'Working...' : 'Publish product'}</button></div>
      <div className="cataloguePanel"><div className="catalogueTitle"><div><h2>Live catalogue</h2><p>Changes here are reflected in customer shop pages.</p></div></div>{menu?.sections.map((section) => <section key={section.id} className="catalogueSection"><h3>{section.title}</h3><p>{section.description}</p><div className="managerItems">{section.items.map((entry) => <article key={entry.id}>{entry.imageUrl ? <img src={entry.imageUrl} alt={entry.name}/> : <div className="imagePlaceholder"><ImagePlus/></div>}<div><b>{entry.name}</b><span>{entry.description}</span><strong>{money(entry.price)}</strong></div><button className={entry.available === false ? 'off' : 'on'} onClick={() => toggle(entry)}>{entry.available === false ? 'Unavailable' : 'Available'}</button></article>)}</div></section>)}{!menu?.items.length && <p className="empty">Create a category and publish your first product.</p>}</div>
    </section>{message && <div className="merchantToast">{message}</div>}
  </main>;
}

function App() {
  const saved = useMemo(readBasket, []);
  const [vendors, setVendors] = useState<LiveVendor[]>([]);
  const [selected, setSelected] = useState(saved.vendorId);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Line[]>(saved.lines || []);
  const [query, setQuery] = useState('');
  const [session, setSession] = useState<Session>(() => readAuthSession());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '', city: 'Nairobi', defaultAddress: '' });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card'>('mpesa');
  const [pendingPayment, setPendingPayment] = useState<Payment | null>(() => {
    try { return JSON.parse(localStorage.getItem(PAYMENT_KEY) || 'null'); } catch { return null; }
  });
  const [status, setStatus] = useState('');
  const [focused, setFocused] = useState<MenuItem | null>(null);
  const [similar, setSimilar] = useState<MenuItem[]>([]);

  useEffect(() => {
    api<{ vendors: LiveVendor[] }>('/api/vendors').then(({ vendors: next }) => {
      setVendors(next);
      setSelected((current) => current && next.some((vendor) => vendor.id === current) ? current : next[0]?.id || '');
    }).catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    api<{ items: MenuItem[] }>(`/api/menu?vendorId=${encodeURIComponent(selected)}`).then(({ items }) => setMenu(items)).catch((error) => setStatus(error.message));
  }, [selected]);

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify({ vendorId: selected, lines: cart })); }, [selected, cart]);

  useEffect(() => {
    if (pendingPayment) localStorage.setItem(PAYMENT_KEY, JSON.stringify(pendingPayment));
    else localStorage.removeItem(PAYMENT_KEY);
  }, [pendingPayment]);

  useEffect(() => {
    if (!session?.user) return;
    setForm((current) => ({
      ...current,
      fullName: current.fullName || session.user.name || '',
      email: current.email || session.user.email || '',
      phone: current.phone || session.user.phone || '',
      city: current.city || session.user.city || 'Nairobi',
      defaultAddress: current.defaultAddress || session.user.defaultAddress || String(session.user.profile?.defaultAddress || ''),
    }));
  }, [session?.user.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('auth_code');
    const error = params.get('auth_error');
    if (error) { setAuthError(error); setAuthOpen(true); }
    if (!code) return;
    api<NonNullable<Session>>('/api/auth/google/web/exchange', { method: 'POST', body: JSON.stringify({ code }) })
      .then((next) => { saveAuthSession(next); setSession(next); setCheckoutOpen(true); })
      .catch((nextError) => { setAuthError(nextError.message); setAuthOpen(true); })
      .finally(() => { window.history.replaceState({}, '', window.location.pathname); });
  }, []);

  const vendor = vendors.find((entry) => entry.id === selected);
  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const deliveryFee = Number(vendor?.deliveryFee || 0);
  const serviceFee = Math.round(subtotal * 0.04);
  const total = subtotal + deliveryFee + serviceFee;
  const visibleMenu = menu.filter((item) => `${item.name} ${item.description || ''} ${item.category}`.toLowerCase().includes(query.toLowerCase()));

  const chooseVendor = (id: string) => {
    if (id === selected) return;
    if (cart.length && !window.confirm('Starting a basket from another shop will clear your current basket. Continue?')) return;
    setCart([]); setFocused(null); setSimilar([]); setSelected(id);
  };
  const add = (item: MenuItem) => setCart((lines) => {
    const current = lines.find((line) => line.item.id === item.id);
    return current ? lines.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { item, quantity: 1 }];
  });
  const change = (id: string, delta: number) => setCart((lines) => lines.map((line) => line.item.id === id ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0));
  const inspectItem = (item: MenuItem) => {
    setFocused(item);
    api<{ similar: MenuItem[] }>(`/api/menu/${item.id}/similar`).then((result) => setSimilar(result.similar)).catch(() => setSimilar([]));
  };
  const beginCheckout = () => {
    if (!cart.length) return;
    if (!session) { setAuthOpen(true); return; }
    setCheckoutOpen(true);
  };
  const submitAuth = async () => {
    setAuthBusy(true); setAuthError('');
    try {
      const body = authMode === 'login' ? { role: 'customer', email: form.email, password: form.password } : { ...form, role: 'customer', marketingOptIn: true };
      const next = await api<NonNullable<Session>>(authMode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
      saveAuthSession(next); setSession(next); setAuthOpen(false); setCheckoutOpen(true);
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Unable to sign in'); }
    finally { setAuthBusy(false); }
  };
  const continueGoogle = () => {
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    window.location.assign(`${API_BASE}/api/auth/google/web/start?returnTo=${encodeURIComponent(returnTo)}`);
  };
  const saveProfile = async () => {
    const result = await api<{ user: NonNullable<Session>['user'] }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ phone: form.phone, city: form.city, defaultAddress: form.defaultAddress }) });
    if (!session) return;
    const next = { ...session, user: result.user };
    saveAuthSession(next); setSession(next);
  };
  const startPayment = async () => {
    if (!session?.user || !vendor) return;
    if (!form.phone || !form.defaultAddress) { setStatus('Add your mobile number and delivery address before payment.'); return; }
    await saveProfile();
    const result = await api<{ payment: Payment }>('/api/payments/checkout', { method: 'POST', body: JSON.stringify({ method: paymentMethod, amount: total, currency: 'KES', phone: form.phone, email: session.user.email, customerName: session.user.name }) });
    setPendingPayment(result.payment);
    setStatus(result.payment.providerMessage || result.payment.promptMessage || 'Payment started.');
    if (paymentMethod === 'card' && result.payment.actionUrl) window.location.assign(result.payment.actionUrl);
  };
  const confirmAndOrder = async () => {
    if (!pendingPayment || !vendor) return;
    const confirmed = await api<{ payment: Payment }>(`/api/payments/${pendingPayment.reference}/confirm`, { method: 'POST' });
    if (confirmed.payment.status !== 'paid') { setStatus(confirmed.payment.providerMessage || 'Payment is still pending.'); return; }
    const result = await api<{ order: { code: string } }>('/api/orders', { method: 'POST', body: JSON.stringify({ phone: form.phone, vendorId: vendor.id, deliveryAddress: form.defaultAddress, paymentMethod, paymentReference: pendingPayment.reference, items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })) }) });
    setCart([]); setPendingPayment(null); setCheckoutOpen(false); setStatus(`Order ${result.order.code} was placed successfully.`);
  };
  const signOut = () => { clearAuthSession(); setSession(null); setPendingPayment(null); };

  if (session && (session.user.role === 'vendor' || session.user.role === 'merchant')) return <MerchantManager session={session} onSignOut={signOut} />;

  return <main>
    <header className="topbar"><button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><Utensils /> SokoEats</button><label className="search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products and meals"/></label><div className="account">{session ? <><span>{session.user.name}</span><button onClick={signOut}>Sign out</button></> : <button onClick={() => setAuthOpen(true)}><UserRound size={18}/> Sign in</button>}<button className="basketButton" onClick={beginCheckout}><ShoppingBag size={18}/> {cart.reduce((sum, line) => sum + line.quantity, 0)}</button></div></header>
    <section className="categoryBand"><div><p>Delivery around Nairobi</p><h1>Choose a shop. Build your basket.</h1><span>Sign in only when you are ready to pay.</span></div></section>
    <section className="vendors">{vendors.map((entry) => <button key={entry.id} className={entry.id === selected ? 'vendor active' : 'vendor'} onClick={() => chooseVendor(entry.id)}>{entry.imageUrl && <img src={entry.imageUrl} alt=""/>}<strong>{entry.name}</strong><span>{entry.tagline || entry.cuisine}</span><em><Star size={14}/> {entry.rating} <Clock3 size={14}/> {entry.prepMinutes}m</em></button>)}</section>
    <section className="shopHeading">{vendor && <><div><small><Store size={15}/> {vendor.category || 'Shop'}</small><h2>{vendor.name}</h2><p><MapPin size={16}/> {vendor.address}</p></div><strong>{money(deliveryFee)} delivery</strong></>}</section>
    <section className="shell"><div className="menu">{visibleMenu.map((item) => <article key={item.id} onClick={() => inspectItem(item)}>{item.imageUrl && <img src={item.imageUrl} alt={item.name}/>}<div><small>{item.category}{item.popular ? ' / popular' : ''}</small><h3>{item.name}</h3><p>{item.description}</p><strong>{money(item.price)}</strong></div><button onClick={(event) => { event.stopPropagation(); add(item); }}><Plus size={18}/> Add</button></article>)}</div><aside><h2><ShoppingBag/> Basket</h2>{cart.length ? cart.map((line) => <div className="cartline" key={line.item.id}><div><b>{line.item.name}</b><span>{money(line.item.price * line.quantity)}</span></div><div className="stepper"><button onClick={() => change(line.item.id, -1)}><Minus size={14}/></button><strong>{line.quantity}</strong><button onClick={() => change(line.item.id, 1)}><Plus size={14}/></button></div></div>) : <p className="empty">Add products from this shop to begin.</p>}<div className="totals"><span>Subtotal</span><b>{money(subtotal)}</b><span>Delivery</span><b>{money(deliveryFee)}</b><span>Service</span><b>{money(serviceFee)}</b><span>Total</span><b>{money(total)}</b></div><button className="checkout" onClick={beginCheckout} disabled={!cart.length}>Continue to checkout <ChevronRight size={18}/></button>{status && <p className="notice">{status}</p>}</aside></section>
    {focused && <section className="similar"><button className="link" onClick={() => setFocused(null)}><ArrowLeft size={16}/> Back to shop</button><h2>Similar to {focused.name}</h2><div className="similarGrid">{similar.map((item) => <article key={item.id}>{item.imageUrl && <img src={item.imageUrl} alt={item.name}/>}<h3>{item.name}</h3><p>{item.description}</p><strong>{money(item.price)}</strong></article>)}</div></section>}
    {authOpen && <div className="overlay"><section className="dialog"><button className="close" onClick={() => setAuthOpen(false)}>×</button><h2>{authMode === 'login' ? 'Sign in to checkout' : 'Create your buyer account'}</h2><p>Your basket stays exactly as you left it.</p><button className="google" onClick={continueGoogle}><LogIn size={18}/> Continue with Google</button><div className="divider">or use email</div>{authMode === 'register' && <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}/>}<input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/><input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/>{authMode === 'register' && <><input placeholder="Mobile number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/><input placeholder="Delivery address" value={form.defaultAddress} onChange={(e) => setForm({ ...form, defaultAddress: e.target.value })}/></>}{authError && <p className="error">{authError}</p>}<button className="checkout" disabled={authBusy} onClick={submitAuth}>{authBusy ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Create account'}</button><button className="link" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'New to SokoEats? Create account' : 'Already registered? Sign in'}</button></section></div>}
    {checkoutOpen && session && <div className="overlay"><section className="dialog checkoutDialog"><button className="close" onClick={() => setCheckoutOpen(false)}>×</button><h2>Delivery and payment</h2><p>Signed in as {session.user.email}</p><input placeholder="Mobile number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/><input placeholder="Delivery address" value={form.defaultAddress} onChange={(e) => setForm({ ...form, defaultAddress: e.target.value })}/><div className="paymentChoice"><button className={paymentMethod === 'mpesa' ? 'active' : ''} onClick={() => { setPaymentMethod('mpesa'); setPendingPayment(null); }}>M-Pesa</button><button className={paymentMethod === 'card' ? 'active' : ''} onClick={() => { setPaymentMethod('card'); setPendingPayment(null); }}>Card</button></div><div className="checkoutTotal"><span>Total</span><strong>{money(total)}</strong></div>{session.user.profileComplete === false && <p className="notice">Complete these delivery details before payment.</p>}{!pendingPayment ? <button className="checkout" onClick={startPayment}>Pay {money(total)}</button> : <button className="checkout" onClick={confirmAndOrder}><Check size={18}/> Confirm payment and place order</button>} {status && <p className="notice">{status}</p>}</section></div>}
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
