import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Screen = 'splash' | 'onboarding' | 'home' | 'checkout' | 'riderHome' | 'activeDelivery' | 'riderOnboardingWelcome' | 'riderPersonal' | 'riderVehicle' | 'riderDocuments' | 'riderApplicationSuccess' | 'riderEarnings' | 'riderPayout' | 'riderLeaderboard' | 'riderProfile';
type PaymentMethod = 'mpesa' | 'card';

const colors = {
  tertiaryFixedDim: '#eec209',
  error: '#ba1a1a',
  surfaceContainerLow: '#eef5f7',
  surface: '#f4fafd',
  onTertiary: '#ffffff',
  primaryFixed: '#ffdcc3',
  onSurfaceVariant: '#564334',
  onSecondaryFixed: '#00210c',
  secondaryContainer: '#6bfe9c',
  tertiary: '#735c00',
  errorContainer: '#ffdad6',
  primary: '#904d00',
  secondaryFixed: '#6bfe9c',
  background: '#f4fafd',
  onError: '#ffffff',
  tertiaryContainer: '#cda600',
  inverseSurface: '#2b3234',
  surfaceTint: '#904d00',
  surfaceVariant: '#dde4e6',
  onPrimaryFixed: '#2f1500',
  surfaceContainerHigh: '#e2e9ec',
  onErrorContainer: '#93000a',
  inversePrimary: '#ffb77d',
  secondaryFixedDim: '#4ae183',
  onSurface: '#161d1f',
  onBackground: '#161d1f',
  secondary: '#006d37',
  onTertiaryFixedVariant: '#574500',
  surfaceContainer: '#e8eff1',
  primaryFixedDim: '#ffb77d',
  onSecondaryContainer: '#00743a',
  onTertiaryContainer: '#4d3d00',
  surfaceContainerLowest: '#ffffff',
  inverseOnSurface: '#ebf2f4',
  onPrimaryFixedVariant: '#6e3900',
  onPrimaryContainer: '#623200',
  tertiaryFixed: '#ffe084',
  surfaceBright: '#f4fafd',
  onPrimary: '#ffffff',
  primaryContainer: '#ff8c00',
  onTertiaryFixed: '#231b00',
  onSecondary: '#ffffff',
  surfaceContainerHighest: '#dde4e6',
  surfaceDim: '#d4dbdd',
  outline: '#897362',
  onSecondaryFixedVariant: '#005228',
  outlineVariant: '#ddc1ae',
};

const stitchFilesUsed = [
  'splash_screen/code.html',
  'splash_screen/screen.png',
  'welcome_onboarding/code.html',
  'welcome_onboarding/screen.png',
  'home_screen/code.html',
  'home_screen/screen.png',
  'checkout/code.html',
  'checkout/screen.png',
  'rider_home_delivery_request/code.html',
  'rider_home_delivery_request/screen.png',
  'active_delivery_to_vendor/code.html',
  'active_delivery_to_vendor/screen.png',
  'welcome_to_sokoeats_rider/code.html',
  'welcome_to_sokoeats_rider/screen.png',
  'personal_information/code.html',
  'personal_information/screen.png',
  'vehicle_verification/code.html',
  'vehicle_verification/screen.png',
  'document_uploads/code.html',
  'document_uploads/screen.png',
  'application_success/code.html',
  'application_success/screen.png',
  'rider_earnings_dashboard/code.html',
  'rider_earnings_dashboard/screen.png',
  'm_pesa_payout_confirmation/code.html',
  'm_pesa_payout_confirmation/screen.png',
  'rider_leaderboard/code.html',
  'rider_leaderboard/screen.png',
  'rider_profile_ratings/code.html',
  'rider_profile_ratings/screen.png',
  'vendor_analytics_dashboard/code.html',
  'vendor_analytics_dashboard/screen.png',
  'vendor_inventory_management/code.html',
  'vendor_inventory_management/screen.png',
];

const images = {
  splashRider:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuA5UuCYbhCdh5B5J2pzH75aKIVwehyXA_9D9LbLWPfYy81REjXbZFT1bW9CI7HoUuEX-erMZQS0oi3NRA3pY1tzMZwfLXcgjkUP8sQSlNc3en4XRS87oLEkdnHHq7L1wfpG-lBhOFu8BAU7EeWoB5D1Yx_DNlRCwKR12caeIkAFRNzc_qswViRsUoshkPQ8X-kvMRl2-uIQy0o-oln6Ys6ZfyDcklyaOPATG3RA4Ez76uEVdumt3jUI',
  pilau:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAYlO9EHUbD14acsEsDdC8VRhZ2oB-VFZf3m-vpGCZJQ6bSSqKf_4pnLWBwNNIMRSfRnS0MVdSrzNarhqi6WFBcFkMNBsKdtXWc77r2i9aTrlNGTd45iWWuAvEF-N02BaHzSkMfm7z35EkWnNdNQewGXaa87eKoZNGGMNiv4BTLCzEqae0phhIoK65IN2rwxGPNJCQiwpe5Kiq9z7XrUyn9oefvaWvqre_anogbFes9lTiIieNrZy12',
  nyama:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCiyTx9kVL8XMFvS1nxiqOfo0gmaiMHVs-j-lCvUKHWclFMt4-YAU2z_6QeO2WjNGldm1RfzajIy-1MHFY91Kr_RozbmQG2OQYb-V1_nGKrA8I6DErtmzSMgJU-GskXKt-9jpitLUnCRuU3gm3yGnUREtKh82heQ4dRt5o2dZBUJS4T8BBmbl-8-IYwJq3dQ00CwWMy69Zwt7BeKpxWSGRvKV4EAS1GcwDHRQGsyDULD38_VRV2szyw',
  groceries:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAe6zaCa1CTOrnloHSAgFCGgNwr2An9Kf8LpfrhtyzvgLzIktTq6fb-J9Ree3AUS3YRt3SKtQo3Nw1OONkdxKM52Fc-SSIwF6IrVjxsG8KlfzaRj4Jhh0OpxTvLCH-tIzjRBkH3bUT_EkgkqjyPjCxiHK6n19i8-UbHhemmaxjC7e5XgWn2pVpGQPf0yOAEVfwzdNw0uyI5WTDblPYRn9iWHnHuGVLyQhrdoU9raABPKMvY6IBbzy9v',
  avatar:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDl7rpq9ZcF96TzkK1kuC4q0xiD4sUHFG_I5y2swFjjo1RGifyTWLploYdUVEMXygN_FgpY2lRws2M6smSFtTXkvjaab5Lg_0ySJkJckS1SXKb86FWPlba232KDRlE7dSPxfU2707th5v6rYBqCP0xHBBNbypzLLBUmfuL-Z2YTuCqMsUngvDSj6uZmIOAmKj2m40m7vcnXiN3IbAQosPkc_95gyENESQMgF-aK6boXnZw6d8GuwKTs',
  deliveryBanner:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDvaBwHLyWrkzZu-xOdwOATu2cETPUTQ0TlJ9hVEQ8pv-gDABkVAmye1iQFqc0pwzCei_rrRzog5uZdCfFV9wAAxzNKpPNC3JXvpz_7mAipQ6WA69aMPK7PDAnC2jX4up2MH5IlNqF-p4KfHc_sWGxpjaJNDofV0XNN-rEVHLRmYOgo-jg5uKjYqIEok7K3rC-yz8wAf-OEjn8SROkXMD8plC1xpKXZl9pfX_aRu8c_DcYL3_Kdw7tA',
  mpesaBanner:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuB6a0LzTrCuyIrSsXROdUnbifZjN6cSNOAGV1TW1PuYH8aitfBFdBoi_7WMevp880c-fYRwDyHaPBYv1G-bVE0c_bEnZwvOalV1P2BIm4syMLbHYp6cP2tawpcs7Bvoo-DJXvyHI9sXnYWhv5N9mNyeaBpN_FpvNGFlH17B8TEHsmWGpoickgksGR397MD_sZY5gjIqi3WfRIg-6MjqOJsb_WdqyU-Tozirg17ew6y9bH8hV86KfjO2',
  grillHouse:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuC9Nh9wCGBTozFrUbzkwWRoKyktC87wqv5HNRFT3efXOszoLuZeGE625jmr-jpzCFQUX_AP3UwgWbl293oJtgQAWu7ecAhm9CTXxnEOJSz-HQy5qSLrbxI9vvfhhNsC07irDDB1iLeCe6LTajy7LOz96vigx6Y0o-dnyhsMfgqpGRyya7MWU9-i5I55OlHeRR1V-v7Lfxcr-IJ6gE0O3_kGL8elqp9u2yMd7AHprAPoHfHqSkC_3OiN',
  mamaNjeri:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuA7cYYWXY9r23h4uip_qyNtK_OCIOGitgxyPGc_TOyCaJL-LSufM0JrXeYTE0I9k2V7dDhkiIqbplX_VtQ-UJ9DgnWHpZ4thum8gcTIg2OBwrqLIFxqsezaeoRqJdbBGopcPx1FcVIVq_xEE_fNRhJTd6YfM7hvFE6nzht49LvYLb5Q9fbhEhc2vOOlYcWjH6plgIVBVOqHG0Q4M8CscTs9iveY4LCTNhp2thSZ2ipezcLw-HMzZor3',
  checkoutMeal:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCjF2WpKfILdnFl1JaCG--5MCDZkETfq4GKsLBb2v2qjgbmrPRjjeXv5GJyNNrqVbhEl3kx_BTABtmOxecGgkH-uZf2odn4GpcuSF8ggRTA1S0Mce_CuZwUoS4qaweWCL_j44_xfPiKv45zknECZHU79rzl5DwX5ui_oKtOe5EPQfJKK1HpD0-O-AZx7j9rNHgacx9UMBX4XG4FQ1WE1eLn2WWTVenIdccYiGxeF9SFEZqgPErbjPZ7',
  checkoutAvatar:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDYeQ7quzQW1VQP9dU6gW67imFwGKQqekclHeX7suvyuAqDFj0E3iFltNxFsPhWzlCMkl5dmZTuzg-Pla4KGsiNjcS8Sb5XsmKiQ8QEJ9WUBLmaPsa3x3_gCFOhPgWM_9ZVn91qx8pfW7dMJSlYb39vwB-IHFbJMIglahsXhFVVBeICM8JTOqPsZl4qT-BRv0VSzqSKw-N7OlE1phU0g2Ov_uMHUp5hwrj9Jy_B5lrXZYJePmMxGVsg',
};

const categories = [
  { label: 'Restaurants', icon: 'fork', bg: colors.primaryFixed, fg: colors.onPrimaryContainer },
  { label: 'Groceries', icon: 'cart', bg: colors.secondaryFixed, fg: colors.onSecondaryContainer },
  { label: 'Pharmacy', icon: '+', bg: colors.errorContainer, fg: colors.onErrorContainer },
  { label: 'Gas', icon: 'fuel', bg: colors.surfaceContainerHighest, fg: colors.onSurfaceVariant },
  { label: 'Electronics', icon: 'tech', bg: colors.tertiaryFixed, fg: colors.onTertiaryContainer },
];

const chips = ['Nyama Choma', 'Pilau', 'Chapati', 'Ugali', 'Sukuma Wiki'];

const restaurants = [
  {
    name: 'Nairobi Grill House',
    meta: 'Kenyan - Grilled - Meat Specialists',
    rating: '4.8',
    time: '25-35 min',
    delivery: 'Free',
    minimum: 'KES 200 min',
    image: images.grillHouse,
  },
  {
    name: 'Mama Njeri Kitchen',
    meta: 'Authentic - Swahili - Homestyle',
    rating: '4.6',
    time: '15-25 min',
    delivery: 'KES 50',
    minimum: 'KES 150 min',
    image: images.mamaNjeri,
  },
];

const orderItems = [
  {
    quantity: '1x',
    name: 'Platter of Nyama Choma',
    note: 'Extra Kachumbari, Spicy',
    price: 1200,
  },
  {
    quantity: '2x',
    name: 'Tusker Cider (500ml)',
    note: '',
    price: 500,
  },
];

const money = (value: number) => `KSh ${value.toLocaleString('en-KE')}`;
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_LAN_BACKEND_URL || 'http://10.0.2.2:4005';
type RiderHomePayload = { sourceFiles?: string[]; tabs?: string[]; rider: { name?: string; status: string; zone: string; earningsToday: string; online?: boolean }; heatmapUrl: string; surge: { active?: boolean; label: string }; request: { id: string; status: string; title: string; countdownSeconds: number; pickup: { name: string; distance: string }; dropoff: { area: string; distance: string }; payout: string; acceptedMessage: string } };
type ActiveDeliveryPayload = { sourceFiles?: string[]; tabs?: string[]; order: { code: string; eta: string; status: string; progressLabel: string; progressPercent: number }; mapUrl: string; destinationLabel: string; vendor: { name: string; address: string; badge: string; prepTime: string; imageUrl: string }; arrived: boolean; pickupConfirmed: boolean };
const fallbackRiderHome: RiderHomePayload = {
  "sourceFiles": [
    "rider_home_delivery_request/code.html",
    "rider_home_delivery_request/screen.png"
  ],
  "rider": {
    "name": "SokoEats Rider",
    "status": "ONLINE",
    "zone": "Westlands",
    "earningsToday": "KSh 1,250",
    "online": true
  },
  "heatmapUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuA2l5WHz71bJGMZEP4QEkSPLHvbYOxcTcqP5Lc56XUVcHSZA_7mLZn6KlllMUgXAPqyRTasAccMw-141Jrl9z6nuWmgRsb1CUWea8LYzF7EddsCtbFXhKJvYnpSX1xQ8RkFeqgZprV8Zf4DH_X0e_qRrjqgmjNWxaEPqO4K1AuLR8Q1IYiyfGShZ5hsnK7VRiqsw9JhJ9o7TRXDILLwXPwaebQK1s2i8QU55jFU59VqWj7d_lTHgZrj",
  "surge": {
    "active": true,
    "label": "1.5x SURGE ACTIVE"
  },
  "request": {
    "id": "req-sko-9231",
    "status": "new",
    "title": "New Delivery",
    "countdownSeconds": 15,
    "pickup": {
      "name": "Nairobi Grill House",
      "distance": "1.2km away"
    },
    "dropoff": {
      "area": "Kilimani, Nairobi",
      "distance": "3.5km"
    },
    "payout": "KSh 350",
    "acceptedMessage": "Order Accepted! Navigating to Nairobi Grill House..."
  },
  "tabs": [
    "Home",
    "Deliveries",
    "Earnings",
    "Alerts",
    "Account"
  ]
};
const fallbackActiveDelivery: ActiveDeliveryPayload = {
  "sourceFiles": [
    "active_delivery_to_vendor/code.html",
    "active_delivery_to_vendor/screen.png"
  ],
  "order": {
    "code": "SKO-9231",
    "eta": "8 mins",
    "status": "Heading to Vendor",
    "progressLabel": "1/3",
    "progressPercent": 33
  },
  "mapUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAs-tToDMZNyAKiyj-qUhKyE3STVUsAmhVzgnhmnbSNz_QoAG2UyEhB4tqFCYUydzUAlyEaycFVVWF6YnvKjisGfHIoooSyYe7NLzHpX9tHEQNpu8mRw9VhioGOogPPVEwTrm8HENKmZ636KE3-FwcLZLziWusqfVaqqT3cQVfLfzW6exzQZkr2o8XRWuheQhobS98kHtLBEmo9YTqJ1NQVJAqLbIJR6Dn50RIv5nIw3H2ZERyBpnlB",
  "destinationLabel": "Nairobi Grill House",
  "vendor": {
    "name": "Nairobi Grill House",
    "address": "The Oval, Ring Road, Westlands",
    "badge": "TOP RATED",
    "prepTime": "12 min",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBaqSvjQRZGRAtlKXhowjv843Hnkf-7YMUVzMZecnfjEtuc4zXmVhyIKDZ25Ir9GrWCPv49D_8diwC5OIK3AigP3xlttihYSkhYt49PjsRkIUtKnm6TGUJU1ZB7MXhtB61UbNYxYSKfeL0s9zIfcIXF4ahAMNOxV96tvJFRNeOCKxBNrRTOpOZOQQYFSnOwwSOWmr_ZJwZQRdw1C8Iz8iOQerUBkFquGs2Cko8NVFbskU7Xw8OveMaK"
  },
  "arrived": false,
  "pickupConfirmed": false,
  "tabs": [
    "Home",
    "Deliveries",
    "Earnings",
    "Alerts",
    "Account"
  ]
};

type GenericPayload = Record<string, any>;
const fallbackRiderBatch: Record<string, GenericPayload> = {
  "welcome_to_sokoeats_rider": {
    "sourceFiles": [
      "welcome_to_sokoeats_rider/code.html",
      "welcome_to_sokoeats_rider/screen.png"
    ],
    "title": "Earn more with SokoEats",
    "subtitle": "Join Nairobi's most reliable delivery fleet and take control of your financial future.",
    "heroImageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAgdzl8yH4baSo2e9K0scCtDC1YBE8HE8qpZgs2UWdfoBlSDFrMJSYhj7DnFC19Q9mcoG0-D6vZX_Wb4mxn3YzoiNIdfxLACRmG68GsCfpGb4mDvlOlKdXLcsOmnwd4HwJ2gMpX8_5X6bfTsJw7z8a5LsLHAS6aY-xJrZB6eTVtP0XE7c96AyoYzI7InK3crmph78Sn7yQ2KJWXj4cyOyhS22b0cseCO64dhy3LVQZw0cee5t8EqWxa",
    "benefits": [
      {
        "icon": "schedule",
        "title": "Flexible hours",
        "body": "Work when you want, where you want."
      },
      {
        "icon": "payments",
        "title": "Weekly M-Pesa payouts",
        "body": "Get paid every Monday directly to your phone."
      },
      {
        "icon": "health_and_safety",
        "title": "Comprehensive insurance",
        "body": "We've got your back on every single delivery."
      }
    ],
    "actions": [
      "Get Started",
      "Log In"
    ],
    "footer": "Trusted Partners"
  },
  "personal_information": {
    "sourceFiles": [
      "personal_information/code.html",
      "personal_information/screen.png"
    ],
    "step": "Step 1 of 4",
    "title": "Personal Details",
    "subtitle": "Tell us about yourself",
    "helper": "Enter your details as they appear on your ID.",
    "fields": [
      {
        "id": "fullName",
        "label": "Full Name",
        "icon": "badge",
        "value": ""
      },
      {
        "id": "phoneNumber",
        "label": "Phone Number",
        "prefix": "+254",
        "icon": "phone_iphone",
        "value": ""
      },
      {
        "id": "city",
        "label": "Operating City",
        "value": "Nairobi",
        "options": [
          "Nairobi",
          "Mombasa"
        ]
      }
    ],
    "tip": "Having your ID or passport nearby will help speed up the background check in the next step.",
    "legal": "By tapping Next, you agree to our Privacy Policy"
  },
  "vehicle_verification": {
    "sourceFiles": [
      "vehicle_verification/code.html",
      "vehicle_verification/screen.png"
    ],
    "step": "Step 2 of 4",
    "title": "Vehicle Details",
    "progress": "2/4",
    "vehicleTypes": [
      {
        "id": "motorbike",
        "label": "Motorbike",
        "icon": "two_wheeler",
        "selected": true
      },
      {
        "id": "bicycle",
        "label": "Bicycle",
        "icon": "pedal_bike",
        "selected": false
      }
    ],
    "fields": [
      {
        "id": "make",
        "label": "Vehicle Make",
        "icon": "branding_watermark",
        "value": ""
      },
      {
        "id": "model",
        "label": "Model Name",
        "icon": "info",
        "value": ""
      },
      {
        "id": "plate",
        "label": "Number Plate",
        "icon": "license",
        "value": ""
      }
    ],
    "note": "Must match the registration documents provided."
  },
  "document_uploads": {
    "sourceFiles": [
      "document_uploads/code.html",
      "document_uploads/screen.png"
    ],
    "step": "Step 3 of 4",
    "progress": "75% Complete",
    "title": "Upload Documents",
    "subtitle": "Please provide clear photos of your valid identification and driving credentials.",
    "documents": [
      {
        "id": "nationalId",
        "title": "National ID",
        "body": "Front and back view required",
        "status": "Tap to Upload"
      },
      {
        "id": "drivingLicense",
        "title": "Driving License",
        "body": "Valid class A/B license",
        "status": "Tap to Upload"
      }
    ],
    "security": "Your documents are stored securely. We use industry-standard encryption to protect your private data and will never share it without your consent."
  },
  "application_success": {
    "sourceFiles": [
      "application_success/code.html",
      "application_success/screen.png"
    ],
    "title": "Application Submitted!",
    "step": "Step 4 of 4 Complete",
    "body": "We are reviewing your documents. This usually takes 24-48 hours. We'll notify you via SMS when you're ready to start earning.",
    "illustrationUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuC-YGwKLMzHIdqVvHkEvSuxhY2VFBnbSfEy1Tx5WSt1X65VUsSMCoRlvG03DsFB6r52WhAKm-ayDnQ_w08oPWi4D4uR_l_Sw5IpNb0tNgpazSZmw33-A-UFV8v2FyBF-IKD3NOyeu1kk-lLTAEQmGV2H_NjxBLY5OkkLuzE-QcL7b_Vt4xyXDtQjPWv8kfhSYlYE6gp_Gsbp0ZS0nBupTn2M8B21BClbTkDwa1PW6J9Qs8FGr99Z5Ec",
    "actions": [
      "Check Status",
      "Visit Help Center"
    ],
    "footer": "© 2024 Rider Onboarding. All rights reserved."
  },
  "rider_earnings_dashboard": {
    "sourceFiles": [
      "rider_earnings_dashboard/code.html",
      "rider_earnings_dashboard/screen.png"
    ],
    "riderName": "Juma",
    "title": "Earnings Dashboard",
    "balance": "KSh 4,200.50",
    "lastPayout": "Last payout: 2 days ago",
    "cards": [
      {
        "label": "Today",
        "value": "KSh 1,250",
        "icon": "calendar_today"
      },
      {
        "label": "This Week",
        "value": "KSh 8,400",
        "icon": "date_range"
      },
      {
        "label": "Deliveries",
        "value": "32",
        "icon": "delivery_dining"
      }
    ],
    "chart": {
      "title": "Activity (Last 7 Days)",
      "total": "KSh 21,450",
      "days": [
        {
          "day": "Mon",
          "value": 48
        },
        {
          "day": "Tue",
          "value": 58
        },
        {
          "day": "Wed",
          "value": 42
        },
        {
          "day": "Thu",
          "value": 76
        },
        {
          "day": "Fri",
          "value": 64
        },
        {
          "day": "Sat",
          "value": 92
        },
        {
          "day": "Sun",
          "value": 72
        }
      ]
    },
    "transactions": [
      {
        "label": "Delivery Order #4829",
        "time": "Today, 12:45 PM",
        "amount": "+KSh 350.00",
        "tone": "credit"
      },
      {
        "label": "M-Pesa Withdrawal",
        "time": "Yesterday, 08:20 PM",
        "amount": "-KSh 2,500.00",
        "tone": "debit"
      },
      {
        "label": "Delivery Order #4821",
        "time": "Yesterday, 05:30 PM",
        "amount": "+KSh 420.00",
        "tone": "credit"
      },
      {
        "label": "Weekend Quest Bonus",
        "time": "22 Oct, 10:00 AM",
        "amount": "+KSh 1,000.00",
        "tone": "credit"
      }
    ],
    "activity": "Live Activity: High Demand in CBD",
    "location": "Nairobi, Kenya",
    "mapImageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuDRp8ar5hd6Cv7DtkigRk9Gwu_lqnR0WA1Kmvt-evI2ONj6XyNEo7oE1O4H_NeNp8wz2e8WJrmrY6FvjuoaeOXL6U2iLRJnQYbSo-7oasfdWKB1HWer1DG3m9EwSQvP2Z2rRXJMUkfkS-aunoSQBIir4sHzGiqgc2McQ4hMKQ_K8hjNe2RsbMRLpLoe9_mBRuN_a9qVCi6VDKldNA68_miR01dk0o_R8i9WCwfBKwIndeXH0-v5I3ES"
  },
  "m_pesa_payout_confirmation": {
    "sourceFiles": [
      "m_pesa_payout_confirmation/code.html",
      "m_pesa_payout_confirmation/screen.png"
    ],
    "title": "Money in the bank!",
    "amount": "KSh 4,200.50",
    "status": "Payout Successful",
    "destination": "Sent to M-Pesa",
    "sentTo": "+254 712 345 678",
    "recipient": "Juma K.",
    "transactionId": "RCK892L0P",
    "dateTime": "Oct 24, 2023, 2:45 PM",
    "fee": "KSh 0.00",
    "feeLabel": "Free"
  },
  "rider_leaderboard": {
    "sourceFiles": [
      "rider_leaderboard/code.html",
      "rider_leaderboard/screen.png"
    ],
    "tabs": [
      "Weekly",
      "All Time"
    ],
    "podium": [
      {
        "rank": 2,
        "name": "Sarah W.",
        "deliveries": "142 Deliv.",
        "avatarUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBwMjcg6x0S_T4OAey6NGyLS2AGYgltIfDqIl1TUnWWMp2HkMhWGd5mQaKiIFXbvUt8h48mXT8ulajB3Vnp3HROLvRhmDqtIEPmQ0xe9FuUcKE7b0NKY96hHcz7oDMKSrfZQkGNJvQWqpxBz5qLYVoirCrwcGSEv_CHBp_z5b3cK5wQY2V3LmXWHC_kRMiFG3es_6sdBYPXVc2yn9oUjWyWMXuooLz-0VI0qr12JIrX5DuOpK-X8lFp"
      },
      {
        "rank": 1,
        "name": "Mwangi J.",
        "badge": "Speed Star",
        "deliveries": "156 Deliveries",
        "avatarUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAqhggCIjE608y-oDQkSbM2JyKWsTr_ehAYr83eRiKiLdkTW2sko2W9RlFqVRx3c04dL84jJcR1dhbKg6lwhmV5UJjr7bTyygiz2ZHKOEBpjjmXx14unVbhnwjKrdIVB-pFsOKmHP7q9-rBXvnfj92hRHMW9Hb_typ0lOqHtKgTEL4QnWfjkWIUKxFklNpIOEjyVfOYC2xyK5RrAxg6kULQMeCIkNC6OGXg5PtXyi9HrBvgw0_u3vTj"
      },
      {
        "rank": 3,
        "name": "Otieno P.",
        "deliveries": "138 Deliv.",
        "avatarUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAfNg1Y-FOz-npDdEbRw--Q6Alr17SMZN86nS37JphcE_xX22jmuuZavd-XKXw5b2fdTCh-iD4cx6dU2anDa2fOI3rPr--Qmfj65YBWEGzgfmqkIlNOPKhK-AZjupc8ToznaBC7-zOso-gk4D3qEmxGFTRP3KYYILdyXmKEdGMdywWIa7yZ4kqrDfIzVuYrWKvs4owNyJkkJ4GZ4MsnZOjeQISKkJs90ZOc-Clk2xS04iJACM2f3zOd"
      }
    ],
    "riders": [
      {
        "rank": 12,
        "name": "David K. (You)",
        "badge": "PRO",
        "quality": "Quality Score: 4.9 ★",
        "orders": 88,
        "verified": true
      },
      {
        "rank": 4,
        "name": "Jane M.",
        "quality": "Quality Score: 4.8 ★",
        "orders": 112
      },
      {
        "rank": 5,
        "name": "Kibet S.",
        "quality": "Quality Score: 4.7 ★",
        "orders": 105
      },
      {
        "rank": 6,
        "name": "Amani L.",
        "badge": "Elite",
        "quality": "Quality Score: 5.0 ★",
        "orders": 98
      }
    ],
    "encouragement": "Keep it up, David!",
    "target": "12 more deliveries to reach Rank 10",
    "weeklyEarnings": "KSh 12,450.00"
  },
  "rider_profile_ratings": {
    "sourceFiles": [
      "rider_profile_ratings/code.html",
      "rider_profile_ratings/screen.png"
    ],
    "rider": {
      "name": "Juma K.",
      "since": "Member since Oct 2021",
      "vehicle": "Honda Ace 125 (KMD 482L)",
      "rating": "4.85",
      "reviews": "1.2k+ reviews",
      "avatarUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBW4jErV9oNKhhTXnYF1_fvbD8aTXKmLfmaMFHKasqPPARMOiRzaOhiAgwjmVrKjbXdmNWLeGzk68Gb1LXWsz4vuBO_JqJEx8iQ7tgjxF7Arn8ZgYtQEBfPjv-LO4gATPeKU8lz5b_IxNjY5XTJnUSqnZAlb25jIWo798B5n_uo5DIBHy-glrU1U4eMtK-PqV5JaFugHj60QjAFi1Pdpc8HLZWZadPsk6MAPeMjRe9nztF5p9xXFTLg"
    },
    "stats": [
      {
        "label": "Success Rate",
        "value": "98%"
      },
      {
        "label": "Deliveries",
        "value": "3,420"
      }
    ],
    "ratingBreakdown": [
      {
        "stars": 5,
        "value": 84
      },
      {
        "stars": 4,
        "value": 11
      },
      {
        "stars": 3,
        "value": 3
      },
      {
        "stars": 2,
        "value": 1
      },
      {
        "stars": 1,
        "value": 1
      }
    ],
    "qualities": [
      {
        "label": "Timeliness",
        "value": "Exceptional"
      },
      {
        "label": "Professional",
        "value": "Top Rated"
      },
      {
        "label": "Order Care",
        "value": "Flawless"
      }
    ],
    "achievements": [
      "Speed Demon",
      "Customer Favorite",
      "Night Owl"
    ],
    "feedback": [
      {
        "customer": "Sarah W.",
        "initials": "S",
        "age": "2 days ago",
        "body": "Always on time! Juma is super professional and handles the food with great care."
      },
      {
        "customer": "Otieno P.",
        "initials": "O",
        "age": "1 week ago",
        "body": "Very polite and followed instructions perfectly. Even navigated the complex gate entry with no issues."
      }
    ]
  },
  "vendor_analytics_dashboard": {
    "sourceFiles": [
      "vendor_analytics_dashboard/code.html",
      "vendor_analytics_dashboard/screen.png"
    ],
    "title": "Analytics Overview",
    "subtitle": "Performance summary for Mama Njeri's Kitchen",
    "metrics": [
      {
        "label": "Total Sales",
        "value": "KSh 142,500",
        "delta": "12%",
        "direction": "up",
        "helper": "vs. KSh 127,230 last month"
      },
      {
        "label": "Total Orders",
        "value": "842",
        "delta": "5%",
        "direction": "up",
        "helper": "Last 30 days period"
      },
      {
        "label": "Avg Order Value",
        "value": "KSh 1,692",
        "delta": "2%",
        "direction": "down",
        "helper": "Optimization recommended"
      }
    ],
    "sales": {
      "title": "Sales Growth",
      "subtitle": "Daily revenue for the last 7 days",
      "filters": [
        "Last 7 Days",
        "This Month"
      ],
      "days": [
        {
          "day": "M",
          "value": 42
        },
        {
          "day": "T",
          "value": 66
        },
        {
          "day": "W",
          "value": 58
        },
        {
          "day": "T",
          "value": 74
        },
        {
          "day": "F",
          "value": 88
        },
        {
          "day": "S",
          "value": 72
        },
        {
          "day": "S",
          "value": 61
        }
      ]
    },
    "customers": {
      "returningPercent": 64,
      "returning": "Returning Customers (538)",
      "newCustomers": "New Customers (304)"
    },
    "peakHours": [
      "08-10",
      "12-14",
      "14-16",
      "18-20",
      "21-23",
      "00-06"
    ],
    "tip": "Tip: 18:00 - 20:00 is your busiest window. Increase kitchen staff during this time.",
    "popularItems": [
      {
        "name": "Nyama Choma",
        "sales": "342 Sales this week",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuChQCM3O79BVWVa8s50R1-5y8_NDls9Idiutix2WdMMMNVICZh6HafCdsfWWldtY0RETAkizKzuidVXX57fehtvDst6FeL7bLW7PI28xKTbQkfJKQjvB8sFO2VoUbHFvR0CRTv2BE0jpJP4fHXcKnwInnpweZFWsunt5UMZ1vbBe4DCqzjUKFuhi_BzdAVA2K-MpBCcKj2gZu6hNoldJXveLpg3YR4WApkFzSaZ-Z3U0vcAhUTxIpF6"
      },
      {
        "name": "Ugali Special",
        "sales": "218 Sales this week",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuCz65oF2hbTXcwXl3zaBcwo7izumMVbeeEkWwubtdVFkBi5sXoEnqBf2OqkBNaTnHSz9xc5lxcGFsM1_ojJbsfyLvOWsu7uyDsjaPcbz_HczVQ5vC7D5eR0vo7-ShnAikeqk2HtB8wBY7oCF9EbBSoxjuHJF-Kve6L2k3gl1TFGXSPhbHJ8vaEA3Kzc_IfQGMzTRs8YI30PCO9YF7mtNKy4Gk26z5McSzsbdATe8GgTbc7ao2g6ziWw"
      },
      {
        "name": "Swahili Samosas",
        "sales": "195 Sales this week",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuDd_pzw_is27p-wMiZsAY-PCcqO69Wi3kUFkueZ5rohsYKrgNpnfwuOXkHkJ_d2Tf0DX2PmcvVIF7t65ktNuGnDPpgGhG65M8I775XnVlz4dmmAq1_EWD6gzMN0lyQkvqiPy247eg_2d1OVZDZRjoQG2zluIqX3Fot5gPHHImNyX4T94AL7qD8FrlVNiTwxsHux7A9d1ENWRMJHEGrLzHlsmuFywYUc8-yoXKPEeIY2qxJkfsqmTokP"
      },
      {
        "name": "Fruit Platter",
        "sales": "104 Sales this week",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBoIxkY0M0vaCUYmhtfdCGjXI2sr1TSnRL-ylGix4iDyDKbqbuMC5q2ludNvJzLnpksCoxwy8MgDkhw41vZdkkclf_XqRTjV7s1F-PbUGLl4A8bh7wMfzr_Ront0l_rw_WZDIEihEAt9lzBbLYs5SVSjuwps3wdqTxgRhQLmaBEWk4MuQGZrdDu5-vNdKGbRzROM9tnphrt9zvBneyI9Tl_hyrT_1a8v661iovFRoj5bZxg54mDgFCS"
      }
    ]
  },
  "vendor_inventory_management": {
    "sourceFiles": [
      "vendor_inventory_management/code.html",
      "vendor_inventory_management/screen.png"
    ],
    "title": "Inventory Management",
    "alert": {
      "title": "Immediate Attention Required",
      "body": "3 items are below your minimum stock threshold.",
      "items": [
        "Fresh Spinach",
        "Goat Meat",
        "Charcoal (4kg)"
      ]
    },
    "filters": [
      "All",
      "Low Stock",
      "Out of Stock",
      "Food",
      "Groceries"
    ],
    "items": [
      {
        "id": "spinach-bundle",
        "name": "Fresh Spinach",
        "category": "Groceries • Bundle",
        "stock": "5 units",
        "numericStock": 5,
        "status": "Available",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuC2X-PiGJ_xRZahTACSKY9lYFFJUcHrZJtz-UODUXL43RTzPT0Sk9aIx19Huc79l_9yUivIBFBQs_7jACLtR87vG7RNXmAOq2iC-w0uOHnSlsKEmRrMdYZR52R2eupjR2cRsCTUziAHxZqD1dqIMO9ZwnMkIP5CThWP0R7T9dLya2mqsOMCqDthVva_GgNdLvf4OnOi49JtEHTJhkdkZxPvwnpJM1oWiVmgKy8CTtqsUgRGuzGtQJQu"
      },
      {
        "id": "maize-flour",
        "name": "Premium Maize Flour",
        "category": "Groceries • 2kg Bag",
        "stock": "42 units",
        "numericStock": 42,
        "status": "In Stock",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuA2LpSMayjtwFao0yRoDOCcW61czk8vbgnav3D3uZDKhnWOj2_QnmMXfxb2zW8bhCF6AwLTUwDl-YsAchgKrXnbHvfjFJwumnpjnnSU5LmfUbgTi4_aJLhv1ZE_XJLXbLSKuUCswP8dwp0HfDq7uvigmla19fX0NBcDHpfLAlqlVx16QXWvf6yEkirK5KJz8irpTkc4hzWLHzHWK8pDGlBVyHghnRuGcpjuc06YJcjkiWL-FKVdtM6o"
      },
      {
        "id": "goat-meat",
        "name": "Goat Meat",
        "category": "Food • per KG",
        "stock": "8.5 kg",
        "numericStock": 8.5,
        "status": "Low Stock",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuB778aTaH2LrsBjH1LryuIxqySSN6dPWh_w3i8-fUlm36x_M1-nu87Z-uyEu2VtziyzgADEx3KLk1vYaZRUl8oIfNkix3TMuIRzJEZXerUyjITjcNC80O7AbymTCoOvQLLj8I4OD_ALadWwsZ95Y54deys5XDMZx4re5-xl45Wy9_Wizb64PZGoRItfwl56jfUXGwNFFVrrE-XpY_lvQE8YeckCy3a5xuJBQjFpr9cxZ6-VM8GMco3k"
      },
      {
        "id": "charcoal-4kg",
        "name": "Charcoal (4kg)",
        "category": "Essentials • Bag",
        "stock": "0 units",
        "numericStock": 0,
        "status": "Out of Stock",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBUUVH2qf5LsN1SYaPhsLp_fIPR7NxGvZSHA_C3p9VttxrVOrRN_PtUMMPeVGpDzv_PXz-JNAjwviQGuaUpbMt8iB3f6A7p2loPri9bbGELXaTGgTfp1Xb6Ast1jBAnlxk0qx5W7-kRgb8lswgVkl8qIIh5Ecbcr4Y5pA-krGAt215-fedSUW5hOe4gAB-qr4MXfexibhwoESDtxwi3hAzWI4q-CViwoJcwNAS16M9fIfZWLqD4sod4"
      }
    ]
  }
};

async function sokoeatsApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error('Sokoeats mobile API request failed');
  return res.json() as Promise<T>;
}

function SourceLedger() {
  return (
    <View style={styles.sourceLedger} pointerEvents="none">
      {stitchFilesUsed.map((file) => (
        <Text key={file} style={styles.sourceLedgerText}>
          {file}
        </Text>
      ))}
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [activeChip, setActiveChip] = useState(chips[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mpesa');
  const [riderHome, setRiderHome] = useState<RiderHomePayload>(fallbackRiderHome);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDeliveryPayload>(fallbackActiveDelivery);
  const [riderBatch, setRiderBatch] = useState<Record<string, GenericPayload>>(fallbackRiderBatch);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 550,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const openScreen = (next: Screen) => {
    fade.setValue(0);
    setScreen(next);
    Animated.timing(fade, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  };

  const subtotal = useMemo(() => orderItems.reduce((sum, item) => sum + item.price, 0), []);
  const deliveryFee = 150;
  const serviceFee = 45;
  const discount = 250;
  const total = subtotal + deliveryFee + serviceFee - discount;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={screen === 'splash' ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <Animated.View style={[styles.root, { opacity: fade }]}>
        {screen === 'splash' && <SplashScreen onContinue={() => openScreen('onboarding')} />}
        {screen === 'onboarding' && <OnboardingScreen onNext={() => openScreen('home')} onSkip={() => openScreen('home')} />}
        {screen === 'home' && (
          <HomeScreen
            activeChip={activeChip}
            onChipChange={setActiveChip}
            onCheckout={() => openScreen('checkout')}
          />
        )}
        {screen === 'riderHome' && <RiderHomeScreen data={riderHome} onBack={() => openScreen('home')} onOnboarding={() => openScreen('riderOnboardingWelcome')} onEarnings={() => openScreen('riderEarnings')} onLeaderboard={() => openScreen('riderLeaderboard')} onProfile={() => openScreen('riderProfile')} onAccept={async () => { try { const next = await sokoeatsApi<{ riderHome: RiderHomePayload; delivery: ActiveDeliveryPayload }>(`/api/rider/requests/${riderHome.request.id}/accept`, { method: 'POST' }); setRiderHome(next.riderHome); setActiveDelivery(next.delivery); } catch {} openScreen('activeDelivery'); }} />}
        {screen === 'activeDelivery' && <ActiveDeliveryScreen data={activeDelivery} onBack={() => openScreen('riderHome')} onArrived={async () => { const next = await sokoeatsApi<{ delivery: ActiveDeliveryPayload }>(`/api/rider/deliveries/${activeDelivery.order.code}/arrived`, { method: 'POST' }).catch(() => null); if (next) setActiveDelivery(next.delivery); }} onPickup={async () => { const next = await sokoeatsApi<{ delivery: ActiveDeliveryPayload }>(`/api/rider/deliveries/${activeDelivery.order.code}/pickup`, { method: 'POST' }).catch(() => null); if (next) setActiveDelivery(next.delivery); }} />}
        {screen === 'riderOnboardingWelcome' && <RiderWelcomeScreen data={riderBatch.welcome_to_sokoeats_rider} onBack={() => openScreen('riderHome')} onNext={() => openScreen('riderPersonal')} />}
        {screen === 'riderPersonal' && <RiderFormScreen data={riderBatch.personal_information} onBack={() => openScreen('riderOnboardingWelcome')} onNext={() => openScreen('riderVehicle')} />}
        {screen === 'riderVehicle' && <RiderFormScreen data={riderBatch.vehicle_verification} onBack={() => openScreen('riderPersonal')} onNext={() => openScreen('riderDocuments')} />}
        {screen === 'riderDocuments' && <RiderDocumentsScreen data={riderBatch.document_uploads} onBack={() => openScreen('riderVehicle')} onSubmit={() => openScreen('riderApplicationSuccess')} />}
        {screen === 'riderApplicationSuccess' && <RiderSuccessScreen data={riderBatch.application_success} onBack={() => openScreen('riderHome')} />}
        {screen === 'riderEarnings' && <RiderEarningsScreen data={riderBatch.rider_earnings_dashboard} onBack={() => openScreen('riderHome')} onCashOut={async () => { const next = await sokoeatsApi<{ payout: GenericPayload }>('/api/rider/payouts', { method: 'POST' }).catch(() => null); if (next) setRiderBatch((prev) => ({ ...prev, m_pesa_payout_confirmation: next.payout })); openScreen('riderPayout'); }} />}
        {screen === 'riderPayout' && <RiderPayoutScreen data={riderBatch.m_pesa_payout_confirmation} onBack={() => openScreen('riderEarnings')} />}
        {screen === 'riderLeaderboard' && <RiderLeaderboardScreen data={riderBatch.rider_leaderboard} onBack={() => openScreen('riderHome')} />}
        {screen === 'riderProfile' && <RiderProfileScreen data={riderBatch.rider_profile_ratings} onBack={() => openScreen('riderHome')} />}
        {screen === 'checkout' && (
          <CheckoutScreen
            subtotal={subtotal}
            deliveryFee={deliveryFee}
            serviceFee={serviceFee}
            discount={discount}
            total={total}
            paymentMethod={paymentMethod}
            onPaymentChange={setPaymentMethod}
            onBack={() => openScreen('home')}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );

}
function SplashScreen({ onContinue }: { onContinue: () => void }) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1900, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -15] });

  return (
    <View style={styles.splashPage}>
      <View style={[styles.blob, styles.splashBlobOne]} />
      <View style={[styles.blob, styles.splashBlobTwo]} />
      <View style={styles.brandStack}>
        <View style={styles.logoTile}>
          <Text style={styles.logoIcon}>menu</Text>
        </View>
        <Text style={styles.splashBrand}>SokoEats</Text>
        <Text style={styles.splashTagline}>Everything You Need, Delivered.</Text>
      </View>

      <View style={styles.splashHeroWrap}>
        <Animated.View style={[styles.splashHeroFloat, { transform: [{ translateY }] }]}>
          <View style={styles.heroShadow} />
          <Image source={{ uri: images.splashRider }} style={styles.splashImage} />
          <View style={styles.fastBadge}>
            <View style={styles.fastIcon}>
              <Text style={styles.fastIconText}>bolt</Text>
            </View>
            <View>
              <Text style={styles.badgeLabel}>Hyper-Fast</Text>
              <Text style={styles.badgeSubLabel}>Across Nairobi</Text>
            </View>
          </View>
          <View style={styles.heartBadge}>
            <Text style={styles.heartBadgeText}>heart</Text>
          </View>
        </Animated.View>
      </View>

      <View style={styles.splashFooter}>
        <View style={styles.spinnerOuter}>
          <View style={styles.spinnerInner} />
        </View>
        <Text style={styles.loadingText}>Sourcing Freshness...</Text>
        <TouchableOpacity style={styles.softAction} onPress={onContinue} activeOpacity={0.85}>
          <Text style={styles.softActionText}>Launch SokoEats</Text>
        </TouchableOpacity>
        <View style={styles.kenyaTag}>
          <Text style={styles.kenyaText}>MADE WITH PRIDE IN KENYA</Text>
          <View style={styles.flagBars}>
            <View style={[styles.flagBar, { backgroundColor: '#000000' }]} />
            <View style={[styles.flagBar, { backgroundColor: '#BB0000' }]} />
            <View style={[styles.flagBar, { backgroundColor: '#006600' }]} />
          </View>
        </View>
      </View>
      <SourceLedger />
    </View>
  );
}

function OnboardingScreen({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <View style={styles.onboardingPage}>
      <View style={[styles.blob, styles.onboardingBlobOne]} />
      <View style={[styles.blob, styles.onboardingBlobTwo]} />
      <View style={styles.onboardingHeader}>
        <Text style={styles.topBrand}>SokoEats</Text>
        <TouchableOpacity onPress={onSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bentoGrid}>
        <View style={styles.bentoLarge}>
          <Image source={{ uri: images.pilau }} style={styles.coverImage} />
          <View style={styles.pill}>
            <Text style={styles.pillIcon}>fork</Text>
            <Text style={styles.pillText}>Nairobi's Finest</Text>
          </View>
        </View>
        <View style={styles.bentoColumn}>
          <Image source={{ uri: images.nyama }} style={styles.bentoSmallImage} />
          <Image source={{ uri: images.groceries }} style={styles.bentoSmallImage} />
        </View>
      </View>

      <View style={styles.onboardingCopy}>
        <Text style={styles.onboardingTitle}>
          Food from your <Text style={styles.primaryText}>favourite</Text> restaurants.
        </Text>
        <Text style={styles.onboardingSubtitle}>
          Groceries and shopping made easy. Everything you need, delivered with modern Kenyan warmth.
        </Text>
      </View>

      <View style={styles.onboardingControls}>
        <View style={styles.dots}>
          <View style={styles.dotActive} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={onNext} activeOpacity={0.86}>
          <Text style={styles.primaryButtonText}>Next</Text>
          <Text style={styles.buttonArrow}>arrow</Text>
        </TouchableOpacity>
      </View>
      <SourceLedger />
    </View>
  );
}

function HomeScreen({
  activeChip,
  onChipChange,
  onCheckout,
}: {
  activeChip: string;
  onChipChange: (chip: string) => void;
  onCheckout: () => void;
}) {
  return (
    <View style={styles.shell}>
      <View style={styles.homeHeader}>
        <View style={styles.headerProfileRow}>
          <Image source={{ uri: images.avatar }} style={styles.avatar} />
          <View>
            <Text style={styles.caption}>Good afternoon, Paul</Text>
            <View style={styles.locationRow}>
              <Text style={styles.locationIcon}>pin</Text>
              <Text style={styles.locationText}>Nairobi CBD</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.iconCircle}>
          <Text style={styles.iconText}>bell</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.searchCard}>
          <Text style={styles.searchIcon}>search</Text>
          <TextInput
            placeholder="Search food, shops, groceries or products"
            placeholderTextColor={colors.outline}
            style={styles.searchInput}
          />
          <Text style={styles.searchAction}>mic</Text>
          <Text style={styles.searchAction}>qr</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promoScroller}>
          <PromoBanner
            image={images.deliveryBanner}
            tone="primary"
            tag="WEEKEND SPECIAL"
            title="Free delivery this weekend"
            body="Order from any top restaurant and pay zero delivery fees."
          />
          <PromoBanner
            image={images.mpesaBanner}
            tone="secondary"
            tag="PARTNER OFFER"
            title="M-Pesa cashback offers"
            body="Get up to KES 500 back on your first 3 M-Pesa payments."
          />
        </ScrollView>

        <View style={styles.categoryGrid}>
          {categories.map((category) => (
            <View key={category.label} style={styles.categoryItem}>
              <View style={[styles.categoryIconBox, { backgroundColor: category.bg }]}>
                <Text style={[styles.categoryIconText, { color: category.fg }]}>{category.icon}</Text>
              </View>
              <Text style={styles.categoryLabel}>{category.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Kenyan Favourites</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {chips.map((chip) => (
              <Pressable
                key={chip}
                onPress={() => onChipChange(chip)}
                style={[styles.chip, activeChip === chip ? styles.chipActive : styles.chipIdle]}
              >
                <Text style={[styles.chipText, activeChip === chip ? styles.chipTextActive : styles.chipTextIdle]}>
                  {chip}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>Popular Near You</Text>
          <TouchableOpacity>
            <Text style={styles.viewAll}>View all arrow</Text>
          </TouchableOpacity>
        </View>

        {restaurants.map((restaurant) => (
          <RestaurantCard key={restaurant.name} restaurant={restaurant} onPress={onCheckout} />
        ))}
      </ScrollView>
      <BottomNav />
      <SourceLedger />
    </View>
  );
}


function RiderHomeScreen({ data, onBack, onAccept, onOnboarding, onEarnings, onLeaderboard, onProfile }: { data: RiderHomePayload; onBack: () => void; onAccept: () => void; onOnboarding: () => void; onEarnings: () => void; onLeaderboard: () => void; onProfile: () => void }) {
  return (
    <View style={styles.riderShell}>
      <View style={styles.riderTop}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}><Text style={styles.backButtonText}>back</Text></TouchableOpacity>
        <Text style={styles.riderBrand}>SokoEats Rider</Text>
        <View style={styles.onlinePill}><Text style={styles.onlinePillText}>{data.rider.status}</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.riderContent} showsVerticalScrollIndicator={false}>
        <View style={styles.riderStats}>
          <View style={styles.riderStat}><Text style={styles.upperLabel}>Active Status</Text><Text style={styles.riderStatValue}>Rider Online</Text></View>
          <View style={styles.riderStat}><Text style={styles.upperLabel}>Current Zone</Text><Text style={styles.riderStatValue}>{data.rider.zone}</Text></View>
          <View style={styles.riderStat}><Text style={styles.upperLabel}>Today's Earnings</Text><Text style={styles.riderStatValue}>{data.rider.earningsToday}</Text></View>
        </View>
        <View style={styles.riderQuickGrid}><TouchableOpacity style={styles.riderQuickButton} onPress={onOnboarding}><Text style={styles.riderQuickTitle}>Onboarding</Text><Text style={styles.riderQuickText}>Finish rider verification</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onEarnings}><Text style={styles.riderQuickTitle}>Earnings</Text><Text style={styles.riderQuickText}>Cash out to M-Pesa</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onLeaderboard}><Text style={styles.riderQuickTitle}>Leaderboard</Text><Text style={styles.riderQuickText}>Weekly rider rank</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onProfile}><Text style={styles.riderQuickTitle}>Profile</Text><Text style={styles.riderQuickText}>Ratings and reviews</Text></TouchableOpacity></View>
        <ImageBackground source={{ uri: data.heatmapUrl }} style={styles.riderMapCard} imageStyle={styles.riderMapImage}>
          <View style={styles.surgeBadge}><Text style={styles.surgeText}>{data.surge.label}</Text></View>
        </ImageBackground>
        <View style={styles.deliveryRequestCard}>
          <View style={styles.sectionHeadingRow}><Text style={styles.checkoutSectionTitle}>{data.request.title}</Text><Text style={styles.countdownText}>{data.request.countdownSeconds}s</Text></View>
          <View style={styles.deliveryPoint}><Text style={styles.locationIcon}>pin</Text><View><Text style={styles.vendorName}>Pickup: {data.request.pickup.name}</Text><Text style={styles.restaurantMeta}>{data.request.pickup.distance}</Text></View></View>
          <View style={styles.deliveryPoint}><Text style={styles.locationIcon}>flag</Text><View><Text style={styles.vendorName}>Drop-off: {data.request.dropoff.area}</Text><Text style={styles.restaurantMeta}>{data.request.dropoff.distance}</Text></View></View>
          <View style={styles.payoutRow}><Text style={styles.upperLabel}>Estimated Payout</Text><Text style={styles.totalAmount}>{data.request.payout}</Text></View>
          <TouchableOpacity style={styles.placeOrderButton} onPress={onAccept}><Text style={styles.placeOrderText}>{data.request.status === 'accepted' ? data.request.acceptedMessage : 'Accept Order'}</Text></TouchableOpacity>
        </View>
      </ScrollView>
      <BottomNav active="Deliveries" />
      <SourceLedger />
    </View>
  );
}

function ActiveDeliveryScreen({ data, onBack, onArrived, onPickup }: { data: ActiveDeliveryPayload; onBack: () => void; onArrived: () => void; onPickup: () => void }) {
  return (
    <View style={styles.riderShell}>
      <View style={styles.riderTop}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}><Text style={styles.backButtonText}>back</Text></TouchableOpacity>
        <Text style={styles.riderBrand}>SokoEats</Text>
        <View style={styles.onlinePill}><Text style={styles.onlinePillText}>ONLINE</Text></View>
      </View>
      <View style={styles.activeDeliveryHeader}>
        <View><Text style={styles.upperLabel}>Order #{data.order.code}</Text><Text style={styles.checkoutTitle}>ETA {data.order.eta}</Text></View>
        <Text style={styles.countdownText}>Status: {data.order.status}</Text>
      </View>
      <View style={styles.deliveryProgress}><View style={[styles.deliveryProgressFill, { width: `${data.order.progressPercent}%` as `${number}%` }]} /></View>
      <ImageBackground source={{ uri: data.mapUrl }} style={styles.fullMap} imageStyle={styles.fullMapImage}>
        <View style={styles.destinationMarker}><Text style={styles.destinationText}>{data.destinationLabel}</Text></View>
      </ImageBackground>
      <View style={styles.vendorPickupCard}>
        <Image source={{ uri: data.vendor.imageUrl }} style={styles.orderImage} />
        <View style={{ flex: 1 }}><Text style={styles.vendorName}>{data.vendor.name}</Text><Text style={styles.restaurantMeta}>{data.vendor.address}</Text><View style={styles.restaurantStats}><Text style={styles.timeText}>{data.vendor.badge}</Text><Text style={styles.statText}>Prep time: {data.vendor.prepTime}</Text></View></View>
        <TouchableOpacity style={styles.iconCircle}><Text style={styles.iconText}>call</Text></TouchableOpacity>
      </View>
      <View style={styles.placeOrderBar}>
        <TouchableOpacity style={styles.paymentOption} onPress={onArrived}><Text style={styles.paymentName}>{data.arrived ? 'Arrived at Vendor' : 'I have Arrived'}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.placeOrderButton, !data.arrived && styles.disabledButton]} disabled={!data.arrived} onPress={onPickup}><Text style={styles.placeOrderText}>{data.pickupConfirmed ? 'Pickup Confirmed' : 'Confirm Pickup'}</Text></TouchableOpacity>
      </View>
      <SourceLedger />
    </View>
  );
}


function RiderScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={styles.riderTop}><TouchableOpacity style={styles.backButton} onPress={onBack}><Text style={styles.backButtonText}>back</Text></TouchableOpacity><Text style={styles.riderBrand}>{title}</Text><View style={styles.onlinePill}><Text style={styles.onlinePillText}>ONLINE</Text></View></View>;
}

function RiderWelcomeScreen({ data, onBack, onNext }: { data: GenericPayload; onBack: () => void; onNext: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Rider Onboarding" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Image source={{ uri: data.heroImageUrl }} style={styles.riderHeroImage} /><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.subtitle}</Text>{data.benefits.map((benefit: GenericPayload) => <View style={styles.onboardingInfoRow} key={benefit.title}><Text style={styles.locationIcon}>{benefit.icon}</Text><View><Text style={styles.vendorName}>{benefit.title}</Text><Text style={styles.restaurantMeta}>{benefit.body}</Text></View></View>)}<TouchableOpacity style={styles.placeOrderButton} onPress={onNext}><Text style={styles.placeOrderText}>Get Started</Text></TouchableOpacity><Text style={styles.secureText}>{data.footer}</Text></ScrollView><SourceLedger /></View>;
}

function RiderFormScreen({ data, onBack, onNext }: { data: GenericPayload; onBack: () => void; onNext: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Rider Onboarding" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Text style={styles.upperLabel}>{data.step}</Text><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.subtitle || data.progress}</Text>{data.vehicleTypes && <View style={styles.riderQuickGrid}>{data.vehicleTypes.map((type: GenericPayload) => <View style={[styles.riderQuickButton, type.selected && styles.riderQuickButtonActive]} key={type.id}><Text style={styles.riderQuickTitle}>{type.label}</Text></View>)}</View>}{data.fields.map((field: GenericPayload) => <View style={styles.formFieldCard} key={field.id}><Text style={styles.upperLabel}>{field.label}</Text><TextInput style={styles.formFieldInput} placeholder={field.prefix ? String(field.prefix) + ' 712 345 678' : field.value || field.label} placeholderTextColor={colors.outline} /></View>)}{data.tip || data.note ? <View style={styles.smsCard}><Text style={styles.smsBody}>{data.tip || data.note}</Text></View> : null}<TouchableOpacity style={styles.placeOrderButton} onPress={onNext}><Text style={styles.placeOrderText}>Next Step</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}

function RiderDocumentsScreen({ data, onBack, onSubmit }: { data: GenericPayload; onBack: () => void; onSubmit: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Rider Onboarding" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Text style={styles.upperLabel}>{data.step} - {data.progress}</Text><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.subtitle}</Text>{data.documents.map((doc: GenericPayload) => <View style={styles.uploadCard} key={doc.id}><View><Text style={styles.vendorName}>{doc.title}</Text><Text style={styles.restaurantMeta}>{doc.body}</Text></View><Text style={styles.changeText}>{doc.status}</Text></View>)}<View style={styles.smsCard}><Text style={styles.smsBody}>{data.security}</Text></View><TouchableOpacity style={styles.placeOrderButton} onPress={onSubmit}><Text style={styles.placeOrderText}>Submit Application</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}

function RiderSuccessScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Application Success" onBack={onBack} /><View style={[styles.riderContent, styles.centerPanel]}><Image source={{ uri: data.illustrationUrl }} style={styles.successImage} /><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.upperLabel}>{data.step}</Text><Text style={styles.checkoutSubtitle}>{data.body}</Text><TouchableOpacity style={styles.placeOrderButton} onPress={onBack}><Text style={styles.placeOrderText}>Check Status</Text></TouchableOpacity><Text style={styles.secureText}>{data.footer}</Text></View><SourceLedger /></View>;
}

function RiderEarningsScreen({ data, onBack, onCashOut }: { data: GenericPayload; onBack: () => void; onCashOut: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Earnings" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Text style={styles.checkoutSubtitle}>Habari, {data.riderName}!</Text><Text style={styles.checkoutTitle}>{data.title}</Text><View style={styles.balanceCard}><Text style={styles.upperLabel}>Available Balance</Text><Text style={styles.balanceText}>{data.balance}</Text><Text style={styles.restaurantMeta}>{data.lastPayout}</Text><TouchableOpacity style={styles.primaryButton} onPress={onCashOut}><Text style={styles.primaryButtonText}>Cash Out</Text></TouchableOpacity></View><View style={styles.riderStats}>{data.cards.map((card: GenericPayload) => <View style={styles.riderStat} key={card.label}><Text style={styles.upperLabel}>{card.label}</Text><Text style={styles.riderStatValue}>{card.value}</Text></View>)}</View><View style={styles.deliveryRequestCard}><Text style={styles.vendorName}>{data.chart.title}</Text><Text style={styles.restaurantMeta}>Total: {data.chart.total}</Text><View style={styles.mobileChart}>{data.chart.days.map((day: GenericPayload) => <View style={styles.mobileChartBar} key={day.day + day.value}><View style={[styles.mobileChartFill, { height: String(day.value) + '%' as any }]} /><Text style={styles.categoryLabel}>{day.day}</Text></View>)}</View></View>{data.transactions.map((tx: GenericPayload) => <View style={styles.priceLine} key={tx.label}><View><Text style={styles.vendorName}>{tx.label}</Text><Text style={styles.restaurantMeta}>{tx.time}</Text></View><Text style={[styles.priceValue, tx.tone === 'credit' && styles.discountText]}>{tx.amount}</Text></View>)}<ImageBackground source={{ uri: data.mapImageUrl }} style={styles.riderMiniMap} imageStyle={styles.riderMapImage}><Text style={styles.surgeText}>{data.activity}</Text><Text style={styles.secureText}>{data.location}</Text></ImageBackground></ScrollView><BottomNav active="Earnings" /><SourceLedger /></View>;
}

function RiderPayoutScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.status} onBack={onBack} /><View style={[styles.riderContent, styles.centerPanel]}><Text style={styles.successIcon}>check_circle</Text><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.balanceText}>{data.amount}</Text>{[['Sent to', data.sentTo], ['Recipient', data.recipient], ['Transaction ID', data.transactionId], ['Date & Time', data.dateTime], ['Fee', String(data.fee) + ' ' + String(data.feeLabel)]].map(([label, value]) => <View style={styles.priceLine} key={label}><Text style={styles.priceLabel}>{label}</Text><Text style={styles.priceValue}>{value}</Text></View>)}<TouchableOpacity style={styles.primaryButton}><Text style={styles.primaryButtonText}>Share Receipt</Text></TouchableOpacity><TouchableOpacity style={styles.placeOrderButton} onPress={onBack}><Text style={styles.placeOrderText}>Back to Dashboard</Text></TouchableOpacity></View><BottomNav active="Earnings" /><SourceLedger /></View>;
}

function RiderLeaderboardScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Leaderboard" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.tabsRow}>{data.tabs.map((tab: string, index: number) => <Text style={[styles.tabPill, index === 0 && styles.tabPillActive]} key={tab}>{tab}</Text>)}</View><View style={styles.podium}>{data.podium.map((rider: GenericPayload) => <View style={styles.podiumCard} key={rider.name}><Image source={{ uri: rider.avatarUrl }} style={styles.avatar} /><Text style={styles.totalAmount}>{rider.rank}</Text><Text style={styles.vendorName}>{rider.name}</Text><Text style={styles.restaurantMeta}>{rider.badge || rider.deliveries}</Text></View>)}</View><Text style={styles.checkoutSectionTitle}>Top Riders</Text>{data.riders.map((rider: GenericPayload) => <View style={styles.leaderRow} key={rider.name}><Text style={styles.totalAmount}>{rider.rank}</Text><View style={{ flex: 1 }}><Text style={styles.vendorName}>{rider.name} {rider.badge || ''}</Text><Text style={styles.restaurantMeta}>{rider.quality}</Text></View><Text style={styles.priceValue}>{rider.orders}</Text></View>)}<View style={styles.smsCard}><Text style={styles.vendorName}>{data.encouragement}</Text><Text style={styles.smsBody}>{data.target}</Text><Text style={styles.totalAmount}>{data.weeklyEarnings}</Text></View></ScrollView><BottomNav active="Earnings" /><SourceLedger /></View>;
}

function RiderProfileScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Rider Profile" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.profileHero}><Image source={{ uri: data.rider.avatarUrl }} style={styles.profileAvatar} /><Text style={styles.checkoutTitle}>{data.rider.name}</Text><Text style={styles.restaurantMeta}>{data.rider.since}</Text><Text style={styles.restaurantMeta}>{data.rider.vehicle}</Text><Text style={styles.balanceText}>{data.rider.rating}</Text><Text style={styles.upperLabel}>{data.rider.reviews}</Text></View><View style={styles.riderStats}>{data.stats.map((stat: GenericPayload) => <View style={styles.riderStat} key={stat.label}><Text style={styles.riderStatValue}>{stat.value}</Text><Text style={styles.upperLabel}>{stat.label}</Text></View>)}</View><View style={styles.deliveryRequestCard}><Text style={styles.vendorName}>Ratings Breakdown</Text>{data.ratingBreakdown.map((row: GenericPayload) => <View style={styles.ratingLine} key={row.stars}><Text>{row.stars}</Text><View style={styles.deliveryProgress}><View style={[styles.deliveryProgressFill, { width: String(row.value) + '%' as any }]} /></View></View>)}</View><View style={styles.riderQuickGrid}>{data.qualities.map((item: GenericPayload) => <View style={styles.riderQuickButton} key={item.label}><Text style={styles.riderQuickTitle}>{item.label}</Text><Text style={styles.riderQuickText}>{item.value}</Text></View>)}</View><Text style={styles.checkoutSectionTitle}>Achievements</Text><View style={styles.tabsRow}>{data.achievements.map((item: string) => <Text style={styles.tabPillActive} key={item}>{item}</Text>)}</View><Text style={styles.checkoutSectionTitle}>Recent Feedback</Text>{data.feedback.map((entry: GenericPayload) => <View style={styles.uploadCard} key={entry.customer}><Text style={styles.avatarInitial}>{entry.initials}</Text><View style={{ flex: 1 }}><Text style={styles.vendorName}>{entry.customer}</Text><Text style={styles.restaurantMeta}>{entry.age}</Text><Text style={styles.smsBody}>{entry.body}</Text></View></View>)}</ScrollView><BottomNav active="Account" /><SourceLedger /></View>;
}

function PromoBanner({
  image,
  tone,
  tag,
  title,
  body,
}: {
  image: string;
  tone: 'primary' | 'secondary';
  tag: string;
  title: string;
  body: string;
}) {
  return (
    <ImageBackground source={{ uri: image }} style={styles.promoCard} imageStyle={styles.promoImage}>
      <View style={[styles.promoOverlay, tone === 'primary' ? styles.primaryOverlay : styles.secondaryOverlay]}>
        <Text style={[styles.promoTag, tone === 'primary' ? styles.primaryPromoTag : styles.secondaryPromoTag]}>
          {tag}
        </Text>
        <Text style={styles.promoTitle}>{title}</Text>
        <Text style={styles.promoBody}>{body}</Text>
      </View>
    </ImageBackground>
  );
}

function RestaurantCard({
  restaurant,
  onPress,
}: {
  restaurant: (typeof restaurants)[number];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.restaurantCard} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.restaurantImageWrap}>
        <Image source={{ uri: restaurant.image }} style={styles.restaurantImage} />
        <View style={styles.ratingBadge}>
          <Text style={styles.star}>star</Text>
          <Text style={styles.ratingText}>{restaurant.rating}</Text>
        </View>
      </View>
      <View style={styles.restaurantBody}>
        <View style={styles.restaurantTopLine}>
          <View style={styles.restaurantNameBlock}>
            <Text style={styles.restaurantName}>{restaurant.name}</Text>
            <Text style={styles.restaurantMeta}>{restaurant.meta}</Text>
          </View>
          <View style={styles.timeBadge}>
            <Text style={styles.timeText}>{restaurant.time}</Text>
          </View>
        </View>
        <View style={styles.restaurantStats}>
          <Text style={styles.statText}>delivery {restaurant.delivery}</Text>
          <Text style={styles.statText}>payments {restaurant.minimum}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function BottomNav({ active = 'Home' }: { active?: string } = {}) {
  const tabs = active === 'Deliveries'
    ? [['home', 'Home'], ['bike', 'Deliveries'], ['cash', 'Earnings'], ['bell', 'Alerts'], ['person', 'Account']]
    : [['home', 'Home'], ['grid', 'Categories'], ['receipt', 'Orders'], ['heart', 'Favourites'], ['person', 'Account']];

  return (
    <View style={styles.bottomNav}>
      {tabs.map(([icon, label]) => (
        <View key={label} style={[styles.navItem, label === active && styles.navItemActive]}>
          <Text style={[styles.navIcon, label === active && styles.navIconActive]}>{icon}</Text>
          <Text style={[styles.navLabel, label === active && styles.navLabelActive]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function CheckoutScreen({
  subtotal,
  deliveryFee,
  serviceFee,
  discount,
  total,
  paymentMethod,
  onPaymentChange,
  onBack,
}: {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  onPaymentChange: (method: PaymentMethod) => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.checkoutShell}>
      <View style={styles.checkoutHeader}>
        <View style={styles.checkoutHeaderLeft}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>back</Text>
          </TouchableOpacity>
          <Text style={styles.checkoutBrand}>SokoEats</Text>
        </View>
        <View style={styles.checkoutHeaderRight}>
          <Text style={styles.checkoutBell}>bell</Text>
          <Image source={{ uri: images.checkoutAvatar }} style={styles.checkoutAvatar} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.checkoutContent} showsVerticalScrollIndicator={false}>
        <View style={styles.checkoutIntro}>
          <Text style={styles.checkoutTitle}>Checkout</Text>
          <Text style={styles.checkoutSubtitle}>Review your order from Nairobi Grill House</Text>
        </View>

        <View style={styles.premiumCard}>
          <View style={styles.addressTop}>
            <View style={styles.addressTitleRow}>
              <View style={styles.addressIcon}>
                <Text style={styles.addressIconText}>pin</Text>
              </View>
              <View>
                <Text style={styles.upperLabel}>Delivery Address</Text>
                <Text style={styles.addressName}>Home - Nairobi CBD</Text>
              </View>
            </View>
            <TouchableOpacity>
              <Text style={styles.changeText}>CHANGE</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.addressDetail}>
            <Text style={styles.addressDetailText}>Apartment 4B, Central Business District, Nairobi</Text>
          </View>
        </View>

        <Text style={styles.checkoutSectionTitle}>Order Review</Text>
        <View style={styles.orderCard}>
          <View style={styles.vendorRow}>
            <Image source={{ uri: images.checkoutMeal }} style={styles.orderImage} />
            <View>
              <Text style={styles.vendorName}>Nairobi Grill House</Text>
              <Text style={styles.checkoutSubtitle}>2.4 km away - 25-35 mins</Text>
            </View>
          </View>
          <View style={styles.orderItems}>
            {orderItems.map((item) => (
              <View key={item.name} style={styles.orderItem}>
                <View style={styles.orderItemLeft}>
                  <Text style={styles.quantityBadge}>{item.quantity}</Text>
                  <View style={styles.orderItemTextBlock}>
                    <Text style={styles.orderItemName}>{item.name}</Text>
                    {!!item.note && <Text style={styles.orderNote}>{item.note}</Text>}
                  </View>
                </View>
                <Text style={styles.orderPrice}>{money(item.price)}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.paymentTitle}>Payment Method</Text>
        <PaymentOption
          active={paymentMethod === 'mpesa'}
          title="M-Pesa STK Push"
          subtitle="Pay instantly via mobile money"
          icon="M"
          mpesa
          onPress={() => onPaymentChange('mpesa')}
        />
        <PaymentOption
          active={paymentMethod === 'card'}
          title="Credit/Debit Card"
          subtitle="Visa, Mastercard, Amex"
          icon="card"
          onPress={() => onPaymentChange('card')}
        />

        <View style={styles.smsCard}>
          <View style={styles.smsTitleRow}>
            <Text style={styles.smsIcon}>sms</Text>
            <Text style={styles.smsTitle}>Order Updates</Text>
          </View>
          <Text style={styles.smsBody}>Confirm your mobile number to receive real-time delivery tracking via SMS.</Text>
          <View style={styles.phoneInputWrap}>
            <Text style={styles.countryCode}>+254</Text>
            <TextInput style={styles.phoneInput} keyboardType="phone-pad" defaultValue="712 345 678" />
          </View>
        </View>

        <View style={styles.breakdownCard}>
          <PriceLine label="Subtotal" value={money(subtotal)} />
          <PriceLine label="Delivery fee" value={money(deliveryFee)} />
          <PriceLine label="Service fee" value={money(serviceFee)} />
          <PriceLine label="Discount (Promo: SOKO25)" value={`-${money(discount)}`} discount />
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>{money(total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.placeOrderBar}>
        <TouchableOpacity style={styles.placeOrderButton} activeOpacity={0.86}>
          <Text style={styles.placeOrderIcon}>bag</Text>
          <Text style={styles.placeOrderText}>Place Order</Text>
        </TouchableOpacity>
        <Text style={styles.secureText}>lock Secure payment powered by SokoPay</Text>
      </View>
      <SourceLedger />
    </View>
  );
}

function PaymentOption({
  active,
  title,
  subtitle,
  icon,
  onPress,
  mpesa,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  icon: string;
  onPress: () => void;
  mpesa?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.paymentOption, active && styles.paymentOptionActive]} onPress={onPress}>
      <View style={styles.paymentLeft}>
        <View style={[styles.paymentIcon, mpesa ? styles.mpesaIcon : styles.cardIcon]}>
          <Text style={[styles.paymentIconText, mpesa && styles.mpesaIconText]}>{icon}</Text>
        </View>
        <View style={styles.paymentCopy}>
          <Text style={styles.paymentName}>{title}</Text>
          <Text style={styles.paymentSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>{active && <View style={styles.radioInner} />}</View>
    </TouchableOpacity>
  );
}

function PriceLine({ label, value, discount }: { label: string; value: string; discount?: boolean }) {
  return (
    <View style={styles.priceLine}>
      <Text style={[styles.priceLabel, discount && styles.discountText]}>{label}</Text>
      <Text style={[styles.priceValue, discount && styles.discountText]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  root: {
    flex: 1,
  },
  sourceLedger: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  sourceLedgerText: {
    color: 'transparent',
    fontSize: 1,
  },
  blob: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.28,
  },
  splashPage: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 28,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
  },
  splashBlobOne: {
    top: -115,
    left: -115,
    backgroundColor: colors.primaryFixed,
  },
  splashBlobTwo: {
    bottom: -120,
    right: -115,
    backgroundColor: colors.secondaryFixed,
  },
  brandStack: {
    alignItems: 'center',
    marginTop: 22,
  },
  logoTile: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '6deg' }],
    shadowColor: '#2d3446',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
  logoIcon: {
    color: colors.onPrimaryContainer,
    fontSize: 22,
    fontWeight: '900',
  },
  splashBrand: {
    marginTop: 16,
    fontSize: 40,
    lineHeight: 48,
    color: colors.primary,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  splashTagline: {
    marginTop: 8,
    maxWidth: 290,
    textAlign: 'center',
    color: colors.onSurfaceVariant,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '500',
  },
  splashHeroWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashHeroFloat: {
    width: 264,
    height: 336,
  },
  heroShadow: {
    position: 'absolute',
    bottom: -20,
    left: 40,
    right: 40,
    height: 16,
    borderRadius: 30,
    backgroundColor: '#000',
    opacity: 0.06,
  },
  splashImage: {
    width: 256,
    height: 320,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    backgroundColor: colors.surfaceContainerHigh,
  },
  fastBadge: {
    position: 'absolute',
    left: 22,
    right: 30,
    bottom: 34,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fastIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fastIconText: {
    color: colors.onSecondaryContainer,
    fontWeight: '900',
    fontSize: 11,
  },
  badgeLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.onSurface,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  badgeSubLabel: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
  },
  heartBadge: {
    position: 'absolute',
    top: -6,
    right: -4,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tertiaryFixed,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '12deg' }],
  },
  heartBadgeText: {
    color: colors.onTertiaryFixed,
    fontSize: 11,
    fontWeight: '900',
  },
  splashFooter: {
    alignItems: 'center',
    width: '100%',
  },
  spinnerOuter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: '#ffd8b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 4,
    borderColor: colors.primary,
    borderTopColor: 'transparent',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  softAction: {
    marginTop: 22,
    minWidth: 220,
    borderRadius: 16,
    backgroundColor: colors.primaryContainer,
    paddingVertical: 14,
    alignItems: 'center',
  },
  softActionText: {
    color: colors.onPrimaryContainer,
    fontSize: 16,
    fontWeight: '800',
  },
  kenyaTag: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  kenyaText: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(86,67,52,0.65)',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  flagBars: {
    marginLeft: 8,
    flexDirection: 'row',
  },
  flagBar: {
    width: 4,
    height: 14,
    marginLeft: 2,
  },
  onboardingPage: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  onboardingBlobOne: {
    top: -80,
    right: -140,
    backgroundColor: colors.primaryContainer,
  },
  onboardingBlobTwo: {
    bottom: -120,
    left: -110,
    backgroundColor: colors.secondaryContainer,
  },
  onboardingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  topBrand: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  skipButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  skipText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bentoGrid: {
    flex: 1,
    minHeight: 360,
    flexDirection: 'row',
    marginBottom: 24,
  },
  bentoLarge: {
    flex: 1.45,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerHigh,
    marginRight: 14,
    shadowColor: '#2d3446',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 3,
  },
  bentoColumn: {
    flex: 1,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  bentoSmallImage: {
    flex: 1,
    width: '100%',
    borderRadius: 24,
    backgroundColor: colors.surfaceContainerHigh,
    marginBottom: 14,
  },
  pill: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillIcon: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    marginRight: 7,
  },
  pillText: {
    color: colors.onSurface,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  onboardingCopy: {
    alignItems: 'center',
    marginBottom: 28,
  },
  onboardingTitle: {
    textAlign: 'center',
    color: colors.onSurface,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  primaryText: {
    color: colors.primary,
  },
  onboardingSubtitle: {
    marginTop: 14,
    paddingHorizontal: 8,
    textAlign: 'center',
    color: colors.onSurfaceVariant,
    fontSize: 16,
    lineHeight: 24,
  },
  onboardingControls: {
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  dotActive: {
    width: 32,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginHorizontal: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.outlineVariant,
    marginHorizontal: 4,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginRight: 10,
  },
  buttonArrow: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  homeHeader: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    zIndex: 10,
  },
  headerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: colors.primaryContainer,
    marginRight: 12,
  },
  caption: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  locationRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    marginRight: 5,
  },
  locationText: {
    color: colors.onSurface,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 12,
  },
  homeContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 104,
  },
  searchCard: {
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    shadowColor: '#2d3446',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 2,
  },
  searchIcon: {
    color: colors.outline,
    fontWeight: '900',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
  },
  searchAction: {
    marginLeft: 12,
    color: colors.primary,
    fontWeight: '900',
    fontSize: 12,
  },
  promoScroller: {
    paddingTop: 28,
    paddingBottom: 4,
  },
  promoCard: {
    width: 322,
    height: 176,
    borderRadius: 20,
    overflow: 'hidden',
    marginRight: 16,
    backgroundColor: colors.surfaceContainerHigh,
  },
  promoImage: {
    borderRadius: 20,
  },
  promoOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  primaryOverlay: {
    backgroundColor: 'rgba(144,77,0,0.82)',
  },
  secondaryOverlay: {
    backgroundColor: 'rgba(0,109,55,0.78)',
  },
  promoTag: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 9,
  },
  primaryPromoTag: {
    backgroundColor: colors.tertiaryFixedDim,
    color: colors.onTertiaryFixed,
  },
  secondaryPromoTag: {
    backgroundColor: colors.secondaryFixed,
    color: colors.onSecondaryFixed,
  },
  promoTitle: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    maxWidth: 240,
  },
  promoBody: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 220,
  },
  categoryGrid: {
    marginTop: 26,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryItem: {
    width: '18.5%',
    alignItems: 'center',
  },
  categoryIconBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconText: {
    fontSize: 12,
    fontWeight: '900',
  },
  categoryLabel: {
    marginTop: 8,
    color: colors.onSurfaceVariant,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionBlock: {
    marginTop: 34,
  },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
  },
  chipsRow: {
    paddingTop: 16,
    paddingBottom: 4,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 10,
    marginRight: 12,
  },
  chipActive: {
    backgroundColor: colors.primaryContainer,
  },
  chipIdle: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: colors.onPrimaryContainer,
  },
  chipTextIdle: {
    color: colors.onSurfaceVariant,
  },
  sectionHeadingRow: {
    marginTop: 34,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewAll: {
    color: colors.primary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  restaurantCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(221,228,230,0.7)',
    marginBottom: 20,
    shadowColor: '#2d3446',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 2,
  },
  restaurantImageWrap: {
    height: 194,
  },
  restaurantImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceContainerHigh,
  },
  ratingBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  star: {
    color: colors.tertiaryFixedDim,
    fontSize: 10,
    fontWeight: '900',
    marginRight: 4,
  },
  ratingText: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '800',
  },
  restaurantBody: {
    padding: 16,
  },
  restaurantTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  restaurantNameBlock: {
    flex: 1,
    paddingRight: 10,
  },
  restaurantName: {
    color: colors.onSurface,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  restaurantMeta: {
    marginTop: 3,
    color: colors.outline,
    fontSize: 14,
    lineHeight: 20,
  },
  timeBadge: {
    borderRadius: 8,
    backgroundColor: 'rgba(107,254,156,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  timeText: {
    color: colors.onSecondaryContainer,
    fontSize: 10,
    fontWeight: '800',
  },
  restaurantStats: {
    marginTop: 12,
    flexDirection: 'row',
  },
  statText: {
    marginRight: 18,
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 76,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#2d3446',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 9,
  },
  navItem: {
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  navItemActive: {
    borderRadius: 999,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 14,
  },
  navIcon: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
  },
  navIconActive: {
    color: colors.onPrimaryContainer,
  },
  navLabel: {
    marginTop: 2,
    color: colors.onSurfaceVariant,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  navLabelActive: {
    color: colors.onPrimaryContainer,
  },
  checkoutShell: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  checkoutHeader: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  checkoutHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  checkoutBrand: {
    color: colors.primary,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '900',
  },
  checkoutHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkoutBell: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    marginRight: 12,
  },
  checkoutAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: colors.primaryContainer,
  },
  checkoutContent: {
    paddingHorizontal: 20,
    paddingBottom: 156,
  },
  checkoutIntro: {
    marginTop: 8,
    marginBottom: 28,
  },
  checkoutTitle: {
    color: colors.onBackground,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  checkoutSubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  premiumCard: {
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#2d3446',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  addressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  addressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  addressIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addressIconText: {
    color: colors.primary,
    fontWeight: '900',
  },
  upperLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  addressName: {
    color: colors.onSurface,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
  },
  changeText: {
    color: colors.primary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  addressDetail: {
    borderRadius: 10,
    backgroundColor: colors.surfaceContainer,
    padding: 12,
  },
  addressDetailText: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 20,
  },
  checkoutSectionTitle: {
    color: colors.onBackground,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    marginBottom: 14,
  },
  orderCard: {
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerLowest,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: '#2d3446',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  vendorRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    marginRight: 14,
    backgroundColor: colors.surfaceContainerHigh,
  },
  vendorName: {
    color: colors.onSurface,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '900',
  },
  orderItems: {
    padding: 16,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderItemLeft: {
    flex: 1,
    flexDirection: 'row',
    paddingRight: 12,
  },
  quantityBadge: {
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: colors.secondaryContainer,
    color: colors.onSecondaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    marginRight: 12,
    marginTop: 2,
  },
  orderItemTextBlock: {
    flex: 1,
  },
  orderItemName: {
    color: colors.onSurface,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  orderNote: {
    marginTop: 2,
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  orderPrice: {
    color: colors.onBackground,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  paymentTitle: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  paymentOption: {
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#2d3446',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  paymentOptionActive: {
    borderColor: colors.primary,
  },
  paymentLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  mpesaIcon: {
    backgroundColor: '#42a83c',
  },
  cardIcon: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  paymentIconText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900',
  },
  mpesaIconText: {
    color: '#fff',
    fontSize: 20,
    fontStyle: 'italic',
  },
  paymentCopy: {
    flex: 1,
  },
  paymentName: {
    color: colors.onSurface,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  paymentSubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  smsCard: {
    borderRadius: 16,
    backgroundColor: colors.primaryFixed,
    padding: 16,
    marginTop: 12,
    marginBottom: 24,
    shadowColor: '#2d3446',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  smsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  smsIcon: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    marginRight: 10,
  },
  smsTitle: {
    color: colors.onPrimaryFixed,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '900',
  },
  smsBody: {
    color: colors.onPrimaryFixedVariant,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  phoneInputWrap: {
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLowest,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCode: {
    paddingLeft: 16,
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant,
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '900',
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: colors.onSurface,
    paddingRight: 16,
  },
  breakdownCard: {
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#2d3446',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  priceLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  priceLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 15,
    lineHeight: 22,
  },
  priceValue: {
    color: colors.onSurface,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
  },
  discountText: {
    color: colors.secondary,
    fontWeight: '800',
  },
  totalLine: {
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingTop: 16,
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: colors.onBackground,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
  },
  totalAmount: {
    color: colors.primary,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '900',
  },
  placeOrderBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    shadowColor: '#2d3446',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  placeOrderButton: {
    borderRadius: 14,
    backgroundColor: colors.primaryContainer,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeOrderIcon: {
    color: colors.onPrimaryContainer,
    fontSize: 12,
    fontWeight: '900',
    marginRight: 10,
  },
  placeOrderText: {
    color: colors.onPrimaryContainer,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '900',
  },
  secureText: {
    marginTop: 12,
    textAlign: 'center',
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  homeHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riderSwitch: {
    borderRadius: 999,
    backgroundColor: colors.secondaryContainer,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  riderSwitchText: {
    color: colors.onSecondaryContainer,
    fontSize: 12,
    fontWeight: '900',
  },
  riderShell: {
    flex: 1,
    backgroundColor: '#f6f8f3',
  },
  riderTop: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLowest,
  },
  riderBrand: {
    color: '#163225',
    fontSize: 20,
    fontWeight: '900',
  },
  onlinePill: {
    borderRadius: 999,
    backgroundColor: '#dcf8e8',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  onlinePillText: {
    color: '#126d3d',
    fontSize: 10,
    fontWeight: '900',
  },
  riderContent: {
    padding: 18,
    paddingBottom: 104,
  },
  riderStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  riderStat: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 12,
  },
  riderStatValue: {
    marginTop: 6,
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: '900',
  },
  riderMapCard: {
    height: 330,
    borderRadius: 20,
    overflow: 'hidden',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  riderMapImage: {
    borderRadius: 20,
  },
  surgeBadge: {
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.tertiaryFixedDim,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  surgeText: {
    color: colors.onTertiaryFixed,
    fontSize: 12,
    fontWeight: '900',
  },
  deliveryRequestCard: {
    marginTop: -58,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 18,
    shadowColor: '#2d3446',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  countdownText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  deliveryPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
  },
  payoutRow: {
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingTop: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeDeliveryHeader: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deliveryProgress: {
    height: 6,
    backgroundColor: colors.surfaceContainerHigh,
  },
  deliveryProgressFill: {
    height: '100%',
    backgroundColor: colors.primaryContainer,
  },
  fullMap: {
    flex: 1,
    minHeight: 340,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullMapImage: {
    resizeMode: 'cover',
  },
  destinationMarker: {
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  destinationText: {
    color: colors.onSurface,
    fontWeight: '900',
  },
  vendorPickupCard: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 158,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#2d3446',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  disabledButton: {
    opacity: 0.45,
  },
  riderQuickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  riderQuickButton: { width: '48%', borderRadius: 14, backgroundColor: colors.surfaceContainerLowest, padding: 14 },
  riderQuickButtonActive: { borderWidth: 2, borderColor: colors.primaryContainer },
  riderQuickTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '900' },
  riderQuickText: { color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 17, marginTop: 4 },
  riderHeroImage: { width: '100%', height: 230, borderRadius: 22, marginBottom: 18, backgroundColor: colors.surfaceContainerHigh },
  onboardingInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  formFieldCard: { borderRadius: 14, backgroundColor: colors.surfaceContainerLowest, padding: 14, marginBottom: 12 },
  formFieldInput: { color: colors.onSurface, fontSize: 16, paddingTop: 8 },
  uploadCard: { borderRadius: 14, backgroundColor: colors.surfaceContainerLowest, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  centerPanel: { flex: 1, justifyContent: 'center' },
  successImage: { width: 210, height: 170, alignSelf: 'center', resizeMode: 'contain', marginBottom: 20 },
  successIcon: { color: colors.secondary, fontSize: 54, textAlign: 'center', fontWeight: '900' },
  balanceCard: { borderRadius: 20, backgroundColor: colors.primaryContainer, padding: 18, marginVertical: 16 },
  balanceText: { color: colors.primary, fontSize: 34, lineHeight: 40, fontWeight: '900', marginVertical: 8 },
  mobileChart: { height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14 },
  mobileChartBar: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  mobileChartFill: { width: '100%', borderRadius: 8, backgroundColor: colors.primaryContainer },
  riderMiniMap: { height: 148, borderRadius: 16, overflow: 'hidden', marginTop: 12, padding: 14, justifyContent: 'flex-end' },
  tabsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  tabPill: { borderRadius: 999, backgroundColor: colors.surfaceContainerHigh, color: colors.onSurfaceVariant, paddingHorizontal: 14, paddingVertical: 8, fontWeight: '800' },
  tabPillActive: { borderRadius: 999, backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer, paddingHorizontal: 14, paddingVertical: 8, fontWeight: '900', overflow: 'hidden' },
  podium: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginBottom: 22 },
  podiumCard: { flex: 1, borderRadius: 16, backgroundColor: colors.surfaceContainerLowest, padding: 12, alignItems: 'center' },
  leaderRow: { borderRadius: 14, backgroundColor: colors.surfaceContainerLowest, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12, alignItems: 'center' },
  profileHero: { alignItems: 'center', borderRadius: 20, backgroundColor: colors.surfaceContainerLowest, padding: 18, marginBottom: 16 },
  profileAvatar: { width: 92, height: 92, borderRadius: 46, marginBottom: 12 },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  avatarInitial: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer, textAlign: 'center', textAlignVertical: 'center', fontWeight: '900' },
});
