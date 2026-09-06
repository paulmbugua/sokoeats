import Joi from 'joi';

const role = Joi.string().valid('normal','user','customer','rider','courier','vendor','merchant','merchant_admin','support','admin').default('customer');
const phone = Joi.string().min(7).max(30).allow('', null);
const termsAcceptance = Joi.object({
  accepted: Joi.boolean().strict().valid(true).required(),
  role: Joi.string().valid('rider', 'vendor', 'merchant').required(),
  version: Joi.string().max(60).required(),
  hash: Joi.string().hex().length(64).required(),
}).unknown(false);

export const registerSchema = Joi.object({
  termsAcceptance,
  role,
  fullName: Joi.string().min(2).max(120),
  name: Joi.string().min(2).max(120),
  email: Joi.string().email().required(),
  phone,
  password: Joi.string().min(8).max(128).required(),
  city: Joi.string().max(80),
  defaultAddress: Joi.string().max(220).allow('', null),
  address: Joi.string().max(220).allow('', null),
  businessName: Joi.string().max(140).allow('', null),
  storeName: Joi.string().max(140).allow('', null),
  storeAddress: Joi.string().max(220).allow('', null),
  vehicleType: Joi.string().max(80).allow('', null),
  registrationNumber: Joi.string().max(40).allow('', null),
  vehicleRegistration: Joi.string().max(40).allow('', null),
  nationalId: Joi.string().max(40).allow('', null),
  businessCategory: Joi.string().max(80).allow('', null),
  category: Joi.string().max(80).allow('', null),
  payoutPhone: Joi.string().min(7).max(30).allow('', null),
  settlementMethod: Joi.string().valid('mpesa_wallet', 'mpesa_till', 'mpesa_paybill').allow('', null),
  businessRegistrationNumber: Joi.string().max(80).allow('', null),
  kraPin: Joi.string().max(20).allow('', null),
  directorName: Joi.string().max(160).allow('', null),
  directorNationalId: Joi.string().max(30).allow('', null),
  pspSubaccountId: Joi.string().max(100).allow('', null),
  commissionAccepted: Joi.boolean(),
  department: Joi.string().max(80).allow('', null),
  preferredLanguage: Joi.string().max(40),
  inviteCode: Joi.string().max(120).allow('', null),
  marketingOptIn: Joi.boolean().default(false),
}).unknown(false).or('fullName', 'name', 'businessName');

export const loginSchema = Joi.object({
  role,
  email: Joi.string().email().required(),
  password: Joi.string().min(1).required(),
}).unknown(false);

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).max(128).required(),
  newPassword: Joi.string().min(12).max(128)
    .pattern(/[a-z]/, 'lowercase letter')
    .pattern(/[A-Z]/, 'uppercase letter')
    .pattern(/[0-9]/, 'number')
    .pattern(/[^A-Za-z0-9]/, 'special character')
    .required(),
}).unknown(false);

export const googleAuthSchema = Joi.object({
  role,
  idToken: Joi.string().min(100).required(),
  phone,
  city: Joi.string().max(80),
  defaultAddress: Joi.string().max(220).allow('', null),
  address: Joi.string().max(220).allow('', null),
  businessName: Joi.string().max(140).allow('', null),
  storeName: Joi.string().max(140).allow('', null),
  storeAddress: Joi.string().max(220).allow('', null),
  vehicleType: Joi.string().max(80).allow('', null),
  registrationNumber: Joi.string().max(40).allow('', null),
  vehicleRegistration: Joi.string().max(40).allow('', null),
  nationalId: Joi.string().max(40).allow('', null),
  businessCategory: Joi.string().max(80).allow('', null),
  category: Joi.string().max(80).allow('', null),
  payoutPhone: Joi.string().min(7).max(30).allow('', null),
  department: Joi.string().max(80).allow('', null),
  preferredLanguage: Joi.string().max(40),
  inviteCode: Joi.string().max(120).allow('', null),
  marketingOptIn: Joi.boolean().default(false),
}).unknown(false);

export const deleteAccountSchema = Joi.object({
  confirmation: Joi.string().valid('DELETE').required(),
  password: Joi.string().min(8).max(128).allow('', null),
  reason: Joi.string().trim().max(500).allow('', null),
});

export const updateProfileSchema = Joi.object({
  termsAcceptance,
  fullName: Joi.string().min(2).max(120),
  name: Joi.string().min(2).max(120),
  phone,
  city: Joi.string().max(80),
  defaultAddress: Joi.string().max(220).allow('', null),
  address: Joi.string().max(220).allow('', null),
  businessName: Joi.string().max(140).allow('', null),
  storeName: Joi.string().max(140).allow('', null),
  storeAddress: Joi.string().max(220).allow('', null),
  vehicleType: Joi.string().max(80).allow('', null),
  registrationNumber: Joi.string().max(40).allow('', null),
  vehicleRegistration: Joi.string().max(40).allow('', null),
  nationalId: Joi.string().max(40).allow('', null),
  businessCategory: Joi.string().max(80).allow('', null),
  category: Joi.string().max(80).allow('', null),
  payoutPhone: Joi.string().min(7).max(30).allow('', null),
  department: Joi.string().max(80).allow('', null),
  preferredLanguage: Joi.string().max(40),
  marketingOptIn: Joi.boolean(),
}).unknown(false).min(1);
