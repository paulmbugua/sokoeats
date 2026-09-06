'use client';
import React, { useEffect, useState } from 'react';
import { MapPin, RefreshCw, Phone, CheckCircle } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import './DeliveryBoard.css';

type Order = { id: string; code: string; vendorName: string; status: string };
type Detail = { id: string; status: string; vendorName: string; recipientName: string; recipientPhone?: string; deliveryAddress: string; notes: string; destination: { latitude: number; longitude: number } | null; rider: { name: string } | null; timeline: { key: string; label: string; at: string | null }[]; items: { name: string; quantity: number }[]; estimate: { minutes: number; overdue: boolean } | null };
export function DeliveryBoard({ partner = false }: { partner?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true, fetching = false;
    const refresh = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const result = await api<{ orders: Order[] }>('/api/deliveries');
        if (active) setOrders(result.orders);
        if (selected) { const result = await api<{ tracking: Detail }>(`/api/deliveries/${selected}`); if (active) setDetail(result.tracking); }
        if (active) setError('');
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to refresh orders'); }
      finally { fetching = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [selected, revision]);
  const update = async (action: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try { await api(`/api/deliveries/${selected}/actions`, { method: 'POST', body: JSON.stringify({ action }) }); setRevision(value => value + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Order update failed'); }
    finally { setBusy(false); }
  };
  return <section className="deliveryBoard">
    <header><h2>{partner ? 'Orders and dispatch' : 'Your deliveries'}</h2><button title="Refresh orders" aria-label="Refresh orders" onClick={() => setRevision(value => value + 1)}><RefreshCw size={18}/></button></header>
    {error && <p role="alert">{error}</p>}
    <div className="deliveryColumns"><div className="deliveryList">{orders.map(order => <button key={order.id} aria-pressed={selected === order.id} onClick={() => { setDetail(null); setSelected(order.id); }}><strong>{order.code}</strong><span>{order.vendorName}</span><small>{order.status.replaceAll('_', ' ')}</small></button>)}{!orders.length && <p>No orders yet.</p>}</div>
    {detail && <div className="deliveryDetail"><h3>{detail.vendorName}</h3><p>{detail.recipientName}: {detail.deliveryAddress}</p><p>{detail.notes}</p>
      {detail.destination && <a href={`https://www.google.com/maps/dir/?api=1&destination=${detail.destination.latitude},${detail.destination.longitude}`} target="_blank" rel="noreferrer"><MapPin size={18}/> Open delivery pin</a>}
      {partner && detail.recipientPhone && <a href={`tel:${detail.recipientPhone}`}><Phone size={18}/> Call recipient</a>}
      {detail.rider && <p>Rider: {detail.rider.name}</p>}
      {detail.estimate && <p>{detail.estimate.overdue ? 'Delivery is taking longer than estimated.' : `Estimated arrival in ${detail.estimate.minutes} min`}</p>}
      <ul>{detail.items.map((item, index) => <li key={index}>{item.quantity} x {item.name}</li>)}</ul>
      <ol>{detail.timeline.map(event => <li key={event.key} data-complete={!!event.at}><CheckCircle size={16}/><span>{event.label}</span><time>{event.at ? new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet recorded'}</time></li>)}</ol>
      {partner && <div className="deliveryActions">{detail.status === 'placed' && <button disabled={busy} onClick={() => void update('accept')}>Accept paid order</button>}{detail.status === 'accepted' && <button disabled={busy} onClick={() => void update('preparing')}>Start preparing</button>}{['accepted','preparing'].includes(detail.status) && <button disabled={busy} onClick={() => void update('ready')}>Ready for pickup</button>}</div>}
    </div>}</div>
  </section>;
}
