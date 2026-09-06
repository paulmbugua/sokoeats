'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, BarChart3, CheckCircle2, Clock3, ImagePlus, LogOut, PackageCheck, PackagePlus, Pencil, Plus, Save, Star, Store, Trash2, TrendingUp, Utensils, X } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import type { MenuItem } from '@sokoeats/shared/types';
import { DeliveryBoard } from './DeliveryBoard';
import { ApplicationTracker } from './CustomerCareChat';

type Session = { user: { id?: string; name: string; email: string; role: string; status?: string; applicationReference?: string | null } };
type StoreProfile = { id?: string; name: string; address?: string; tagline?: string; contactPhone?: string; imageUrl?: string; acceptingOrders?: boolean; rating?: number; ratingCount?: number; prepMinutes?: number; minimumOrder?: number; openingHours?: Record<string,string> };
type PartnerMenu = { vendor: StoreProfile; sections: Array<{ id: string; title: string; description?: string; items: MenuItem[] }>; items: MenuItem[] };
type Operations = { vendor: StoreProfile; metrics: Record<'today'|'week'|'month',{ sales:number; customerRevenue:number; orders:number; delivered:number }>; trend:Array<{date:string;sales:number;orders:number}>; orderStatuses:Record<string,number>; orders:Array<{id:string;code:string;status:string;paymentStatus:string;customerName:string;recipientName?:string;deliveryAddress:string;subtotal:number;total:number;createdAt:string;items:Array<{name:string;quantity:number;lineTotal:number}>}>; ratings:{average:number;count:number;breakdown:Array<{stars:number;count:number}>;recent:Array<{id:string;rating:number;comment?:string;customerName:string;orderCode:string;createdAt:string}>}; catalogue:{total:number;available:number;unavailable:number} };
type Upload = { uploadUrl: string; publicUrl: string; headers?: Record<string, string> };
const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;

export function PartnerPortal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [partnerStatus,setPartnerStatus]=useState(session.user.status);
  const [menu, setMenu] = useState<PartnerMenu | null>(null);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [category, setCategory] = useState({ title: '', description: '' });
  const [item, setItem] = useState({ name: '', description: '', price: '', sectionTitle: '', unitLabel: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [preview, setPreview] = useState('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState('');
  const [profile, setProfile] = useState({ name:'', tagline:'', address:'', contactPhone:'', prepMinutes:'25', minimumOrder:'300', openingHours:'Mon-Sun 8:00-22:00', acceptingOrders:true, imageUrl:'' });
  const partnerPrice = Number(item.price || 0);
  const shopperPrice = Math.round(partnerPrice * 1.1);
  const editor = useRef<HTMLElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const load = async () => {
    try {
      const [menuResult, operationsResult] = await Promise.all([api<{ menu: PartnerMenu }>('/api/vendor/menu'),api<{operations:Operations}>('/api/vendor/operations')]);
      setMenu(menuResult.menu); setOperations(operationsResult.operations);
      const shop=operationsResult.operations.vendor;
      setProfile({name:shop.name||'',tagline:shop.tagline||'',address:shop.address||'',contactPhone:shop.contactPhone||'',prepMinutes:String(shop.prepMinutes||25),minimumOrder:String(shop.minimumOrder||0),openingHours:shop.openingHours?.daily||'Mon-Sun 8:00-22:00',acceptingOrders:shop.acceptingOrders!==false,imageUrl:shop.imageUrl||''});
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Store data could not be loaded.'); }
  };
  useEffect(() => { if(partnerStatus==='active')void load(); }, [partnerStatus]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!profileFile) { setProfilePreview(''); return; }
    const url=URL.createObjectURL(profileFile); setProfilePreview(url);
    return()=>URL.revokeObjectURL(url);
  },[profileFile]);
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);

  const resetEditor = () => {
    setEditing(null); setItem({ name: '', description: '', price: '', sectionTitle: '', unitLabel: '' }); setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };
  const editItem = (entry: MenuItem) => {
    if (busy) return;
    setEditing(entry); setFile(null); setMessage('');
    if (fileInput.current) fileInput.current.value = '';
    setItem({ name: entry.name, description: entry.description || '', price: String(entry.price), sectionTitle: entry.category, unitLabel: entry.unitLabel || '' });
    editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nameInput.current?.focus({ preventScroll: true });
  };

  const deleteItem = async () => {
    if (!deleting || busy) return;
    setBusy(true); setMessage('');
    try {
      const { deletedId } = await api<{ deletedId: string }>(`/api/vendor/menu/items/${encodeURIComponent(deleting.id)}`, { method: 'DELETE' });
      setMenu(current => current ? { ...current, items: current.items.filter(entry => entry.id !== deletedId), sections: current.sections.map(section => ({ ...section, items: section.items.filter(entry => entry.id !== deletedId) })) } : current);
      if (editing?.id === deletedId) resetEditor();
      setDeleting(null); setMessage('Product deleted. Past orders have been kept.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Product could not be deleted.'); }
    finally { setBusy(false); }
  };

  const createCategory = async () => {
    if (!category.title.trim()) return setMessage('Enter a customer-facing category name.');
    setBusy(true); setMessage('');
    try {
      const result = await api<{ menu: PartnerMenu }>('/api/vendor/menu/categories', { method: 'POST', body: JSON.stringify(category) });
      setMenu(result.menu); setItem((current) => ({ ...current, sectionTitle: category.title })); setCategory({ title: '', description: '' }); setMessage('Category is live.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Category could not be saved.'); }
    finally { setBusy(false); }
  };

  const uploadAsset = async (asset: File) => {
    const result = await api<{ upload: Upload }>('/api/vendor/media/presign', { method: 'POST', body: JSON.stringify({ filename: asset.name, contentType: asset.type }) });
    let response: Response;
    try {
      response = await fetch(result.upload.uploadUrl, { method: 'PUT', headers: result.upload.headers || { 'Content-Type': asset.type }, body: asset, credentials: 'omit' });
    } catch {
      throw new Error('Image storage could not be reached. Check your connection and that the R2 bucket allows uploads from this dashboard. Your product details have been kept.');
    }
    if (!response.ok) throw new Error(`Image upload failed (HTTP ${response.status}). Retry to get a fresh upload link; your product details have been kept.`);
    return result.upload.publicUrl;
  };
  const uploadImage = async () => {
    if (!file) throw new Error('Choose a clear product image before publishing.');
    return uploadAsset(file);
  };

  const saveStoreProfile = async () => {
    if (!profile.name.trim() || !profile.address.trim()) return setMessage('Shop name and physical address are required.');
    setBusy(true); setMessage('Saving shop profile...');
    try {
      const imageUrl=profileFile ? await uploadAsset(profileFile) : profile.imageUrl || undefined;
      await api('/api/vendor/store-profile',{method:'PATCH',body:JSON.stringify({...profile,imageUrl,openingHours:{daily:profile.openingHours},prepMinutes:Number(profile.prepMinutes),minimumOrder:Number(profile.minimumOrder)})});
      setProfileFile(null); await load(); setMessage('Shop profile is live for customers.');
    } catch(error){setMessage(error instanceof Error?error.message:'Shop profile could not be saved.');}
    finally{setBusy(false);}
  };

  const advanceOrder = async (order: Operations['orders'][number]) => {
    setBusy(true); setMessage('Updating order...');
    try {
      if(order.status==='placed') await api(`/api/finance/orders/${encodeURIComponent(order.id)}/vendor-accept`,{method:'POST'});
      else { const status=order.status==='accepted'?'preparing':'ready'; await api(`/api/vendor/orders/${encodeURIComponent(order.id)}/workflow`,{method:'PATCH',body:JSON.stringify({status})}); }
      await load(); setMessage('Order status updated. The buyer can see the change immediately.');
    } catch(error){setMessage(error instanceof Error?error.message:'Order status could not be updated.');}
    finally{setBusy(false);}
  };

  const createItem = async () => {
    if (busy) return;
    const name = item.name.trim();
    const sectionTitle = item.sectionTitle.trim() || undefined;
    const price = Number(item.price);
    if (name.length < 2 || name.length > 140) return setMessage('Product name must contain 2 to 140 characters.');
    if (!Number.isInteger(price) || price < 1) return setMessage('Enter a whole-shilling price of at least KES 1.');
    if (item.description.length > 500) return setMessage('Product description must be 500 characters or fewer.');
    if (item.unitLabel.length > 40) return setMessage('Unit must be 40 characters or fewer.');
    if (sectionTitle && (sectionTitle.length < 2 || sectionTitle.length > 80)) return setMessage('Category name must contain 2 to 80 characters.');
    setBusy(true); setMessage(editing ? 'Saving product...' : 'Uploading and publishing product...');
    try {
      const imageUrl = file ? await uploadImage() : editing?.imageUrl || await uploadImage();
      const path = editing ? `/api/vendor/menu/items/${encodeURIComponent(editing.id)}` : '/api/vendor/menu/items';
      const result = await api<{ menu?: PartnerMenu; categorization?: { category: string; source: string } }>(path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ name, description: item.description, unitLabel: item.unitLabel, sectionTitle, price, imageUrl, available: editing?.available ?? true, popular: editing?.popular ?? false, sortOrder: editing?.sortOrder ?? 0 }) });
      if (result.menu) setMenu(result.menu); else await load();
      setMessage(`Product ${editing ? 'updated' : 'published'} in ${result.categorization?.category || item.sectionTitle}.`);
      resetEditor();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Product could not be published.'); }
    finally { setBusy(false); }
  };

  const toggle = async (entry: MenuItem) => {
    if (busy) return;
    setBusy(true);
    try { await api(`/api/vendor/menu/${entry.id}/availability`, { method: 'PATCH', body: JSON.stringify({ available: entry.available === false }) }); setEditing(current => current?.id === entry.id ? { ...current, available: entry.available === false } : current); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Availability could not be changed.'); }
    finally { setBusy(false); }
  };

  if (partnerStatus !== 'active') {
    return <main className="partnerPortal">
      <header className="partnerHeader"><div className="brand"><span className="brandMark"><Utensils/></span>SokoEats Partner</div><div><span>{session.user.name}</span><button onClick={onSignOut}><LogOut/> Sign out</button></div></header>
      <ApplicationTracker user={session.user} onStatusChange={status=>setPartnerStatus(status==='verified'?'active':'review')}/>
      <section className="partnerPending"><BadgeCheck/><span>Partner account</span><h1>Your shop application</h1><p>Check your latest application status above. Your shop can publish products once its business and settlement details are approved.</p><div><b>Account</b><span>{session.user.email}</span></div><a href="mailto:support@sokoeats.co.ke">Contact customer care</a></section>
    </main>;
  }

  return <main className="partnerPortal">
    <header className="partnerHeader"><div className="brand"><span className="brandMark"><Utensils/></span>SokoEats Partner</div><div><span>{session.user.name}</span><button onClick={onSignOut}><LogOut/> Sign out</button></div></header>
    <ApplicationTracker user={session.user} onStatusChange={status=>setPartnerStatus(status==='verified'?'active':'review')}/>
    <section className="partnerIntro"><div><span>Partner operations</span><h1>{menu?.vendor.name || 'Your SokoEats shop'}</h1><p>{menu?.vendor.address || session.user.email}</p></div><strong className={operations?.vendor.acceptingOrders===false?'storeClosed':''}>{operations?.vendor.acceptingOrders===false?'Store paused':'Accepting orders'}</strong></section>
    {operations && <section className="operationsOverview">
      <div className="metricGrid">{(['today','week','month'] as const).map(period=><article key={period}><span>{period==='today'?'Today':period==='week'?'This week':'This month'}</span><strong>{money(operations.metrics[period].sales)}</strong><small>{operations.metrics[period].orders} paid orders · {operations.metrics[period].delivered} delivered</small></article>)}<article><span>Shop rating</span><strong><Star/> {operations.ratings.average.toFixed(1)}</strong><small>{operations.ratings.count} verified delivery reviews</small></article></div>
      <div className="operationsColumns"><section><div className="sectionTitle"><BarChart3/><div><h2>7-day sales</h2><p>Paid product sales, excluding cancelled orders.</p></div></div><div className="salesBars">{operations.trend.map(day=>{const max=Math.max(...operations.trend.map(point=>point.sales),1);return <div key={day.date} title={`${money(day.sales)} · ${day.orders} orders`}><span style={{height:`${Math.max(5,day.sales/max*100)}%`}}/><small>{new Date(day.date).toLocaleDateString('en-KE',{weekday:'short'})}</small></div>})}</div></section>
      <section><div className="sectionTitle"><PackageCheck/><div><h2>Catalogue health</h2><p>Keep unavailable products updated before opening.</p></div></div><div className="catalogueHealth"><strong>{operations.catalogue.available}</strong><span>available</span><strong>{operations.catalogue.unavailable}</strong><span>unavailable</span><strong>{operations.catalogue.total}</strong><span>total products</span></div></section></div>
      <section className="partnerOrders"><div className="sectionTitle"><Clock3/><div><h2>Orders and fulfilment</h2><p>Accept, prepare and mark orders ready. Riders confirm pickup and delivery.</p></div></div><div className="orderList">{operations.orders.slice(0,12).map(order=><article key={order.id}><div><strong>{order.code}</strong><span className={`status status-${order.status}`}>{order.status.replaceAll('_',' ')}</span></div><p>{order.items.map(item=>`${item.quantity}× ${item.name}`).join(', ')||'Items unavailable'}</p><small>{order.recipientName||order.customerName} · {order.deliveryAddress}</small><footer><b>{money(order.subtotal)}</b><time>{new Date(order.createdAt).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'})}</time>{['placed','accepted','preparing'].includes(order.status)&&<button disabled={busy||order.paymentStatus!=='paid'} onClick={()=>advanceOrder(order)}>{order.status==='placed'?'Accept order':order.status==='accepted'?'Start preparing':'Mark ready'}</button>}{order.status==='delivered'&&<span className="delivered"><CheckCircle2/> Delivered</span>}</footer></article>)}{!operations.orders.length&&<p>No paid orders yet.</p>}</div></section>
      <div className="operationsColumns"><section><div className="sectionTitle"><Star/><div><h2>Customer ratings</h2><p>Reviews are accepted only after a completed delivery.</p></div></div><div className="ratingBreakdown">{operations.ratings.breakdown.map(row=><div key={row.stars}><span>{row.stars} stars</span><progress max={Math.max(operations.ratings.count,1)} value={row.count}/><b>{row.count}</b></div>)}</div>{operations.ratings.recent.slice(0,4).map(review=><blockquote key={review.id}><div>{'★'.repeat(review.rating)} <small>{review.orderCode}</small></div><p>{review.comment||'Rating submitted without a comment.'}</p><cite>{review.customerName}</cite></blockquote>)}</section>
      <section className="storeProfile"><div className="sectionTitle"><Store/><div><h2>Shop profile and branding</h2><p>This identity appears on your customer-facing shop.</p></div></div>{(profilePreview||profile.imageUrl)&&<img src={profilePreview||profile.imageUrl} alt="Shop branding preview"/>}<label className="fileInput"><ImagePlus/><span>{profileFile?.name||'Upload main shop image'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event=>setProfileFile(event.target.files?.[0]||null)}/></label><label>Shop name<input value={profile.name} onChange={event=>setProfile({...profile,name:event.target.value})}/></label><label>Short description<input maxLength={180} value={profile.tagline} onChange={event=>setProfile({...profile,tagline:event.target.value})}/></label><label>Physical address<textarea value={profile.address} onChange={event=>setProfile({...profile,address:event.target.value})}/></label><label>Customer phone<input value={profile.contactPhone} onChange={event=>setProfile({...profile,contactPhone:event.target.value})}/></label><label>Opening hours<input value={profile.openingHours} onChange={event=>setProfile({...profile,openingHours:event.target.value})} placeholder="Mon-Sun 8:00-22:00"/></label><div className="partnerInputRow"><label>Preparation minutes<input type="number" min="5" max="180" value={profile.prepMinutes} onChange={event=>setProfile({...profile,prepMinutes:event.target.value})}/></label><label>Minimum order (KES)<input type="number" min="0" value={profile.minimumOrder} onChange={event=>setProfile({...profile,minimumOrder:event.target.value})}/></label></div><button className={`storeToggle ${profile.acceptingOrders?'open':''}`} onClick={()=>setProfile({...profile,acceptingOrders:!profile.acceptingOrders})}>{profile.acceptingOrders?'Accepting new orders':'Store paused'}</button><button className="primary" disabled={busy} onClick={saveStoreProfile}><Save/> Save shop profile</button></section></div>
    </section>}
    <DeliveryBoard partner />
    <section className="partnerWorkspace">
      <aside><section><h2><Plus/> New category</h2><p>Examples: Meals, Drinks, Medicine, Fresh Produce, Gas Refills or Electronics.</p><label>Category name<input value={category.title} onChange={(e) => setCategory({ ...category, title: e.target.value })}/></label><label>Customer description<textarea value={category.description} onChange={(e) => setCategory({ ...category, description: e.target.value })}/></label><button className="primary" disabled={busy} onClick={createCategory}>Save category</button></section>
      <section ref={editor} className="productEditor">
        <h2>{editing ? <Pencil/> : <PackagePlus/>}{editing ? 'Edit product' : 'Add product'}</h2>
        <fieldset disabled={busy}>
          <label>Category<select value={item.sectionTitle} onChange={(e) => setItem({ ...item, sectionTitle: e.target.value })}><option value="">Automatic (recommended)</option>{menu?.sections.map((section) => <option key={section.id}>{section.title}</option>)}</select></label>
          <label>Specific product name<input ref={nameInput} maxLength={140} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder="Nyama Choma Platter"/></label>
          <label>Description<textarea maxLength={500} value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} placeholder="Ingredients, size and key details"/></label>
          <div className="partnerInputRow"><label>Your price in KES<input type="number" min="1" step="1" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })}/></label><label>Unit<input maxLength={40} value={item.unitLabel} onChange={(e) => setItem({ ...item, unitLabel: e.target.value })} placeholder="plate, 1kg"/></label></div>
          <div className="pricePreview"><span>You receive before statutory deductions</span><strong>{money(partnerPrice)}</strong><span>Customer-facing item price</span><strong>{money(shopperPrice)}</strong><small>SokoEats adds the 10% marketplace amount to the price you enter. Customers see one final item price; your settlement statement records the breakdown.</small></div>
          {(preview || editing?.imageUrl) && <img className="productEditorPreview" src={preview || editing?.imageUrl} alt={item.name || 'Product preview'}/>}
          <label className="fileInput"><ImagePlus/><span>{file?.name || (editing?.imageUrl ? 'Replace product image (optional)' : 'Choose product image')}</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setFile(e.target.files?.[0] || null)}/></label>
          <div className="productEditorActions"><button className="primary" onClick={createItem}>{editing ? <Save/> : <Plus/>}{busy ? 'Saving...' : editing ? 'Save changes' : 'Publish product'}</button>{editing && <button onClick={resetEditor}><X/> Cancel</button>}</div>
        </fieldset>
      </section></aside>
      <div className="liveCatalogue"><div><span>Customer view</span><h2>Published catalogue</h2><p>Product names, descriptions, prices and images update the buyer shop immediately.</p></div>{menu?.sections.map((section) => <section key={section.id}><h3>{section.title}</h3><p>{section.description}</p><div>{section.items.map((entry) => <article key={entry.id}>{entry.imageUrl ? <img src={entry.imageUrl} alt={entry.name}/> : <div className="productFallback"><Store/></div>}<div><b>{entry.name}</b><span>{entry.description}</span><strong>{money(entry.customerPrice ?? Math.round(entry.price * 1.1))} customer price</strong><small>{money(entry.price)} partner amount</small></div><div className="productActions"><button disabled={busy} className={entry.available === false ? 'unavailable' : ''} aria-label={`${entry.name}: ${entry.available === false ? 'mark available' : 'mark unavailable'}`} onClick={() => toggle(entry)}>{entry.available === false ? 'Unavailable' : 'Available'}</button><button disabled={busy} title="Edit product" aria-label={`Edit ${entry.name}`} onClick={() => editItem(entry)}><Pencil/></button><button disabled={busy} className="deleteProduct" title="Delete product" aria-label={`Delete ${entry.name}`} onClick={() => { setMessage(''); setDeleting(entry); }}><Trash2/></button></div></article>)}</div></section>)}{!menu?.items.length && <div className="partnerEmpty"><Store/><h3>Your catalogue is empty</h3><p>Create a category, then publish your first product with a clear image.</p></div>}</div>
    </section>{message && !deleting && <div role="status" className="partnerToast">{message}</div>}
    <dialog ref={deleteDialog} className="productDeleteDialog" aria-labelledby="delete-product-title" aria-describedby="delete-product-description" onCancel={event => { if (busy) event.preventDefault(); else setDeleting(null); }}>
      <h2 id="delete-product-title">Delete product?</h2><p id="delete-product-description"><strong>{deleting?.name}</strong> will be removed from your shop. Past orders will not change. This cannot be undone.</p>
      {message && <p role="alert">{message}</p>}
      <div className="productEditorActions"><button autoFocus disabled={busy} onClick={() => setDeleting(null)}>Keep product</button><button className="deleteProduct" disabled={busy} onClick={deleteItem}><Trash2/>{busy ? 'Deleting...' : 'Delete product'}</button></div>
    </dialog>
  </main>;
}
