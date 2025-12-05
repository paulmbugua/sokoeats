// apps/web/src/components/CreateProfileForm.web.tsx
import React, { FC, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfileForm } from '@mytutorapp/shared/hooks';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';
import CountrySelect from './CountrySelect';

// Pricing keys + ranges (tokens == USD)
type PricingKeys = 'privateSession' | 'groupSession' | 'workshop' | 'lecture';
const tokenRanges: Record<PricingKeys, { min: number; max: number }> = {
  privateSession: { min: 5, max: 50 },
  groupSession:   { min: 5, max: 50 },   // intended per learner
  workshop:       { min: 5, max: 100 },  // one-to-many, intensive
  lecture:        { min: 5, max: 100 },  // one-to-many, lower interaction
};
const pricingFields: PricingKeys[] = ['privateSession', 'groupSession', 'workshop', 'lecture'];

// If your shared types include an UploadAsset, use it; otherwise:
interface UploadAsset { url: string }
function isUploadAsset(obj: any): obj is UploadAsset {
  return obj != null && typeof obj.url === 'string';
}

type Errors = Record<string, string>;

const labelFor: Record<string, string> = {
  role: 'Your Role',
  name: 'Name',
  country: 'Country',
  schoolGrade: 'School Grade / Year / Level',
  languages: 'Languages',
  category: 'Subject/Skill Category',
  payoutMethod: 'Payout Method',
  payoutCurrency: 'Payout Currency',
  wiseEmail: 'Wise Email',
  mpesaPhoneNumber: 'M-Pesa Phone Number',
  privateSession: 'Private session rate',
  groupSession: 'Group session rate',
  workshop: 'Workshop rate',
  lecture: 'Lecture rate',
};

const CreateProfileForm: FC = () => {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);

  // refs for quick scroll-to-invalid behaviors
  const nameRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);
  const langSectionRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const mpesaRef = useRef<HTMLInputElement>(null);
  const wiseRef = useRef<HTMLInputElement>(null);

  const {
    role,
    // basics
    name, setName,
    languages, handleLanguageSelect,
    country, setCountry,
    schoolGrade, setSchoolGrade,
    category, setCategory,
    bio, setBio,
    expertise, setExpertise,
    teachingStyle, setTeachingStyle,
    pricing, handlePricingChange,

    // media
    images, setImages,
    videoPreview, handleVideoChange, handleRemoveVideo,

    // payout prefs (✅ currency is derived from method in the hook)
    payoutCurrency,
    payoutMethod, setPayoutMethod,
    wiseEmail, setWiseEmail,
    mpesaPhoneNumber, setMpesaPhoneNumber,

    // submit
    loading, handleSubmit, step,
  } = useProfileForm({
    onSuccess: () => navigate('/'),
  });

  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string>('');

  const setFieldError = (key: string, message: string) => {
    setErrors(prev => ({ ...prev, [key]: message }));
  };
  const clearFieldError = (key: string) => {
    setErrors(prev => {
      if (!(key in prev)) return prev;
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };

  const scrollToEl = (el?: HTMLElement | null) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as any)?.focus?.();
  };

  const buildBannerFromErrors = (errs: Errors) => {
    const keys = Object.keys(errs);
    if (!keys.length) return '';
    const items = keys.map(k => labelFor[k] || k);
    return `Please complete: ${items.join(' • ')}.`;
  };

  const validateCustom = (): { ok: boolean; firstKey?: string } => {
    const newErrors: Errors = {};

    // Country (custom because CountrySelect may not use native "required")
    if (!country) newErrors.country = 'Select your country.';

    // Languages
    if (Object.values(languages).every(v => !v)) {
      newErrors.languages = 'Select at least one language.';
    }

    if (role === 'tutor') {
      // Category (also has native required, but we keep a clear inline msg)
      if (!category) newErrors.category = 'Select a subject/skill category.';

      // Payout details
      if (payoutMethod === 'mpesa') {
        if (!mpesaPhoneNumber?.trim()) newErrors.mpesaPhoneNumber = 'Enter your M-Pesa phone number.';
      } else if (payoutMethod === 'wise') {
        if (!wiseEmail?.trim()) newErrors.wiseEmail = 'Enter your Wise account email.';
      }

      // Pricing numeric sanity + bounds
      pricingFields.forEach((field) => {
        const raw = (pricing as Record<PricingKeys, string>)[field];
        const { min, max } = tokenRanges[field];
        const n = Number(raw);
        if (raw == null || raw === '') {
          newErrors[field] = `Enter ${labelFor[field]}.`;
        } else if (!Number.isFinite(n)) {
          newErrors[field] = `${labelFor[field]} must be a number.`;
        } else if (n < min || n > max) {
          newErrors[field] = `${labelFor[field]} must be between ${min} and ${max}.`;
        }
      });
    }

    setErrors(newErrors);
    setBanner(buildBannerFromErrors(newErrors));
    return { ok: Object.keys(newErrors).length === 0, firstKey: Object.keys(newErrors)[0] };
  };

  const onFormSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    setErrors({});
    setBanner('');

    const form = formRef.current;

    // 1) Native HTML validation first
    if (form) {
      // Gather all invalids to show a precise banner and scroll/focus the first
      const invalids = Array.from(form.querySelectorAll(':invalid')) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
      if (invalids.length) {
        const tmpErrors: Errors = {};
        for (const el of invalids) {
          const key = el.getAttribute('name') || '';
          if (!key) continue;
          }
        setErrors(tmpErrors);
        setBanner(buildBannerFromErrors(tmpErrors));

        const firstInvalid = invalids[0] as any;
        scrollToEl(firstInvalid);
        firstInvalid?.reportValidity?.();
        return;
      }
    }

    // 2) Custom cross-field validation (languages, country, payout details, pricing bounds)
    const { ok, firstKey } = validateCustom();
    if (!ok) {
      // Scroll to the relevant section/field
      switch (firstKey) {
        case 'languages':
          scrollToEl(langSectionRef.current);
          break;
        case 'category':
          scrollToEl(categoryRef.current);
          break;
        case 'mpesaPhoneNumber': {
          scrollToEl(mpesaRef.current);
          break;
        }
        case 'wiseEmail': {
          scrollToEl(wiseRef.current);
          break;
        }
        case 'country': {
          // CountrySelect wrapper is not a native control; scroll its label area
          const countryLabel = document.getElementById('country-label');
          scrollToEl(countryLabel || formRef.current);
          break;
        }
        default: {
          // Pricing fields / others
          if (firstKey && form) {
            const el = form.querySelector(`[name="${firstKey}"]`) as HTMLElement | null;
            scrollToEl(el || form);
          }
        }
      }
      return;
    }

    // 3) All good — submit
    handleSubmit(e);
  };

  const inputBase =
    'w-full p-3 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] text-[#0d141c] dark:text-white placeholder:opacity-70';

  const invalidRing = 'border-red-500 ring-1 ring-red-500';
  const labelBase = 'text-base sm:text-lg text-[#49739c] dark:text-gray-200';
  const smallLabel = 'text-sm text-[#49739c] dark:text-gray-300';

  const chipOn = 'bg-pink-500 text-white border-pink-500';
  const chipOff = 'bg-[#e7edf4] text-[#49739c] dark:bg-[#172534] dark:text-gray-300 border-transparent';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg py-10 sm:py-16 px-3 sm:px-4">
      <form
        ref={formRef}
        onSubmit={onFormSubmit}
        className="space-y-6 p-4 sm:p-6 rounded-2xl border border-[#cedbe8] 
                   dark:border-darkCard bg-white dark:bg-[#0f1821] shadow-sm 
                   max-w-2xl mx-auto text-[#0d141c] dark:text-white"
        noValidate
        aria-describedby={banner ? 'form-error-banner' : undefined}
      >
        <h2 className="text-2xl font-bold text-center dark:text-white">Create Your Profile</h2>

        {/* Top error banner */}
        {banner && (
          <div
            id="form-error-banner"
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-3"
          >
            {banner}
          </div>
        )}

        {/* Background video upload notice */}
        {step === 'bg-video' && (
          <div className="text-sm text-[#49739c] dark:text-gray-300">
            Uploading your intro video in the background… you can continue using the app.
          </div>
        )}

        {/* Role display */}
        {role ? (
          <div className="space-y-2">
            <label className={labelBase}>Your Role</label>
            <p className={`${inputBase}`}>{role}</p>
          </div>
        ) : (
          <p className="text-[#49739c] dark:text-gray-300">Fetching your role...</p>
        )}

        {/* Name */}
        <div>
          <label className={labelBase}>Name</label>
          <input
            ref={nameRef}
            name="name"
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={e => {
              setName(e.target.value);
              clearFieldError('name');
            }}
            className={`${inputBase} ${errors.name ? invalidRing : ''}`}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'err-name' : undefined}
            required
          />
          {errors.name && <p id="err-name" className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.name}</p>}
        </div>

        {/* Country */}
        <div className="space-y-2">
          <label id="country-label" className={labelBase}>
            Country
          </label>
          <CountrySelect
            value={country}
            onChange={(v: string) => {
              setCountry(v);
              clearFieldError('country');
            }}
            options={COUNTRIES}
            placeholder="Select your country"
            className={`${inputBase} ${errors.country ? invalidRing : ''}`}
            aria-invalid={!!errors.country}
            aria-describedby={errors.country ? 'err-country' : undefined}
          />
          {errors.country && <p id="err-country" className="text-sm text-red-600 dark:text-red-400">{errors.country}</p>}
        </div>

        {/* School Grade (free text so it works globally) */}
        <div className="space-y-2">
          <label className={labelBase}>School Grade / Year / Level - You Teach</label>
          <input
            name="schoolGrade"
            type="text"
            placeholder="e.g., Grade 7, Form 2, Year 10, Freshman, TVET, ..."
            value={schoolGrade}
            onChange={e => {
              setSchoolGrade(e.target.value);
              clearFieldError('schoolGrade');
            }}
            className={`${inputBase} ${errors.schoolGrade ? invalidRing : ''}`}
            aria-invalid={!!errors.schoolGrade}
            aria-describedby={errors.schoolGrade ? 'err-schoolGrade' : undefined}
            required
          />
          {errors.schoolGrade && <p id="err-schoolGrade" className="text-sm text-red-600 dark:text-red-400">{errors.schoolGrade}</p>}
        </div>

        {/* Language Selection */}
        <div ref={langSectionRef} className="space-y-2 mt-4">
          <label className={labelBase}>
            Select Languages You Speak
          </label>
          <div className={`flex gap-2 flex-wrap rounded-xl p-2 ${errors.languages ? 'ring-1 ring-red-500' : ''}`}>
            {Object.keys(languages).map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  handleLanguageSelect(lang);
                  clearFieldError('languages');
                }}
                className={`p-2 rounded border text-sm sm:text-base ${languages[lang] ? chipOn : chipOff}`}
                aria-pressed={languages[lang]}
              >
                {lang}
              </button>
            ))}
          </div>
          {errors.languages && <p className="text-sm text-red-600 dark:text-red-400">{errors.languages}</p>}
        </div>

        {/* Tutor-only */}
        {role === 'tutor' && (
          <>
            {/* Category */}
            <div className="space-y-2">
              <label className={labelBase}>
                Select Subject or Skill Category
              </label>
              <select
                ref={categoryRef}
                name="category"
                value={category}
                onChange={e => {
                  setCategory(e.target.value);
                  clearFieldError('category');
                }}
                className={`${inputBase} ${errors.category ? invalidRing : ''}`}
                aria-invalid={!!errors.category}
                aria-describedby={errors.category ? 'err-category' : undefined}
                required
              >
                <option value="" disabled>Select a category</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Sciences">Sciences</option>
                <option value="Programming">Programming</option>
                <option value="Art & Design">Art & Design</option>
                <option value="Languages">Languages</option>
                <option value="Wellness">Wellness</option>
              </select>
              {errors.category && <p id="err-category" className="text-sm text-red-600 dark:text-red-400">{errors.category}</p>}
            </div>

            {/* Payout Preferences */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-base sm:text-lg font-semibold text-[#49739c] dark:text-gray-200">
                Payout Preferences
              </h3>

              {/* Method (Wise or M-Pesa) */}
              <div>
                <label className={`${smallLabel} block mb-1`}>
                  Payout Method
                </label>
                <select
                  name="payoutMethod"
                  value={payoutMethod}
                  onChange={e => {
                    setPayoutMethod(e.target.value as 'wise' | 'mpesa');
                    clearFieldError('wiseEmail');
                    clearFieldError('mpesaPhoneNumber');
                  }}
                  className={`${inputBase}`}
                  required
                >
                  <option value="wise">Wise (USD)</option>
                  <option value="mpesa">M-Pesa (KES)</option>
                </select>
              </div>

              {/* Currency (derived from method, read-only) */}
              <div>
                <label className={`${smallLabel} block mb-1`}>
                  Payout Currency
                </label>
                <input
                  className={inputBase}
                  value={payoutCurrency}
                  readOnly
                />
                <p className="text-xs mt-1 text-[#49739c] dark:text-gray-300">
                  Wise pays out in USD to your Wise account. M-Pesa payouts settle in KES; FX conversion happens at payout time.
                </p>
              </div>

              {/* Method details */}
              {payoutMethod === 'wise' && (
                <div>
                  <label className={`${smallLabel} block mb-1`}>
                    Wise account email
                  </label>
                  <input
                    ref={wiseRef}
                    name="wiseEmail"
                    type="email"
                    placeholder="you@yourdomain.com"
                    value={wiseEmail}
                    onChange={e => {
                      setWiseEmail(e.target.value);
                      clearFieldError('wiseEmail');
                    }}
                    className={`${inputBase} ${errors.wiseEmail ? invalidRing : ''}`}
                    aria-invalid={!!errors.wiseEmail}
                    aria-describedby={errors.wiseEmail ? 'err-wise' : undefined}
                    required
                  />
                  {errors.wiseEmail && <p id="err-wise" className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.wiseEmail}</p>}
                </div>
              )}

              {payoutMethod === 'mpesa' && (
                <div className="space-y-2">
                  <label className={labelBase}>
                    M-Pesa Phone Number
                  </label>
                  <input
                    ref={mpesaRef}
                    name="mpesaPhoneNumber"
                    type="text"
                    placeholder="+2547XXXXXXXX"
                    value={mpesaPhoneNumber}
                    onChange={e => {
                      setMpesaPhoneNumber(e.target.value);
                      clearFieldError('mpesaPhoneNumber');
                    }}
                    className={`${inputBase} ${errors.mpesaPhoneNumber ? invalidRing : ''}`}
                    aria-invalid={!!errors.mpesaPhoneNumber}
                    aria-describedby={errors.mpesaPhoneNumber ? 'err-mpesa' : undefined}
                    required
                  />
                  {errors.mpesaPhoneNumber && <p id="err-mpesa" className="text-sm text-red-600 dark:text-red-400">{errors.mpesaPhoneNumber}</p>}
                </div>
              )}
            </div>

            {/* Teaching Styles */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-[#49739c] dark:text-gray-200 mb-2">
                Teaching Styles
              </h3>
              <div className="flex flex-wrap gap-3">
                {['One-on-One', 'Group', 'Workshop', 'Lecture'].map(style => (
                  <button
                    key={style}
                    type="button"
                    className={`p-2 rounded-lg text-sm sm:text-base ${teachingStyle.includes(style) ? chipOn : chipOff}`}
                    onClick={() =>
                      setTeachingStyle(prev =>
                        prev.includes(style) ? prev.filter(item => item !== style) : [...prev, style]
                      )
                    }
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className={labelBase}>Bio</label>
              <textarea
                name="bio"
                placeholder="A short bio about yourself..."
                value={bio}
                onChange={e => setBio(e.target.value)}
                className={`${inputBase} !min-h-[96px]`}
                rows={3}
              />
            </div>

            {/* Expertise */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-[#49739c] dark:text-gray-200 mb-2">
                Expertise
              </h3>
              <div className="flex flex-wrap gap-3">
                {['Exam Prep','Skill Building','Homework Help','Career Guidance'].map(skill => (
                  <button
                    key={skill}
                    type="button"
                    className={`p-2 rounded-lg text-sm sm:text-base ${expertise.includes(skill) ? chipOn : chipOff}`}
                    onClick={() =>
                      setExpertise(prev =>
                        prev.includes(skill) ? prev.filter(item => item !== skill) : [...prev, skill]
                      )
                    }
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <label className={labelBase}>
                Set Your Rates (1 token = $1 USD)
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                {pricingFields.map(field => {
                  const { min, max } = tokenRanges[field];
                  const value = (pricing as Record<PricingKeys, string>)[field] || '';
                  const errKey = field;
                  return (
                    <div key={field} className="flex flex-col">
                      <label className={`${smallLabel}`}>
                        {field.replace(/([A-Z])/g, ' $1')} (Min: {min} | Max: {max})
                      </label>
                      <input
                        name={field}
                        type="number"
                        placeholder={`Enter ${field.replace(/([A-Z])/g, ' $1')} Tokens`}
                        value={value}
                        onChange={e => {
                          handlePricingChange(field, e.target.value);
                          clearFieldError(errKey);
                        }}
                        className={`${inputBase} focus:outline-none focus:ring-2 focus:ring-pink-500 ${errors[errKey] ? invalidRing : ''}`}
                        min={min}
                        max={max}
                        aria-invalid={!!errors[errKey]}
                        aria-describedby={errors[errKey] ? `err-${errKey}` : undefined}
                        required
                      />
                      {errors[errKey] && (
                        <p id={`err-${errKey}`} className="text-sm text-red-600 dark:text-red-400 mt-1">
                          {errors[errKey]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[#49739c] dark:text-gray-300">
                Tip: For group pricing, we recommend entering the price <strong>per learner</strong>. If you price per session instead, multiply by your target class size.
              </p>
            </div>

            {/* Upload Profile Image */}
            <label htmlFor="image1" className="space-y-2 cursor-pointer">
              <span className={labelBase}>
                Upload Profile Image
              </span>
              <div className="w-20 h-20 sm:w-24 sm:h-24 border border-[#cedbe8] dark:border-darkCard rounded-lg overflow-hidden bg-slate-50 dark:bg-[#0f1821] flex items-center justify-center">
                {(() => {
                  const first = images[0];
                  let src: string;
                  if (first instanceof File) src = URL.createObjectURL(first);
                  else if (typeof first === 'string') src = first;
                  else if (isUploadAsset(first)) src = first.url;
                  else src = '/upload_placeholder.png';
                  return <img src={src} alt="" className="w-full h-full object-cover" />;
                })()}
              </div>
              <input
                id="image1"
                type="file"
                accept="image/*"
                hidden
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setImages([file]);
                }}
              />
            </label>

            {/* Introduction Video */}
            <div className="space-y-2">
              <label className={labelBase}>
                Introduction Video
              </label>
              <div className="flex items-center justify-center sm:justify-start gap-4">
                {videoPreview ? (
                  <div className="relative w-28 h-28 sm:w-32 sm:h-32 bg-slate-50 dark:bg-[#0f1821] rounded-lg overflow-hidden">
                    <video src={videoPreview} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={handleRemoveVideo}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      title="Remove video"
                    >
                      X
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="video-upload"
                    className="flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32 bg-[#e7edf4] dark:bg-[#172534] rounded-lg cursor-pointer hover:opacity-90"
                    title="Upload video"
                  >
                    <span className="dark:text-white">Upload Video</span>
                  </label>
                )}
                <input
                  id="video-upload"
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleVideoChange(e.target.files[0]);
                    }
                  }}
                />
              </div>
            </div>
          </>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="w-full bg-[#3d99f5] hover:brightness-110 text-white py-3 rounded-lg text-base sm:text-lg"
          disabled={loading}
        >
          {loading
            ? (step === 'uploading' ? 'Uploading images…'
              : step === 'creating' ? 'Creating profile…'
              : 'Creating profile…')
            : 'Create Profile'}
        </button>
      </form>
    </div>
  );
};

export default CreateProfileForm;
