import Joi from 'joi';

export const menuAvailabilitySchema = Joi.object({
  available: Joi.boolean().required(),
});

export const ticketMessageSchema = Joi.object({
  body: Joi.string().min(2).max(2000).required(),
  internal: Joi.boolean().default(false),
});

export const ticketResolveSchema = Joi.object({
  note: Joi.string().max(500).allow('', null),
});

export const vendorOrderStatusSchema = Joi.object({
  status: Joi.string().valid('accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled').required(),
});


export const riderOnboardingStepSchema = Joi.object({
  fullName: Joi.string().allow('', null),
  phoneNumber: Joi.string().allow('', null),
  city: Joi.string().allow('', null),
  vehicleType: Joi.string().allow('', null),
  make: Joi.string().allow('', null),
  model: Joi.string().allow('', null),
  plate: Joi.string().allow('', null),
  documents: Joi.object().unknown(true),
}).unknown(true);

export const inventoryStockSchema = Joi.object({
  numericStock: Joi.number().min(0).required(),
  stock: Joi.string().allow('', null),
});


export const incidentReportSchema = Joi.object({
  category: Joi.string().required(),
  urgency: Joi.string().required(),
  location: Joi.string().allow('', null),
  incidentTime: Joi.string().allow('', null),
  description: Joi.string().min(2).required(),
  photos: Joi.array().items(Joi.string()).default([]),
});

export const riderChatMessageSchema = Joi.object({
  body: Joi.string().min(1).max(1200).required(),
});

export const quizSubmissionSchema = Joi.object({
  selectedIndex: Joi.number().integer().min(0).required(),
});

export const vendorProfileSettingsSchema = Joi.object({
  acceptingOrders: Joi.boolean(),
  business: Joi.object().unknown(true),
  operations: Joi.array().items(Joi.object().unknown(true)),
}).unknown(true);


export const referralInvitationsSchema = Joi.object({
  contactIds: Joi.array().items(Joi.string()).min(1).required(),
});

export const campaignCreateSchema = Joi.object({
  goal: Joi.string().required(),
  offerType: Joi.string().required(),
  budget: Joi.number().min(0).required(),
}).unknown(true);


export const walletTopUpSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  method: Joi.string().default('M-Pesa Express'),
}).unknown(true);

export const walletWithdrawSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  destination: Joi.string().default('M-Pesa Account'),
}).unknown(true);

export const scanPaymentSchema = Joi.object({
  merchantQr: Joi.string().min(8).required(),
  vendorId: Joi.string().allow('', null),
  vendorSlug: Joi.string().pattern(/^[a-z0-9-]+$/).allow('', null),
  vendorName: Joi.string().min(2).allow('', null),
  amount: Joi.number().min(1).required(),
  currency: Joi.string().valid('KES').default('KES'),
  paymentMethod: Joi.string().valid('mpesa', 'card').required(),
  phone: Joi.string().min(9).required(),
  email: Joi.string().email({ tlds: { allow: false } }).allow('', null),
  customerName: Joi.string().allow('', null),
  callbackUrl: Joi.string().uri().allow('', null),
  shortcode: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
}).unknown(false);

export const merchantPayoutRequestSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  destination: Joi.string().required(),
}).unknown(true);


export const merchantOnboardingSubmissionSchema = Joi.object({
  screenKey: Joi.string().allow('', null),
}).unknown(true);

export const merchantMenuItemSchema = Joi.object({
  vendorId: Joi.string().allow('', null),
  vendorSlug: Joi.string().pattern(/^[a-z0-9-]+$/).default('nairobi-grill-house'),
  sectionTitle: Joi.string().min(2).max(80),
  sectionDescription: Joi.string().max(220).allow('', null),
  sectionSortOrder: Joi.number().integer().min(0).allow(null),
  name: Joi.string().min(2).max(140).required(),
  description: Joi.string().max(500).allow('', null),
  price: Joi.alternatives().try(Joi.number().min(1), Joi.string().min(1)).required(),
  category: Joi.string().min(2).max(80).required(),
  unitLabel: Joi.string().max(40).allow('', null),
  imageUrl: Joi.string().uri().allow('', null),
  popular: Joi.boolean().default(false),
  available: Joi.boolean().default(true),
  sortOrder: Joi.number().integer().min(0).default(0),
}).unknown(false);

export const merchantBulkImportSchema = Joi.object({
  fileName: Joi.string().default('Restaurant_Menu_July.csv'),
  itemCount: Joi.number().integer().min(1).default(142),
}).unknown(true);

export const merchantAdLaunchSchema = Joi.object({
  goal: Joi.string().required(),
  budget: Joi.number().min(1).required(),
  durationDays: Joi.number().integer().min(1).default(7),
}).unknown(true);
