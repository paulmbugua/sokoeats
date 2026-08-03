import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bike, Clock3, MapPin, Plus, Search, ShoppingBag, Star, TicketPlus, Utensils } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import type { MenuItem, Vendor } from '@sokoeats/shared/types';
import './styles.css';
const money = (v: number) => `KES ${v.toLocaleString('en-KE')}`;
type Line = { item: MenuItem; quantity: number };
function App() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [selected, setSelected] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [notice, setNotice] = useState('');
  useEffect(() => { api<{ vendors: Vendor[] }>('/api/vendors').then((r) => { setVendors(r.vendors); setSelected(r.vendors[0]?.id || ''); }); }, []);
  useEffect(() => { api<{ items: MenuItem[] }>(selected ? `/api/menu?vendorId=${selected}` : '/api/menu').then((r) => setMenu(r.items)); }, [selected]);
  const vendor = vendors.find((v) => v.id === selected);
  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const total = subtotal + (vendor?.deliveryFee || 0) + Math.round(subtotal * 0.04);
  const add = (item: MenuItem) => setCart((lines) => {
    const existing = lines.find((line) => line.item.id === item.id);
    return existing ? lines.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { item, quantity: 1 }];
  });
  const place = async () => {
    if (!vendor || !cart.length) return;
    const { order } = await api<any>('/api/orders', { method: 'POST', body: JSON.stringify({ customerName: 'Sokoeats Guest', customerEmail: 'guest@sokoeats.local', phone: '+254700000000', vendorId: vendor.id, deliveryAddress: 'Westlands, Nairobi', items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })) }) });
    setCart([]); setNotice(`Order ${order.code} placed. Track it from the kitchen rail.`);
  };
  return <main>
    <section className="hero"><nav><b><Utensils /> Sokoeats</b><span><Search size={16}/> Search meals, vendors, tickets</span></nav><div><p>Food delivery for Nairobi teams</p><h1>Fast menus, clean checkout, vendor dashboards.</h1><button onClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })}>Start order</button></div></section>
    <section className="vendors">{vendors.map((v) => <button key={v.id} className={v.id === selected ? 'vendor active' : 'vendor'} onClick={() => setSelected(v.id)}><strong>{v.name}</strong><span>{v.cuisine}</span><em><Star size={14}/> {v.rating} <Clock3 size={14}/> {v.prepMinutes}m</em></button>)}</section>
    <section className="shell" id="menu"><div className="menu">{menu.map((item) => <article key={item.id}><div><small>{item.category}{item.popular ? ' / popular' : ''}</small><h2>{item.name}</h2><p>{item.description}</p><strong>{money(item.price)}</strong></div><button onClick={() => add(item)}><Plus size={18}/> Add</button></article>)}</div><aside><h2><ShoppingBag /> Basket</h2>{cart.length ? cart.map((line) => <div className="cartline" key={line.item.id}><span>{line.quantity}x {line.item.name}</span><b>{money(line.item.price * line.quantity)}</b></div>) : <p className="empty">Pick a meal to build the first Sokoeats order.</p>}<div className="totals"><span>Subtotal</span><b>{money(subtotal)}</b><span>Delivery</span><b>{money(vendor?.deliveryFee || 0)}</b><span>Total</span><b>{money(total)}</b></div><button className="checkout" onClick={place} disabled={!cart.length}>Place order <Bike size={18}/></button><button className="ticket"><TicketPlus size={18}/> Open support ticket</button>{notice && <p className="notice">{notice}</p>}<p className="address"><MapPin size={15}/> Delivery defaults to Westlands for demo checkout.</p></aside></section>
  </main>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
