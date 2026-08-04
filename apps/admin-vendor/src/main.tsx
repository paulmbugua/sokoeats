import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bell, Check, Clock, HelpCircle, LayoutDashboard, Menu as MenuIcon, PackageCheck, Plus, Search, Store, Utensils, X } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import './styles.css';

type Metric = { label: string; value: string; delta: string };
type Portal = { vendor: { name: string; shortName: string; status: string; merchantId: string; avatarUrl: string }; merchantAvatarUrl: string; greeting: { title: string; subtitle: string }; metrics: Metric[]; liveOrders: { new: any[]; preparing: any[]; ready: any[] }; performance: { day: string; value: number }[]; stats: Metric[]; bestSellers: any[]; sourceFiles: string[] };
type Menu = { title: string; categories: string[]; items: { id: string; name: string; price: string; badge?: string; stock?: string; available: boolean; imageUrl: string }[]; sourceFiles: string[] };

function App() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [activeCategory, setActiveCategory] = useState('Popular');
  useEffect(() => {
    api<{ portal: Portal }>('/api/vendor/portal').then((r) => setPortal(r.portal)).catch(() => {});
    api<{ menu: Menu }>('/api/vendor/menu').then((r) => { setMenu(r.menu); setActiveCategory(r.menu.categories[0]); }).catch(() => {});
  }, []);
  const activeOrders = useMemo(() => portal ? portal.liveOrders.new.length + portal.liveOrders.preparing.length + portal.liveOrders.ready.length : 0, [portal]);
  const toggleItem = async (id: string, available: boolean) => {
    const previous = menu;
    if (menu) setMenu({ ...menu, items: menu.items.map((item) => item.id === id ? { ...item, available } : item) });
    try {
      const next = await api<{ menu: Menu }>(`/api/vendor/menu/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ available }) });
      setMenu(next.menu);
    } catch {
      if (previous) setMenu(previous);
    }
  };
  if (!portal || !menu) return <div className="empty">Loading Nairobi Grill House...</div>;
  return <main className="app">
    <aside className="sidebar">
      <div className="brand"><Store /> <span>Vendor Portal</span></div>
      {['Overview', 'Orders', 'Products', 'Inventory', 'Promotions', 'Payments'].map((item, index) => <button className={index === 0 ? 'nav-btn active' : 'nav-btn'} key={item}><LayoutDashboard size={17} /> {item}</button>)}
      <div className="store-card"><img className="avatar" src={portal.vendor.avatarUrl} /><div><b>{portal.vendor.shortName}</b><div className="muted">{portal.vendor.status}</div></div></div>
    </aside>
    <section className="page">
      <div className="topbar"><input className="search" placeholder="Search orders, products, customers..." /><div className="actions"><button className="action"><Bell size={17} /></button><button className="action"><HelpCircle size={17} /></button><div className="user">{portal.vendor.merchantId}<img className="avatar" src={portal.merchantAvatarUrl} /></div></div></div>
      <div className="hero"><div><p className="eyebrow">Vendor Hub</p><h1>{portal.greeting.title}</h1><p>{portal.greeting.subtitle}</p></div><button className="primary"><Plus size={17} /> Add Item</button></div>
      <div className="metrics">{portal.metrics.map((metric) => <article className="metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><em>{metric.delta}</em></article>)}</div>
      <div className="grid">
        <section className="panel"><h2><PackageCheck /> Live Orders <span className="pill">{activeOrders} active</span></h2><div className="columns">
          <OrderColumn title="New" count={portal.liveOrders.new.length} orders={portal.liveOrders.new} />
          <OrderColumn title="Preparing" count={portal.liveOrders.preparing.length} orders={portal.liveOrders.preparing} preparing />
          <OrderColumn title="Ready" count={portal.liveOrders.ready.length} orders={portal.liveOrders.ready} ready />
        </div></section>
        <section className="panel"><h2><Clock /> Performance</h2><div className="chart">{portal.performance.map((day) => <div className="barcol" key={day.day}><i style={{ height: `${day.value}%` }} /><span>{day.day}</span></div>)}</div><div className="kpi-row">{portal.stats.map((s) => <article className="metric" key={s.label}><span>{s.label}</span><strong>{s.value}</strong></article>)}</div></section>
      </div>
      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel"><h2><MenuIcon /> Menu Management</h2><div className="tabs">{menu.categories.map((cat) => <button className={cat === activeCategory ? 'tab active' : 'tab'} onClick={() => setActiveCategory(cat)} key={cat}>{cat}</button>)}</div>{menu.items.map((item) => <div className="menu-item" key={item.id}><img className="thumb" src={item.imageUrl} /><div style={{ flex: 1 }}><b>{item.name}</b><div className="muted">{item.price}</div><div className="actions">{item.badge && <span className="pill">{item.badge}</span>}{item.stock && <span className="pill red">{item.stock}</span>}</div></div><button className={item.available ? 'toggle on' : 'toggle'} onClick={() => toggleItem(item.id, !item.available)}>{item.available ? 'Available' : 'Paused'}</button></div>)}</section>
        <section className="panel"><h2><Utensils /> Best Sellers</h2>{portal.bestSellers.map((item) => <div className="seller" key={item.name}><img className="thumb" src={item.imageUrl} /><div style={{ flex: 1 }}><b>{item.name}</b><div className="muted">{item.meta}</div></div><div><b>{item.price}</b><span className="pill green">{item.trend}</span></div></div>)}</section>
      </div>
      <div className="source">Built from: {[...portal.sourceFiles, ...menu.sourceFiles].join(' | ')}</div>
    </section>
  </main>;
}

function OrderColumn({ title, count, orders, preparing, ready }: { title: string; count: number; orders: any[]; preparing?: boolean; ready?: boolean }) {
  return <div className="column"><div className="column-title">{title}<span className="pill">{count}</span></div>{orders.map((order) => <article className="order-card" key={order.code}><b>{order.code}</b><div>{order.item}</div><div className="muted">{order.customer || order.rider} {order.age || order.eta || order.status}</div>{preparing && <div className="bar"><i style={{ width: `${order.progress}%` }} /></div>}<div className="actions" style={{ marginTop: 10 }}><button className="action">{ready ? <PackageCheck size={15} /> : <Check size={15} />} {ready ? 'Complete Handover' : 'Accept'}</button>{!ready && <button className="action"><X size={15} /></button>}</div></article>)}</div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
