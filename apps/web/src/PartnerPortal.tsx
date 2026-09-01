'use client';

import React, { useEffect, useState } from 'react';
import { BadgeCheck, ImagePlus, LogOut, PackagePlus, Plus, Store, Utensils } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import type { MenuItem } from '@sokoeats/shared/types';

type Session = { user: { name: string; email: string; role: string; status?: string } };
type PartnerMenu = { vendor: { name: string; address?: string }; sections: Array<{ id: string; title: string; description?: string; items: MenuItem[] }>; items: MenuItem[] };
type Upload = { uploadUrl: string; publicUrl: string; headers?: Record<string, string> };
const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;

export function PartnerPortal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [menu, setMenu] = useState<PartnerMenu | null>(null);
  const [category, setCategory] = useState({ title: '', description: '' });
  const [item, setItem] = useState({ name: '', description: '', price: '', sectionTitle: '', unitLabel: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = () => api<{ menu: PartnerMenu }>('/api/vendor/menu').then((result) => setMenu(result.menu)).catch((error) => setMessage(error.message));
  useEffect(() => { void load(); }, []);

  const createCategory = async () => {
    if (!category.title.trim()) return setMessage('Enter a customer-facing category name.');
    setBusy(true); setMessage('');
    try {
      const result = await api<{ menu: PartnerMenu }>('/api/vendor/menu/categories', { method: 'POST', body: JSON.stringify(category) });
      setMenu(result.menu); setItem((current) => ({ ...current, sectionTitle: category.title })); setCategory({ title: '', description: '' }); setMessage('Category is live.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Category could not be saved.'); }
    finally { setBusy(false); }
  };

  const uploadImage = async () => {
    if (!file) throw new Error('Choose a clear product image before publishing.');
    const result = await api<{ upload: Upload }>('/api/vendor/media/presign', { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type }) });
    const response = await fetch(result.upload.uploadUrl, { method: 'PUT', headers: result.upload.headers || { 'Content-Type': file.type }, body: file });
    if (!response.ok) throw new Error('Image upload failed. Confirm the R2 CORS configuration.');
    return result.upload.publicUrl;
  };

  const createItem = async () => {
    if (!item.name.trim() || Number(item.price) <= 0) return setMessage('Product name and a valid price are required.');
    setBusy(true); setMessage('Uploading and publishing product...');
    try {
      const imageUrl = await uploadImage();
      const result = await api<{ menu: PartnerMenu; categorization?: { category: string; source: string } }>('/api/vendor/menu/items', { method: 'POST', body: JSON.stringify({ ...item, category: item.sectionTitle || undefined, price: Number(item.price), imageUrl, available: true }) });
      setMenu(result.menu); setItem((current) => ({ ...current, name: '', description: '', price: '', unitLabel: '' })); setFile(null); setMessage(`Product published in ${result.categorization?.category || item.sectionTitle}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Product could not be published.'); }
    finally { setBusy(false); }
  };

  const toggle = async (entry: MenuItem) => {
    try { await api(`/api/vendor/menu/${entry.id}/availability`, { method: 'PATCH', body: JSON.stringify({ available: entry.available === false }) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Availability could not be changed.'); }
  };

  if (session.user.status !== 'active') {
    return <main className="partnerPortal">
      <header className="partnerHeader"><div className="brand"><span className="brandMark"><Utensils/></span>SokoEats Partner</div><div><span>{session.user.name}</span><button onClick={onSignOut}><LogOut/> Sign out</button></div></header>
      <section className="partnerPending"><BadgeCheck/><span>Application received</span><h1>Your store is under review</h1><p>SokoEats is verifying the submitted business, director, and settlement details. Catalogue publishing will unlock automatically after approval.</p><div><b>Account</b><span>{session.user.email}</span><b>Status</b><span>Pending verification</span></div><a href="mailto:partners@sokoeats.co.ke">Contact partner operations</a></section>
    </main>;
  }

  return <main className="partnerPortal">
    <header className="partnerHeader"><div className="brand"><span className="brandMark"><Utensils/></span>SokoEats Partner</div><div><span>{session.user.name}</span><button onClick={onSignOut}><LogOut/> Sign out</button></div></header>
    <section className="partnerIntro"><div><span>Live store catalogue</span><h1>{menu?.vendor.name || 'Your SokoEats shop'}</h1><p>{menu?.vendor.address || session.user.email}</p></div><strong>{menu?.items.length || 0} products</strong></section>
    <section className="partnerWorkspace">
      <aside><section><h2><Plus/> New category</h2><p>Examples: Meals, Drinks, Medicine, Fresh Produce, Gas Refills or Electronics.</p><label>Category name<input value={category.title} onChange={(e) => setCategory({ ...category, title: e.target.value })}/></label><label>Customer description<textarea value={category.description} onChange={(e) => setCategory({ ...category, description: e.target.value })}/></label><button className="primary" disabled={busy} onClick={createCategory}>Save category</button></section>
      <section><h2><PackagePlus/> Add product</h2><label>Category<select value={item.sectionTitle} onChange={(e) => setItem({ ...item, sectionTitle: e.target.value })}><option value="">Automatic (recommended)</option>{menu?.sections.map((section) => <option key={section.id}>{section.title}</option>)}</select><small>SokoEats categorizes the item from its name, description and store type.</small></label><label>Specific product name<input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder="Nyama Choma Platter"/></label><label>Description<textarea value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} placeholder="Ingredients, size and key details"/></label><div className="partnerInputRow"><label>Price in KES<input type="number" min="1" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })}/></label><label>Unit<input value={item.unitLabel} onChange={(e) => setItem({ ...item, unitLabel: e.target.value })} placeholder="plate, 1kg"/></label></div><label className="fileInput"><ImagePlus/><span>{file?.name || 'Choose product image'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setFile(e.target.files?.[0] || null)}/></label><button className="primary" disabled={busy} onClick={createItem}>{busy ? 'Working...' : 'Publish product'}</button></section></aside>
      <div className="liveCatalogue"><div><span>Customer view</span><h2>Published catalogue</h2><p>Product names, descriptions, prices and images update the buyer shop immediately.</p></div>{menu?.sections.map((section) => <section key={section.id}><h3>{section.title}</h3><p>{section.description}</p><div>{section.items.map((entry) => <article key={entry.id}>{entry.imageUrl ? <img src={entry.imageUrl} alt={entry.name}/> : <div className="productFallback"><Store/></div>}<div><b>{entry.name}</b><span>{entry.description}</span><strong>{money(entry.price)}</strong></div><button className={entry.available === false ? 'unavailable' : ''} onClick={() => toggle(entry)}>{entry.available === false ? 'Unavailable' : 'Available'}</button></article>)}</div></section>)}{!menu?.items.length && <div className="partnerEmpty"><Store/><h3>Your catalogue is empty</h3><p>Create a category, then publish your first product with a clear image.</p></div>}</div>
    </section>{message && <div className="partnerToast">{message}</div>}
  </main>;
}
