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
  name: Joi.string().trim().min(2).max(120),
  tagline: Joi.string().trim().max(180).allow('', null),
  address: Joi.string().trim().min(3).max(240),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  contactPhone: Joi.string().trim().max(30).allow('', null),
  imageUrl: Joi.string().uri().max(2000).allow('', null),
  prepMinutes: Joi.number().integer().min(5).max(180),
  minimumOrder: Joi.number().integer().min(300).max(1000000),
  openingHours: Joi.object().pattern(Joi.string(), Joi.string().max(80)),
}).and('latitude', 'longitude').min(1);

export const vendorReviewSchema = Joi.object({
  orderId: Joi.string().uuid(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().max(600).allow('', null),
});


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
  paymentMethod: Joi.string().valid('paystack').default('paystack'),
  phone: Joi.string().min(9).allow('', null),
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
  sectionTitle: Joi.string().trim().empty('').min(2).max(80),
  sectionDescription: Joi.string().max(220).allow('', null),
  sectionSortOrder: Joi.number().integer().min(0).allow(null),
  name: Joi.string().trim().min(2).max(140).required(),
  description: Joi.string().max(500).allow('', null),
  price: Joi.alternatives().try(Joi.number().min(1), Joi.string().min(1)).required(),
  category: Joi.string().min(2).max(80).allow('', null),
  unitLabel: Joi.string().max(40).allow('', null),
  imageUrl: Joi.string().uri().allow('', null),
  popular: Joi.boolean().default(false),
  available: Joi.boolean().default(true),
  sortOrder: Joi.number().integer().min(0).default(0),
}).unknown(false);

export const merchantMenuCategorySchema = Joi.object({
  title: Joi.string().min(2).max(80).required(),
  description: Joi.string().max(220).allow('', null),
  sortOrder: Joi.number().integer().min(0).default(0),
}).unknown(false);

export const merchantMenuItemUpdateSchema = merchantMenuItemSchema.fork('price', () => Joi.number().integer().min(1).required());

export const vendorImageUploadSchema = Joi.object({
  filename: Joi.string().min(3).max(180).required(),
  contentType: Joi.string().valid('image/jpeg', 'image/png', 'image/webp', 'image/avif').required(),
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
