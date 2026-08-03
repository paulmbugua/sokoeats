import type { MenuItem, Order, Ticket, Vendor } from '../types';
import { api } from './client';
export const listVendors = () => api<{ vendors: Vendor[] }>('/api/vendors');
export const listMenu = (vendorId?: string) => api<{ items: MenuItem[] }>(vendorId ? `/api/menu?vendorId=${vendorId}` : '/api/menu');
export const listOrders = () => api<{ orders: Order[] }>('/api/orders');
export const listTickets = () => api<{ tickets: Ticket[] }>('/api/tickets');
export const createOrder = (body: unknown) => api<{ order: Order }>('/api/orders', { method: 'POST', body: JSON.stringify(body) });
export const createTicket = (body: unknown) => api<{ ticket: Ticket }>('/api/tickets', { method: 'POST', body: JSON.stringify(body) });
