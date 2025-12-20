// packages/shared/hooks/usePayment.ts
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import useAppQuery from './useAppQuery';
import { useMutation } from '@tanstack/react-query';
import type { Profile, RatingStats, PaymentPackage } from '@mytutorapp/shared/types';
import {
  getPaymentPackages,
  getRandomProfile,
  getTutorReviews,
  initiatePayment,
  paystackCreateOrder,
  paystackVerify,
  getMyWallet,
  completePayment as apiCompletePayment,
  updateMpesaReference as apiUpdateMpesaReference,
} from '@mytutorapp/shared/api';
import type { AxiosResponse } from 'axios';

interface InitiateResponse {
  transactionId?: string;
}
interface CompleteResponse {
  payment: { status: string; mpesa_reference: string };
  tokens: number;
}
interface UpdateRefResponse {
  message: string;
}
type PaystackStartVars = { packageId: string | number };
type PaystackStartResp = { reference: string; authorization_url: string; paymentId: number };

type PaystackFinalizeVars = { reference: string };
type PaystackFinalizeResp = {
  ok: boolean;
  status: string;
  tokensBalance?: number;
  creditsPurchased?: number;
  alreadyCompleted?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** retry verify because webhook might be slightly delayed */
async function verifyWithRetry(
  backendUrl: string,
  reference: string,
  token?: string,
  attempts = 8,
  delayMs = 900
) {
  let last: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const v = await paystackVerify(backendUrl, reference, token);
      last = v;
      if (v?.ok && (v.status === 'success' || v.status === 'Completed')) return v;
      // some servers respond {ok:false,status:'pending'} while webhook finishes
    } catch (e) {
      last = e;
    }
    await sleep(delayMs);
  }
  return last;
}

type Currency = 'USD' | 'KES';

interface UsePaymentResult {
  packages: PaymentPackage[];
  loadingPackages: boolean;
  packagesError: string | null;

  selectedPackage: PaymentPackage | null;
  handlePackageSelection: (pkg: PaymentPackage | null) => void;

  profile: Profile | null;
  mainImage: string | null;
  loadingProfile: boolean;

  ratingData: RatingStats;
  loadingReviews: boolean;

  selectedPaymentMethod: string | null;
  handlePaymentSelection: (method: string) => void;
  inferredCurrency: Currency;

  phoneNumber: string;
  setPhoneNumber: (phone: string) => void;
  showMpesaModal: boolean;
  setShowMpesaModal: (show: boolean) => void;

  initiatingPayment: boolean;
  initiateError: string | null;
  transactionReference: string | null;
  handleInitiateMpesaPayment: () => Promise<void>;

  confirmingPayment: boolean;
  confirmError: string | null;
  handleCompletePayment: () => Promise<void>;

  updatingReference: boolean;
  updateError: string | null;
  mpesaReference: string;
  setMpesaReference: (ref: string) => void;
  handleUpdateMpesaReference: () => Promise<void>;
  startPaystackCheckout: () => Promise<PaystackStartResp | null>;
  finalizePaystack: (reference: string) => Promise<PaystackFinalizeResp>;
  paystackRef: string | null;
  handleCheckout: () => void;
}

const usePayment = (): UsePaymentResult => {
  const { token, backendUrl } = useShopContext();

  // --- Random tutor (for trust block) ---
  const { data: profile = null, isLoading: loadingProfile } = useAppQuery<Profile | null, Error>(
    ['randomProfile', token],
    async () => {
      const p = await getRandomProfile(backendUrl, token);
      return (p?.role === 'tutor' ? p : null) as Profile | null;
    },
    { enabled: Boolean(token) }
  );
  const mainImage = profile?.gallery?.[0] ?? null;

  // --- Currency inference based on payment method or user pref ---
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);

  const inferredCurrency: Currency = useMemo(() => {
    if (
      selectedPaymentMethod === 'PayPal' ||
      selectedPaymentMethod === 'Visa/MasterCard' ||
      selectedPaymentMethod === 'Paystack' ||
      selectedPaymentMethod === 'Card'
    ) {
      return 'USD';
    }

    if (selectedPaymentMethod === 'M-Pesa' || selectedPaymentMethod === 'MPESA') {
      return 'KES';
    }

    const pref = (profile as any)?.payoutCurrency;
    return pref === 'KES' || pref === 'USD' ? pref : 'USD';
  }, [selectedPaymentMethod, profile]);

  // --- Packages (fetch only for the inferred currency) ---
  const {
    data: packages = [],
    isLoading: loadingPackages,
    error: packagesErr,
  } = useAppQuery<PaymentPackage[], Error>(
    ['paymentPackages', token, inferredCurrency],
    () => getPaymentPackages(backendUrl, token, inferredCurrency),
    { enabled: Boolean(token) }
  );
  const packagesError = packagesErr?.message ?? null;

  // --- Reviews ---
  const { data: ratingData = { avgRating: 0, totalReviews: 0 }, isLoading: loadingReviews } =
    useAppQuery<RatingStats, Error>(
      ['paymentReviews', token, profile?.id],
      () => getTutorReviews(backendUrl, token, profile!.id),
      { enabled: Boolean(profile?.id && token) }
    );

  // --- Selection state ---
  const [selectedPackage, setSelectedPackage] = useState<PaymentPackage | null>(null);

  // Clear selection if currency changes (prevents mismatched package/method)
  useEffect(() => {
    setSelectedPackage(null);
  }, [inferredCurrency]);

  const handlePackageSelection = useCallback((pkg: PaymentPackage | null) => {
    setSelectedPackage(pkg);
  }, []);

  const [showMpesaModal, setShowMpesaModal] = useState(false);
  const handlePaymentSelection = useCallback((method: string) => {
    setSelectedPaymentMethod(method);
    setShowMpesaModal(method === 'M-Pesa' || method === 'MPESA');
  }, []);

  // --- M-Pesa state ---
  const [phoneNumber, setPhoneNumber] = useState('');
  const [transactionReference, setTransactionReference] = useState<string | null>(null);
  const [mpesaReference, setMpesaReference] = useState('');

  const [paystackRef, setPaystackRef] = useState<string | null>(null);

  const startPaystackMutation = useMutation<PaystackStartResp, Error, PaystackStartVars>({
    mutationFn: async (vars) => {
      const r = await paystackCreateOrder(backendUrl, token, { packageId: vars.packageId });
      return {
        reference: r.reference,
        authorization_url: r.authorization_url,
        paymentId: r.paymentId,
      };
    },
  });

  useEffect(() => {
    setPaystackRef(null);
  }, [selectedPaymentMethod, inferredCurrency]);

  const finalizePaystackMutation = useMutation<PaystackFinalizeResp, Error, PaystackFinalizeVars>({
    mutationFn: async (vars) => {
      const v = await verifyWithRetry(backendUrl, vars.reference, token);
      if (v?.ok) return v as PaystackFinalizeResp;
      throw new Error(v?.message || 'Payment not confirmed yet.');
    },
  });

  const refreshWallet = useCallback(async () => {
    // if you have a dedicated wallet context refresh, call it instead.
    // this is a safe fallback:
    await getMyWallet(backendUrl, token).catch(() => null);
  }, [backendUrl, token]);

  const startPaystackCheckout = useCallback(async () => {
    if (!selectedPackage) {
      alert('Please select a package first.');
      return null;
    }
    if (!backendUrl || !token) {
      alert('Please sign in again.');
      return null;
    }

    // IMPORTANT: Paystack charges KES; you can keep package as USD intent if you want,
    // but you should NOT collect card details in client anymore.
    const data = await startPaystackMutation.mutateAsync({ packageId: selectedPackage.id });
    setPaystackRef(data.reference);
    return data; // { reference, authorization_url, paymentId }
  }, [selectedPackage, backendUrl, token, startPaystackMutation]);

  const finalizePaystack = useCallback(
    async (reference: string) => {
      const v = await finalizePaystackMutation.mutateAsync({ reference });
      await refreshWallet();
      return v;
    },
    [finalizePaystackMutation, refreshWallet]
  );

  // --- Initiate payment (MPESA only) ---
  type InitiateVars = {
    amount: number;
    packageId: string | number;
    paymentMethod: string;
    phone: string;
  };
  const initiateMutation = useMutation<InitiateResponse, Error, InitiateVars>({
    mutationFn: (vars) =>
      initiatePayment(backendUrl, token, {
        amount: vars.amount,
        packageId: String(vars.packageId),
        paymentMethod: vars.paymentMethod,
        phone: vars.phone,
      }),
  });
  const {
    mutateAsync: initiateAsync,
    status: initiatingStatus,
    error: initiateErr,
  } = initiateMutation;
  const initiatingPayment = initiatingStatus === 'pending';

  const handleInitiateMpesaPayment = useCallback(async () => {
    if (!selectedPackage) {
      alert('Please select a package first.');
      return;
    }
    if (!phoneNumber) {
      alert('Please enter your phone number.');
      return;
    }
    // Ensure we’re on KES packages
    if (inferredCurrency !== 'KES') {
      alert('Please choose M-Pesa to pay in KSh.');
      return;
    }

    try {
      const data = await initiateAsync({
        amount: Number(selectedPackage.price), // KES price
        packageId: selectedPackage.id,
        paymentMethod: 'MPESA',
        phone: phoneNumber,
      });
      if (data.transactionId) {
        setTransactionReference(data.transactionId);
        alert('STK Push initiated. Complete it on your phone.');
      }
    } catch {
      alert('Failed to initiate payment.');
    }
  }, [initiateAsync, selectedPackage, phoneNumber, inferredCurrency]);

  const initiateError = (initiateErr as Error)?.message ?? null;

  // --- Complete payment (MPESA) ---
  const completeMutation = useMutation<CompleteResponse, Error, string>({
    mutationFn: (txRef) =>
      apiCompletePayment(backendUrl, token, { transactionReference: txRef }).then(
        (resp: AxiosResponse<CompleteResponse>) => resp.data
      ),
  });
  const {
    mutateAsync: completeAsync,
    status: confirmingStatus,
    error: completeErr,
  } = completeMutation;
  const confirmingPayment = confirmingStatus === 'pending';

  const handleCompletePayment = useCallback(async () => {
    if (!transactionReference) {
      alert('No transaction reference. Please initiate first.');
      return;
    }
    try {
      const data = await completeAsync(transactionReference);
      alert(
        `Payment status: ${data.payment.status}\n` +
          `Ref: ${data.payment.mpesa_reference}\n` +
          `Tokens: ${data.tokens}`
      );
    } catch {
      alert('Failed to confirm payment.');
    }
  }, [completeAsync, transactionReference]);

  const confirmError = (completeErr as Error)?.message ?? null;

  // --- Update M-Pesa reference ---
  const updateMutation = useMutation<UpdateRefResponse, Error, string>({
    mutationFn: (ref) => apiUpdateMpesaReference(backendUrl, token, transactionReference!, ref),
  });
  const { mutateAsync: updateRefAsync, status: updatingStatus, error: updateErr } = updateMutation;
  const updatingReference = updatingStatus === 'pending';

  const handleUpdateMpesaReference = useCallback(async () => {
    if (!mpesaReference) {
      alert('Enter M-Pesa reference.');
      return;
    }
    if (!transactionReference) {
      alert('Initiate payment first.');
      return;
    }
    try {
      const data = await updateRefAsync(mpesaReference);
      alert(data.message);
    } catch {
      alert('Failed to update reference.');
    }
  }, [updateRefAsync, mpesaReference, transactionReference]);

  const updateError = (updateErr as Error)?.message ?? null;

  // Placeholder for other checkouts (Paystack is handled inline in the PaymentWidget)
  const handleCheckout = useCallback(() => {
    alert('Checkout coming soon…');
  }, []);

  return {
    packages,
    loadingPackages,
    packagesError,

    selectedPackage,
    handlePackageSelection,

    profile,
    mainImage,
    loadingProfile,

    ratingData,
    loadingReviews,

    selectedPaymentMethod,
    handlePaymentSelection,
    inferredCurrency,

    phoneNumber,
    setPhoneNumber,
    showMpesaModal,
    setShowMpesaModal,

    initiatingPayment,
    initiateError,
    transactionReference,
    handleInitiateMpesaPayment,

    confirmingPayment,
    confirmError,
    handleCompletePayment,

    updatingReference,
    updateError,
    mpesaReference,
    setMpesaReference,
    handleUpdateMpesaReference,
    startPaystackCheckout,
    finalizePaystack,
    paystackRef,

    handleCheckout,
  };
};

export default usePayment;
