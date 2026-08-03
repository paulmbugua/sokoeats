import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bike, CheckCircle2, Clock, Headphones, PackageCheck, Store, TicketCheck, Utensils } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import type { DashboardMetric, Order, Ticket, Vendor } from '@sokoeats/shared/types';
import './styles.css';

function App() {
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  useEffect(() => {
    api<{ metrics: DashboardMetric[] }>('/api/admin/overview').then((r) => setMetrics(r.metrics)).catch(() => {});
    api<{ orders: Order[] }>('/api/orders').then((r) => setOrders(r.orders)).catch(() => {});
    api<{ tickets: Ticket[] }>('/api/tickets').then((r) => setTickets(r.tickets)).catch(() => {});
    api<{ vendors: Vendor[] }>('/api/vendors').then((r) => setVendors(r.vendors)).catch(() => {});
  }, []);
  const mode: string = 'vendor';
  const icon = mode === 'vendor' ? <Store /> : mode === 'tickets' ? <TicketCheck /> : mode === 'support' ? <Headphones /> : <Utensils />;
  return <main>
    <aside><div className="brand">{icon}<b>Sokoeats</b></div><button className="active">Dashboard</button><button>Orders</button><button>Tickets</button><button>Vendors</button></aside>
    <section className="page">
      <header><p>Vendor desk</p><h1>Vendor command center</h1></header>
      <div className="metrics">{metrics.map((m) => <article key={m.label}><span>{m.label}</span><strong>{m.value}</strong><em>{m.delta || 'live'}</em></article>)}</div>
      <div className="grid">
        <section><h2><PackageCheck /> Live orders</h2>{orders.slice(0,6).map((o) => <div className="row" key={o.id}><div><b>{o.code}</b><span>{o.customerName} - {o.vendorName}</span></div><span className="pill">{o.status}</span></div>)}</section>
        <section><h2><TicketCheck /> Tickets</h2>{tickets.slice(0,6).map((t) => <div className="row" key={t.id}><div><b>{t.code}</b><span>{t.subject}</span></div><span className="pill">{t.priority}</span></div>)}</section>
        <section><h2><Store /> Vendors</h2>{vendors.slice(0,6).map((v) => <div className="row" key={v.id}><div><b>{v.name}</b><span>{v.cuisine}</span></div><span className="pill">{v.status}</span></div>)}</section>
        <section><h2><Clock /> Shift notes</h2><div className="note"><CheckCircle2 /> Keep menus lean, dispatch fast, and close the loop with customers before refunds escalate.</div><div className="note"><Bike /> Flag courier delays after 12 minutes without pickup.</div></section>
      </div>
    </section>
  </main>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
