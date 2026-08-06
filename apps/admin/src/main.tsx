import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bike, CheckCircle2, Clock, Headphones, PackageCheck, Store, TicketCheck, Utensils } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import type { DashboardMetric, Order, Ticket, Vendor } from '@sokoeats/shared/types';
import './styles.css';

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


function App() {
  const [maps, setMaps] = useState<MapsManifest | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  useEffect(() => {
    api<{ maps: MapsManifest }>('/api/maps/manifest').then((r) => setMaps(r.maps)).catch(() => {});
    api<{ metrics: DashboardMetric[] }>('/api/admin/overview').then((r) => setMetrics(r.metrics)).catch(() => {});
    api<{ orders: Order[] }>('/api/orders').then((r) => setOrders(r.orders)).catch(() => {});
    api<{ tickets: Ticket[] }>('/api/tickets').then((r) => setTickets(r.tickets)).catch(() => {});
    api<{ vendors: Vendor[] }>('/api/vendors').then((r) => setVendors(r.vendors)).catch(() => {});
  }, []);
  const mode: string = 'admin';
  const icon = mode === 'vendor' ? <Store /> : mode === 'tickets' ? <TicketCheck /> : mode === 'support' ? <Headphones /> : <Utensils />;
  return <main>
    <aside><div className="brand">{icon}<b>Sokoeats</b></div><button className="active">Dashboard</button><button>Orders</button><button>Tickets</button><button>Vendors</button></aside>
    <section className="page">
      <header><p>Marketplace admin</p><h1>Marketplace control</h1></header>
      <div className="metrics">{metrics.map((m) => <article key={m.label}><span>{m.label}</span><strong>{m.value}</strong><em>{m.delta || 'live'}</em></article>)}</div>
      <div className="grid">
        <section><h2><PackageCheck /> Live orders</h2>{orders.slice(0,6).map((o) => <div className="row" key={o.id}><div><b>{o.code}</b><span>{o.customerName} - {o.vendorName}</span></div><span className="pill">{o.status}</span></div>)}</section>
        <section><h2><TicketCheck /> Tickets</h2>{tickets.slice(0,6).map((t) => <div className="row" key={t.id}><div><b>{t.code}</b><span>{t.subject}</span></div><span className="pill">{t.priority}</span></div>)}</section>
        <section><h2><Store /> Vendors</h2>{vendors.slice(0,6).map((v) => <div className="row" key={v.id}><div><b>{v.name}</b><span>{v.cuisine}</span></div><span className="pill">{v.status}</span></div>)}</section>
        <section><h2><Clock /> Shift notes</h2><div className="note"><CheckCircle2 /> Keep menus lean, dispatch fast, and close the loop with customers before refunds escalate.</div><div className="note"><Bike /> Flag courier delays after 12 minutes without pickup.</div></section>
        <section><h2><Bike /> Command map</h2><MapPreview title={maps?.admin?.commandCenter?.title || 'Marketplace coverage'} map={maps?.admin?.commandCenter?.map} href={maps?.admin?.commandCenter?.dispatchUrl} meta="Vendors, riders, customer demand, and support incidents" /></section>
      </div>
    </section>
  </main>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
