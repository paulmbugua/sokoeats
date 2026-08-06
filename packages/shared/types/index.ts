export type ID = string;
export type UserRole = 'customer' | 'vendor' | 'courier' | 'support' | 'admin';
export type OrderStatus = 'cart' | 'placed' | 'accepted' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled';
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type VendorStatus = 'draft' | 'review' | 'active' | 'paused';
export type User = { id: ID; name: string; email: string; phone?: string; role: UserRole };
export type Vendor = { id: ID; name: string; slug: string; status: VendorStatus; cuisine: string; rating: number; prepMinutes: number; deliveryFee: number; minimumOrder: number; imageUrl?: string };
export type MenuItem = { id: ID; vendorId: ID; name: string; description: string; price: number; category: string; popular?: boolean; available: boolean; imageUrl?: string };
export type CartLine = { menuItemId: ID; quantity: number; notes?: string };
export type Order = { id: ID; code: string; customerName: string; vendorName: string; status: OrderStatus; subtotal: number; deliveryFee: number; total: number; deliveryAddress: string; createdAt: string };
export type Ticket = { id: ID; code: string; subject: string; status: TicketStatus; priority: 'low' | 'normal' | 'high' | 'urgent'; requesterName: string; assignedTeam: string; createdAt: string };
export type DashboardMetric = { label: string; value: string; delta?: string };

export type StitchScreenPayload<T = Record<string, unknown>> = T & { sourceFiles?: string[] };
export type ApiEnvelope<TName extends string, TPayload> = { [K in TName]: TPayload };

export type GeoPoint = { id?: ID; label: string; address?: string; lat: number; lng: number; kind?: string };
export type DeliveryRoute = { id: ID; orderCode?: string; status: string; etaMinutes?: number; distanceKm?: number; pickup: GeoPoint; dropoff: GeoPoint; rider?: GeoPoint; polyline?: GeoPoint[]; navigationUrl?: string };
export type MapViewport = { center: GeoPoint; markers: GeoPoint[]; path?: GeoPoint[]; staticUrlTemplate?: string };
export type MapsManifest = {
  provider: 'google_maps';
  androidPackage: string;
  requiredApis: string[];
  customer: Record<string, unknown>;
  rider: Record<string, unknown>;
  vendor: Record<string, unknown>;
  merchant: Record<string, unknown>;
  support: Record<string, unknown>;
  admin: Record<string, unknown>;
  tickets: Record<string, unknown>;
};