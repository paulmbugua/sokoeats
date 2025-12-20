import React, { FC, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import useManageProfileForm from '@mytutorapp/shared/hooks/useManageProfileForm';
import { toast } from 'react-toastify';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';

const STATUS_OPTIONS = [
  { value: 'Online', label: 'Online' },
  { value: 'Offline', label: 'Offline' },
  { value: 'Busy', label: 'Busy' },
  { value: 'Free', label: 'Free Session' },
  { value: 'New', label: 'New' },
];

const CATEGORY_OPTIONS = [
  'Mathematics',
  'Sciences',
  'Languages',
  'Arts',
  'Social Studies',
  'Technology & Computing',
  'Business & Economics',
  'Wellness & PE',
];

const LANGUAGES = ['English', 'Swahili', 'French', 'Spanish', 'German'];

type PricingKey = 'privateSession' | 'groupSession' | 'lecture' | 'workshop';
const PRICING_KEYS: PricingKey[] = ['privateSession', 'groupSession', 'lecture', 'workshop'];

// ✅ Updated token ranges (1 token = $1)
const TOKEN_RANGES: Record<PricingKey, { min: number; max: number }> = {
  privateSession: { min: 5, max: 50 },
  groupSession: { min: 5, max: 50 }, // per learner recommended
  lecture: { min: 5, max: 100 },
  workshop: { min: 5, max: 100 },
};

// same regex you use in the hook/backend
const MPESA_REGEX = /^(?:07|2547|\+2547|01|2541|\+2541)\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ManageProfileForm: FC = () => {
  const navigate = useNavigate();
  const { backendUrl } = useShopContext();

  // ─── Refs for “scroll to first error” UX ────────────────────────────────
  const nameRef = useRef<HTMLInputElement>(null);
  const languagesRef = useRef<HTMLDivElement>(null);
  const ageGroupRef = useRef<HTMLDivElement>(null);

  const categoryRef = useRef<HTMLSelectElement>(null);
  const pricingRefs = useRef<Record<PricingKey, HTMLInputElement | null>>({
    privateSession: null,
    groupSession: null,
    lecture: null,
    workshop: null,
  });

  const payoutMethodRef = useRef<HTMLSelectElement>(null);
  const payoutCurrencyRef = useRef<HTMLInputElement>(null);
  const wiseEmailRef = useRef<HTMLInputElement>(null);
  const mpesaPhoneRef = useRef<HTMLInputElement>(null);

  const {
    role,
    updatedData,
    setUpdatedData,
    availableProfiles,
    searchResults,
    isUploading,

    handleInputChange,
    handleLanguageSelect,
    handleSearch,
    handleAddRecommendation,
    handleRemoveRecommendation,
    handlePricingChange,
    setVideo,
    handleDeleteImage,
    handleDeleteVideo,
    handleToggleNotifications,

    handleTeachingStyleSelect,
    handleExpertiseSelect,

    handleSubmit,
  } = useManageProfileForm(navigate);

  // Default tutors to USD/Wise if unset (and keep currency derived from method)
  useEffect(() => {
    if (role === 'tutor') {
      setUpdatedData((prev) => {
        const next = { ...prev };
        if (next.payoutMethod !== 'wise' && next.payoutMethod !== 'mpesa') {
          next.payoutMethod = 'wise';
        }
        // derive currency from method
        next.payoutCurrency = next.payoutMethod === 'mpesa' ? 'KES' : 'USD';
        return next;
      });
    }
  }, [role, setUpdatedData]);

  const getFullUrl = (path: string) => (path?.startsWith('/') ? `${backendUrl}${path}` : path);

  const inputBase =
    'w-full p-3 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] text-[#0d141c] dark:text-darkTextPrimary';

  const chipOn = 'bg-pink-500 text-white border-pink-500';
  const chipOff =
    'bg-[#e7edf4] text-[#49739c] dark:bg-[#172534] dark:text-darkTextSecondary border-transparent';

  // ─── Smooth scroll + highlight helper ────────────────────────────────────
  const scrollToEl = (el?: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).focus?.();
    el.classList.add('ring-2', 'ring-red-500');
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 2000);
  };

  // ─── Minimal client-side validation (first error wins) ───────────────────
  const validateBeforeSubmit = (): true | { el?: HTMLElement | null; msg: string } => {
    // name
    if (!updatedData.name?.trim()) {
      return { el: nameRef.current, msg: 'Please enter your name.' };
    }

    // languages
    const hasLang = Object.values(updatedData.languages || {}).some(Boolean);
    if (!hasLang) {
      return { el: languagesRef.current, msg: 'Select at least one language.' };
    }

    // tutor-only
    if (role === 'tutor') {
      if (!updatedData.category) {
        return { el: categoryRef.current, msg: 'Please select a category.' };
      }

      for (const key of PRICING_KEYS) {
        const val = updatedData.pricing[key];
        const { min, max } = TOKEN_RANGES[key];
        if (!Number.isFinite(val) || val < min || val > max) {
          return {
            el: pricingRefs.current[key],
            msg: `Set a valid rate for ${key} (${min}-${max}).`,
          };
        }
      }

      // payout checks (Wise or M-Pesa only, currency derived)
      if (updatedData.payoutMethod === 'wise') {
        if (!updatedData.wiseEmail?.trim() || !EMAIL_REGEX.test(updatedData.wiseEmail)) {
          return { el: wiseEmailRef.current, msg: 'Enter a valid Wise account email.' };
        }
      } else if (updatedData.payoutMethod === 'mpesa') {
        if (
          !updatedData.mpesaPhoneNumber?.trim() ||
          !MPESA_REGEX.test(updatedData.mpesaPhoneNumber)
        ) {
          return { el: mpesaPhoneRef.current, msg: 'Enter a valid M-Pesa phone number.' };
        }
      } else {
        return { el: payoutMethodRef.current, msg: 'Choose Wise or M-Pesa as payout method.' };
      }
    }

    return true;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg py-10 sm:py-16 px-3 sm:px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const result = validateBeforeSubmit();
          if (result !== true) {
            toast.error(result.msg);
            scrollToEl(result.el);
            return;
          }
          handleSubmit(e);
        }}
        className="space-y-6 px-4 sm:px-6 pt-10 pb-16 sm:pt-12 sm:pb-20
                 rounded-2xl border border-[#cedbe8] dark:border-darkCard
                 bg-white dark:bg-[#0f1821] shadow-sm max-w-2xl mx-auto
                 text-[#0d141c] dark:text-darkTextPrimary"
      >
        {/* Role */}
        <p className="text-[#49739c] dark:text-darkTextSecondary">Role: {role || 'Loading…'}</p>

        {/* Name */}
        <input
          ref={nameRef}
          name="name"
          type="text"
          placeholder="Name"
          value={updatedData.name}
          onChange={(e) => handleInputChange('name', e)}
          className={inputBase}
        />

        {/* Country */}
        <div>
          <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">Country</label>
          <select
            name="country"
            value={updatedData.country || ''}
            onChange={(e) => handleInputChange('country', e)}
            className={inputBase}
          >
            <option value="" disabled>
              Select your country
            </option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* School Grade */}
        <div>
          <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
            School Grade / Year / Level
          </label>
          <input
            name="schoolGrade"
            type="text"
            placeholder="e.g., Grade 7, Form 2, Year 10, Freshman …"
            value={updatedData.schoolGrade || ''}
            onChange={(e) => handleInputChange('schoolGrade', e)}
            className={inputBase}
          />
        </div>

        {/* Languages */}
        <div ref={languagesRef}>
          <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">Languages</label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => handleLanguageSelect(lang)}
                className={`px-3 py-1 rounded-full border text-sm ${updatedData.languages[lang] ? chipOn : chipOff}`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Tutor Section */}
        {role === 'tutor' && (
          <>
            {/* Category */}
            <div>
              <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
                Category
              </label>
              <select
                ref={categoryRef}
                name="category"
                value={updatedData.category}
                onChange={(e) => handleInputChange('category', e)}
                className={inputBase}
              >
                <option value="" disabled>
                  Select Category
                </option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <select
              name="status"
              value={updatedData.status}
              onChange={(e) => handleInputChange('status', e)}
              className={inputBase}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Notifications */}
            <div className="flex items-center">
              <label className="text-[#49739c] dark:text-darkTextSecondary mr-2">
                Notifications
              </label>
              <input
                type="checkbox"
                checked={!!updatedData.notifications}
                onChange={() => handleToggleNotifications()}
                className="w-5 h-5 accent-pink-500"
              />
            </div>

            {/* Bio */}
            <textarea
              name="bio"
              rows={3}
              placeholder="Write a brief introduction…"
              value={updatedData.bio}
              onChange={(e) => handleInputChange('bio', e)}
              className={`${inputBase} !min-h-[96px]`}
            />

            {/* Pricing */}
            <div>
              <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
                Rates (1 token = $1 USD)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PRICING_KEYS.map((field) => {
                  const { min, max } = TOKEN_RANGES[field];
                  return (
                    <div key={field}>
                      <label className="text-sm text-[#49739c] dark:text-darkTextSecondary block">
                        {field.replace(/([A-Z])/g, ' $1')} (Min {min} | Max {max})
                      </label>
                      <input
                        ref={(el) => {
                          pricingRefs.current[field] = el;
                        }}
                        type="number"
                        min={min}
                        max={max}
                        value={(updatedData.pricing[field] ?? '').toString()}
                        onChange={(e) => handlePricingChange(field, e.target.value)}
                        className={`${inputBase} !p-2`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Expertise */}
            <div>
              <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
                Expertise
              </label>
              <div className="flex flex-wrap gap-2">
                {['Exam Prep', 'Skill Building', 'Homework Help', 'Career Guidance'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleExpertiseSelect(opt)}
                    className={`px-3 py-1 rounded-full border text-sm ${updatedData.expertise.includes(opt) ? chipOn : chipOff}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Teaching Styles */}
            <div>
              <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
                Teaching Styles
              </label>
              <div className="flex flex-wrap gap-2">
                {['One-on-One', 'Group', 'Workshop', 'Lecture'].map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => handleTeachingStyleSelect(style)}
                    className={`px-3 py-1 rounded-full border text-sm ${updatedData.teachingStyle.includes(style) ? chipOn : chipOff}`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div>
              <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
                Experience Level
              </label>
              <div className="flex flex-wrap gap-2">
                {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => handleInputChange('experienceLevel', lvl)}
                    className={`px-3 py-1 rounded-full border text-sm ${updatedData.experienceLevel === lvl ? chipOn : chipOff}`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Payout Preferences */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-base sm:text-lg font-semibold text-[#49739c] dark:text-darkTextSecondary">
                Payout Preferences
              </h3>

              {/* Method (Wise or M-Pesa) */}
              <div>
                <label className="text-sm text-[#49739c] dark:text-darkTextSecondary block mb-1">
                  Payout Method
                </label>
                <select
                  ref={payoutMethodRef}
                  name="payoutMethod"
                  value={updatedData.payoutMethod}
                  onChange={(e) => {
                    const method = e.target.value as 'wise' | 'mpesa';
                    setUpdatedData((prev) => ({
                      ...prev,
                      payoutMethod: method,
                      payoutCurrency: method === 'mpesa' ? 'KES' : 'USD',
                    }));
                  }}
                  className={inputBase}
                >
                  <option value="wise">Wise (USD)</option>
                  <option value="mpesa">M-Pesa (KES)</option>
                </select>
              </div>

              {/* Currency (derived, read-only) */}
              <div>
                <label className="text-sm text-[#49739c] dark:text-darkTextSecondary block mb-1">
                  Payout Currency
                </label>
                <input
                  ref={payoutCurrencyRef}
                  className={inputBase}
                  value={updatedData.payoutMethod === 'mpesa' ? 'KES' : 'USD'}
                  readOnly
                />
                <p className="text-xs mt-1 text-[#49739c] dark:text-darkTextSecondary">
                  Wise pays out in USD to your Wise account. M-Pesa payouts settle in KES.
                </p>
              </div>

              {/* Method details */}
              {updatedData.payoutMethod === 'wise' && (
                <div>
                  <label className="text-sm text-[#49739c] dark:text-darkTextSecondary block mb-1">
                    Wise account email
                  </label>
                  <input
                    ref={wiseEmailRef}
                    type="email"
                    placeholder="you@yourdomain.com"
                    value={updatedData.wiseEmail || ''}
                    onChange={(e) =>
                      setUpdatedData((prev) => ({ ...prev, wiseEmail: e.target.value }))
                    }
                    className={inputBase}
                  />
                </div>
              )}

              {updatedData.payoutMethod === 'mpesa' && (
                <div>
                  <label className="text-base sm:text-lg text-[#49739c] dark:text-darkTextSecondary">
                    M-Pesa Phone Number
                  </label>
                  <input
                    ref={mpesaPhoneRef}
                    name="mpesaPhoneNumber"
                    placeholder="+2547XXXXXXXX"
                    value={updatedData.mpesaPhoneNumber || ''}
                    onChange={(e) =>
                      setUpdatedData((prev) => ({ ...prev, mpesaPhoneNumber: e.target.value }))
                    }
                    className={`${inputBase} mb-2`}
                  />
                </div>
              )}
            </div>

            {/* Gallery */}
            <div className="gallery-section mb-4">
              <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
                Upload Profile Image
              </label>
              <div className="w-40 h-40 border border-[#cedbe8] dark:border-darkCard rounded-lg overflow-hidden relative group bg-slate-50 dark:bg-[#0f1821]">
                <img
                  src={
                    updatedData.gallery[0] instanceof File
                      ? URL.createObjectURL(updatedData.gallery[0] as File)
                      : updatedData.gallery[0]
                        ? getFullUrl(updatedData.gallery[0] as string)
                        : '/upload_placeholder.png'
                  }
                  alt=""
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  {updatedData.gallery[0] && (
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(0)}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                      title="Delete Image"
                    >
                      &times;
                    </button>
                  )}
                  {/* Upload / Replace */}
                  <label className="p-2 bg-[#3d99f5] text-white rounded cursor-pointer">
                    {updatedData.gallery[0] ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const dataUrl = reader.result as string;
                          setUpdatedData((prev) => {
                            const g = [...prev.gallery];
                            g[0] = dataUrl;
                            return { ...prev, gallery: g };
                          });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Video */}
            <div className="video-section mb-4">
              <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
                Uploaded Video
              </label>
              <div className="relative rounded-lg overflow-hidden">
                {updatedData.video instanceof File ? (
                  <video
                    src={URL.createObjectURL(updatedData.video as File)}
                    controls
                    className="w-full h-40 object-cover rounded-lg"
                  />
                ) : updatedData.video ? (
                  <video
                    src={getFullUrl(updatedData.video as string)}
                    controls
                    className="w-full h-40 object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-full h-40 bg-[#e7edf4] dark:bg-[#172534] flex items-center justify-center text-[#49739c] dark:text-darkTextSecondary rounded-lg">
                    No video uploaded
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                  {updatedData.video && (
                    <button
                      type="button"
                      onClick={handleDeleteVideo}
                      className="p-2 bg-red-600 text-white rounded-full mr-2"
                    >
                      &times;
                    </button>
                  )}
                  <label className="p-2 bg-[#3d99f5] text-white rounded cursor-pointer">
                    {updatedData.video ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept="video/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setVideo(file, { maxSeconds: 30 });
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="recommendations-section mb-4">
              <label className="text-[#49739c] dark:text-darkTextSecondary mb-2 block">
                Recommendations
              </label>
              <input
                type="text"
                placeholder="Search profiles…"
                onChange={(e) => handleSearch(e)}
                className={`${inputBase} !p-2 mb-2`}
              />
              {searchResults.length > 0 && (
                <div className="bg-slate-50 dark:bg-[#0f1821] p-2 rounded mb-2 max-h-40 overflow-y-auto border border-[#cedbe8] dark:border-darkCard">
                  {searchResults.map((p) => (
                    <div
                      key={p._id}
                      className="flex justify-between items-center p-2 even:bg-[#f6f9fc] dark:even:bg-[#101a27] rounded"
                    >
                      <span className="">{p.name}</span>
                      <button
                        type="button"
                        onClick={() => handleAddRecommendation(p._id)}
                        className="bg-pink-500 px-3 py-1 rounded text-white"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {updatedData.recommended.length > 0 ? (
                  updatedData.recommended.map((id) => {
                    const prof = availableProfiles.find((x) => x._id === id);
                    return prof ? (
                      <div
                        key={id}
                        className="flex justify-between items-center p-2 bg-slate-50 dark:bg-[#0f1821] border border-[#cedbe8] dark:border-darkCard rounded hover:bg-[#f6f9fc] dark:hover:bg-[#101a27] transition-colors"
                      >
                        <span className="flex-1 truncate">{prof.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecommendation(id)}
                          className="text-[#49739c] hover:text-red-500"
                        >
                          ✕
                        </button>
                      </div>
                    ) : null;
                  })
                ) : (
                  <p className="text-[#49739c] dark:text-darkTextSecondary">
                    No recommendations yet.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={isUploading}
          className="w-full bg-[#3d99f5] hover:brightness-110 text-white py-3 rounded-lg transition-all duration-300 disabled:opacity-60"
        >
          {isUploading ? 'Updating Profile…' : 'Update Profile'}
        </button>
      </form>
    </div>
  );
};

export default ManageProfileForm;
