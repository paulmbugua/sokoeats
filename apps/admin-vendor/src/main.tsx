import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bell, Check, Clock, HelpCircle, LayoutDashboard, Menu as MenuIcon, PackageCheck, Plus, Search, Store, Utensils, X } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import './styles.css';

type Metric = { label: string; value: string; delta: string };
type Portal = { vendor: { name: string; shortName: string; status: string; merchantId: string; avatarUrl: string }; merchantAvatarUrl: string; greeting: { title: string; subtitle: string }; metrics: Metric[]; liveOrders: { new: any[]; preparing: any[]; ready: any[] }; performance: { day: string; value: number }[]; stats: Metric[]; bestSellers: any[]; sourceFiles: string[] };
type Menu = { title: string; categories: string[]; items: { id: string; name: string; price: string; badge?: string; stock?: string; available: boolean; imageUrl: string }[]; sourceFiles: string[] };
type Analytics = { title: string; subtitle: string; metrics: any[]; sales: any; customers: any; peakHours: string[]; tip: string; popularItems: any[]; sourceFiles: string[] };
type Inventory = { title: string; alert: { title: string; body: string; items: string[] }; filters: string[]; items: any[]; sourceFiles: string[] };
type OrderHistory = { title: string; subtitle: string; period: string; stats: any[]; filters: string[]; orders: any[]; sourceFiles: string[] };
type ProfileSettings = { name: string; vendorId: string; badges: string[]; acceptingOrders: boolean; business: any; operations: any[]; payout: any; serviceArea: string[]; sourceFiles: string[] };

function App() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [activeCategory, setActiveCategory] = useState('Popular');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderHistory | null>(null);
  const [profileSettings, setProfileSettings] = useState<ProfileSettings | null>(null);
  useEffect(() => {
    api<{ portal: Portal }>('/api/vendor/portal').then((r) => setPortal(r.portal)).catch(() => {});
    api<{ menu: Menu }>('/api/vendor/menu').then((r) => { setMenu(r.menu); setActiveCategory(r.menu.categories[0]); }).catch(() => {});
    api<{ analytics: Analytics }>('/api/vendor/analytics').then((r) => setAnalytics(r.analytics)).catch(() => {});
    api<{ inventory: Inventory }>('/api/vendor/inventory').then((r) => setInventory(r.inventory)).catch(() => {});
    api<{ orderHistory: OrderHistory }>('/api/vendor/orders/history').then((r) => setOrderHistory(r.orderHistory)).catch(() => {});
    api<{ profileSettings: ProfileSettings }>('/api/vendor/profile-settings').then((r) => setProfileSettings(r.profileSettings)).catch(() => {});
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
  if (!portal || !menu || !analytics || !inventory || !orderHistory || !profileSettings) return <div className="empty">Loading Nairobi Grill House...</div>;
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
      <section className="panel" style={{ marginTop: 16 }}><h2><LayoutDashboard /> {analytics.title}</h2><p className="muted">{analytics.subtitle}</p><div className="metrics">{analytics.metrics.map((metric) => <article className="metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><em>{metric.direction === 'down' ? '-' : '+'}{metric.delta}</em><div className="muted">{metric.helper}</div></article>)}</div><div className="grid"><div><h2>{analytics.sales.title}</h2><p className="muted">{analytics.sales.subtitle}</p><div className="chart">{analytics.sales.days.map((day: any) => <div className="barcol" key={day.day + day.value}><i style={{ height: String(day.value) + '%' }} /><span>{day.day}</span></div>)}</div></div><div><h2>Customer Insights</h2><article className="metric"><span>Returning</span><strong>{analytics.customers.returningPercent}%</strong><div className="muted">{analytics.customers.returning}</div><div className="muted">{analytics.customers.newCustomers}</div></article><h2>Peak Hours</h2><div className="tabs">{analytics.peakHours.map((hour) => <span className="tab active" key={hour}>{hour}</span>)}</div><div className="note">{analytics.tip}</div></div></div><h2>Most Popular Items</h2>{analytics.popularItems.map((item) => <div className="seller" key={item.name}><img className="thumb" src={item.imageUrl} /><div><b>{item.name}</b><div className="muted">{item.sales}</div></div></div>)}</section>
      <section className="panel" style={{ marginTop: 16 }}><h2><PackageCheck /> {inventory.title}</h2><div className="alert"><b>{inventory.alert.title}</b><div className="muted">{inventory.alert.body}</div><div className="tabs">{inventory.alert.items.map((item) => <span className="pill red" key={item}>{item}</span>)}</div></div><div className="tabs">{inventory.filters.map((filter, index) => <span className={index === 0 ? 'tab active' : 'tab'} key={filter}>{filter}</span>)}</div>{inventory.items.map((item) => <div className="menu-item" key={item.id}><img className="thumb" src={item.imageUrl} /><div style={{ flex: 1 }}><b>{item.name}</b><div className="muted">{item.category}</div></div><span className={item.status === 'Out of Stock' ? 'pill red' : 'pill green'}>{item.stock} - {item.status}</span><button className="action" onClick={async () => { const nextStock = Number(item.numericStock) + 5; const next = await api<{ inventory: Inventory }>(`/api/vendor/inventory/${item.id}`, { method: 'PATCH', body: JSON.stringify({ numericStock: nextStock, stock: String(nextStock) + ' units' }) }); setInventory(next.inventory); }}>Update Stock</button></div>)}</section>
      <section className="panel" style={{ marginTop: 16 }}><h2><PackageCheck /> {orderHistory.title}</h2><p className="muted">{orderHistory.subtitle}</p><div className="metrics">{orderHistory.stats.map((stat: any) => <article className="metric" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><em>{stat.delta}</em></article>)}</div><div className="tabs">{orderHistory.filters.map((filter: string, index: number) => <span className={index === 0 ? 'tab active' : 'tab'} key={filter}>{filter}</span>)}</div>{orderHistory.orders.map((order: any) => <div className="seller" key={order.code}><img className="thumb" src={order.imageUrl} /><div style={{ flex: 1 }}><b>{order.code}</b><div>{order.customer}</div><div className="muted">{order.meta}</div></div><b>{order.total}</b><button className="action">View Details</button></div>)}</section>
      <section className="panel" style={{ marginTop: 16 }}><h2><Store /> Vendor Profile Settings</h2><div className="seller"><img className="thumb" src={profileSettings.business.images[0]} /><div style={{ flex: 1 }}><b>{profileSettings.name}</b><div className="muted">Vendor ID: {profileSettings.vendorId}</div><div className="tabs">{profileSettings.badges.map((badge: string) => <span className="pill green" key={badge}>{badge}</span>)}</div></div><button className={profileSettings.acceptingOrders ? 'toggle on' : 'toggle'} onClick={async () => { const next = await api<{ profileSettings: ProfileSettings }>('/api/vendor/profile-settings', { method: 'PATCH', body: JSON.stringify({ acceptingOrders: !profileSettings.acceptingOrders }) }); setProfileSettings(next.profileSettings); }}>{profileSettings.acceptingOrders ? 'Accepting Orders' : 'Paused'}</button></div><div className="grid"><article className="metric"><span>Category</span><strong style={{ fontSize: 18 }}>{profileSettings.business.category}</strong><div className="muted">{profileSettings.business.description}</div></article><article className="metric"><span>Payout</span><strong style={{ fontSize: 18 }}>{profileSettings.payout.next}</strong><div className="muted">{profileSettings.payout.method} - {profileSettings.payout.schedule}</div></article></div><h2>Operational Settings</h2>{profileSettings.operations.map((item: any) => <div className="row" key={item.label}><b>{item.label}</b><span className="muted">{item.value}</span></div>)}<h2>Service Area</h2>{profileSettings.serviceArea.map((item: string) => <span className="pill" key={item}>{item}</span>)}</section>
      <div className="source">Built from: {[...portal.sourceFiles, ...menu.sourceFiles, ...analytics.sourceFiles, ...inventory.sourceFiles, ...orderHistory.sourceFiles, ...profileSettings.sourceFiles].join(' | ')}</div>
    </section>
  </main>;
}

function OrderColumn({ title, count, orders, preparing, ready }: { title: string; count: number; orders: any[]; preparing?: boolean; ready?: boolean }) {
  return <div className="column"><div className="column-title">{title}<span className="pill">{count}</span></div>{orders.map((order) => <article className="order-card" key={order.code}><b>{order.code}</b><div>{order.item}</div><div className="muted">{order.customer || order.rider} {order.age || order.eta || order.status}</div>{preparing && <div className="bar"><i style={{ width: `${order.progress}%` }} /></div>}<div className="actions" style={{ marginTop: 10 }}><button className="action">{ready ? <PackageCheck size={15} /> : <Check size={15} />} {ready ? 'Complete Handover' : 'Accept'}</button>{!ready && <button className="action"><X size={15} /></button>}</div></article>)}</div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
