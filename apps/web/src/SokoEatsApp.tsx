'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { DeliveryBoard } from './DeliveryBoard';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  LogIn,
  MapPin,
  Menu,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Star,
  Store,
  Trash2,
  UserRound,
  Utensils,
  X,
} from 'lucide-react';
import {
  API_BASE,
  api,
  clearAuthSession,
  readAuthSession,
  saveAuthSession,
} from '@sokoeats/shared/api';
import type { MenuItem, Vendor } from '@sokoeats/shared/types';
import { PartnerPortal } from './PartnerPortal';
import { PartnerTerms, type TermsConsent } from './PartnerTerms';
import { CustomerCareChat } from './CustomerCareChat';

type Session = ReturnType<typeof readAuthSession>;
type Line = { item: MenuItem; quantity: number };
type LiveVendor = Vendor & {
  category?: string;
  tagline?: string;
  address?: string;
  sections?: Array<{ title: string }>;
  deliveryAvailable?: boolean;
  deliveryAvailabilityMessage?: string | null;
};
type Payment = {
  reference: string;
  method: 'mpesa' | 'card' | 'paystack';
  status: string;
  actionUrl?: string;
  providerMessage?: string;
  promptMessage?: string;
};
type PricingQuote = {
  id: string;
  subtotal: number;
  taxableSubtotal: number;
  vatRateBps: number;
  smallOrderFee: number;
  minimumOrder: number;
  amountToMinimum: number;
  deliveryFee: number;
  deliveryBreakdown: { baseFee?: number; minimumFee?: number; distanceFee?: number; timeFee?: number };
  serviceFee: number;
  waivedServiceFee: number;
  firstOrderOffer: boolean;
  surgeFee: number;
  vatAmount: number;
  discountAmount: number;
  total: number;
  distanceKm: number;
  durationMin: number;
};
type Page = 'landing' | 'browse' | 'profile';
type AuthRole = 'customer' | 'rider' | 'vendor' | 'merchant';
const partnerRoleDetails = {
  vendor: {
    title: 'Vendor - Sell from your shop',
    description: 'Choose Vendor if you own or operate one shop. Add products, set prices, receive orders and prepare them for delivery.',
  },
  merchant: {
    title: 'Merchant - Manage the business',
    description: 'Choose Merchant if you manage a registered business, brand or several shops. Manage business details, staff, payments and shop performance.',
  },
} as const;

const CART_KEY = 'sokoeats.web.basket.v2';
const PAYMENT_KEY = 'sokoeats.web.payment.v2';
const APP_URL =
  process.env.NEXT_PUBLIC_ANDROID_APP_URL ||
  'https://play.google.com/store/apps/details?id=com.paulmbugua2.sokoeats';
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1800&q=88';
const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;
const MINIMUM_ORDER = 300;
const SMALL_ORDER_FEE = 50;
const categories = ['All', 'Restaurants', 'Groceries', 'Pharmacy', 'Gas', 'Electronics'];

function readBasket(): { vendorId: string; lines: Line[] } {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '{"vendorId":"","lines":[]}');
  } catch {
    return { vendorId: '', lines: [] };
  }
}

export default function SokoEatsApp() {
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState<Page>('landing');
  const [mobileNav, setMobileNav] = useState(false);
  const [vendors, setVendors] = useState<LiveVendor[]>([]);
  const [selected, setSelected] = useState('');
  const [category, setCategory] = useState('All');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Line[]>([]);
  const [query, setQuery] = useState('');
  const [session, setSession] = useState<Session>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [termsAcceptance, setTermsAcceptance] = useState<TermsConsent | null>(null);
  const [authRole, setAuthRole] = useState<AuthRole>('customer');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod] = useState<'paystack'>('paystack');
  const [pendingPayment, setPendingPayment] = useState<Payment | null>(null);
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [focused, setFocused] = useState<MenuItem | null>(null);
  const [similar, setSimilar] = useState<MenuItem[]>([]);
  const [deliveryPin, setDeliveryPin] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ confirmation: '', password: '', reason: '' });
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    city: 'Nairobi',
    defaultAddress: '',
    vehicleType: 'Motorbike',
    registrationNumber: '',
    payoutPhone: '',
    businessName: '',
    businessCategory: 'Restaurant',
    storeAddress: '',
    businessRegistrationNumber: '',
    kraPin: '',
    directorName: '',
    directorNationalId: '',
    settlementMethod: 'mpesa_wallet',
    settlementAccount: '',
    pspSubaccountId: '',
    commissionAccepted: false,
  });
  const focusAuthField = (key: string, message: string) => {
    setAuthBusy(false);
    setAuthError(message);
    requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(`[data-auth-field="${key}"]`);
      container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const control = container?.matches('input, textarea, select')
        ? container
        : container?.querySelector<HTMLElement>('input, textarea, select, button');
      window.setTimeout(() => control?.focus(), 260);
    });
    return false;
  };

  useEffect(() => {
    const handleExpiredSession = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      setSession(null);
      setAuthMode('login');
      setAuthError(message || 'Your session has expired. Please sign in again.');
      setAuthOpen(true);
    };
    window.addEventListener('sokoeats:session-expired', handleExpiredSession);
    return () => window.removeEventListener('sokoeats:session-expired', handleExpiredSession);
  }, []);

  useEffect(() => {
    const saved = readBasket();
    setSelected(saved.vendorId);
    setCart(saved.lines || []);
    const storedSession = readAuthSession();
    setSession(storedSession);
    if (storedSession) void api<{ user: NonNullable<Session>['user'] }>('/api/auth/me').then(({ user }) => {
      if (readAuthSession()?.token !== storedSession.token) return;
      const refreshed = { ...storedSession, user }; saveAuthSession(refreshed); setSession(refreshed);
    }).catch(() => {});
    try {
      setPendingPayment(JSON.parse(localStorage.getItem(PAYMENT_KEY) || 'null'));
    } catch {
      setPendingPayment(null);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    const loadVendors = (path: string) => api<{ vendors: LiveVendor[]; coverage?: { serviceable: boolean; message?: string } | null }>(path)
      .then(({ vendors: next }) => {
        setVendors(next);
        setSelected((current) =>
          current && next.some((vendor) => vendor.id === current) ? current : next[0]?.id || ''
        );
      })
      .catch((error) => setStatus(error.message));
    if (!navigator.geolocation) { void loadVendors('/api/vendors'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => void loadVendors(`/api/vendors?latitude=${encodeURIComponent(coords.latitude)}&longitude=${encodeURIComponent(coords.longitude)}`),
      () => void loadVendors('/api/vendors'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (!selected) return;
    api<{ items: MenuItem[] }>(`/api/menu?vendorId=${encodeURIComponent(selected)}`)
      .then(({ items }) => setMenu(items))
      .catch((error) => setStatus(error.message));
  }, [selected]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(CART_KEY, JSON.stringify({ vendorId: selected, lines: cart }));
  }, [hydrated, selected, cart]);
  useEffect(() => {
    if (!hydrated) return;
    if (pendingPayment) localStorage.setItem(PAYMENT_KEY, JSON.stringify(pendingPayment));
    else localStorage.removeItem(PAYMENT_KEY);
  }, [hydrated, pendingPayment]);

  useEffect(() => {
    if (!session?.user) return;
    setForm((current) => ({
      ...current,
      fullName: session.user.name || current.fullName,
      email: session.user.email || current.email,
      phone: session.user.phone || current.phone,
      city: session.user.city || current.city,
      defaultAddress:
        session.user.defaultAddress ||
        String(session.user.profile?.defaultAddress || current.defaultAddress),
      vehicleType: String(session.user.profile?.vehicleType || current.vehicleType),
      registrationNumber: String(
        session.user.profile?.registrationNumber || current.registrationNumber
      ),
      payoutPhone: String(session.user.profile?.payoutPhone || current.payoutPhone),
    }));
  }, [session?.user.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('auth_code');
    const error = params.get('auth_error');
    // OAuth handoff codes are single-use. Remove them synchronously so React
    // Strict Mode cannot replay the exchange while checking this effect.
    if (code || error) window.history.replaceState({}, '', window.location.pathname);
    if (error) {
      setAuthError(error);
      setAuthOpen(true);
    }
    if (!code) return;
    api<NonNullable<Session>>('/api/auth/google/web/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
      .then((next) => {
        saveAuthSession(next);
        setSession(next);
        setPage(
          next.user.profileComplete === false || next.user.role === 'rider' ? 'profile' : 'browse'
        );
        if (cart.length && next.user.role === 'customer' && next.user.profileComplete !== false)
          setCheckoutOpen(true);
      })
      .catch((nextError) => {
        setAuthError(nextError.message);
        setAuthOpen(true);
      });
  }, []);

  const vendor = vendors.find((entry) => entry.id === selected);
  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const basketCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const previewDeliveryFee = Math.max(150, Number(vendor?.deliveryFee || 0));
  const previewServiceFee = Math.round(subtotal * 0.04);
  const previewVat = cart.reduce((sum, line) => sum + Number(line.item.vatAmount || 0) * line.quantity, 0);
  const previewSmallOrderFee = subtotal > 0 && subtotal < MINIMUM_ORDER ? SMALL_ORDER_FEE : 0;
  const previewAmountToMinimum = Math.max(0, MINIMUM_ORDER - subtotal);
  const previewTotal = subtotal + previewSmallOrderFee + previewDeliveryFee + previewServiceFee + previewVat;
  const filteredVendors = vendors.filter(
    (entry) => category === 'All' || entry.category?.toLowerCase() === category.toLowerCase()
  );
  const visibleMenu = menu.filter((item) =>
    `${item.name} ${item.description || ''} ${item.category}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const openBrowse = (vendorId?: string) => {
    if (vendorId) chooseVendor(vendorId);
    setPage('browse');
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const chooseVendor = (id: string) => {
    if (id === selected) return;
    if (
      cart.length &&
      !window.confirm(
        'Starting a basket from another shop will clear your current basket. Continue?'
      )
    )
      return;
    setCart([]);
    setFocused(null);
    setSimilar([]);
    setSelected(id);
    setQuote(null);
    setPendingPayment(null);
  };
  const add = (item: MenuItem) =>
    setCart((lines) => {
      const current = lines.find((line) => line.item.id === item.id);
      return current
        ? lines.map((line) =>
            line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line
          )
        : [...lines, { item, quantity: 1 }];
    });
  const change = (id: string, delta: number) => {
    setQuote(null);
    setPendingPayment(null);
    setCart((lines) =>
      lines
        .map((line) => (line.item.id === id ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    );
  };
  const inspectItem = (item: MenuItem) => {
    setFocused(item);
    api<{ similar: MenuItem[] }>(`/api/menu/${item.id}/similar`)
      .then((result) => setSimilar(result.similar))
      .catch(() => setSimilar([]));
  };
  const useCurrentDeliveryLocation = () => {
    if (!navigator.geolocation) {
      setStatus('Current location is not available in this browser. Enter an estate, road and town.');
      return;
    }
    setStatus('Finding your current delivery location...');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        console.info('[SokoEats][Web][Location] current-location-captured', { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
        setDeliveryPin({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
        setQuote(null);
        setPendingPayment(null);
        setStatus(`Delivery pin captured${coords.accuracy ? ` within about ${Math.round(coords.accuracy)}m` : ''}. Recalculating your route...`);
      },
      () => setStatus('Current location permission was denied or unavailable. Enter an estate, road and town.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };
  const beginCheckout = () => {
    if (!cart.length) return;
    if (!session) {
      setAuthMode('login');
      setAuthOpen(true);
      return;
    }
    if (session.user.role !== 'customer') {
      setStatus('Use a buyer account to place an order.');
      return;
    }
    setCheckoutOpen(true);
    setPendingPayment(null);
    setQuote(null);
    setCheckoutBusy(true);
    setStatus('Calculating VAT and your traffic-aware delivery route...');
    void createQuote()
      .then((nextQuote) => {
        setStatus(nextQuote.smallOrderFee
          ? `Add ${money(nextQuote.amountToMinimum)} more to reach the ${money(nextQuote.minimumOrder)} basket minimum and remove the ${money(nextQuote.smallOrderFee)} small-order fee.`
          : `Route confirmed: ${nextQuote.distanceKm.toFixed(1)} km, about ${nextQuote.durationMin} min.`);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Could not calculate checkout pricing.'))
      .finally(() => setCheckoutBusy(false));
  };
  const submitAuth = async () => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const isPartner = authRole === 'vendor' || authRole === 'merchant';
      if (authMode === 'register' && !form.fullName.trim()) return void focusAuthField('fullName', 'Full name is required.');
      if (!form.email.trim()) return void focusAuthField('email', 'Email address is required.');
      if (!form.password) return void focusAuthField('password', 'Password is required.');
      if (authMode === 'register' && form.password.length < 8) return void focusAuthField('password', 'Use a password of at least 8 characters.');
      if (authMode === 'register' && !form.confirmPassword) return void focusAuthField('confirmPassword', 'Confirm your password.');
      if (authMode === 'register' && form.password !== form.confirmPassword) return void focusAuthField('confirmPassword', 'The passwords do not match.');
      if (authMode === 'register' && !form.phone.trim()) return void focusAuthField('phone', 'Mobile number is required.');
      if (authMode === 'register' && !form.city.trim()) return void focusAuthField('city', 'City is required.');
      if (authMode === 'register' && authRole === 'customer' && !form.defaultAddress.trim()) return void focusAuthField('defaultAddress', 'Delivery address is required.');
      if (authMode === 'register' && authRole === 'rider' && !form.vehicleType.trim()) return void focusAuthField('vehicleType', 'Vehicle type is required.');
      if (authMode === 'register' && authRole === 'rider' && !form.registrationNumber.trim()) return void focusAuthField('registrationNumber', 'Registration number is required.');
      if (authMode === 'register' && authRole === 'rider' && !form.payoutPhone.trim()) return void focusAuthField('payoutPhone', 'Payout M-Pesa number is required.');
      if (authMode === 'register' && isPartner && !form.businessName.trim()) return void focusAuthField('businessName', 'Legal business name is required.');
      if (authMode === 'register' && isPartner && !form.businessCategory.trim()) return void focusAuthField('businessCategory', 'Business category is required.');
      if (authMode === 'register' && isPartner && !form.storeAddress.trim()) return void focusAuthField('storeAddress', 'Store address is required.');
      if (authMode === 'register' && isPartner && !form.businessRegistrationNumber.trim()) return void focusAuthField('businessRegistrationNumber', 'Business registration number is required.');
      if (authMode === 'register' && isPartner && !form.kraPin.trim()) return void focusAuthField('kraPin', 'KRA PIN is required.');
      if (authMode === 'register' && isPartner && !form.directorName.trim()) return void focusAuthField('directorName', 'Director or proprietor name is required.');
      if (authMode === 'register' && isPartner && !form.directorNationalId.trim()) return void focusAuthField('directorNationalId', 'Director national ID is required.');
      if (authMode === 'register' && isPartner && !form.settlementAccount.trim()) return void focusAuthField('settlementAccount', 'Settlement account is required.');
      if (authMode === 'register' && isPartner && !form.commissionAccepted) return void focusAuthField('commissionAgreement', 'Accept the marketplace commission agreement to continue.');
      if (authMode === 'register' && authRole !== 'customer' && termsAcceptance?.role !== authRole) return void focusAuthField('termsAcceptance', 'Read and accept the terms of service to continue.');
      const body =
        authMode === 'login'
          ? { role: authRole, email: form.email, password: form.password }
          : {
              role: authRole,
              termsAcceptance: termsAcceptance || undefined,
              fullName: form.fullName,
              email: form.email,
              password: form.password,
              phone: form.phone,
              city: form.city,
              defaultAddress: authRole === 'customer' ? form.defaultAddress : undefined,
              vehicleType: authRole === 'rider' ? form.vehicleType : undefined,
              registrationNumber: authRole === 'rider' ? form.registrationNumber : undefined,
              payoutPhone:
                authRole === 'rider'
                  ? form.payoutPhone
                  : isPartner
                    ? form.settlementAccount
                    : undefined,
              businessName: isPartner ? form.businessName : undefined,
              businessCategory: isPartner ? form.businessCategory : undefined,
              storeAddress: isPartner ? form.storeAddress : undefined,
              marketingOptIn: false,
            };
      const next = await api<NonNullable<Session>>(
        authMode === 'login' ? '/api/auth/login' : '/api/auth/register',
        { method: 'POST', body: JSON.stringify(body) }
      );
      saveAuthSession(next);
      setSession(next);
      if (authMode === 'register' && isPartner) {
        await api('/api/vendor/compliance', {
          method: 'PUT',
          body: JSON.stringify({
            legalBusinessName: form.businessName,
            registrationNumber: form.businessRegistrationNumber,
            kraPin: form.kraPin.toUpperCase(),
            directorName: form.directorName,
            directorNationalId: form.directorNationalId,
            settlementMethod: form.settlementMethod,
            settlementAccount: form.settlementAccount,
            pspSubaccountId: form.pspSubaccountId || undefined,
            commissionRateBps: 1000,
            commissionAgreementVersion: 'marketplace-v1',
            commissionAccepted: true,
          }),
        });
      }
      if (authMode === 'register' && authRole === 'rider' && form.payoutPhone) {
        await api('/api/rider/payout-profile', {
          method: 'PUT',
          body: JSON.stringify({
            method: 'mpesa_wallet',
            accountNumber: form.payoutPhone,
            schedule: 'daily',
          }),
        });
      }
      setSession(next);
      setAuthOpen(false);
      setPage(
        isPartner || authRole === 'rider' || next.user.profileComplete === false
          ? 'profile'
          : 'browse'
      );
      if (cart.length && authRole === 'customer' && next.user.profileComplete !== false)
        setCheckoutOpen(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in');
    } finally {
      setAuthBusy(false);
    }
  };
  const continueGoogle = () => {
    if (authRole !== 'customer' && authRole !== 'rider') {
      setAuthError('Google sign-in is available for buyers and riders only.');
      return;
    }
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    window.location.assign(
      `${API_BASE}/api/auth/google/web/start?returnTo=${encodeURIComponent(returnTo)}&role=${authRole}`
    );
  };
  const saveProfile = async () => {
    if (!session) return;
    if (!form.phone.trim() || !form.city.trim()) throw new Error('Mobile number and city are required.');
    if (session.user.role === 'customer' && !form.defaultAddress.trim()) throw new Error('Add a delivery address.');
    if (session.user.role === 'rider' && (!form.vehicleType.trim() || !form.registrationNumber.trim() || !form.payoutPhone.trim())) throw new Error('Vehicle, registration, and payout details are required.');
    const result = await api<{ user: NonNullable<Session>['user'] }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        name: form.fullName,
        termsAcceptance: termsAcceptance || undefined,
        phone: form.phone,
        city: form.city,
        defaultAddress: session?.user.role === 'customer' ? form.defaultAddress : undefined,
        vehicleType: session?.user.role === 'rider' ? form.vehicleType : undefined,
        registrationNumber: session?.user.role === 'rider' ? form.registrationNumber : undefined,
        payoutPhone: session?.user.role === 'rider' ? form.payoutPhone : undefined,
      }),
    });
    if (session.user.role === 'rider') {
      await api('/api/rider/payout-profile', { method: 'PUT', body: JSON.stringify({ method: 'mpesa_wallet', accountNumber: form.payoutPhone, schedule: 'daily' }) });
    }
    const next = { ...session, user: result.user };
    saveAuthSession(next);
    setSession(next);
    setStatus('Profile saved.');
  };
  const createQuote = async () => {
    if (!vendor || !session) throw new Error('Choose a shop and sign in before checkout.');
    if (!form.phone.trim())
      throw new Error('Add a mobile number before payment.');
    if (!deliveryPin && !form.defaultAddress.trim())
      throw new Error('Use current location or enter an estate, road and town before payment.');
    await saveProfile();
    const result = await api<{ quote: PricingQuote }>('/api/orders/quote', {
      method: 'POST',
      body: JSON.stringify({
        vendorId: vendor.id,
        deliveryAddress: form.defaultAddress.trim() || 'Current location',
        city: form.city,
        ...(deliveryPin ? { latitude: deliveryPin.latitude, longitude: deliveryPin.longitude } : {}),
        items: cart.map((line) => ({
          menuItemId: line.item.id,
          quantity: line.quantity,
          notes: null,
        })),
      }),
    });
    console.info('[SokoEats][Web][Location] quote-request', { hasDeliveryPin: Boolean(deliveryPin), latitude: deliveryPin?.latitude ?? null, longitude: deliveryPin?.longitude ?? null, address: form.defaultAddress.trim() || 'Current location' });
    setQuote(result.quote);
    return result.quote;
  };

  useEffect(() => {
    if (!checkoutOpen || !deliveryPin || !session || !cart.length) return;
    let active = true;
    setCheckoutBusy(true);
    setStatus('Delivery pin captured. Calculating your route and delivery price...');
    void createQuote().then((nextQuote) => {
      if (!active) return;
      setStatus(nextQuote.smallOrderFee ? `Route confirmed. Add ${money(nextQuote.amountToMinimum)} more to remove the ${money(nextQuote.smallOrderFee)} small-order fee.` : `Route confirmed: ${nextQuote.distanceKm.toFixed(1)} km, about ${nextQuote.durationMin} min.`);
    }).catch((error) => {
      if (active) setStatus(error instanceof Error ? error.message : 'Could not calculate checkout pricing.');
    }).finally(() => { if (active) setCheckoutBusy(false); });
    return () => { active = false; };
  }, [checkoutOpen, deliveryPin, session?.user.id, cart.length]);

  const startPayment = async () => {
    if (!session?.user || !vendor) return;
    setCheckoutBusy(true);
    setStatus('Calculating your live delivery route...');
    try {
      const currentQuote = quote || (await createQuote());
      const result = await api<{ payment: Payment }>('/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({
          pricingQuoteId: currentQuote.id,
          method: paymentMethod,
          amount: currentQuote.total,
          currency: 'KES',
          phone: form.phone,
          email: session.user.email,
          customerName: session.user.name,
        }),
      });
      setPendingPayment(result.payment);
      setStatus(
        result.payment.providerMessage || result.payment.promptMessage || 'Payment started.'
      );
      if (result.payment.actionUrl)
        window.location.assign(result.payment.actionUrl);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Payment could not be started.');
    } finally {
      setCheckoutBusy(false);
    }
  };
  const confirmAndOrder = async () => {
    if (!pendingPayment || !vendor || !quote) return;
    setCheckoutBusy(true);
    try {
      const confirmed = await api<{ payment: Payment }>(
        `/api/payments/${pendingPayment.reference}/confirm`,
        { method: 'POST' }
      );
      if (confirmed.payment.status !== 'paid') {
        setStatus(
          confirmed.payment.providerMessage ||
            'Payment is still pending. Complete the M-Pesa or card prompt first.'
        );
        return;
      }
      const result = await api<{ order: { code: string } }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          phone: form.phone,
          vendorId: vendor.id,
          deliveryAddress: form.defaultAddress,
          paymentMethod,
          paymentReference: pendingPayment.reference,
          pricingQuoteId: quote.id,
          items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
        }),
      });
      setCart([]);
      setQuote(null);
      setPendingPayment(null);
      setCheckoutOpen(false);
      setStatus(`Order ${result.order.code} was placed successfully.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Order could not be completed.');
    } finally {
      setCheckoutBusy(false);
    }
  };
  const signOut = () => {
    clearAuthSession();
    setSession(null);
    setPendingPayment(null);
    setQuote(null);
    setPage('landing');
  };
  const deleteAccount = async () => {
    setAuthBusy(true);
    setAuthError('');
    try {
      await api('/api/auth/account', { method: 'DELETE', body: JSON.stringify(deleteForm) });
      clearAuthSession();
      localStorage.removeItem(PAYMENT_KEY);
      setSession(null);
      setPendingPayment(null);
      setQuote(null);
      setDeleteOpen(false);
      setPage('landing');
      setStatus('Your account and personal profile were deleted.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Account could not be deleted.');
    } finally {
      setAuthBusy(false);
    }
  };

  const Header = () => (
    <header className="siteHeader">
      <button className="brand" onClick={() => setPage('landing')}>
        <span className="brandMark">
          <Utensils size={21} />
        </span>
        SokoEats
      </button>
      <button
        className="mobileMenu"
        aria-label="Open navigation"
        onClick={() => setMobileNav(!mobileNav)}
      >
        {mobileNav ? <X /> : <Menu />}
      </button>
      <nav className={mobileNav ? 'navOpen' : ''}>
        <button onClick={() => openBrowse()}>Browse shops</button>
        <button
          onClick={() => {
            setPage('landing');
            setTimeout(
              () => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }),
              0
            );
          }}
        >
          How it works
        </button>
        <a href="mailto:support@sokoeats.co.ke">Help</a>
        {session ? (
          <button
            onClick={() => {
              setPage('profile');
              setMobileNav(false);
            }}
          >
            <UserRound size={17} /> {session.user.name}
          </button>
        ) : (
          <button
            onClick={() => {
              setAuthMode('login');
              setAuthOpen(true);
            }}
          >
            <LogIn size={17} /> Log in
          </button>
        )}
        <button
          className="navBasket"
          onClick={() => {
            openBrowse();
            setTimeout(beginCheckout, 0);
          }}
        >
          <ShoppingBag size={17} /> {basketCount}
        </button>
      </nav>
    </header>
  );

  const Footer = () => (
    <footer className="siteFooter">
      <div>
        <button className="footerBrand" onClick={() => setPage('landing')}>
          <Utensils /> SokoEats
        </button>
        <p>
          Everyday essentials from trusted Kenyan businesses, delivered with accountable local
          riders.
        </p>
      </div>
      <div>
        <h3>Order</h3>
        <button onClick={() => openBrowse()}>Browse shops</button>
        <a href={APP_URL}>Get the app</a>
        <a href="mailto:support@sokoeats.co.ke">Help centre</a>
      </div>
      <div>
        <h3>Partners</h3>
        <button
          onClick={() => {
            setAuthRole('vendor');
            setAuthMode('login');
            setAuthOpen(true);
          }}
        >
          Partner sign in
        </button>
        <button
          onClick={() => {
            setAuthRole('vendor');
            setAuthMode('register');
            setAuthOpen(true);
          }}
        >
          List your shop
        </button>
        <button
          onClick={() => {
            setAuthRole('rider');
            setAuthMode('register');
            setAuthOpen(true);
          }}
        >
          Become a rider
        </button>
      </div>
      <div>
        <h3>Legal</h3>
        <button onClick={() => setLegal('terms')}>Terms of service</button>
        <a href="/privacy-policy">Privacy policy</a>
        <a href="mailto:privacy@sokoeats.co.ke">Privacy requests</a>
      </div>
      <small>© {new Date().getFullYear()} SokoEats Kenya. All rights reserved.</small>
    </footer>
  );

  if (session && (session.user.role === 'vendor' || session.user.role === 'merchant'))
    return <><CustomerCareChat user={session.user}/><section className="profilePage"><PartnerTerms role={session.user.role} value={termsAcceptance} onChange={setTermsAcceptance} accepted={session.user.termsAccepted} />{!session.user.termsAccepted && <button className="primary" disabled={!termsAcceptance || authBusy} onClick={async () => {
      setAuthBusy(true);
      try {
        const result = await api<{ user: NonNullable<Session>['user'] }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ termsAcceptance }) });
        const next = { ...session, user: result.user }; saveAuthSession(next); setSession(next);
      } catch (error) { setStatus(error instanceof Error ? error.message : 'Acceptance could not be saved.'); }
      finally { setAuthBusy(false); }
    }}>Accept and continue</button>}{status && <p role="status">{status}</p>}</section>{session.user.termsAccepted && <PartnerPortal session={session} onSignOut={signOut} />}{!session.user.termsAccepted && <button onClick={signOut}>Sign out</button>}</>;

  return (
    <main>
      <Header />
      {page === 'landing' && (
        <>
          <section
            className="hero"
            style={{
              backgroundImage: `linear-gradient(90deg, rgba(8,26,18,.9), rgba(8,26,18,.34)), url(${HERO_IMAGE})`,
            }}
          >
            <div className="heroCopy">
              <span>Made for Kenya</span>
              <h1>SokoEats</h1>
              <p>
                Food, groceries, pharmacy, gas and electronics from shops you know. One basket, live
                delivery pricing and secure checkout.
              </p>
              <div className="heroActions">
                <button onClick={() => openBrowse()}>
                  <ShoppingBag /> Start an order
                </button>
                <a href={APP_URL}>
                  <Download /> Get app
                </a>
                <button
                  className="secondary"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthOpen(true);
                  }}
                >
                  Create account
                </button>
              </div>
            </div>
          </section>
          <section className="categoryStrip">
            {categories.slice(1).map((entry) => (
              <button
                key={entry}
                onClick={() => {
                  setCategory(entry);
                  openBrowse();
                }}
              >
                <Store />
                <span>{entry}</span>
              </button>
            ))}
          </section>
          <section id="how" className="contentBand">
            <div className="sectionHeading">
              <span>A simpler local marketplace</span>
              <h2>From nearby shelf to your door</h2>
            </div>
            <div className="steps">
              <article>
                <Search />
                <b>Choose locally</b>
                <p>Compare verified shops and clear product details.</p>
              </article>
              <article>
                <LockKeyhole />
                <b>Pay securely</b>
                <p>M-Pesa or card payment is confirmed before ordering.</p>
              </article>
              <article>
                <MapPin />
                <b>Follow delivery</b>
                <p>Distance-aware pricing and accountable order updates.</p>
              </article>
            </div>
          </section>
          <section className="featuredBand">
            <div className="sectionHeading">
              <span>Popular now</span>
              <h2>Shops ready to deliver</h2>
            </div>
            <div className="landingVendors">
              {vendors.slice(0, 4).map((entry) => (
                <button key={entry.id} onClick={() => openBrowse(entry.id)}>
                  {entry.imageUrl ? (
                    <img src={entry.imageUrl} alt="" />
                  ) : (
                    <div className="vendorImageFallback">
                      <Store />
                    </div>
                  )}
                  <div>
                    <b>{entry.name}</b>
                    <span>{entry.tagline || entry.cuisine}</span>
                    <small>
                      <Star size={14} /> {entry.rating} · {entry.prepMinutes} min
                    </small>
                    {entry.acceptingOrders === false && <small>Shop paused · browse only</small>}
                  </div>
                  <ChevronRight />
                </button>
              ))}
            </div>
          </section>
          <section className="appBand">
            <div>
              <Smartphone />
              <span>Order wherever the day takes you</span>
              <h2>SokoEats in your pocket</h2>
              <p>
                Save addresses, receive order updates and manage your deliveries from the Android
                app.
              </p>
              <a href={APP_URL}>
                <Download /> Get the app
              </a>
            </div>
          </section>
          <Footer />
        </>
      )}

      {page === 'browse' && (
        <>
          <section className="browseHead">
            <div>
              <span>Delivery marketplace</span>
              <h1>What do you need today?</h1>
              <p>Browse freely. We only ask you to sign in when you check out.</p>
            </div>
            <label>
              <Search />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this shop"
              />
            </label>
          </section>
          <section className="filterBar">
            {categories.map((entry) => (
              <button
                className={category === entry ? 'active' : ''}
                key={entry}
                onClick={() => setCategory(entry)}
              >
                {entry}
              </button>
            ))}
          </section>
          <section className="vendors">
            {filteredVendors.map((entry) => (
              <button
                key={entry.id}
                className={entry.id === selected ? 'vendor active' : 'vendor'}
                onClick={() => chooseVendor(entry.id)}
              >
                {entry.imageUrl ? (
                  <img src={entry.imageUrl} alt="" />
                ) : (
                  <div className="vendorImageFallback">
                    <Store />
                  </div>
                )}
                <strong>{entry.name}</strong>
                <span>{entry.tagline || entry.cuisine}</span>
                <em>
                  <Star size={14} /> {entry.rating} <Clock3 size={14} /> {entry.prepMinutes}m
                </em>
                {entry.deliveryAvailable === false && <small>Browse only</small>}
                {entry.acceptingOrders === false && <small>Shop paused</small>}
              </button>
            ))}
          </section>
          <section className="shopHeading">
            {vendor && (
              <>
                <div>
                  <small>
                    <Store size={15} /> {vendor.category || 'Shop'}
                  </small>
                  <h2>{vendor.name}</h2>
                  <p>
                    <MapPin size={16} /> {vendor.address}
                  </p>
                </div>
                <strong>{vendor.deliveryAvailable === false ? 'Delivery coming soon here' : `From ${money(vendor.deliveryFee)} delivery`}</strong>
              </>
            )}
          </section>
          <section className="shopShell">
            <div className="menuGrid">
              {visibleMenu.map((item) => (
                <article key={item.id} onClick={() => inspectItem(item)}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} />
                  ) : (
                    <div className="itemImageFallback">
                      <Utensils />
                    </div>
                  )}
                  <div>
                    <small>
                      {item.category}
                      {item.popular ? ' · popular' : ''}
                    </small>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <strong>{money(item.price)}</strong>
                  </div>
                  <button
                    aria-label={`Add ${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      add(item);
                    }}
                  >
                    <Plus />
                  </button>
                </article>
              ))}
            </div>
            <aside>
              <h2>
                <ShoppingBag /> Basket
              </h2>
              {cart.length ? (
                cart.map((line) => (
                  <div className="cartline" key={line.item.id}>
                    <div>
                      <b>{line.item.name}</b>
                      <span>{money(line.item.price * line.quantity)}</span>
                    </div>
                    <div className="stepper">
                      <button onClick={() => change(line.item.id, -1)}>
                        <Minus />
                      </button>
                      <strong>{line.quantity}</strong>
                      <button onClick={() => change(line.item.id, 1)}>
                        <Plus />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty">Add products from this shop to begin.</p>
              )}
              <div className="totals">
                <span>Items subtotal</span>
                <b>{money(subtotal)}</b>
                {previewSmallOrderFee > 0 && <><span>Small order fee</span><b>{money(previewSmallOrderFee)}</b></>}
                <span>Delivery fee from</span>
                <b>{money(previewDeliveryFee)}</b>
                <span>Service fee</span>
                <b>{money(previewServiceFee)}</b>
                <span>{previewVat > 0 ? 'VAT (16% taxable items)' : 'VAT (not applicable)'}</span>
                <b>{money(previewVat)}</b>
                <strong>Total</strong>
                <b>{money(previewTotal)}</b>
              </div>
              {previewAmountToMinimum > 0 && <p className="notice">Add {money(previewAmountToMinimum)} to reach the {money(MINIMUM_ORDER)} basket minimum and remove the {money(SMALL_ORDER_FEE)} small-order fee. Delivery is priced separately from the mapped route so rider earnings do not fall on small baskets.</p>}
              <button className="primary" onClick={beginCheckout} disabled={!cart.length}>
                Continue to checkout <ChevronRight />
              </button>
              {status && <p className="notice">{status}</p>}
            </aside>
          </section>
          {focused && (
            <section className="similar">
              <button className="textButton" onClick={() => setFocused(null)}>
                <ArrowLeft /> Back to shop
              </button>
              <h2>More like {focused.name}</h2>
              <div>
                {similar.map((item) => (
                  <article key={item.id} onClick={() => inspectItem(item)}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} />
                    ) : (
                      <div className="itemImageFallback">
                        <Store />
                      </div>
                    )}
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <strong>{money(item.price)}</strong>
                    <button onClick={() => add(item)}>
                      <Plus /> Add
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          <Footer />
        </>
      )}

      {page === 'profile' && session && (
        <>
          <section className="profilePage">
            <button className="textButton" onClick={() => openBrowse()}>
              <ArrowLeft /> Back to shopping
            </button>
            <header>
              <div className="profileAvatar">
                <UserRound />
              </div>
              <div>
                <span>{session.user.role === 'rider' ? 'Rider account' : 'Buyer profile'}</span>
                <h1>{session.user.name}</h1>
                <p>{session.user.email}</p>
              </div>
            </header>
            {session.user.role === 'rider' ? (
              <section className="profileForm">
                <h2>Rider workspace</h2>
                <p>
                  Complete your rider profile, then use the app for live requests, surge navigation,
                  proof of delivery, earnings, and safety tools.
                </p>
                <label>
                  Full name
                  <input
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </label>
                <label>
                  Mobile number
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
                <label>
                  City
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </label>
                <label>
                  Vehicle type
                  <input
                    value={form.vehicleType}
                    onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                  />
                </label>
                <label>
                  Registration number
                  <input
                    value={form.registrationNumber}
                    onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                  />
                </label>
                <label>
                  Payout M-Pesa number
                  <input
                    value={form.payoutPhone}
                    onChange={(e) => setForm({ ...form, payoutPhone: e.target.value })}
                  />
                </label>
                <PartnerTerms role={session.user.role} value={termsAcceptance} onChange={setTermsAcceptance} accepted={session.user.termsAccepted} />
                <button className="primary" onClick={() => void saveProfile().catch((error) => setStatus(error instanceof Error ? error.message : 'Profile could not be saved.'))}>
                  Save rider profile
                </button>
                <a className="primary" href={APP_URL}>
                  <Download /> Open rider app
                </a>
              </section>
            ) : (
              <section className="profileForm">
                <h2>Delivery details</h2>
                <p>These details are used for checkout and delivery updates.</p>
                <label>
                  Full name
                  <input
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </label>
                <label>
                  Mobile number
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
                <label>
                  City
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </label>
                <label>
                  Default delivery address
                  <textarea
                    value={form.defaultAddress}
                    onChange={(e) => setForm({ ...form, defaultAddress: e.target.value })}
                  />
                </label>
                <button className="primary" onClick={() => void saveProfile().catch((error) => setStatus(error instanceof Error ? error.message : 'Profile could not be saved.'))}>
                  Save profile
                </button>
              </section>
            )}
            {status && <p className="notice">{status}</p>}
            {session.user.role === 'customer' && <DeliveryBoard />}
            <section className="securityPanel">
              <ShieldCheck />
              <div>
                <h2>Account security</h2>
                <p>Signed in as {session.user.email}. Signing out does not clear your basket.</p>
              </div>
              <button onClick={signOut}>Sign out</button>
            </section>
            <section className="dangerPanel">
              <Trash2 />
              <div>
                <h2>Delete account</h2>
                <p>
                  Permanently removes your personal profile and disables access. Financial and order
                  records required by law remain anonymised.
                </p>
              </div>
              <button onClick={() => setDeleteOpen(true)}>Delete account</button>
            </section>
          </section>
          <Footer />
        </>
      )}

      {authOpen && (
        <div className="overlay">
          <section className="dialog accountDialog">
            <button className="close" onClick={() => setAuthOpen(false)}>
              <X />
            </button>
            <h2>
              {authMode === 'login'
                ? 'Access your SokoEats account'
                : authRole === 'vendor' || authRole === 'merchant'
                  ? 'Submit a store application'
                  : `Create your ${authRole === 'rider' ? 'rider' : 'buyer'} account`}
            </h2>
            <p>
              {authRole === 'vendor' || authRole === 'merchant'
                ? 'Store access is activated after SokoEats verifies the business, representative, and settlement details.'
                : cart.length && authRole === 'customer'
                  ? 'Your basket is saved. Continue where you left off after signing in.'
                  : 'Choose the account that matches how you use SokoEats.'}
            </p>
            <div className="roleChoice">
              {(
                [
                  ['customer', 'Buyer'],
                  ['rider', 'Rider'],
                  ['vendor', 'Store Partner'],
                ] as Array<[AuthRole, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={value === 'vendor' ? (authRole === 'vendor' || authRole === 'merchant' ? 'active' : '') : authRole === value ? 'active' : ''}
                  onClick={() => {
                    setAuthRole(value);
                    setAuthError('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {(authRole === 'vendor' || authRole === 'merchant') && (
              <>
                <div className="roleChoice partnerType" aria-label="Store partner type">
                  <button className={authRole === 'vendor' ? 'active' : ''} onClick={() => setAuthRole('vendor')}>Vendor</button>
                  <button className={authRole === 'merchant' ? 'active' : ''} onClick={() => setAuthRole('merchant')}>Merchant</button>
                </div>
                <div className="partnerRoleDescription" aria-live="polite">
                  <Store aria-hidden="true" />
                  <span><b>{partnerRoleDetails[authRole].title}</b>{partnerRoleDetails[authRole].description}</span>
                </div>
              </>
            )}
            {(authRole === 'customer' || authRole === 'rider') && (
              <>
                <button className="google" onClick={continueGoogle}>
                  <LogIn /> Continue with Google
                </button>
                <div className="divider">or continue with email</div>
              </>
            )}
            {(authRole === 'vendor' || authRole === 'merchant') && authMode === 'register' && (
              <div className="applicationNotice">
                <ShieldCheck />
                <span>
                  <b>Verification required</b>Complete all fields. Catalogue tools unlock after
                  approval.
                </span>
              </div>
            )}
            {authMode === 'register' && (
              <input
                data-auth-field="fullName"
                placeholder={
                  authRole === 'vendor' || authRole === 'merchant'
                    ? 'Owner or administrator full name'
                    : 'Full name'
                }
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            )}
            <input
              data-auth-field="email"
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <div className="passwordField" data-auth-field="password">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={authMode === 'register' ? 'Password, at least 8 characters' : 'Password'}
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                className="passwordToggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {authMode === 'register' && (
              <div className="passwordField" data-auth-field="confirmPassword">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                />
                <button
                  type="button"
                  className="passwordToggle"
                  aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                  aria-pressed={showConfirmPassword}
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                >
                  {showConfirmPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            )}
            {authMode === 'register' && (
              <>
                <div className="formPair">
                  <input
                    data-auth-field="phone"
                    placeholder="Mobile number"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  <input
                    data-auth-field="city"
                    placeholder="City"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                {authRole === 'customer' && (
                  <textarea
                    data-auth-field="defaultAddress"
                    placeholder="Default delivery address"
                    value={form.defaultAddress}
                    onChange={(e) => setForm({ ...form, defaultAddress: e.target.value })}
                  />
                )}
                {authRole === 'rider' && (
                  <>
                    <div className="formPair">
                      <input
                        data-auth-field="vehicleType"
                        placeholder="Vehicle type"
                        value={form.vehicleType}
                        onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                      />
                      <input
                        data-auth-field="registrationNumber"
                        placeholder="Registration number"
                        value={form.registrationNumber}
                        onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                      />
                    </div>
                    <input
                      data-auth-field="payoutPhone"
                      placeholder="Rider payout M-Pesa number"
                      value={form.payoutPhone}
                      onChange={(e) => setForm({ ...form, payoutPhone: e.target.value })}
                    />
                  </>
                )}
                {(authRole === 'vendor' || authRole === 'merchant') && (
                  <>
                    <input
                      data-auth-field="businessName"
                      placeholder="Legal business name"
                      value={form.businessName}
                      onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                    />
                    <div className="formPair">
                      <input
                        data-auth-field="businessCategory"
                        placeholder="Business category"
                        value={form.businessCategory}
                        onChange={(e) => setForm({ ...form, businessCategory: e.target.value })}
                      />
                      <input
                        data-auth-field="businessRegistrationNumber"
                        placeholder="Registration number"
                        value={form.businessRegistrationNumber}
                        onChange={(e) =>
                          setForm({ ...form, businessRegistrationNumber: e.target.value })
                        }
                      />
                    </div>
                    <textarea
                      data-auth-field="storeAddress"
                      placeholder="Store address"
                      value={form.storeAddress}
                      onChange={(e) => setForm({ ...form, storeAddress: e.target.value })}
                    />
                    <div className="formPair">
                      <input
                        data-auth-field="kraPin"
                        placeholder="KRA PIN"
                        value={form.kraPin}
                        onChange={(e) => setForm({ ...form, kraPin: e.target.value.toUpperCase() })}
                      />
                      <input
                        data-auth-field="directorName"
                        placeholder="Director or proprietor name"
                        value={form.directorName}
                        onChange={(e) => setForm({ ...form, directorName: e.target.value })}
                      />
                    </div>
                    <input
                      data-auth-field="directorNationalId"
                      placeholder="Director national ID"
                      value={form.directorNationalId}
                      onChange={(e) => setForm({ ...form, directorNationalId: e.target.value })}
                    />
                    <label>
                      Settlement destination
                      <select
                        value={form.settlementMethod}
                        onChange={(e) => setForm({ ...form, settlementMethod: e.target.value })}
                      >
                        <option value="mpesa_wallet">M-Pesa number</option>
                        <option value="mpesa_till">M-Pesa till</option>
                        <option value="mpesa_paybill">M-Pesa paybill</option>
                      </select>
                    </label>
                    <input
                      data-auth-field="settlementAccount"
                      placeholder="Settlement account number"
                      value={form.settlementAccount}
                      onChange={(e) => setForm({ ...form, settlementAccount: e.target.value })}
                    />
                    <input
                      placeholder="PSP subaccount ID (optional)"
                      value={form.pspSubaccountId}
                      onChange={(e) => setForm({ ...form, pspSubaccountId: e.target.value })}
                    />
                    <label className="agreement" data-auth-field="commissionAgreement">
                      <input
                        type="checkbox"
                        checked={form.commissionAccepted}
                        onChange={(e) => setForm({ ...form, commissionAccepted: e.target.checked })}
                      />
                      <span>I accept the marketplace-v1 agreement. SokoEats adds 10% to my entered product amount to create the customer-facing price.</span>
                    </label>
                  </>
                )}
              </>
            )}
            {authError && <p className="error">{authError}</p>}
            {authMode === 'register' && <PartnerTerms role={authRole} value={termsAcceptance} onChange={setTermsAcceptance} />}
            <button className="primary" disabled={authBusy} onClick={submitAuth}>
              {authBusy
                ? 'Please wait...'
                : authMode === 'login'
                  ? 'Log in'
                  : authRole === 'vendor' || authRole === 'merchant'
                    ? 'Submit application'
                    : 'Create account'}
            </button>
            <button
              className="textButton switchMode"
              onClick={() => {
                setAuthError('');
                setAuthMode(authMode === 'login' ? 'register' : 'login');
              }}
            >
              {authMode === 'login'
                ? authRole === 'vendor' || authRole === 'merchant'
                  ? 'New partner? Submit an application'
                  : 'New to SokoEats? Create account'
                : 'Already registered? Log in'}
            </button>
          </section>
        </div>
      )}

      {checkoutOpen && session && (
        <div className="overlay">
          <section className="dialog checkoutDialog">
            <button className="close" onClick={() => setCheckoutOpen(false)}>
              <X />
            </button>
            <h2>Delivery and payment</h2>
            <p>Payment is confirmed before your order reaches the shop.</p>
            <label>
              Order updates number
              <input
                placeholder="07..."
                value={form.phone}
                onChange={(e) => {
                  setForm({ ...form, phone: e.target.value });
                  setQuote(null);
                  setPendingPayment(null);
                }}
              />
            </label>
            <label>
              Delivery address
              <textarea
                value={form.defaultAddress}
                onChange={(e) => {
                  setForm({ ...form, defaultAddress: e.target.value });
                  setDeliveryPin(null);
                  setQuote(null);
                  setPendingPayment(null);
                }}
              />
            </label>
            <button className="textButton" type="button" onClick={useCurrentDeliveryLocation}>
              <MapPin /> Use current location
            </button>
            {deliveryPin && (
              <p className="notice">
                Delivery pin ready: {deliveryPin.latitude.toFixed(5)}, {deliveryPin.longitude.toFixed(5)}
                {deliveryPin.accuracy ? ` · ${Math.round(deliveryPin.accuracy)}m accuracy` : ''}
              </p>
            )}
            <div className="paymentChoice paymentChoiceSingle" aria-label="Payment method">
              <button className="active" type="button">
                <span>M-Pesa / Card</span>
                <small>Secure Paystack checkout</small>
              </button>
            </div>
            <div className="quoteBox">
              <span>
                Item subtotal <b>{money(quote?.subtotal ?? subtotal)}</b>
              </span>
              {(quote?.smallOrderFee ?? previewSmallOrderFee) > 0 && <span>
                Small order fee <b>{money(quote?.smallOrderFee ?? previewSmallOrderFee)}</b>
              </span>}
              <span>
                Delivery fee <b>{money(quote?.deliveryFee ?? previewDeliveryFee)}</b>
              </span>
              {quote && <small>
                Route price: {money(quote.deliveryBreakdown.baseFee || 0)} base + {money(quote.deliveryBreakdown.distanceFee || 0)} distance + {money(quote.deliveryBreakdown.timeFee || 0)} traffic time; rider minimum {money(quote.deliveryBreakdown.minimumFee || 150)}.
              </small>}
              {!!quote?.surgeFee && <span>Busy-area delivery fee <b>{money(quote.surgeFee)}</b></span>}
              <span>
                Service fee <b>{money(quote ? quote.serviceFee + quote.waivedServiceFee : previewServiceFee)}</b>
              </span>
              {!!quote?.firstOrderOffer && <span className="quoteSaving">First-order service fee saving <b>-{money(quote.waivedServiceFee)}</b></span>}
              {!!quote?.discountAmount && <span className="quoteSaving">Promotion <b>-{money(quote.discountAmount)}</b></span>}
              <span>{quote?.vatRateBps ? `VAT (${quote.vatRateBps / 100}% of ${money(quote.taxableSubtotal)})` : 'VAT (not applicable)'} <b>{money(quote?.vatAmount ?? previewVat)}</b></span>
              {!!quote?.amountToMinimum && <small>Add {money(quote.amountToMinimum)} more to remove the {money(quote.smallOrderFee)} small-order fee. The delivery price remains route-based to protect rider earnings.</small>}
              {quote && (
                <small>
                  <MapPin /> {quote.distanceKm.toFixed(1)} km · about {quote.durationMin} min
                </small>
              )}
              <strong>
                Total <b>{money(quote?.total ?? previewTotal)}</b>
              </strong>
            </div>
            {!pendingPayment ? (
              <button className="primary" disabled={checkoutBusy} onClick={startPayment}>
                {checkoutBusy
                  ? 'Preparing secure payment...'
                  : 'Pay with M-Pesa / Card'}
              </button>
            ) : (
              <button className="primary" disabled={checkoutBusy} onClick={confirmAndOrder}>
                <Check /> {checkoutBusy ? 'Checking payment...' : 'Confirm payment and place order'}
              </button>
            )}
            {status && <p className="notice">{status}</p>}
          </section>
        </div>
      )}

      {deleteOpen && (
        <div className="overlay">
          <section className="dialog dangerDialog">
            <button className="close" onClick={() => setDeleteOpen(false)}>
              <X />
            </button>
            <Trash2 className="dangerIcon" />
            <h2>Delete your SokoEats account?</h2>
            <p>
              This cannot be undone. Type <b>DELETE</b> to confirm.
            </p>
            <textarea
              placeholder="Reason (optional)"
              value={deleteForm.reason}
              onChange={(e) => setDeleteForm({ ...deleteForm, reason: e.target.value })}
            />
            <input
              placeholder="Type DELETE"
              value={deleteForm.confirmation}
              onChange={(e) =>
                setDeleteForm({ ...deleteForm, confirmation: e.target.value.toUpperCase() })
              }
            />
            <input
              type="password"
              placeholder="Password (required for email accounts)"
              value={deleteForm.password}
              onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })}
            />
            {authError && <p className="error">{authError}</p>}
            <button
              className="deleteConfirm"
              disabled={authBusy || deleteForm.confirmation !== 'DELETE'}
              onClick={deleteAccount}
            >
              {authBusy ? 'Deleting...' : 'Permanently delete account'}
            </button>
            <button className="textButton switchMode" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </button>
          </section>
        </div>
      )}

      {legal && (
        <div className="overlay">
          <section className="dialog legalDialog">
            <button className="close" onClick={() => setLegal(null)}>
              <X />
            </button>
            <h2>{legal === 'terms' ? 'Terms of service' : 'Privacy policy'}</h2>
            {legal === 'terms' ? (
              <>
                <p>
                  SokoEats connects customers with independent shops and riders. Prices,
                  availability, delivery estimates and fees are confirmed at checkout.
                </p>
                <p>
                  Orders are sent to a shop only after payment confirmation. Refunds follow the
                  original payment provider and may be held while a delivery dispute is reviewed.
                </p>
                <p>
                  Customers must provide accurate contact and delivery information and use the
                  service lawfully.
                </p>
              </>
            ) : (
              <>
                <p>
                  We use account, order, payment reference and location data to operate delivery,
                  prevent fraud, provide support and comply with Kenyan law.
                </p>
                <p>
                  Payment card details are handled by the payment provider. SokoEats stores payment
                  references and settlement records, not raw card numbers.
                </p>
                <p>
                  You can correct or delete your profile from Account. Legally required transaction
                  records are retained in anonymised form.
                </p>
              </>
            )}
            <a className="primary legalContact" href="mailto:legal@sokoeats.co.ke">
              <Headphones /> Contact SokoEats
            </a>
          </section>
        </div>
      )}
      <CustomerCareChat user={session?.user || null} onSignIn={() => { setAuthMode('login'); setAuthOpen(true); }}/>
    </main>
  );
}
