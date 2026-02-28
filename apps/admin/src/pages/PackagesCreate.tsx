// apps/admin/src/pages/PackagesCreate.tsx
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useShopContext } from '@myhandymanapp/shared/context/ShopContext';

type Props = {
  /** Optional: if omitted we use the context token */
  token?: string;
};

export default function PackagesCreate({ token: propToken }: Props) {
  const { token: ctxToken } = useShopContext();
  const token = propToken ?? ctxToken ?? ''; // available for future API calls

  // UI state only — wire to backend later
  const [title, setTitle] = useState('');
  const [credits, setCredits] = useState<number | ''>('');
  const [priceUSD, setPriceUSD] = useState<number | ''>('');
  const [priceKES, setPriceKES] = useState<number | ''>('');
  const [offer, setOffer] = useState('');

  return (
    <form className="flex flex-col w-full items-start gap-4">
      <h2 className="form-heading">Create Token Package</h2>

      <div className="w-full grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm">Title</span>
          <input
            className="input mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Starter Pack"
          />
        </label>

        <label className="block">
          <span className="text-sm">Credits</span>
          <input
            className="input mt-1"
            type="number"
            value={credits}
            onChange={(e) => setCredits(e.target.value ? Number(e.target.value) : '')}
            placeholder="5"
          />
        </label>

        <label className="block">
          <span className="text-sm">Price (USD)</span>
          <input
            className="input mt-1"
            type="number"
            value={priceUSD}
            onChange={(e) => setPriceUSD(e.target.value ? Number(e.target.value) : '')}
            placeholder="1.00"
          />
        </label>

        <label className="block">
          <span className="text-sm">Price (KES)</span>
          <input
            className="input mt-1"
            type="number"
            value={priceKES}
            onChange={(e) => setPriceKES(e.target.value ? Number(e.target.value) : '')}
            placeholder="120.00"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm">Offer / Badge</span>
          <input
            className="input mt-1"
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="Best value, Limited time…"
          />
        </label>
      </div>

      <button type="button" className="btn mt-2">
        <Plus className="w-4 h-4" /> Save Package
      </button>
    </form>
  );
}
