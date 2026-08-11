import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import nextArrowIcon from '../assets/next-arrow.png';
import { AppIcon, type IconName } from './AppIcon';

WebBrowser.maybeCompleteAuthSession();

type Screen = 'splash' | 'onboarding' | 'home' | 'categories' | 'shopDetail' | 'orders' | 'favourites' | 'accountAccess' | 'checkout' | 'walletHome' | 'walletTopUp' | 'walletWithdraw' | 'scanQr' | 'confirmPayment' | 'paymentSuccessful' | 'transactionHistory' | 'riderHome' | 'activeDelivery' | 'riderOnboardingWelcome' | 'riderPersonal' | 'riderVehicle' | 'riderDocuments' | 'riderApplicationSuccess' | 'riderEarnings' | 'riderPayout' | 'riderLeaderboard' | 'riderProfile' | 'riderIncidentReport' | 'riderIncidentConfirmation' | 'riderHelpCenter' | 'riderLiveChat' | 'riderOrderDetail' | 'riderTraining' | 'riderLesson' | 'riderQuiz' | 'riderQuizResults' | 'referralHome' | 'referralContacts' | 'referralSent' | 'referralShare' | 'referralRewards' | 'supportTicketHistory' | 'resolvedTicketDetail';
type PaymentMethod = 'mpesa' | 'card';
type UserRole = 'customer' | 'rider' | 'vendor' | 'merchant' | 'support' | 'admin';
type AuthUser = { id: string; name: string; email: string; phone?: string | null; role: UserRole; status?: string; authProvider?: string; avatarUrl?: string | null; city?: string | null; defaultAddress?: string | null; emailVerified?: boolean; phoneVerified?: boolean; profileComplete?: boolean; missingProfileFields?: string[]; profile?: Record<string, unknown> };
type AuthSession = { token: string; expiresAt: string; user: AuthUser };
type CheckoutPayment = { reference: string; method: PaymentMethod; amount: number; status: string; actionUrl?: string; promptMessage?: string; providerMessage?: string | null; providerReference?: string; simulation?: boolean };
type CheckoutOrderResult = { order: { code: string; total: number; paymentStatus: string } };
type BottomNavVariant = 'customer' | 'rider';
type BottomNavItem = { icon: IconName; label: string; screen: Screen };
type ShopCategoryKey = 'restaurants' | 'groceries' | 'pharmacy' | 'gas' | 'electronics';
type ShopListing = {
  id: string;
  category: ShopCategoryKey;
  name: string;
  meta: string;
  rating: number;
  time: string;
  delivery: string;
  minimum: string;
  distance: string;
  badge: string;
  image: string;
  popularItems: string[];
  reorderLabel: string;
};
type ShopMenuItem = { id: string; name: string; description?: string | null; price: number; category: string; popular?: boolean; available?: boolean; unitLabel?: string | null; imageUrl?: string | null };
type ShopMenuSection = { id?: string; title: string; description?: string | null; items: ShopMenuItem[] };
type ShopMenuResponse = { vendor?: Partial<ShopListing> & { slug?: string }; sections: ShopMenuSection[] };
type OrderItem = { quantity: string; name: string; note: string; price: number };
const AUTH_STORAGE_KEY = 'sokoeats.auth';
const authRoleOptions: { role: UserRole; label: string; subtitle: string; icon: IconName }[] = [
  { role: 'customer', label: 'Buyer', subtitle: 'Order meals, groceries, medicine, gas, and essentials', icon: 'bag' },
  { role: 'rider', label: 'Rider', subtitle: 'Accept deliveries, earnings, training, and safety tools', icon: 'bike' },
  { role: 'vendor', label: 'Vendor', subtitle: 'Run menus, orders, inventory, and payouts', icon: 'grid' },
  { role: 'merchant', label: 'Merchant Admin', subtitle: 'Manage stores, campaigns, reports, and billing', icon: 'grid' },
];
const BottomNavNavigationContext = createContext<((screen: Screen) => void) | null>(null);

export async function checkForAppUpdate() {
  if (__DEV__) return;

  try {
    const Updates = await import('expo-updates');
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();

      Alert.alert(
        'Update available',
        'A new version is ready. Restart the app now to update.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Update now', onPress: () => { void Updates.reloadAsync(); } },
        ],
      );
    }
  } catch {
    // Updates are opportunistic; app startup should not fail if the check fails.
  }
}

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
  'safety_incident_report/code.html',
  'safety_incident_report/screen.png',
  'rider_help_center/code.html',
  'rider_help_center/screen.png',
  'live_chat_support/code.html',
  'live_chat_support/screen.png',
  'order_details_sko_1294/code.html',
  'order_details_sko_1294/screen.png',
  'rider_training_dashboard/code.html',
  'rider_training_dashboard/screen.png',
  'customer_service_lesson/code.html',
  'customer_service_lesson/screen.png',
  'rider_training_quiz/code.html',
  'rider_training_quiz/screen.png',
  'invite_friends_earn_rewards/code.html',
  'invite_friends_earn_rewards/screen.png',
  'select_contacts/code.html',
  'select_contacts/screen.png',
  'invitations_sent_success/code.html',
  'invitations_sent_success/screen.png',
  'whatsapp_sharing_template/code.html',
  'whatsapp_sharing_template/screen.png',
  'my_referral_rewards/code.html',
  'my_referral_rewards/screen.png',
  'incident_confirmation_next_steps/code.html',
  'incident_confirmation_next_steps/screen.png',
  'support_ticket_history/code.html',
  'support_ticket_history/screen.png',
  'resolved_ticket_details_inc_82941/code.html',
  'resolved_ticket_details_inc_82941/screen.png',
  'sokoeats_wallet/code.html',
  'sokoeats_wallet/screen.png',
  'top_up_wallet/code.html',
  'top_up_wallet/screen.png',
  'withdraw_to_m_pesa/code.html',
  'withdraw_to_m_pesa/screen.png',
  'scan_qr_code/code.html',
  'scan_qr_code/screen.png',
  'confirm_payment/code.html',
  'confirm_payment/screen.png',
  'payment_successful/code.html',
  'payment_successful/screen.png',
  'full_transaction_history/code.html',
  'full_transaction_history/screen.png',
  'quiz_results_feedback/code.html',
  'quiz_results_feedback/screen.png',
  'vendor_order_history/code.html',
  'vendor_order_history/screen.png',
  'vendor_profile_settings/code.html',
  'vendor_profile_settings/screen.png',
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

const categories: Array<{ key: ShopCategoryKey; label: string; icon: IconName; bg: string; fg: string; accent: string }> = [
  { key: 'restaurants', label: 'Restaurants', icon: 'fork', bg: colors.primaryFixed, fg: colors.onPrimaryContainer, accent: 'Hot meals nearby' },
  { key: 'groceries', label: 'Groceries', icon: 'cart', bg: colors.secondaryFixed, fg: colors.onSecondaryContainer, accent: 'Fresh market runs' },
  { key: 'pharmacy', label: 'Pharmacy', icon: 'plus', bg: colors.errorContainer, fg: colors.onErrorContainer, accent: 'Wellness essentials' },
  { key: 'gas', label: 'Gas', icon: 'fuel', bg: colors.surfaceContainerHighest, fg: colors.onSurfaceVariant, accent: 'Cooking gas refill' },
  { key: 'electronics', label: 'Electronics', icon: 'tech', bg: colors.tertiaryFixed, fg: colors.onTertiaryContainer, accent: 'Chargers and devices' },
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

const categoryCopy: Record<ShopCategoryKey, { title: string; subtitle: string }> = {
  restaurants: { title: 'Restaurants near Nairobi CBD', subtitle: 'Ready-to-eat meals, family trays, and office lunch baskets.' },
  groceries: { title: 'Groceries and fresh markets', subtitle: 'Produce, pantry refills, and everyday essentials from trusted shops.' },
  pharmacy: { title: 'Pharmacy and wellness shops', subtitle: 'OTC medicine, baby care, supplements, and urgent health essentials.' },
  gas: { title: 'Gas refill partners', subtitle: 'Verified LPG vendors with cylinder swaps and express dispatch.' },
  electronics: { title: 'Electronics and accessories', subtitle: 'Chargers, power banks, earbuds, routers, and quick tech replacements.' },
};

const shopListings: ShopListing[] = [
  { id: 'nairobi-grill-house', category: 'restaurants', name: 'Nairobi Grill House', meta: 'Kenyan grill - Nyama choma - Family trays', rating: 4.8, time: '25-35 min', delivery: 'Free', minimum: 'KES 200 min', distance: '1.2 km', badge: 'Most reordered', image: images.grillHouse, popularItems: ['Nyama Choma', 'Ugali', 'Kachumbari'], reorderLabel: 'Reorder grill platter' },
  { id: 'mama-njeri-kitchen', category: 'restaurants', name: 'Mama Njeri Kitchen', meta: 'Swahili plates - Chapati - Pilau', rating: 4.6, time: '15-25 min', delivery: 'KES 50', minimum: 'KES 150 min', distance: '0.8 km', badge: 'Top rated', image: images.mamaNjeri, popularItems: ['Pilau', 'Beef Stew', 'Samosas'], reorderLabel: 'Reorder Swahili lunch' },
  { id: 'city-fresh-grocers', category: 'groceries', name: 'City Fresh Grocers', meta: 'Vegetables - Fruits - Pantry staples', rating: 4.7, time: '20-30 min', delivery: 'KES 80', minimum: 'KES 300 min', distance: '1.5 km', badge: 'Fresh today', image: images.groceries, popularItems: ['Spinach Bundle', 'Bananas', 'Maize Flour'], reorderLabel: 'Reorder weekly basket' },
  { id: 'soko-pantry-express', category: 'groceries', name: 'Soko Pantry Express', meta: 'Milk - Bread - Snacks - Office supplies', rating: 4.5, time: '18-28 min', delivery: 'KES 60', minimum: 'KES 250 min', distance: '1.1 km', badge: 'Office favorite', image: images.checkoutMeal, popularItems: ['Milk', 'Bread', 'Tea Leaves'], reorderLabel: 'Reorder breakfast kit' },
  { id: 'afya-plus-pharmacy', category: 'pharmacy', name: 'Afya Plus Pharmacy', meta: 'OTC medicine - Baby care - First aid', rating: 4.9, time: '20-32 min', delivery: 'KES 70', minimum: 'KES 200 min', distance: '1.9 km', badge: 'Pharmacist online', image: images.mpesaBanner, popularItems: ['Pain Relief', 'Vitamin C', 'Bandages'], reorderLabel: 'Reorder wellness pack' },
  { id: 'uzima-care-chemist', category: 'pharmacy', name: 'Uzima Care Chemist', meta: 'Supplements - Personal care - Hygiene', rating: 4.6, time: '25-38 min', delivery: 'KES 90', minimum: 'KES 250 min', distance: '2.4 km', badge: 'Open late', image: images.deliveryBanner, popularItems: ['ORS Sachets', 'Thermometer', 'Sanitizer'], reorderLabel: 'Reorder care kit' },
  { id: 'mtaa-gas-express', category: 'gas', name: 'Mtaa Gas Express', meta: '6kg and 13kg LPG - Cylinder swaps', rating: 4.7, time: '30-45 min', delivery: 'KES 120', minimum: 'KES 900 min', distance: '2.0 km', badge: 'Sealed cylinders', image: images.nyama, popularItems: ['6kg Refill', '13kg Refill', 'Regulator'], reorderLabel: 'Reorder 6kg refill' },
  { id: 'blue-flame-depot', category: 'gas', name: 'Blue Flame Depot', meta: 'K-Gas - TotalEnergies - Accessories', rating: 4.4, time: '35-50 min', delivery: 'KES 140', minimum: 'KES 950 min', distance: '2.8 km', badge: 'Safety checked', image: images.pilau, popularItems: ['13kg Swap', 'Burner Hose', 'Lighter'], reorderLabel: 'Reorder gas swap' },
  { id: 'tech-hub-cbd', category: 'electronics', name: 'Tech Hub CBD', meta: 'Chargers - Earbuds - Power banks', rating: 4.6, time: '22-35 min', delivery: 'KES 90', minimum: 'KES 500 min', distance: '1.4 km', badge: 'Genuine accessories', image: images.checkoutAvatar, popularItems: ['USB-C Charger', 'Power Bank', 'Earbuds'], reorderLabel: 'Reorder charger kit' },
  { id: 'soko-gadgets', category: 'electronics', name: 'Soko Gadgets', meta: 'Phone accessories - Routers - Cables', rating: 4.5, time: '25-40 min', delivery: 'KES 100', minimum: 'KES 450 min', distance: '1.7 km', badge: 'Warranty ready', image: images.splashRider, popularItems: ['Type-C Cable', 'MiFi Router', 'Screen Guard'], reorderLabel: 'Reorder tech essentials' },
];


const shopMenuTemplates: Record<ShopCategoryKey, ShopMenuSection[]> = {
  restaurants: [
    { title: 'Meals', description: 'Main dishes the kitchen wants customers to order first.', items: [{ id: 'meal-nyama', name: 'Nyama Choma Platter', description: 'Charcoal grilled beef with ugali and kachumbari.', price: 1200, category: 'Meals', popular: true }, { id: 'meal-pilau', name: 'Chicken Pilau Bowl', description: 'Spiced rice, tender chicken, salsa, and chilli sauce.', price: 680, category: 'Meals' }] },
    { title: 'Drinks', description: 'Cold drinks, juices, water, and daily refreshments.', items: [{ id: 'drink-passion', name: 'Passion Juice', description: 'Fresh house juice served chilled.', price: 180, category: 'Drinks' }, { id: 'drink-soda', name: 'Assorted Soda', description: 'Choose cola, orange, or lemon lime at checkout notes.', price: 120, category: 'Drinks' }] },
    { title: 'Sides', description: 'Extras that complete the plate.', items: [{ id: 'side-ugali', name: 'Extra Ugali', description: 'Soft white ugali portion.', price: 120, category: 'Sides' }, { id: 'side-kachumbari', name: 'Kachumbari Cup', description: 'Tomato, onion, coriander, and lemon.', price: 90, category: 'Sides' }] },
  ],
  groceries: [
    { title: 'Fresh Produce', description: 'Vegetables, fruits, herbs, and market baskets.', items: [{ id: 'produce-spinach', name: 'Spinach Bundle', description: 'Washed green spinach bunch from today\'s market.', price: 80, category: 'Fresh Produce', unitLabel: 'bundle' }, { id: 'produce-bananas', name: 'Sweet Bananas', description: 'Ripe bananas packed carefully for delivery.', price: 160, category: 'Fresh Produce', unitLabel: 'dozen' }] },
    { title: 'Pantry Staples', description: 'Flour, rice, oil, sugar, tea, and household basics.', items: [{ id: 'pantry-flour', name: 'Maize Flour 2kg', description: 'Trusted everyday ugali flour.', price: 210, category: 'Pantry Staples', unitLabel: '2kg' }, { id: 'pantry-rice', name: 'Pishori Rice', description: 'Aromatic rice packed in a sealed bag.', price: 340, category: 'Pantry Staples', unitLabel: '1kg' }] },
    { title: 'Dairy and Bakery', description: 'Milk, bread, yoghurt, eggs, and breakfast refills.', items: [{ id: 'dairy-milk', name: 'Fresh Milk', description: 'Pasteurised whole milk.', price: 75, category: 'Dairy and Bakery', unitLabel: '500ml' }, { id: 'bakery-bread', name: 'Brown Bread', description: 'Soft sliced family loaf.', price: 95, category: 'Dairy and Bakery' }] },
  ],
  pharmacy: [
    { title: 'Medicine', description: 'OTC essentials with pharmacist-managed availability.', items: [{ id: 'med-pain', name: 'Pain Relief Tablets', description: 'Common pain and fever relief pack.', price: 180, category: 'Medicine' }, { id: 'med-vitamin', name: 'Vitamin C', description: 'Daily immune support tablets.', price: 450, category: 'Medicine' }] },
    { title: 'Baby and Personal Care', description: 'Baby, hygiene, and wellness products.', items: [{ id: 'care-diapers', name: 'Baby Diapers Pack', description: 'Comfort fit pack for daily use.', price: 680, category: 'Baby and Personal Care' }, { id: 'care-sanitizer', name: 'Hand Sanitizer', description: 'Pocket sanitizer for home and travel.', price: 150, category: 'Baby and Personal Care' }] },
    { title: 'First Aid', description: 'Bandages, antiseptic, thermometers, and urgent care basics.', items: [{ id: 'aid-bandage', name: 'Bandage Roll', description: 'Sterile roll for minor wounds.', price: 120, category: 'First Aid' }, { id: 'aid-thermo', name: 'Digital Thermometer', description: 'Fast-read thermometer with battery.', price: 650, category: 'First Aid' }] },
  ],
  gas: [
    { title: 'Cylinder Refills', description: 'Fast verified refills by cylinder size.', items: [{ id: 'gas-6kg', name: '6kg LPG Refill', description: 'Sealed 6kg refill with safety check.', price: 1450, category: 'Cylinder Refills', unitLabel: '6kg' }, { id: 'gas-13kg', name: '13kg LPG Refill', description: 'Home cooking gas refill with dispatch confirmation.', price: 3150, category: 'Cylinder Refills', unitLabel: '13kg' }] },
    { title: 'New Cylinders', description: 'Starter cylinders and full swaps.', items: [{ id: 'new-6kg', name: 'New 6kg Cylinder', description: 'Cylinder, gas, and basic setup check.', price: 4200, category: 'New Cylinders' }, { id: 'new-13kg', name: 'New 13kg Cylinder', description: 'Full 13kg cylinder for family kitchens.', price: 7200, category: 'New Cylinders' }] },
    { title: 'Accessories', description: 'Regulators, hoses, lighters, and safety extras.', items: [{ id: 'gas-regulator', name: 'Gas Regulator', description: 'Standard regulator for home cylinders.', price: 950, category: 'Accessories' }, { id: 'gas-hose', name: 'Burner Hose', description: 'Flexible hose with safety fitting.', price: 380, category: 'Accessories' }] },
  ],
  electronics: [
    { title: 'Chargers and Cables', description: 'Phone chargers, USB cables, and adapters.', items: [{ id: 'tech-usbc', name: 'USB-C Fast Charger', description: '20W wall charger with cable.', price: 1250, category: 'Chargers and Cables' }, { id: 'tech-cable', name: 'Braided Type-C Cable', description: 'Durable 1m charging cable.', price: 450, category: 'Chargers and Cables' }] },
    { title: 'Audio and Power', description: 'Earbuds, power banks, speakers, and batteries.', items: [{ id: 'tech-earbuds', name: 'Wireless Earbuds', description: 'Compact Bluetooth earbuds with charging case.', price: 2400, category: 'Audio and Power' }, { id: 'tech-powerbank', name: '10000mAh Power Bank', description: 'Portable fast-charge power bank.', price: 2850, category: 'Audio and Power' }] },
    { title: 'Connectivity', description: 'Routers, SIM tools, screen protectors, and setup extras.', items: [{ id: 'tech-router', name: '4G MiFi Router', description: 'Portable Wi-Fi router for home and travel.', price: 4950, category: 'Connectivity' }, { id: 'tech-screen', name: 'Tempered Screen Guard', description: 'Scratch-resistant phone screen protector.', price: 300, category: 'Connectivity' }] },
  ],
};

function fallbackShopSections(shop: ShopListing): ShopMenuSection[] {
  return shopMenuTemplates[shop.category].map((section, sectionIndex) => ({
    ...section,
    id: shop.id + '-' + section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    items: section.items.map((item, itemIndex) => ({ ...item, id: shop.id + '-' + item.id, popular: item.popular || itemIndex === 0 || shop.popularItems.some((popular) => item.name.toLowerCase().includes(popular.toLowerCase().split(' ')[0])), price: item.price + sectionIndex * 15 })),
  }));
}

const defaultOrderItems: OrderItem[] = [
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
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '';
const FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';
const GOOGLE_REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'sokoeats', path: 'google-auth' });

type MapPoint = { id?: string; label: string; address?: string; lat: number; lng: number; kind?: string };
type MapViewport = { center?: MapPoint; markers: MapPoint[]; path?: MapPoint[]; staticUrlTemplate?: string };
type MapsManifest = {
  provider?: string;
  androidPackage?: string;
  customer: Record<string, any>;
  rider: Record<string, any>;
  vendor: Record<string, any>;
  merchant: Record<string, any>;
  support: Record<string, any>;
  admin: Record<string, any>;
  tickets: Record<string, any>;
};

const MapsContext = createContext<MapsManifest | null>(null);
const fallbackMaps: MapsManifest = {
  provider: 'google_maps',
  androidPackage: 'com.paulmbugua2.sokoeats',
  customer: {
    nearbyVendors: {
      title: 'Nearby vendors',
      map: { markers: [{ label: 'You', lat: -1.286389, lng: 36.817223 }, { label: 'Nairobi Grill House', lat: -1.28333, lng: 36.82194 }] },
      actionUrl: 'https://www.google.com/maps/search/?api=1&query=-1.28333,36.82194',
    },
    checkout: {
      title: 'Checkout delivery route',
      route: { etaMinutes: 18, distanceKm: 4.2 },
      map: { markers: [{ label: 'Nairobi Grill House', lat: -1.28333, lng: 36.82194 }, { label: 'Home', lat: -1.286389, lng: 36.817223 }], path: [{ label: 'Nairobi Grill House', lat: -1.28333, lng: 36.82194 }, { label: 'Home', lat: -1.286389, lng: 36.817223 }] },
      navigationUrl: 'https://www.google.com/maps/dir/?api=1&origin=-1.28333,36.82194&destination=-1.286389,36.817223&travelmode=driving',
    },
    savedAddresses: [{ label: 'Home - Nairobi CBD', address: 'Apartment 4B, Nairobi CBD', lat: -1.286389, lng: 36.817223, map: { markers: [{ label: 'Home - Nairobi CBD', lat: -1.286389, lng: 36.817223 }] } }],
  },
  rider: {
    deliveryRequest: {
      title: 'Delivery request map',
      map: { markers: [{ label: 'Rider', lat: -1.28472, lng: 36.82336 }, { label: 'Vendor', lat: -1.28333, lng: 36.82194 }, { label: 'Customer', lat: -1.286389, lng: 36.817223 }], path: [{ label: 'Rider', lat: -1.28472, lng: 36.82336 }, { label: 'Vendor', lat: -1.28333, lng: 36.82194 }, { label: 'Customer', lat: -1.286389, lng: 36.817223 }] },
      acceptUrl: 'https://www.google.com/maps/dir/?api=1&destination=-1.28333,36.82194&travelmode=driving',
    },
    activeDelivery: {
      title: 'Active delivery navigation',
      route: { etaMinutes: 18, distanceKm: 4.2 },
      map: { markers: [{ label: 'Rider', lat: -1.28472, lng: 36.82336 }, { label: 'Vendor', lat: -1.28333, lng: 36.82194 }, { label: 'Customer', lat: -1.286389, lng: 36.817223 }], path: [{ label: 'Rider', lat: -1.28472, lng: 36.82336 }, { label: 'Vendor', lat: -1.28333, lng: 36.82194 }, { label: 'Customer', lat: -1.286389, lng: 36.817223 }] },
      toVendorUrl: 'https://www.google.com/maps/dir/?api=1&destination=-1.28333,36.82194&travelmode=driving',
      toCustomerUrl: 'https://www.google.com/maps/dir/?api=1&destination=-1.286389,36.817223&travelmode=driving',
    },
    safety: {
      title: 'Safety incident capture',
      map: { markers: [{ label: 'Incident', lat: -1.2921, lng: 36.8219 }] },
      dispatchUrl: 'https://www.google.com/maps/search/?api=1&query=-1.2921,36.8219',
    },
  },
  vendor: {},
  merchant: {},
  support: {},
  admin: {},
  tickets: {},
};
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
  "sokoeats_wallet": {
    "sourceFiles": [
      "sokoeats_wallet/code.html",
      "sokoeats_wallet/screen.png"
    ],
    "title": "Soko Wallet",
    "profile": {
      "name": "Juma Bakari",
      "level": "Harambee Level: Gold"
    },
    "balance": "KES 3,450",
    "points": "1,240 Points",
    "actions": [
      "Top Up",
      "Withdraw",
      "Scan Pay"
    ],
    "vouchers": [
      {
        "title": "Free Delivery",
        "tag": "Exclusive",
        "body": "On orders over KES 500",
        "expiry": "Expires in 2 days"
      },
      {
        "title": "10% Off",
        "tag": "Harambee Reward",
        "body": "Valid for Mama Njeri's Kitchen",
        "expiry": "Expires in 5 days"
      }
    ],
    "referral": {
      "title": "Harambee Referral Earnings",
      "body": "You've earned KES 1,200 this month."
    },
    "activity": [
      {
        "label": "Referral Bonus - Jabari O.",
        "time": "Today, 10:45 AM",
        "amount": "+ KES 500",
        "tone": "credit"
      },
      {
        "label": "Lunch Order - Mama Njeri's",
        "time": "Yesterday, 1:20 PM",
        "amount": "- KES 850",
        "tone": "debit"
      },
      {
        "label": "M-Pesa Top Up",
        "time": "Oct 24, 08:30 AM",
        "amount": "+ KES 1,000",
        "tone": "credit"
      },
      {
        "label": "Refund - Missing Item",
        "time": "Oct 23, 04:15 PM",
        "amount": "+ KES 200",
        "tone": "credit"
      }
    ],
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBNt9wLZ28EYBKOB-n321wIVQAjOvWEr6W0PVo0D-XfEHUzUbnwuO4MPD9LyPd7We0Zed8DpKanq1JHlsJCui6m9lJMiSjIosVvBYeH52Yug_anROe8C2raMn2mI3PbwXYkKhmwF9TIu72x-O8-Tn85lNomIUEFNTrQB_7ZXE-V1Dpff3Q4xOo35JMRCNZ2bqseXo2IyYlsIfKb0uIRuV-_TO3fq4e61H9a_hy0wRuO9qmwsGqXtNwr"
  },
  "top_up_wallet": {
    "sourceFiles": [
      "top_up_wallet/code.html",
      "top_up_wallet/screen.png"
    ],
    "title": "Top Up Wallet",
    "currentBalance": "KES 1,240.00",
    "memberLevel": "Harambee Gold Member",
    "presets": [
      "KES 200",
      "KES 500",
      "KES 1000",
      "KES 2000"
    ],
    "methods": [
      {
        "title": "M-Pesa Express",
        "body": "0712 *** 456",
        "badge": "Recommended"
      },
      {
        "title": "Linked Credit/Debit Card",
        "body": "Visa / Mastercard"
      },
      {
        "title": "Promotional Code",
        "body": "Redeem gift cards or coupons"
      }
    ],
    "tip": "You will receive an STK Push on your phone to enter your PIN after clicking top up.",
    "bonus": "Earn KES 100 bonus when you invite a friend to top up.",
    "fee": "KES 0.00",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuB1km8jEujS2iLfnyiweIApuFkJZCvI4-dc8TnDakrMjEoiYT7hlQtwmFycGtkLfas5Z3OPHIgra8U8lN2B63ia9Hgvrsx5mWYm_DG_6cfdLQxXAHpdTg6Mg0nziCy9Ycs7EXLbxQCBKkAJ-p20B69jLNyam53X1nYmYFEQoFeSMdPzFWfxljE8LZKfqqWXoI0zVcMQfp3JgIv3cWyVRQpFpzxsAbvnkv64tOjdVKt-yY219B3cie0n"
  },
  "withdraw_to_m_pesa": {
    "sourceFiles": [
      "withdraw_to_m_pesa/code.html",
      "withdraw_to_m_pesa/screen.png"
    ],
    "title": "Withdraw to M-Pesa",
    "currentBalance": "KES 3,450",
    "presets": [
      "KES 500",
      "KES 1000",
      "KES 2000"
    ],
    "destination": {
      "title": "M-Pesa Account",
      "phone": "+254 712 *** 678"
    },
    "summary": {
      "amount": "KES 0",
      "fee": "KES 0.00",
      "total": "KES 0"
    },
    "assurance": "Funds will be sent instantly via M-Pesa. Ensure your number is active and correct before confirming.",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBen9qtqa392Y2fBAoIq92CtzTe24Jq3PuIuS5VD-p0_Kz-1KwkkiDL3TRJy2m8OsK-KeRhStKIT70nl_ieWaoS9F6MTA_NaySwU0Dq2NZilN5EsmrVXZyoEJZSs_uaBrptw0dJKmrovOD5-iffU0zwk2S70XqPI9GiE9oguONvRwk_Y0WTQiI4L6u69yR1fla97_o-3WvxRA1onONi_UoAahUzJfsmK6vjB6LEkIzbcfnvYT0yye8J"
  },
  "scan_qr_code": {
    "sourceFiles": [
      "scan_qr_code/code.html",
      "scan_qr_code/screen.png"
    ],
    "title": "Scan to Pay",
    "subtitle": "Point your camera at the vendor's code",
    "frameLabel": "Align QR Code",
    "actions": [
      "Flashlight",
      "Upload"
    ],
    "fallback": "Can't scan? Enter the Till Number manually",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuCfYwCanj2m3_EZchdFGeK4gzIS238BPiEkHDdazNLxIBRzpSO4xPZrFBPdXjygWE2MFoLES2Uz98hU3A6osCn4_8AYTqUuTPfxipvs9Im-naI6wS11V_TSkeqJQBjSfPiYBTxWRlYa_J8b4g9kRAApbE_dWFH0KNOYdvcgAfijuKG4uTvBOSZGYiFXIZvKCQEdau4Xz74XyvXOEmDIiEwZ3-JgGbAPTrnklnKb5K4uSy48-Q8P8B2d"
  },
  "confirm_payment": {
    "sourceFiles": [
      "confirm_payment/code.html",
      "confirm_payment/screen.png"
    ],
    "title": "Confirm Payment",
    "vendor": {
      "name": "Mama Njeri's Kitchen",
      "location": "Kenyatta Market, Stall 42B, Nairobi"
    },
    "amount": "KES 1,450.00",
    "balance": "KES 14,250.00",
    "points": {
      "earn": "120 Points",
      "next": "80 points away from a free drink!"
    },
    "noteLabel": "Notes for Mama Njeri (Optional)",
    "assurance": "Zero transaction fees for community-vetted merchants. Soko Pay supports local business growth.",
    "secure": "Securely encrypted by Soko Community Security",
    "images": [
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBL9Lgi3dE62h6fhX8SAUYbxbRYj4__BtGcoMECxuaQo9QtdmOGEfpnagO8fbXKpcc86f0hIawG-ZSynG7Jffe3FrttnkI3EOAcmWuKukkh2Xu2JmvctxoYdUUs2R2cpADF6a-nAK3TAeyZCrzgVzXoee1aM8X45Zd4e3EaB6YFUaugQIlZs0G3K8QoWjtVswObrqinAsXd0OlYD1YIWNKl-_TdgeYMPryFvaDKaMY7i63bzMlvhP38",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDQopzAUt1crEQWe2n6ZC_JOvCsRouvJ85wVeJ2shfqTi4-nDvLvQhxIOab7ttTWVOu8kQ1rgyto8ZKoEVobQkGDEt0yweJ5Om6IQYJ57lyyh0UUZ86uQSVpR085zrmnBcM2rMWqzgckAzbR2HSUSTiobBlE6LgitDO4u8Hf4B5uaDcErzpvs676G_XrN0OnmyFrlPUP1TI-naW6xpTWQMA7OeGjKkjqVxprryG8BkDfJcfPLeWIzIi"
    ]
  },
  "payment_successful": {
    "sourceFiles": [
      "payment_successful/code.html",
      "payment_successful/screen.png"
    ],
    "title": "Payment Successful",
    "body": "Your transaction was completed instantly",
    "amount": "KSh 1,450.00",
    "vendor": "Mama Njeri's Kitchen",
    "points": "+45 Points",
    "transactionId": "TXN-88294401",
    "message": "Mama Njeri says thanks! You've supported a local business today. Your community status is rising!",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBFuP-ofe3a31pCQxkmydTuk9eMNhSnP6lxSSuEhJHe3iprmbip8aS8WoF3WqJZSNfS8JMpyIBkF_VP11yD92sAKXOLlXm4HbhO4MizCLqmI8nJKShknVYYVKxbhRYAmdcDrNkdDNbsGhnnycMyBt-gGkZ4pkbZJyHU3iicWDdFFa78htDfhCRzJA5ygJF4sJ_wE0S8rGpvbm75ovgt2H-sEaMrbKvYtaIyrXz0ilzgvekzvhESf6Nu"
  },
  "full_transaction_history": {
    "sourceFiles": [
      "full_transaction_history/code.html",
      "full_transaction_history/screen.png"
    ],
    "title": "Transaction History",
    "tabs": [
      "All Transactions",
      "Income",
      "Spending"
    ],
    "ranges": [
      "This Month",
      "Last 3 Months",
      "Custom Range"
    ],
    "transactions": [
      {
        "label": "Referral Bonus - Juma B.",
        "time": "Oct 24, 2023 • 02:15 PM",
        "id": "TXN-88291040",
        "status": "Completed",
        "amount": "+1,200.00",
        "tone": "credit"
      },
      {
        "label": "Order #5529 - Mama Ngina Foods",
        "time": "Oct 23, 2023 • 12:40 PM",
        "id": "TXN-77401211",
        "status": "Completed",
        "amount": "-850.00",
        "tone": "debit"
      },
      {
        "label": "M-PESA Top-up",
        "time": "Oct 22, 2023 • 09:10 AM",
        "id": "TXN-00129388",
        "status": "Pending",
        "amount": "+5,000.00",
        "tone": "credit"
      },
      {
        "label": "Withdrawal to Bank",
        "time": "Oct 21, 2023 • 05:30 PM",
        "id": "TXN-FAILED-1",
        "status": "Failed",
        "amount": "-2,500.00",
        "tone": "debit"
      },
      {
        "label": "Harambee Milestone Reward",
        "time": "Oct 20, 2023 • 11:15 AM",
        "id": "RWD-SOKO-777",
        "status": "Completed",
        "amount": "+500.00",
        "tone": "credit"
      }
    ],
    "footer": "History is available up to 12 months"
  },
  "invite_friends_earn_rewards": {
    "sourceFiles": [
      "invite_friends_earn_rewards/code.html",
      "invite_friends_earn_rewards/screen.png"
    ],
    "title": "Feed Your Community",
    "subtitle": "Invite friends to SokoEats and you both get KES 500 off your next order.",
    "code": "SOKO-JUMA-254",
    "progress": "3/5 Referrals",
    "nextReward": "KES 1,000 bonus at 5 referrals",
    "earnedTotal": "KES 1,500",
    "activeMembers": "3 Active",
    "heroImages": [
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAmnpkpZGuZT0N5e34mKUKNYt7lmZXC3SBQgfIK8NvqKJdumc-OyFIajQYjfIm_AI-O_DKgiGWU4m7-48-LSlAA0UOgbWMACqronrWQ1hexZsEVEhKo__3sq-ayFSEcknX5-ycXvkuunlFQFqHo9pS0JvMNhd-KQ1_SyjvLwOw776PhRbI3mwbuQzE3sA1hd22Ebh_21UexHHmoN6p3tyyJNDkMKyhYPsjX59gIda4dEZyIn65xTT2f",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCg-amds2XMHeqtkmv094t0d7t3Wt6848k7wpwkspm5sjKKdXo0KfZw8OIs5zScKi3FPHgCKXC0VcO2gqpOxJfvyUp0DAebYvCyNL5QFfpYvRKPM0yZ9zxrR3NTiv-vnmx3sZUBGofgcF-kOCOaBVq59JemQYzESpPl-ukp5EWS91xqLTgmkjVZEh21e2LW4Dvs-Br_jrl6nIRChPxe-jF7ZI0SA31cbKJhmehZavZaMhRcPVbWvDuk",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCIEjwFC6eV7tF_aCnitYATcFgFSYOl04MsRDxHkHHQJe0vXhdFo31-zMIfqLeZQolwNc1BXAlL-7pnSxtt6Wz8fO417mP2ijsfXHsQsKB-rPM8R3ulzT7SsYZwxaofVd0dRz7eAlWAVCYd22a1nBOO30CbTDEfqLe2EVa-M1l73fZAr3ATB5PPA1PcBT40zd0SV9Ddu-nat7FLpZiLfqx546f4GF7RJsMEd4U5-TFW2cGVK7XGDSY0"
    ],
    "activity": [
      {
        "name": "Amani",
        "body": "joined using your code!",
        "age": "2 hours ago",
        "reward": "+500"
      },
      {
        "name": "Kev",
        "body": "just placed his first order",
        "age": "Yesterday"
      }
    ],
    "rewards": [
      {
        "title": "Free Delivery",
        "status": "Available now"
      },
      {
        "title": "KES 1,000 Gift Card",
        "status": "2 more invites"
      },
      {
        "title": "Dinner for Two",
        "status": "7 more invites"
      }
    ]
  },
  "select_contacts": {
    "sourceFiles": [
      "select_contacts/code.html",
      "select_contacts/screen.png"
    ],
    "title": "Choose Friends to Invite",
    "contacts": [
      {
        "id": "jabari",
        "name": "Jabari Omondi",
        "phone": "+254 712 345 678",
        "avatarUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBtJGyOZuxGHCp_88d_VOP_6N1IH2okD2FSZSe9LuhMw-8KGmlRoBay8Wq5OuPcVIj3D1m-3RRN6xKRBN27-fqbDCh-DNDWl0KrcnVJ_WB6ol5qv9A3LgCVe6Go9S0ApScWPhf1GY_1ixesvEbETVd5Fz_tOuC0PbgJOCuHtRgv5PHm8bMjG29VUapyrfFZ3Auv0Eq4uW549TAKE4r1ZJA5muoMgXXkTbRDqN-gu-RT2R4cyB_a8kIL"
      },
      {
        "id": "zuri",
        "name": "Zuri Wanjiku",
        "phone": "+254 723 456 789",
        "avatarUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAcxFkoGwJTXxGJykA0Wv-FFtNxwpbcKpLjuO6TZWpQzF7urMpkuP4j0BNS2-wjSAOuUUbbpwX74iMLIlseWraJaOLvWuQhceRRnOiOUMskREu7OpZur147JF9kA60x4R64XymJqhSHL-PJJh2bAhpDxNpocK1mnp4pEQXX60b3497Y8RfXU5Ilj9L7Tbdhwz0EYTM5a-FsG6_n4pjXxuJTsDxuuuPq936cT8PfMHploPDCsTzXUkS2"
      },
      {
        "id": "kwame",
        "name": "Kwame Musyoka",
        "phone": "+254 734 567 890",
        "initials": "KM"
      },
      {
        "id": "amani",
        "name": "Amani Adhiambo",
        "phone": "+254 745 678 901",
        "avatarUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuCE8rAr6vSOvJh8eAQpbn4u1PRak6oChPqsUShroWVhJChxp0tDqFLPrzZdHf_pyxo7et3qJtf_FY8HrCwN6YaLXJmTxi21ZuYziqdknJKP8qo90QWqboU_ifpVtOPBYAmQXA7TdcUoHTvtQf5hgd-hEtR8Efqdz6IGYykRHaddinfyJ5Ps4bUm5T0nWaHAVKpNNqZzfpOoKCxgs5MwzLuoOkUNgBLa8DYjCy5v676qCxBxx1ZlSzYJ"
      },
      {
        "id": "sasha",
        "name": "Sasha Njeri",
        "phone": "+254 756 789 012",
        "initials": "SN"
      }
    ]
  },
  "invitations_sent_success": {
    "sourceFiles": [
      "invitations_sent_success/code.html",
      "invitations_sent_success/screen.png"
    ],
    "title": "Invitations Sent!",
    "body": "We've sent your referral link to 3 friends. You'll get KES 500 when they complete their first order.",
    "potentialReward": "KES 1,500 total available",
    "community": "12,400+ people joined this week",
    "images": [
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCrkkfEgbIipqHwjG_7GlU21o_e9WBmKbiFjFtqE5yRHIb3oDSLu5KOTbdIYVx7x4QbyAPO6ITEuXYjeOaJ611DDUrJeeWyReUNdaTlBenY_jBEPAgPci4oUXbAZRVX53TY7eHI2m0Si7cDeNK5RsqZPwADUu9xFLbLVJ5w36aY5kTtGTqII4irQc4VtJ6vI15z76Di0Sw63Sk9SW0IjZRmxUHsSWpmCH6KkEB96_X2RnroH9iWOOaw",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA_FcrKu46CuyJiyfvlJO_l2hAFVZQEVd_an3eTLubWvK53DvtvwXFWc4DY89VAg-L7eTa20-xuNyj2a8lrsXI7xvB7ao7vy0zgiq6zJiRcwA2xBhNw9pGJoy807X855WHLf4s4vU_zgiGuBntxgnmXlEnZFcD31zLl65v9nz2Vkvng4lJLY4aKxSQXUvaCvjW0MbZwc-v6BerV4wQqYYfZ3trvzjX7XEB19VHflPe7Scg5hTGAR5Gl",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBrP3hDeK_I1aj2u2T2-fVL7ky3Y8NJNbZRORs8Ss5tXdqovnF4xqfgs63HETU5zJy82H4Q3_BR0RIl9LV28Oykf9FOsbnhoN4QCWaoUJYR459HcLv1B3KfIw22-vgvuIHgpeSz6_4xgZ-qD62u8K0jaCAh0Fm8ZvLihQW3IRV-DcwvPhectp0tXHLoSvMtGdD_rD5RPd0H0fc44JG16gkbsmVjeQq0AJcqScUbnSyO9hpYK5VJ9Vrt"
    ]
  },
  "whatsapp_sharing_template": {
    "sourceFiles": [
      "whatsapp_sharing_template/code.html",
      "whatsapp_sharing_template/screen.png"
    ],
    "title": "Bring your squad to the table",
    "badge": "Harambee Bonus Active",
    "subtitle": "Get KES 500 for every friend who orders!",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAnv_X3WFO6YrGQLVqbCMxQkxw-4DA9q8xuXaW6xspPaJo4jK_Hm5yAjkX4hvXokC7hjaaOolgRd-NB4V_-BEO9U5y678RWdcNSh4jN7uHoYhy5hozITXggXJ4ooF-GXWtlmR9McENnokJTm16bcXbt1uagorOel-VSv0huFhxHM6SUZuj3ggMPNHXIQNtcdTHNopOfKe3QqqsOnZW9IiiuYQ9jHRqnohNyUZwMt_D-sFSf8gT8zaoq",
    "message": "Jambo! I'm using SokoEats to get my favorite Kenyan meals delivered. Use my code SOKO-JUMA-254 to get KES 500 off your first order!",
    "code": "SOKO-JUMA-254",
    "link": "soko.eats/invite",
    "channels": [
      "Share to WhatsApp",
      "SMS",
      "Telegram",
      "Messenger",
      "Copy Link"
    ],
    "reward": "Your friends get KES 500, and you get KES 500 after their first order."
  },
  "my_referral_rewards": {
    "sourceFiles": [
      "my_referral_rewards/code.html",
      "my_referral_rewards/screen.png"
    ],
    "title": "Your Rewards",
    "totalEarned": "KES 2,500",
    "successfulReferrals": "3",
    "pendingRewards": "2",
    "images": [
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAsHbMlW8IN7XvCBjABLv1In4xkXvzK7o7fgMC_OYN2BiyIz810W_l7JJlwqdQXQ8DkM3R588Z2E1V5ildZwYFsMkZcbHKCUerQl2_YbVIJKcF-V2tmH4hdzON_60oJAGSqkdP-SO3knb80Nu3Xxq878iNQ_rQ_T9bbC8QNwbMhOwc3iZefsCQd8wABLIyAtcJNPCFdtqzAJxDLqKFzvJaltkHxUbr4MLLq7aeNs02WtpcoXnOdhHay",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAV4C-YwoPZAiJK7iSnAi_hmxE5WAUbqVTPCJkmhFZ2_VUOqL0p3J3klI0DuhA9oDiOotcxEf4QSUZCBw0E_Bt_ER_bRmyfHL6zZMYyMU98ZOgpLXfX0QHG647_3r0OFom855AGG8ChVrvVLf2TPKfq8f5q1PHY8acBiPpXyjGsLizXkfqcqo8g33q0YdeBh99qv65LsNOfinE-YEJmLy2EaSOFtisbxejsAiR_hwm4vwI-V2oo8AJf",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCl5CXJWvrpeUkt8EJZrAm71gXDUDZvVvP_i811dAMy2UXpj-RIJH1Z46scbOzUtEN3GCG7Z5VZ-OVpYAM71WxsZGMrde9LKOtJLQdCGqbQYt9T5QFrAv9YJ6CiBvpK1zH2TFNLrTpRijLMH146gvGJuivrJZ9wQbj9iH3CSX57Aq7YoLuQcfzQmxoeRnr8wxUkA-xZQ6rs58XPV5DXgWAhcbydnLzkrQcLVYRsSzjGczAmgByHHWl1",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBIHIotCvy7ZiakQ_4cYqxVdqD2fM1z4v46b0sbvPDIqpd6H3rmps1VTbxD3IgJZz2sPtqyNe2p-Vk1M1ELnqOkZWbG6zmJHhSbgBgVAMFKdupScc2OuEERVl7WADcrgy6eYBYpo-vPpIzn5BdrnQAHFHr9X116Mx-qVJkhwaKaxi8G9VbAqTpW9iZUvZ_r8qQoDlIOX9sTbdhdLRxFqiaixTiGlCZBM78ICNmlBiv7xDsCHFWKeiby",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCVApV7XhU7IxR860KNLpSTyFgT2Je5eXLqFGSvYdMsmwS5ywN5cHa5-u4C232bpY5YekRAk9zzZiK4gVvm7FiEFe_X-8kuU5PosPTELZ3noVLbz15qzZv-jLC9qTUoLUZtddKnpPTS53b58sYh7emuvO2sxr2xKj4Z60mPM8yvJcQ-xCg532bWsjZiNS_O80BNstZ8h0QqPWwpdMImqG8xLb5Xnmg6tN_a3aC6zxkZnyS3XUHjIJYY"
    ],
    "friends": [
      {
        "name": "Mwangi K.",
        "status": "Reward Earned",
        "reward": "+KES 500"
      },
      {
        "name": "Zainab A.",
        "status": "Order Placed"
      },
      {
        "name": "David O.",
        "status": "Joined"
      }
    ],
    "nextReward": "Invite 2 more friends to unlock a KES 1,000 bonus voucher!",
    "progress": "3/5 Referrals",
    "activity": [
      "Sarah M. just joined via Mwangi link! Welcome to the table!",
      "Brian L. redeemed KES 1,000 for lunch! Enjoy!"
    ]
  },
  "incident_confirmation_next_steps": {
    "sourceFiles": [
      "incident_confirmation_next_steps/code.html",
      "incident_confirmation_next_steps/screen.png"
    ],
    "title": "We've Got Your Back",
    "body": "Your safety is our top priority. We've received your report.",
    "refId": "#INC-82941",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuA_WQacu1asPubExZ8QvtHZdM7R1iWTXXjFyCNM2CrQl_1EEaFfyrmB0qg978ULC21dsmwzrflIIH-_Pou0tA1mKN1IwOv7lN57doTkfSevRJJiC9jq4MuHHtHKwONlkGwtNsWstAU3d6qKz918gCTm70hmY9DqtMIamNG2LhL15ovfYmwX85YiqpT4dT_-3u9Kexx6Cbc-EKnK4eHp_Dr2XVXT4fIx0U1dG7tGvAdvxe-ToikninUY",
    "steps": [
      "A safety agent will call you within 5 minutes to verify your status.",
      "Dispatch has been notified of your current location at Nairobi Central.",
      "Law enforcement or medical services will be dispatched if requested during the call."
    ],
    "tip": "Please move to a well-lit area and keep your phone charged. If you feel unsafe, find a secure location immediately."
  },
  "support_ticket_history": {
    "sourceFiles": [
      "support_ticket_history/code.html",
      "support_ticket_history/screen.png"
    ],
    "title": "Ticket History",
    "tabs": [
      "Active (3)",
      "Resolved"
    ],
    "tickets": [
      {
        "category": "Safety Incident",
        "status": "IN PROGRESS",
        "title": "Issue with Pickup Location access",
        "code": "#INC-82941",
        "updated": "Updated 2 hours ago",
        "body": "The gate security mentioned they need a specific code for SokoEats riders to enter the premises..."
      },
      {
        "category": "Earnings Query",
        "status": "PENDING",
        "title": "Missing Peak Hour Bonus",
        "code": "#INC-82810",
        "updated": "Updated 5 hours ago",
        "body": "I completed 5 orders during the Sunday lunch rush but the 200 KES bonus hasn't reflected yet."
      },
      {
        "category": "Order Issue",
        "status": "ACTIVE",
        "title": "Customer unreachable at delivery",
        "code": "#INC-82755",
        "updated": "Updated 1 day ago",
        "body": "Agent: We are still trying to contact the customer via their secondary number. Please wait..."
      },
      {
        "category": "Insurance Info",
        "status": "RESOLVED",
        "title": "Update on Medical Cover",
        "code": "#INC-81022",
        "updated": "Resolved 3 days ago",
        "body": "Issue resolved. Documentation sent to your email."
      },
      {
        "category": "Technical",
        "status": "RESOLVED",
        "title": "App crashing during GPS sync",
        "code": "#INC-79441",
        "updated": "Resolved 1 week ago",
        "body": "Fixed in Version 4.2.1"
      }
    ],
    "support": "Our support team is available 24/7 to assist with any challenges on the road."
  },
  "resolved_ticket_details_inc_82941": {
    "sourceFiles": [
      "resolved_ticket_details_inc_82941/code.html",
      "resolved_ticket_details_inc_82941/screen.png"
    ],
    "code": "INC-82941",
    "status": "RESOLVED",
    "title": "Issue with Pickup Location access",
    "resolvedAt": "Resolved Today, 10:30 AM",
    "agent": {
      "label": "Customer Support Agent",
      "time": "10:30 AM"
    },
    "message": "Jambo! We have updated the gate access codes for this location in our system. You should now see the specific code in your 'Order Notes' for all future deliveries to this estate. Thank you for flagging this!",
    "images": [
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCMT2wDg0o-9vyqgVgg5QEt8G11Usbvh6aQeuWMZ7kQWwdZ6a9MGWzy0zhmee0FrBDi-XycaY0gzPtXSQixGIlXX_NJDQ90Dc0qlPnbMXfUMyKq5SRxlsN6_u2RAREh71Kjh5tFqANOZ8_67mAfRXI9gPoMHoGTF69cXQJWycxiuqqdqr3HP8WA5YkJOe6xrF9q-A5qxIdyEfGd0zWDnG7t4LcFGuAxBCPIUS82c9zjgbfo_PsqhXx3",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDvCtyvXrZI_sYnMZZ8Zy55TK-B7wTzZibpXpSYK3mVva1eFgTvATphHj3xI7nuW7qTmaRYLM8ciVC-L0dvZ_4rUu6Cdai7_UAwzre4L0QGryU-_dRxvGLIyB303fwCB98BkztggdS6aLqX1WvjkzHxfek4YZl4WgIiTJD9-dEKlLh8xpbPG5U9SI6Eenx-RU5gK9QTckl2HzFUG2W7P4Uv6S7si3XFU_a617C5VylipJ97TwXfeJ0m"
    ],
    "originalReport": "I'm at the Kilimani Heights gate but the guard says the old code 4455 is no longer working. I had to wait 10 minutes for the customer to pick up."
  },
  "safety_incident_report": {
    "sourceFiles": [
      "safety_incident_report/code.html",
      "safety_incident_report/screen.png"
    ],
    "title": "Incident Reporting",
    "dangerTitle": "Immediate Danger?",
    "dangerBody": "Get help instantly from our dispatch team or emergency services.",
    "actions": [
      "Call Dispatch"
    ],
    "categories": [
      "Road Accident",
      "Breakdown",
      "Customer Safety",
      "Theft/Harassment",
      "Other"
    ],
    "urgencyLevels": [
      "Low",
      "Medium",
      "Emergency"
    ],
    "fields": [
      "Location of Incident",
      "Time of Incident",
      "Detailed Description",
      "Photos & Evidence"
    ],
    "evidenceImages": [
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDd5vUYZDsstfjJCfwS0VtG05TncFDcLTEYsL6UIqvU5CY0bCf9r3nNiD2IxdrvzZZqPoxz955I8ZifOJsdjrhGIEM8gfmTEsN1BWZeLtkrIZIw4Paxp4sEsm_d4WAcaDsxHtbb3dyc7gJp88-c7WNbsYYxw4ufOI_e3ayMp0yKeVqrIrRfRM7hGWlwt4PkEjXs-0M4zLLwP9nor7xrgIrxckNEmvqxgseM6DgPt2u1VSCpwdaqHQVD",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDrf6I_ffY5b9_MeZY_ImYE1deJ1kzK4QRUajcm7d4TAYXSPbIpbiEIONKjWI8pT3pCxJo-gYOZIJ4aQQKHHqLCUvCDbrgSTnU0wb6SmLIg_uGvB-2FXKaa711JLfbMeP_pH8OeW-dYbW3CeiBL0m5AkRmXGqUFrk3KxRLWoZXLvPWoa681jPsc8t-77NmP0sB-NOZnw17M-4k9WeupO_q5LVjxY5tCSeIGWd3xMUo7fblyCng8eCMs"
    ],
    "legal": "By submitting, you confirm that this information is accurate. False reporting can lead to account suspension."
  },
  "rider_help_center": {
    "sourceFiles": [
      "rider_help_center/code.html",
      "rider_help_center/screen.png"
    ],
    "title": "Rider Help Center",
    "heroImageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuDoazv5nZh1KBLL6nJe6e-VUVDQu3LmhxU_YVJuGPFcpIajc4tqUmAFrWuGiU9mVgAhhdfn_WrYujcjnaP0kf-HYsuwrZQCt01B8dxMkdbzWaQbkJwbLMhTNqBXzAm5llHVWtxRu_jnYoV3XXgOH1r1I6ymCWD8a8w1sVv3c_XP5wi0vHxfHj68XRAAkaWPTgIm9DabmVh6bN92B5MNYi-UqqeZ0HwMhHxuvWf3m1ssrEeqwX_mb_x9",
    "primaryActions": [
      {
        "title": "Live Support",
        "body": "WhatsApp or Direct Call"
      },
      {
        "title": "Report an Issue",
        "body": "Report safety or order incidents"
      }
    ],
    "headline": "We're here to keep you moving",
    "categories": [
      {
        "title": "Earnings & Payouts",
        "body": "M-Pesa, statements & bonuses"
      },
      {
        "title": "Order Issues",
        "body": "Cancellations, missing items"
      },
      {
        "title": "App & Navigation",
        "body": "GPS, login & device issues"
      },
      {
        "title": "Safety & Training",
        "body": "Road safety & protocols"
      }
    ],
    "questions": [
      "When will I receive my M-Pesa payout?",
      "How do I change my delivery zone?",
      "My account is under review",
      "Customer was not available to collect"
    ]
  },
  "live_chat_support": {
    "sourceFiles": [
      "live_chat_support/code.html",
      "live_chat_support/screen.png"
    ],
    "title": "Rider Help Center",
    "agent": {
      "name": "Sarah",
      "status": "Online"
    },
    "tip": "For faster resolution, please provide your Order ID or a Photo of the receipt if you are reporting a delivery discrepancy.",
    "messages": [
      {
        "sender": "Sarah",
        "body": "Jambo! I'm Sarah from SokoEats Rider Support. I see you're having trouble with your current pickup at Westlands Mall. How can I assist you today?",
        "time": "10:42 AM",
        "mine": false
      },
      {
        "sender": "You",
        "body": "The restaurant is saying the order will take another 20 minutes. My app says it should have been ready 5 minutes ago. What should I do?",
        "time": "10:44 AM",
        "mine": true
      },
      {
        "sender": "Sarah",
        "body": "I'm sorry for the wait! I'm reaching out to the restaurant manager now to expedite this. Please stay in the rider waiting zone. I'll update your wait time compensation automatically.",
        "time": "10:45 AM",
        "mine": false
      },
      {
        "sender": "You",
        "body": "Here is the crowd at the counter right now.",
        "time": "10:46 AM",
        "mine": true,
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuCsp1suTdfxD3AlPcXFUsPbqw9CNWxNCARfp-g_cpbIJfb1qM9Fmx0fb-pGoXnFHKfKLj6y4Hcs2M0KLeMvAX7mH6iifzq2MCc7YA1uSaYUJ4LCEJ5fmLpZGYDdA--qkuhVhIleVSwZT7WGawtZHuKS6M3aeep69vbWlNg5aVg7thqbidK3WAzb6dX6qIjAccNZ6qT99ERZ_tEQi-8tpHxDn1euS6kXFyCFXegveiKCAzt_8-ZcJU-H"
      }
    ]
  },
  "order_details_sko_1294": {
    "sourceFiles": [
      "order_details_sko_1294/code.html",
      "order_details_sko_1294/screen.png"
    ],
    "code": "SKO-1294",
    "status": "PREPARED",
    "timeline": [
      "Received",
      "Prepared",
      "Dispatched"
    ],
    "customer": {
      "name": "Faith Wanjiru",
      "phone": "+254 712 345 678",
      "address": "Kilimani, Nairobi, Kenya",
      "note": "Gate 4, Wood Avenue Heights"
    },
    "items": [
      {
        "quantity": "1x",
        "name": "Double Beef Burger",
        "price": "KSh 1,200",
        "note": "Well done, No onions",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuDTMjefIzgitI8b6GS4ui1jcJ3aNkI8WU3F4qYY8f5bCEEhmUZQZTNpO2tQCD2oaUEKfmJbC2sHLymT71nwhxZviD1o3mQTc7ZQj2croeYhXHkdLZ96V2NuG0vhB4zkWLlXIeZh4fIg4F-AGQflE0x1up1cEx3xzJZi7OSaxsegk133uMU00nFuK0ARZh3_MxCjXWg3Dy7xmZk-s9QyNUCZ0NfDgPEwz_Ek2LT-EDieFYhAwfT-4kaI"
      },
      {
        "quantity": "1x",
        "name": "Large Masala Fries",
        "price": "KSh 450",
        "note": "Extra spice on side",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuC_1WDWnrgzCaoEsB-e9Gdd2lQ9_S2QqoAnH0WrFB46U8lMpx-vyiz8eSQp2JmMSJ5QX4xokM3tG0QCPtI40bycqIGvX8dVPXDJoVSYsHDpfpD_ZWNGM_wGQvoMdfbaFLlxPKNyF6-DWE4vwsyK7mkTZOUvnLUFQqj6gbaUw1fczuMCaiR3ZFtFnJROuSmh7iqXlqShXLDwj_FoBR91hpfI6VYbfSd8XgDV-PeYmuEiNAV1LYy4bYKY"
      },
      {
        "quantity": "1x",
        "name": "Fresh Passion Juice",
        "price": "KSh 350",
        "note": "Chilled, No added sugar",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuARkSHdLLJmScU4-j6HcU2RGT0sAuW-8fKcCAxsziLEI3_XeRwYa5xyyyKCP6PlPNvZqk9JqNsfdVCfsMpiYRObL5oVERDj_kd4qYa_qUmo1luLYpCSeiYH7si81E9MfQOxLSIcdMjbcCgITaae3LbzHsH4oAvQW72bdQqH_E0Sr3i3ZPNzq7WEtr06LiqI7OLfe9OSm4iR1lKc84_hewBgVHllAWQp6OpwEL7i6NZO9l-NdwbmvYqt"
      }
    ],
    "payment": {
      "status": "M-PESA CONFIRMED",
      "subtotal": "KSh 2,000",
      "deliveryFee": "KSh 250",
      "serviceFee": "KSh 50",
      "total": "KSh 2,300"
    },
    "rider": "John D. (2 mins away)"
  },
  "rider_training_dashboard": {
    "sourceFiles": [
      "rider_training_dashboard/code.html",
      "rider_training_dashboard/screen.png"
    ],
    "title": "Your Training Journey",
    "subtitle": "Complete all modules to start earning",
    "progress": "40% COMPLETE",
    "completed": "2 of 5 modules completed",
    "modules": [
      {
        "title": "Welcome to SokoEats",
        "duration": "5 mins",
        "status": "COMPLETED",
        "action": "Review Module",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuCbgAhKe2AbgDDex45XdMylr74e2OKTntQ_s5ZNF1cx6Mff9BBJPTabbHXEg_G5CY-2oVR64wkLpTIpQdlDnRGzvXijSlyRo2wUtdfLNuwLQw88rzfHPaji40gbHHPVRa3x0x0NqfH7pYZEOSVutVfSYOoEuWfd0nzp7TqAY2oJ1t8r_KH5oWYAyUf1CpySdnVy5EEb_Nls7CTgJ6Iu5r1wLQ0NR9bsnck-fPlKUbijN98qLozdn8Qn"
      },
      {
        "title": "Customer Service Excellence",
        "duration": "12 mins",
        "status": "UP NEXT",
        "action": "Start Now",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuBfj_-i3rWiTyOLYDhnLgJNRUsbFmTkpT1qqdP7nnlZsTs9MWyhLUkW34xTi1UnDL_Ha9POnlJ98WalISXze9s5_nbQfYk9evsDHMEQTQdRx5Uih7uMvwSZr4YKJ86zybjVDn6Ri9hcTZYezbNTMPLaisp6oRXqVQ_jcxrWKtlPH3VfpJwxZLb4GCfJFbQc8Zyh-sunz1PSuS-s4tRpDGw9mKP1HR2U-4c4QFgnUmhOtdWzPIRPqwIO"
      },
      {
        "title": "Safe Riding in Nairobi",
        "duration": "15 mins",
        "status": "LOCKED",
        "action": "Locked",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAyxvz91JUCqP03PFVoQgdV-gvYokiEQ5HOcSwYrxt34iU_EZ2Ad9t5Afg_Y3ca9JbiNhqhW5SUp2OJn-Bx_FoBuUHk4MQPfblT4knEcxTkMTm7G-NceqTTwCNT3j7RCSpBuHT4J85ZZzbD58c0z3QTOvvlVGiqkaf3to6_VKzU6rVVz8HYwv9cVVt7saFR_UTFkMwCCy-f-uVXRieoC3VeVaCVZVJdCL4CCKtZI5RmlE5zh9AtP0zq"
      },
      {
        "title": "Using the App & M-Pesa",
        "duration": "10 mins",
        "status": "LOCKED",
        "action": "Locked",
        "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAmiIXFaRfqD7S7eDEmIqePrmtKK6Jf0f6woeq5Ffr8MNZbgZ1fXgoSF3-UGdTz5XEYIJDi11zi6e_TtTA7WTebZUXf0sZMEpyuH42lpm9VzKu2NsZFA3PJ4lO4QYtWDIG7MWo9JcDEqoJRzyZf3MlL7Cb8fo1hmvnL6r7KGyv1sLezB-XO0FGCywS4jOGux1yPaZKDkZCkMNrb-OVG3RxyoSDkmF55ufkhHcXRUW_Wlt85uFWfdHs6"
      },
      {
        "title": "Emergency & First Aid",
        "duration": "20 mins",
        "status": "LOCKED",
        "action": "Locked"
      }
    ],
    "support": "Need help with training? Our onboarding team is available to assist you via WhatsApp or call."
  },
  "customer_service_lesson": {
    "sourceFiles": [
      "customer_service_lesson/code.html",
      "customer_service_lesson/screen.png"
    ],
    "step": "Step 4/6",
    "module": "Module 4",
    "title": "Customer Service Excellence",
    "duration": "08:45",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuCPnEAcRPGN81PTWWc7Q2S_9JwPp7bVMqUIRsBcQp8075Cv-0wBYv-5m_ttTsP6ys72GvP4Ch2bqU0fHNFUt0dxFVbWK_M4k9BGtlxQT2Nuk1-Zt5gxWYM37ZYFFaXb37Gj4kNy5OQhvoJneBYB5ct0l0juVRizhrg6uDLQ01RV9UpvgbZ5cYd-n6fKPhUp1f1pycQlCxemHvPOz7lEmwoOdED4ELZljnvzihDzfrCPLCGpMwU1SAKs",
    "sections": [
      {
        "title": "The Perfect Handover",
        "body": "First impressions matter. As the face of our service, your interaction during the handover is the most critical part of the customer's journey."
      },
      {
        "title": "Greet with a Smile",
        "body": "Always start with a friendly greeting like \"Good afternoon! Your order from [Restaurant] is here.\" Use the customer name if it is available in the app."
      },
      {
        "title": "Bag Management",
        "body": "Carefully remove the order from your thermal bag in front of the customer. This demonstrates that you've kept their food at the correct temperature."
      },
      {
        "title": "Accuracy Check",
        "body": "Briefly confirm the contents or the number of items."
      }
    ],
    "proTip": "If an item is missing or damaged, never argue. Apologize and immediately direct the customer to the 'Help' button in their app.",
    "quote": "A polite farewell like 'Enjoy your meal!' or 'Have a great evening!' can be the difference between a 4-star and a 5-star rating."
  },
  "rider_training_quiz": {
    "sourceFiles": [
      "rider_training_quiz/code.html",
      "rider_training_quiz/screen.png"
    ],
    "title": "Module Quiz",
    "progress": "Question 1 of 5",
    "completion": "20% Complete",
    "question": "If a customer's food item is missing or damaged upon delivery, what is the correct 'Pro Tip' action?",
    "options": [
      "Argue with the customer to defend the restaurant's reputation.",
      "Apologize and immediately direct the customer to the 'Help' button in their app.",
      "Tell the customer there is nothing you can do as a rider.",
      "Offer to go back to the restaurant and pay for it yourself."
    ],
    "correctIndex": 1,
    "tip": "SokoEats Support is trained to handle these issues quickly with refunds or redeliveries. Your job is to stay polite and guide them to the right tool!"
  },
  "quiz_results_feedback": {
    "sourceFiles": [
      "quiz_results_feedback/code.html",
      "quiz_results_feedback/screen.png"
    ],
    "title": "Module Complete!",
    "body": "Great job, Juma! You've successfully finished the Customer Etiquette module.",
    "score": "4 / 5",
    "accuracy": "80% Accuracy - Excellent!",
    "badge": "Ethical Deliverer Level 1",
    "mastered": [
      "Order Handover Procedures",
      "Safety & Compliance"
    ],
    "review": "One question regarding 'Handling Spillages' could use another look to reach 100% mastery.",
    "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuAavSWwtnYnEnxp-U4-KLUNA-SRyuCbjUiQ52QyASXMhCJlVV4iPFB_llH9a5_hQnDJo-A3Y-KDvT68se3eCKRMVsGM2zCJLM_qKfi16gBeCwJETjvPHq8h8ExmbN5vZDJuSz56UFaGyFsYWho-oE_7njZE6e8ZPGRWV7lLah_ew5y9T9-94dIfP_qcDV13nE-S1vsTH9SP4e3z2Np8Aoc5rp1qPo5_92mQ2Vel54NF4SVT3BHiDO7N"
  },
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
  const incomingHeaders = (init.headers || {}) as Record<string, string>;
  let token = '';
  if (!incomingHeaders.Authorization && !incomingHeaders.authorization) {
    try {
      const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      token = stored ? JSON.parse(stored)?.token || '' : '';
    } catch {
      token = '';
    }
  }
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...incomingHeaders };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.message || 'Sokoeats mobile API request failed');
  }
  return res.json() as Promise<T>;
}

function maskCheckoutPhone(value: string) {
  const normalized = normalizeCheckoutPhone(value);
  return normalized ? normalized.replace(/(\+254\d{3})\d+(\d{2})/, '$1*****$2') : 'invalid';
}

function normalizeCheckoutPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits === '254712345678' || digits === '0712345678' || digits === '712345678') return '';
  if (digits.startsWith('254') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return '';
}
function staticMapUrl(map?: MapViewport) {
  const markers: MapPoint[] = map?.markers?.length ? map.markers : (fallbackMaps.customer.nearbyVendors.map.markers as MapPoint[]);
  const center = map?.center || markers[0];
  const params = [
    `center=${center.lat},${center.lng}`,
    'zoom=14',
    'size=900x520',
    'scale=2',
    'maptype=roadmap',
    ...markers.map((point, index) => `markers=${encodeURIComponent(`color:${index === 0 ? 'orange' : index === 1 ? 'green' : 'red'}|label:${String.fromCharCode(65 + index)}|${point.lat},${point.lng}`)}`),
  ];
  if (map?.path?.length) params.push(`path=${encodeURIComponent('color:0x904d00ff|weight:5|' + map.path.map((point) => `${point.lat},${point.lng}`).join('|'))}`);
  if (GOOGLE_MAPS_API_KEY) params.push(`key=${GOOGLE_MAPS_API_KEY}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.join('&')}`;
}

function openExternalUrl(url?: string) {
  if (!url) return;
  Linking.openURL(url).catch(() => {});
}

async function exchangeGoogleTokenForFirebaseIdToken(googleIdToken: string) {
  if (!FIREBASE_API_KEY) return googleIdToken;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
      requestUri: GOOGLE_REDIRECT_URI,
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.idToken) {
    const detail = payload?.error?.message ? ` Firebase said: ${payload.error.message}` : '';
    throw new Error(`Firebase Google sign-in failed.${detail}`);
  }
  return String(payload.idToken);
}

function profileTextValue(profile: Record<string, unknown> | undefined, key: string) {
  const value = profile?.[key];
  return typeof value === 'string' ? value : '';
}

function profileCompletionTitle(role: UserRole) {
  if (role === 'rider') return 'Complete rider setup';
  if (role === 'vendor') return 'Complete vendor setup';
  if (role === 'merchant') return 'Complete merchant admin setup';
  return 'Complete your delivery profile';
}


function MapPanel({ title, subtitle, map, actionUrl, actionLabel = 'Open navigation' }: { title: string; subtitle?: string; map?: MapViewport; actionUrl?: string; actionLabel?: string }) {
  return (
    <View style={styles.mapPanel}>
      <View style={styles.sectionHeadingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.vendorName}>{title}</Text>
          {!!subtitle && <Text style={styles.restaurantMeta}>{subtitle}</Text>}
        </View>
        <TouchableOpacity style={styles.mapAction} onPress={() => openExternalUrl(actionUrl)}>
          <AppIcon name="pin" size={16} color={colors.primary} />
          <Text style={styles.changeText}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>
      <Image source={{ uri: staticMapUrl(map) }} style={styles.mapPreview} />
    </View>
  );
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
  return (
    <SafeAreaProvider>
      <SokoEatsApp />
    </SafeAreaProvider>
  );
}

function SokoEatsApp() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('splash');
  const [activeChip, setActiveChip] = useState(chips[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mpesa');
  const [riderHome, setRiderHome] = useState<RiderHomePayload>(fallbackRiderHome);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDeliveryPayload>(fallbackActiveDelivery);
  const [riderBatch, setRiderBatch] = useState<Record<string, GenericPayload>>(fallbackRiderBatch);
  const [maps, setMaps] = useState<MapsManifest>(fallbackMaps);
  const [selectedShopCategory, setSelectedShopCategory] = useState<ShopCategoryKey>('restaurants');
  const [shopRatings, setShopRatings] = useState<Record<string, number>>({});
  const [selectedShop, setSelectedShop] = useState<ShopListing | null>(shopListings[0]);
  const [shopMenuSections, setShopMenuSections] = useState<ShopMenuSection[]>(fallbackShopSections(shopListings[0]));
  const [shopMenuLoading, setShopMenuLoading] = useState(false);
  const [basketItems, setBasketItems] = useState<OrderItem[]>(defaultOrderItems);
  const [checkoutShop, setCheckoutShop] = useState<ShopListing | null>(shopListings[0]);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const screenHistory = useRef<Screen[]>([]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 550,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then((raw) => {
        if (raw) setAuthSession(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void checkForAppUpdate();
    sokoeatsApi<{ wallet: Record<string, GenericPayload> }>('/api/wallet/payment-suite').then((r) => setRiderBatch((prev) => ({ ...prev, ...r.wallet }))).catch(() => {});
    sokoeatsApi<{ maps: MapsManifest }>('/api/maps/manifest').then((r) => setMaps(r.maps)).catch(() => {});
  }, []);

  const transitionToScreen = (next: Screen) => {
    fade.setValue(0);
    setScreen(next);
    Animated.timing(fade, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  };

  const openScreen = (next: Screen) => {
    if (next === screen) return;
    screenHistory.current.push(screen);
    transitionToScreen(next);
  };

  const openShopCategory = (category: ShopCategoryKey) => {
    setSelectedShopCategory(category);
    openScreen('categories');
  };

  const openShopDetail = async (shop: ShopListing) => {
    setSelectedShop(shop);
    setSelectedShopCategory(shop.category);
    setCheckoutShop(shop);
    setBasketItems([]);
    setShopMenuSections(fallbackShopSections(shop));
    openScreen('shopDetail');
    setShopMenuLoading(true);
    try {
      const data = await sokoeatsApi<ShopMenuResponse>('/api/vendors/' + shop.id + '/menu');
      setShopMenuSections(data.sections?.length ? data.sections : fallbackShopSections(shop));
    } catch {
      setShopMenuSections(fallbackShopSections(shop));
    } finally {
      setShopMenuLoading(false);
    }
  };

  const addShopItemToBasket = (shop: ShopListing, item: ShopMenuItem, quantity: number) => {
    const safeQuantity = Math.max(1, quantity || 1);
    setCheckoutShop(shop);
    setBasketItems((prev) => {
      const existing = prev.find((entry) => entry.name === item.name);
      if (!existing) return [...prev, { quantity: safeQuantity + 'x', name: item.name, note: item.description || item.category, price: Math.round(item.price * safeQuantity) }];
      const currentQuantity = Number.parseInt(existing.quantity, 10) || 1;
      const nextQuantity = currentQuantity + safeQuantity;
      return prev.map((entry) => entry.name === item.name ? { ...entry, quantity: nextQuantity + 'x', price: Math.round(item.price * nextQuantity) } : entry);
    });
  };


  const rateShop = (shopId: string, rating: number) => {
    setShopRatings((prev) => ({ ...prev, [shopId]: rating }));
  };

  const reorderShop = (shop?: ShopListing) => {
    const nextShop = shop || checkoutShop || shopListings[0];
    const fallbackItems = fallbackShopSections(nextShop).flatMap((section) => section.items).slice(0, 2);
    setCheckoutShop(nextShop);
    setBasketItems(fallbackItems.map((item) => ({ quantity: item.popular ? '2x' : '1x', name: item.name, note: item.description || item.category, price: Math.round(item.price * (item.popular ? 2 : 1)) })));
    openScreen('checkout');
  };

  const routeForRole = (role: UserRole) => {
    if (role === 'rider') openScreen('riderHome');
    else if (role === 'support' || role === 'admin') openScreen('supportTicketHistory');
    else openScreen('home');
  };

  const handleAuthenticated = async (session: AuthSession) => {
    setAuthSession(session);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    if (session.user.profileComplete === false) openScreen('accountAccess');
    else routeForRole(session.user.role);
  };

  const handleSignOut = async () => {
    setAuthSession(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    openScreen('home');
  };

  const goBack = () => {
    const previous = screenHistory.current.pop();
    if (previous) {
      transitionToScreen(previous);
      return true;
    }
    if (screen !== 'home') {
      transitionToScreen('home');
      return true;
    }
    return true;
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [screen]);

  const subtotal = useMemo(() => basketItems.reduce((sum, item) => sum + item.price, 0), [basketItems]);
  const deliveryFee = 150;
  const serviceFee = Math.round(subtotal * 0.04);
  const discount = 250;
  const total = subtotal + deliveryFee + serviceFee - discount;

  const topSystemInset = Math.max(insets.top, StatusBar.currentHeight ?? 0, 10);

  return (
    <View style={[styles.safe, { paddingTop: topSystemInset }]}>
      <StatusBar barStyle={screen === 'splash' ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <Animated.View style={[styles.root, { opacity: fade }]}>
        <BottomNavNavigationContext.Provider value={openScreen}>
          <MapsContext.Provider value={maps}>
        {screen === 'splash' && <SplashScreen onContinue={() => openScreen('onboarding')} />}
        {screen === 'onboarding' && <OnboardingScreen onNext={() => openScreen('home')} onSkip={() => openScreen('home')} />}
        {screen === 'home' && (
          <HomeScreen
            activeChip={activeChip}
            onChipChange={setActiveChip}
            onCheckout={() => openScreen('checkout')}
            onWallet={() => openScreen('walletHome')}
            onScan={() => openScreen('scanQr')}
          onCategoryOpen={openShopCategory}
          />
        )}
        {screen === 'categories' && <CategoriesScreen category={selectedShopCategory} ratings={shopRatings} onBack={() => openScreen('home')} onCategoryChange={setSelectedShopCategory} onRate={rateShop} onReorder={reorderShop} onShopOpen={openShopDetail} />}
        {screen === 'shopDetail' && selectedShop && <ShopDetailScreen shop={selectedShop} sections={shopMenuSections} loading={shopMenuLoading} onBack={() => openScreen('categories')} onAddItem={addShopItemToBasket} onCheckout={() => openScreen('checkout')} />}
        {screen === 'orders' && <OrdersScreen onBack={() => openScreen('home')} onCheckout={() => openScreen('checkout')} onReorder={reorderShop} onRate={rateShop} ratings={shopRatings} onShopOpen={openShopDetail} />}
        {screen === 'favourites' && <FavouritesScreen onBack={() => openScreen('home')} onReorder={reorderShop} onRate={rateShop} ratings={shopRatings} onShopOpen={openShopDetail} />}
        {screen === 'accountAccess' && <AccountAccessScreen authSession={authSession} onAuthenticated={handleAuthenticated} onSignOut={handleSignOut} onBack={() => openScreen('home')} onRider={() => openScreen('riderHome')} />}
        {screen === 'walletHome' && <WalletHomeScreen data={riderBatch.sokoeats_wallet} onBack={() => openScreen('home')} onTopUp={() => openScreen('walletTopUp')} onWithdraw={() => openScreen('walletWithdraw')} onScan={() => openScreen('scanQr')} onHistory={() => openScreen('transactionHistory')} />}
        {screen === 'walletTopUp' && <WalletTopUpScreen data={riderBatch.top_up_wallet} onBack={() => openScreen('walletHome')} onSubmit={async (amount) => { const next = await sokoeatsApi<{ topUp: GenericPayload; history: GenericPayload }>('/api/wallet/top-ups', { method: 'POST', body: JSON.stringify({ amount, method: 'M-Pesa Express' }) }).catch(() => null); if (next) setRiderBatch((prev) => ({ ...prev, top_up_wallet: next.topUp, full_transaction_history: next.history })); openScreen('walletHome'); }} />}
        {screen === 'walletWithdraw' && <WalletWithdrawScreen data={riderBatch.withdraw_to_m_pesa} onBack={() => openScreen('walletHome')} onSubmit={async (amount) => { const next = await sokoeatsApi<{ withdrawal: GenericPayload }>('/api/wallet/withdrawals', { method: 'POST', body: JSON.stringify({ amount, destination: 'M-Pesa Account' }) }).catch(() => null); if (next) setRiderBatch((prev) => ({ ...prev, withdraw_to_m_pesa: next.withdrawal })); openScreen('walletHome'); }} />}
        {screen === 'scanQr' && <ScanQrScreen data={riderBatch.scan_qr_code} onBack={() => openScreen('walletHome')} onContinue={() => openScreen('confirmPayment')} />}
        {screen === 'confirmPayment' && <ConfirmPaymentScreen data={riderBatch.confirm_payment} onBack={() => openScreen('scanQr')} onConfirm={async () => { const next = await sokoeatsApi<{ success: GenericPayload; history: GenericPayload }>('/api/wallet/scan-payments', { method: 'POST', body: JSON.stringify({ amount: 1450, vendor: "Mama Njeri's Kitchen", notes: 'Community lunch pickup' }) }).catch(() => null); if (next) setRiderBatch((prev) => ({ ...prev, payment_successful: next.success, full_transaction_history: next.history })); openScreen('paymentSuccessful'); }} />}
        {screen === 'paymentSuccessful' && <PaymentSuccessfulScreen data={riderBatch.payment_successful} onBack={() => openScreen('walletHome')} onHistory={() => openScreen('transactionHistory')} />}
        {screen === 'transactionHistory' && <TransactionHistoryScreen data={riderBatch.full_transaction_history} onBack={() => openScreen('walletHome')} />}
        {screen === 'riderHome' && <RiderHomeScreen data={riderHome} onBack={() => openScreen('home')} onOnboarding={() => openScreen('riderOnboardingWelcome')} onEarnings={() => openScreen('riderEarnings')} onLeaderboard={() => openScreen('riderLeaderboard')} onProfile={() => openScreen('riderProfile')} onHelp={() => openScreen('riderHelpCenter')} onIncident={() => openScreen('riderIncidentReport')} onTraining={() => openScreen('riderTraining')} onOrderDetail={() => openScreen('riderOrderDetail')} onReferral={() => openScreen('referralHome')} onTickets={() => openScreen('supportTicketHistory')} onAccept={async () => { try { const next = await sokoeatsApi<{ riderHome: RiderHomePayload; delivery: ActiveDeliveryPayload }>(`/api/rider/requests/${riderHome.request.id}/accept`, { method: 'POST' }); setRiderHome(next.riderHome); setActiveDelivery(next.delivery); } catch {} openScreen('activeDelivery'); }} />}
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
        {screen === 'riderIncidentReport' && <RiderIncidentScreen data={riderBatch.safety_incident_report} onBack={() => openScreen('riderHome')} onSubmitted={() => openScreen('riderIncidentConfirmation')} />}
        {screen === 'riderHelpCenter' && <RiderHelpCenterScreen data={riderBatch.rider_help_center} onBack={() => openScreen('riderHome')} onChat={() => openScreen('riderLiveChat')} onIncident={() => openScreen('riderIncidentReport')} />}
        {screen === 'riderLiveChat' && <RiderLiveChatScreen data={riderBatch.live_chat_support} onBack={() => openScreen('riderHelpCenter')} onSend={async (body) => { const next = await sokoeatsApi<{ chat: GenericPayload }>('/api/rider/live-chat/messages', { method: 'POST', body: JSON.stringify({ body }) }).catch(() => null); if (next) setRiderBatch((prev) => ({ ...prev, live_chat_support: next.chat })); }} />}
        {screen === 'riderOrderDetail' && <RiderOrderDetailScreen data={riderBatch.order_details_sko_1294} onBack={() => openScreen('riderHome')} />}
        {screen === 'riderTraining' && <RiderTrainingScreen data={riderBatch.rider_training_dashboard} onBack={() => openScreen('riderHome')} onLesson={() => openScreen('riderLesson')} />}
        {screen === 'riderLesson' && <RiderLessonScreen data={riderBatch.customer_service_lesson} onBack={() => openScreen('riderTraining')} onQuiz={() => openScreen('riderQuiz')} />}
        {screen === 'riderQuiz' && <RiderQuizScreen data={riderBatch.rider_training_quiz} onBack={() => openScreen('riderLesson')} onSubmit={async (selectedIndex) => { const next = await sokoeatsApi<{ results: GenericPayload }>('/api/rider/training/quiz/submissions', { method: 'POST', body: JSON.stringify({ selectedIndex }) }).catch(() => null); if (next) setRiderBatch((prev) => ({ ...prev, quiz_results_feedback: next.results })); openScreen('riderQuizResults'); }} />}
        {screen === 'riderQuizResults' && <RiderQuizResultsScreen data={riderBatch.quiz_results_feedback} onBack={() => openScreen('riderTraining')} />}
        {screen === 'riderIncidentConfirmation' && <IncidentConfirmationScreen data={riderBatch.incident_confirmation_next_steps} onBack={() => openScreen('riderHome')} onTicket={() => openScreen('resolvedTicketDetail')} />}
        {screen === 'referralHome' && <ReferralHomeScreen data={riderBatch.invite_friends_earn_rewards} onBack={() => openScreen('riderHome')} onInvite={() => openScreen('referralContacts')} onShare={() => openScreen('referralShare')} onRewards={() => openScreen('referralRewards')} />}
        {screen === 'referralContacts' && <SelectContactsScreen data={riderBatch.select_contacts} onBack={() => openScreen('referralHome')} onSent={async (ids) => { const next = await sokoeatsApi<{ success: GenericPayload }>('/api/rider/referrals/invitations', { method: 'POST', body: JSON.stringify({ contactIds: ids }) }).catch(() => null); if (next) setRiderBatch((prev) => ({ ...prev, invitations_sent_success: next.success })); openScreen('referralSent'); }} />}
        {screen === 'referralSent' && <ReferralSentScreen data={riderBatch.invitations_sent_success} onBack={() => openScreen('referralHome')} />}
        {screen === 'referralShare' && <ReferralShareScreen data={riderBatch.whatsapp_sharing_template} onBack={() => openScreen('referralHome')} />}
        {screen === 'referralRewards' && <ReferralRewardsScreen data={riderBatch.my_referral_rewards} onBack={() => openScreen('referralHome')} />}
        {screen === 'supportTicketHistory' && <SupportTicketHistoryScreen data={riderBatch.support_ticket_history} onBack={() => openScreen('riderHome')} onTicket={() => openScreen('resolvedTicketDetail')} />}
        {screen === 'resolvedTicketDetail' && <ResolvedTicketScreen data={riderBatch.resolved_ticket_details_inc_82941} onBack={() => openScreen('supportTicketHistory')} />}
        {screen === 'checkout' && (
          <CheckoutScreen
            subtotal={subtotal}
            deliveryFee={deliveryFee}
            serviceFee={serviceFee}
            discount={discount}
            total={total}
            items={basketItems}
            shop={checkoutShop}
            paymentMethod={paymentMethod}
            onPaymentChange={setPaymentMethod}
            onBack={() => openScreen('home')}
          />
        )}
          </MapsContext.Provider>
        </BottomNavNavigationContext.Provider>
      </Animated.View>
    </View>
  );

}
function SplashScreen({ onContinue }: { onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const splashFooterLiftStyle = useMemo(
    () => ({ paddingBottom: Math.max(insets.bottom + 64, 104) }),
    [insets.bottom]
  );
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
    <View style={[styles.splashPage, splashFooterLiftStyle]}>
      <View style={styles.brandStack}>
        <View style={styles.logoTile}>
          <AppIcon name="bag" size={42} color={colors.onPrimaryContainer} />
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
              <AppIcon name="bolt" size={18} color={colors.onSecondaryContainer} />
            </View>
            <View>
              <Text style={styles.badgeLabel}>Hyper-Fast</Text>
              <Text style={styles.badgeSubLabel}>Across Nairobi</Text>
            </View>
          </View>
          <View style={styles.heartBadge}>
            <AppIcon name="heart" size={20} color={colors.error} />
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
  const insets = useSafeAreaInsets();
  const onboardingFooterLiftStyle = useMemo(
    () => ({ paddingBottom: Math.max(insets.bottom + 56, 96) }),
    [insets.bottom]
  );

  return (
    <View style={[styles.onboardingPage, onboardingFooterLiftStyle]}>
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
            <AppIcon name="fork" size={14} color={colors.primary} style={styles.inlineIcon} />
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
          <Image source={nextArrowIcon} style={styles.buttonArrowImage} />
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
  onWallet,
  onScan,
  onCategoryOpen,
}: {
  activeChip: string;
  onChipChange: (chip: string) => void;
  onCheckout: () => void;
  onWallet: () => void;
  onScan: () => void;
  onCategoryOpen: (category: ShopCategoryKey) => void;
}) {
  const maps = useContext(MapsContext) || fallbackMaps;
  return (
    <View style={styles.shell}>
      <View style={styles.homeHeader}>
        <View style={styles.headerProfileRow}>
          <Image source={{ uri: images.avatar }} style={styles.avatar} />
          <View>
            <Text style={styles.caption}>Good afternoon, Paul</Text>
            <View style={styles.locationRow}>
              <AppIcon name="pin" size={15} color={colors.primary} style={styles.inlineIcon} />
              <Text style={styles.locationText}>Nairobi CBD</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.iconCircle}>
          <AppIcon name="bell" size={19} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.searchCard}>
          <AppIcon name="search" size={19} color={colors.outline} style={styles.searchIcon} />
          <TextInput
            placeholder="Search food, shops, groceries or products"
            placeholderTextColor={colors.outline}
            style={styles.searchInput}
          />
          <AppIcon name="mic" size={19} color={colors.primary} style={styles.searchActionIcon} />
          <TouchableOpacity onPress={onScan} style={styles.searchActionButton}><AppIcon name="qr" size={19} color={colors.primary} /></TouchableOpacity>
        </View>

        <View style={styles.riderQuickGrid}>
          <TouchableOpacity style={styles.riderQuickButton} onPress={onWallet}><Text style={styles.riderQuickTitle}>Soko Wallet</Text><Text style={styles.riderQuickText}>Balance, vouchers, referrals</Text></TouchableOpacity>
          <TouchableOpacity style={styles.riderQuickButton} onPress={onScan}><Text style={styles.riderQuickTitle}>Scan to Pay</Text><Text style={styles.riderQuickText}>QR payments for local merchants</Text></TouchableOpacity>
        </View>

        <MapPanel title={maps.customer.nearbyVendors.title || 'Nearby vendors'} subtitle="Restaurants and riders around Nairobi CBD" map={maps.customer.nearbyVendors.map} actionUrl={maps.customer.nearbyVendors.actionUrl} actionLabel="Open map" />

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
            <TouchableOpacity key={category.key} style={styles.categoryItem} onPress={() => onCategoryOpen(category.key)} activeOpacity={0.82}>
              <View style={[styles.categoryIconBox, { backgroundColor: category.bg }]}>
                <AppIcon name={category.icon} size={24} color={category.fg} />
              </View>
              <Text style={styles.categoryLabel}>{category.label}</Text>
            </TouchableOpacity>
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
            <View style={styles.viewAllRow}><Text style={styles.viewAll}>View all</Text><AppIcon name="chevron" size={16} color={colors.primary} /></View>
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


function CustomerScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.checkoutHeader}>
      <View style={styles.checkoutHeaderLeft}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <AppIcon name="back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.checkoutBrand}>{title}</Text>
      </View>
      <TouchableOpacity style={styles.iconCircle}>
        <AppIcon name="bell" size={19} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

function CategoriesScreen({
  category,
  ratings,
  onBack,
  onCategoryChange,
  onRate,
  onReorder,
  onShopOpen,
}: {
  category: ShopCategoryKey;
  ratings: Record<string, number>;
  onBack: () => void;
  onCategoryChange: (category: ShopCategoryKey) => void;
  onRate: (shopId: string, rating: number) => void;
  onReorder: (shop: ShopListing) => void;
  onShopOpen: (shop: ShopListing) => void;
}) {
  const activeCopy = categoryCopy[category];
  const shops = shopListings.filter((shop) => shop.category === category);

  return (
    <View style={styles.shell}>
      <CustomerScreenHeader title="Categories" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.checkoutTitle}>Shop by need</Text>
        <Text style={styles.checkoutSubtitle}>Fast food, groceries, pharmacy runs, gas, and electronics in one SokoEats basket.</Text>
        <View style={styles.categoryGrid}>
          {categories.map((item) => {
            const active = item.key === category;
            return (
              <TouchableOpacity key={item.key} style={[styles.categoryItem, active && styles.categoryItemActive]} onPress={() => onCategoryChange(item.key)} activeOpacity={0.82}>
                <View style={[styles.categoryIconBox, { backgroundColor: item.bg }, active && styles.categoryIconBoxActive]}>
                  <AppIcon name={item.icon} size={25} color={item.fg} />
                </View>
                <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.shopCategoryHero}>
          <Text style={styles.upperLabel}>{categories.find((item) => item.key === category)?.accent}</Text>
          <Text style={styles.checkoutSectionTitle}>{activeCopy.title}</Text>
          <Text style={styles.smsBody}>{activeCopy.subtitle}</Text>
        </View>
        {shops.map((shop) => (
          <ShopCard key={shop.id} shop={shop} rating={ratings[shop.id] || Math.round(shop.rating)} onRate={(value) => onRate(shop.id, value)} onReorder={() => onReorder(shop)} onOpen={() => onShopOpen(shop)} />
        ))}
      </ScrollView>
      <BottomNav active="Categories" />
      <SourceLedger />
    </View>
  );
}

function OrdersScreen({ onBack, onCheckout, onReorder, onRate, ratings, onShopOpen }: { onBack: () => void; onCheckout: () => void; onReorder: (shop?: ShopListing) => void; onRate: (shopId: string, rating: number) => void; ratings: Record<string, number>; onShopOpen: (shop: ShopListing) => void }) {
  const previousShop = shopListings.find((shop) => shop.id === 'mama-njeri-kitchen') || shopListings[1];
  return (
    <View style={styles.shell}>
      <CustomerScreenHeader title="Orders" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.checkoutTitle}>Your orders</Text>
        <Text style={styles.checkoutSubtitle}>Review current baskets and recent SokoEats activity.</Text>
        <TouchableOpacity style={styles.orderCard} onPress={onCheckout}>
          <View style={styles.vendorRow}>
            <Image source={{ uri: images.checkoutMeal }} style={styles.orderImage} />
            <View style={{ flex: 1 }}><Text style={styles.vendorName}>Nairobi Grill House</Text><Text style={styles.checkoutSubtitle}>Ready to checkout - 3 items</Text></View>
            <AppIcon name="chevron" size={20} color={colors.primary} />
          </View>
        </TouchableOpacity>
        <View style={styles.deliveryRequestCard}>
          <Text style={styles.vendorName}>Previous delivery</Text>
          <Text style={styles.smsBody}>{previousShop.name} - Delivered yesterday to Nairobi CBD.</Text>
          <RatingControl value={ratings[previousShop.id] || Math.round(previousShop.rating)} onRate={(value) => onRate(previousShop.id, value)} />
          <TouchableOpacity style={styles.reorderButton} onPress={() => onReorder(previousShop)} activeOpacity={0.86}>
            <AppIcon name="receipt" size={17} color={colors.onPrimaryContainer} />
            <Text style={styles.reorderText}>Reorder previous basket</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <BottomNav active="Orders" />
      <SourceLedger />
    </View>
  );
}

function FavouritesScreen({ onBack, onReorder, onRate, ratings, onShopOpen }: { onBack: () => void; onReorder: (shop: ShopListing) => void; onRate: (shopId: string, rating: number) => void; ratings: Record<string, number>; onShopOpen: (shop: ShopListing) => void }) {
  const savedShops = shopListings.filter((shop) => ['nairobi-grill-house', 'mama-njeri-kitchen', 'city-fresh-grocers'].includes(shop.id));
  return (
    <View style={styles.shell}>
      <CustomerScreenHeader title="Favourites" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.checkoutTitle}>Saved vendors</Text>
        <Text style={styles.checkoutSubtitle}>Quick access to restaurants and shops you love.</Text>
        {savedShops.map((shop) => <ShopCard key={shop.id} shop={shop} rating={ratings[shop.id] || Math.round(shop.rating)} onRate={(value) => onRate(shop.id, value)} onReorder={() => onReorder(shop)} onOpen={() => onShopOpen(shop)} />)}
      </ScrollView>
      <BottomNav active="Favourites" />
      <SourceLedger />
    </View>
  );
}

function AccountAccessScreen({ authSession, onAuthenticated, onSignOut, onBack, onRider }: { authSession: AuthSession | null; onAuthenticated: (session: AuthSession) => Promise<void>; onSignOut: () => Promise<void>; onBack: () => void; onRider: () => void }) {
  const maps = useContext(MapsContext) || fallbackMaps;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<UserRole>('customer');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [city, setCity] = useState('Nairobi');
  const [defaultAddress, setDefaultAddress] = useState(maps.customer.savedAddresses?.[0]?.address || 'Nairobi CBD');
  const [businessName, setBusinessName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [vehicleType, setVehicleType] = useState('Motorbike');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [businessCategory, setBusinessCategory] = useState('Restaurant');
  const [payoutPhone, setPayoutPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    scopes: ['openid', 'profile', 'email'],
  }, { scheme: 'sokoeats', path: 'google-auth' });

  const authPayload = () => ({
    role,
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    password,
    city: city.trim() || 'Nairobi',
    defaultAddress: defaultAddress.trim(),
    businessName: businessName.trim(),
    storeAddress: storeAddress.trim(),
    vehicleType: vehicleType.trim() || 'Motorbike',
    registrationNumber: registrationNumber.trim(),
    nationalId: nationalId.trim(),
    businessCategory: businessCategory.trim(),
    payoutPhone: payoutPhone.trim() || phone.trim(),
    marketingOptIn: true,
    preferredLanguage: 'English',
  });

  const finishAuth = async (session: AuthSession) => {
    setMessage('');
    await onAuthenticated(session);
  };

  const submitPasswordAuth = async () => {
    const payload = authPayload();
    if (!payload.email || !payload.password || (mode === 'register' && !payload.fullName && !payload.businessName)) {
      Alert.alert('Complete your account details', mode === 'register' ? 'Add your name, email, and an 8 character password.' : 'Enter your email and password to continue.');
      return;
    }
    if (mode === 'register' && payload.password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters for your SokoEats account.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const session = await sokoeatsApi<AuthSession>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(mode === 'login' ? { role, email: payload.email, password: payload.password } : payload),
      });
      await finishAuth(session);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'SokoEats could not complete sign-in');
    } finally {
      setBusy(false);
    }
  };

  const submitGoogleAuth = async (idToken: string) => {
    setBusy(true);
    setMessage('');
    try {
      const firebaseIdToken = await exchangeGoogleTokenForFirebaseIdToken(idToken);
      const session = await sokoeatsApi<AuthSession>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ role, idToken: firebaseIdToken, preferredLanguage: 'English', marketingOptIn: true }),
      });
      await finishAuth(session);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Google sign-in could not be completed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === 'error') {
      setMessage(googleResponse.error?.message || 'Google sign-in returned an authorization error.');
      return;
    }
    if (googleResponse.type !== 'success') return;
    const idToken = googleResponse.params?.id_token;
    if (!idToken) {
      setMessage('Google did not return an ID token. Check the configured web/android client IDs.');
      return;
    }
    void submitGoogleAuth(idToken);
  }, [googleResponse]);

  useEffect(() => {
    if (!authSession?.user) return;
    const profile = authSession.user.profile || {};
    setPhone(authSession.user.phone || '');
    setCity(authSession.user.city || profileTextValue(profile, 'city') || 'Nairobi');
    setDefaultAddress(authSession.user.defaultAddress || profileTextValue(profile, 'defaultAddress') || profileTextValue(profile, 'address') || defaultAddress);
    setVehicleType(profileTextValue(profile, 'vehicleType') || 'Motorbike');
    setRegistrationNumber(profileTextValue(profile, 'registrationNumber'));
    setNationalId(profileTextValue(profile, 'nationalId'));
    setBusinessName(profileTextValue(profile, 'businessName'));
    setBusinessCategory(profileTextValue(profile, 'businessCategory') || 'Restaurant');
    setStoreAddress(profileTextValue(profile, 'storeAddress'));
    setPayoutPhone(profileTextValue(profile, 'payoutPhone') || authSession.user.phone || '');
  }, [authSession?.user?.id]);

  const continueWithGoogle = async () => {
    if (!GOOGLE_ANDROID_CLIENT_ID && !GOOGLE_IOS_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
      Alert.alert('Google sign-in not configured', 'Add the SokoEats Google client IDs to the Expo environment first.');
      return;
    }
    if (!FIREBASE_API_KEY) {
      Alert.alert('Firebase login not configured', 'Add EXPO_PUBLIC_FIREBASE_API_KEY to the mobile environment.');
      return;
    }
    console.info('[SokoEats][Auth] google:start', { hasRequest: Boolean(googleRequest), redirectUri: GOOGLE_REDIRECT_URI, hasAndroidClient: Boolean(GOOGLE_ANDROID_CLIENT_ID), hasWebClient: Boolean(GOOGLE_WEB_CLIENT_ID), firebaseProjectId: FIREBASE_PROJECT_ID || null });
    setMessage('');
    try {
      await promptGoogle();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Google sign-in could not open. Check the redirect URI and Firebase Android client.');
    }
  };

  const submitProfileCompletion = async () => {
    if (!authSession) return;
    const payload = authPayload();
    const currentRole = authSession.user.role;
    const missing: string[] = [];
    if (!payload.phone) missing.push('mobile number');
    if (!payload.city) missing.push('city');
    if (currentRole === 'customer' && !payload.defaultAddress) missing.push('delivery address');
    if (currentRole === 'rider' && !payload.vehicleType) missing.push('vehicle type');
    if (currentRole === 'rider' && !payload.registrationNumber) missing.push('registration number');
    if ((currentRole === 'vendor' || currentRole === 'merchant') && !payload.businessName) missing.push('business name');
    if ((currentRole === 'vendor' || currentRole === 'merchant') && !payload.storeAddress) missing.push('store address');
    if (missing.length) {
      Alert.alert('Complete your profile', 'Add ' + missing.join(', ') + ' to continue.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { role: _role, email: _email, password: _password, ...profilePayload } = payload;
      const result = await sokoeatsApi<{ user: AuthUser }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(profilePayload),
      });
      await finishAuth({ ...authSession, user: result.user });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Profile details could not be saved');
    } finally {
      setBusy(false);
    }
  };

  if (authSession) {
    const user = authSession.user;
    const signedInRole = user.role;
    const isRider = signedInRole === 'rider';
    const needsCompletion = user.profileComplete === false;
    if (needsCompletion) {
      return (
        <View style={styles.shell}>
          <CustomerScreenHeader title="Complete profile" onBack={onBack} />
          <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
            <View style={styles.profileHero}>
              {user.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={styles.profileAvatar} /> : <AppIcon name="person" size={54} color={colors.primary} />}
              <Text style={styles.checkoutTitle}>{profileCompletionTitle(signedInRole)}</Text>
              <Text style={styles.checkoutSubtitle}>Google sign-in is complete. Add the details SokoEats needs for your account.</Text>
            </View>
            <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Mobile number</Text><TextInput style={styles.formFieldInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+254 712 345 678" placeholderTextColor={colors.outline} /></View>
            <View style={styles.formFieldCard}><Text style={styles.upperLabel}>City</Text><TextInput style={styles.formFieldInput} value={city} onChangeText={setCity} placeholder="Nairobi" placeholderTextColor={colors.outline} /></View>
            {signedInRole === 'customer' && <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Delivery address</Text><TextInput style={styles.formFieldInput} value={defaultAddress} onChangeText={setDefaultAddress} placeholder="Apartment, estate, street" placeholderTextColor={colors.outline} /></View>}
            {signedInRole === 'rider' && (
              <>
                <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Vehicle type</Text><TextInput style={styles.formFieldInput} value={vehicleType} onChangeText={setVehicleType} placeholder="Motorbike" placeholderTextColor={colors.outline} /></View>
                <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Registration number</Text><TextInput style={styles.formFieldInput} value={registrationNumber} onChangeText={setRegistrationNumber} autoCapitalize="characters" placeholder="KDM 482L" placeholderTextColor={colors.outline} /></View>
                <View style={styles.formFieldCard}><Text style={styles.upperLabel}>National ID optional</Text><TextInput style={styles.formFieldInput} value={nationalId} onChangeText={setNationalId} keyboardType="number-pad" placeholder="12345678" placeholderTextColor={colors.outline} /></View>
              </>
            )}
            {(signedInRole === 'vendor' || signedInRole === 'merchant') && (
              <>
                <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Business name</Text><TextInput style={styles.formFieldInput} value={businessName} onChangeText={setBusinessName} placeholder="Nairobi Grill House" placeholderTextColor={colors.outline} /></View>
                <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Business category</Text><TextInput style={styles.formFieldInput} value={businessCategory} onChangeText={setBusinessCategory} placeholder="Restaurant" placeholderTextColor={colors.outline} /></View>
                <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Store address</Text><TextInput style={styles.formFieldInput} value={storeAddress} onChangeText={setStoreAddress} placeholder="Westlands, Nairobi" placeholderTextColor={colors.outline} /></View>
                <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Payout M-Pesa number</Text><TextInput style={styles.formFieldInput} value={payoutPhone} onChangeText={setPayoutPhone} keyboardType="phone-pad" placeholder="+254 712 345 678" placeholderTextColor={colors.outline} /></View>
              </>
            )}
            {!!user.missingProfileFields?.length && <Text style={styles.secureText}>Required: {user.missingProfileFields.join(', ')}</Text>}
            {!!message && <Text style={styles.authMessage}>{message}</Text>}
            <TouchableOpacity style={[styles.placeOrderButton, busy && styles.disabledButton]} disabled={busy} onPress={submitProfileCompletion}>
              <AppIcon name="check" size={18} color={colors.onPrimary} style={styles.inlineIcon} />
              <Text style={styles.placeOrderText}>{busy ? 'Saving...' : 'Save and continue'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={onSignOut}><Text style={styles.primaryButtonText}>Sign out</Text></TouchableOpacity>
          </ScrollView>
          <BottomNav active="Account" />
          <SourceLedger />
        </View>
      );
    }
    return (
      <View style={styles.shell}>
        <CustomerScreenHeader title="Account" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
          <View style={styles.profileHero}>
            {user.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={styles.profileAvatar} /> : <AppIcon name="person" size={54} color={colors.primary} />}
            <Text style={styles.checkoutTitle}>Hi, {user.name}</Text>
            <Text style={styles.checkoutSubtitle}>{user.email} - {user.role === 'merchant' ? 'Merchant Admin' : user.role}</Text>
          </View>
          <View style={styles.signedInCard}>
            <View style={styles.sectionHeadingRow}><Text style={styles.vendorName}>SokoEats account</Text><Text style={styles.discountText}>{user.status || 'active'}</Text></View>
            <Text style={styles.smsBody}>{isRider ? 'Rider tools, delivery requests, earnings, training, and support are unlocked on this device.' : 'Ordering, wallet, saved addresses, ratings, reorders, referrals, and payments are unlocked on this device.'}</Text>
            <Text style={styles.secureText}>Session expires {new Date(authSession.expiresAt).toLocaleDateString()}</Text>
          </View>
          <MapPanel title="Default delivery address" subtitle={user.defaultAddress || defaultAddress} map={maps.customer.savedAddresses?.[0]?.map} actionUrl={maps.customer.nearbyVendors.actionUrl} actionLabel="Open pin" />
          <TouchableOpacity style={styles.placeOrderButton} onPress={isRider ? onRider : onBack}>
            <AppIcon name={isRider ? 'bike' : 'home'} size={18} color={colors.onPrimary} style={styles.inlineIcon} />
            <Text style={styles.placeOrderText}>{isRider ? 'Open rider workspace' : 'Continue shopping'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={onSignOut}><Text style={styles.primaryButtonText}>Sign out</Text></TouchableOpacity>
        </ScrollView>
        <BottomNav active="Account" />
        <SourceLedger />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <CustomerScreenHeader title="Account" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHero}>
          <AppIcon name="person" size={54} color={colors.primary} />
          <Text style={styles.checkoutTitle}>{mode === 'login' ? 'Welcome back to SokoEats' : 'Create your SokoEats account'}</Text>
          <Text style={styles.checkoutSubtitle}>One secure account for buyers, riders, vendors, and merchant admins.</Text>
        </View>
        <View style={styles.authModeSwitch}>
          <TouchableOpacity style={mode === 'login' ? styles.tabPillActive : styles.tabPill} onPress={() => setMode('login')}><Text style={mode === 'login' ? styles.authPillActiveText : styles.authPillText}>Login</Text></TouchableOpacity>
          <TouchableOpacity style={mode === 'register' ? styles.tabPillActive : styles.tabPill} onPress={() => setMode('register')}><Text style={mode === 'register' ? styles.authPillActiveText : styles.authPillText}>Create account</Text></TouchableOpacity>
        </View>
        <View style={styles.authRoleGrid}>
          {authRoleOptions.map((option) => (
            <TouchableOpacity key={option.role} style={[styles.authRoleCard, role === option.role && styles.authRoleCardActive]} onPress={() => setRole(option.role)}>
              <AppIcon name={option.icon} size={20} color={role === option.role ? colors.onPrimaryContainer : colors.onSurfaceVariant} />
              <Text style={styles.vendorName}>{option.label}</Text>
              <Text style={styles.authRoleSubtitle}>{option.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {mode === 'register' && <View style={styles.formFieldCard}><Text style={styles.upperLabel}>{role === 'vendor' || role === 'merchant' ? 'Owner or admin name' : 'Full name'}</Text><TextInput style={styles.formFieldInput} value={fullName} onChangeText={setFullName} placeholder="Paul Mbugua" placeholderTextColor={colors.outline} /></View>}
        <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Email address</Text><TextInput style={styles.formFieldInput} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="paul@sokoeats.co.ke" placeholderTextColor={colors.outline} /></View>
        <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Password</Text><TextInput style={styles.formFieldInput} value={password} onChangeText={setPassword} secureTextEntry placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} placeholderTextColor={colors.outline} /></View>
        {mode === 'register' && <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Mobile number</Text><TextInput style={styles.formFieldInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+254 712 345 678" placeholderTextColor={colors.outline} /></View>}
        {mode === 'register' && <View style={styles.formFieldCard}><Text style={styles.upperLabel}>City</Text><TextInput style={styles.formFieldInput} value={city} onChangeText={setCity} placeholder="Nairobi" placeholderTextColor={colors.outline} /></View>}
        {mode === 'register' && role === 'customer' && <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Default delivery address</Text><TextInput style={styles.formFieldInput} value={defaultAddress} onChangeText={setDefaultAddress} placeholder="Apartment, estate, street" placeholderTextColor={colors.outline} /></View>}
        {mode === 'register' && role === 'rider' && (
          <>
            <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Vehicle type</Text><TextInput style={styles.formFieldInput} value={vehicleType} onChangeText={setVehicleType} placeholder="Motorbike" placeholderTextColor={colors.outline} /></View>
            <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Registration number</Text><TextInput style={styles.formFieldInput} value={registrationNumber} onChangeText={setRegistrationNumber} autoCapitalize="characters" placeholder="KDM 482L" placeholderTextColor={colors.outline} /></View>
          </>
        )}
        {mode === 'register' && (role === 'vendor' || role === 'merchant') && (
          <>
            <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Business name</Text><TextInput style={styles.formFieldInput} value={businessName} onChangeText={setBusinessName} placeholder="Nairobi Grill House" placeholderTextColor={colors.outline} /></View>
            <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Business category</Text><TextInput style={styles.formFieldInput} value={businessCategory} onChangeText={setBusinessCategory} placeholder="Restaurant" placeholderTextColor={colors.outline} /></View>
            <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Store address</Text><TextInput style={styles.formFieldInput} value={storeAddress} onChangeText={setStoreAddress} placeholder="Westlands, Nairobi" placeholderTextColor={colors.outline} /></View>
            <View style={styles.formFieldCard}><Text style={styles.upperLabel}>Payout M-Pesa number</Text><TextInput style={styles.formFieldInput} value={payoutPhone} onChangeText={setPayoutPhone} keyboardType="phone-pad" placeholder="+254 712 345 678" placeholderTextColor={colors.outline} /></View>
          </>
        )}
        <MapPanel title="Default delivery address" subtitle={maps.customer.savedAddresses?.[0]?.address || defaultAddress} map={maps.customer.savedAddresses?.[0]?.map} actionUrl={maps.customer.nearbyVendors.actionUrl} actionLabel="Edit pin" />
        {!!message && <Text style={styles.authMessage}>{message}</Text>}
        <TouchableOpacity style={[styles.googleAuthButton, busy && styles.disabledButton]} disabled={busy} onPress={continueWithGoogle}>
          <Text style={styles.googleMark}>G</Text>
          <Text style={styles.googleAuthText}>Continue with Google</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.placeOrderButton, busy && styles.disabledButton]} disabled={busy} onPress={submitPasswordAuth}>
          <AppIcon name={mode === 'login' ? 'person' : 'check'} size={18} color={colors.onPrimary} style={styles.inlineIcon} />
          <Text style={styles.placeOrderText}>{busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create SokoEats Account'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smsCard} onPress={onRider}><Text style={styles.vendorName}>Already delivering with SokoEats?</Text><Text style={styles.smsBody}>Open partner tools, onboarding, earnings, and support dashboards.</Text><Text style={styles.changeText}>Continue to rider mode</Text></TouchableOpacity>
      </ScrollView>
      <BottomNav active="Account" />
      <SourceLedger />
    </View>
  );
}
function RiderHomeScreen({ data, onBack, onAccept, onOnboarding, onEarnings, onLeaderboard, onProfile, onHelp, onIncident, onTraining, onOrderDetail, onReferral, onTickets }: { data: RiderHomePayload; onBack: () => void; onAccept: () => void; onOnboarding: () => void; onEarnings: () => void; onLeaderboard: () => void; onProfile: () => void; onHelp: () => void; onIncident: () => void; onTraining: () => void; onOrderDetail: () => void; onReferral: () => void; onTickets: () => void }) {
  const maps = useContext(MapsContext) || fallbackMaps;
  return (
    <View style={styles.riderShell}>
      <View style={styles.riderTop}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}><AppIcon name="back" size={20} color={colors.primary} /></TouchableOpacity>
        <Text style={styles.riderBrand}>SokoEats Rider</Text>
        <View style={styles.onlinePill}><AppIcon name="online" size={9} color={colors.secondary} /><Text style={styles.onlinePillText}>{data.rider.status}</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.riderContent} showsVerticalScrollIndicator={false}>
        <View style={styles.riderStats}>
          <View style={styles.riderStat}><Text style={styles.upperLabel}>Active Status</Text><Text style={styles.riderStatValue}>Rider Online</Text></View>
          <View style={styles.riderStat}><Text style={styles.upperLabel}>Current Zone</Text><Text style={styles.riderStatValue}>{data.rider.zone}</Text></View>
          <View style={styles.riderStat}><Text style={styles.upperLabel}>Today's Earnings</Text><Text style={styles.riderStatValue}>{data.rider.earningsToday}</Text></View>
        </View>
        <View style={styles.riderQuickGrid}><TouchableOpacity style={styles.riderQuickButton} onPress={onOnboarding}><Text style={styles.riderQuickTitle}>Onboarding</Text><Text style={styles.riderQuickText}>Finish rider verification</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onEarnings}><Text style={styles.riderQuickTitle}>Earnings</Text><Text style={styles.riderQuickText}>Cash out to M-Pesa</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onLeaderboard}><Text style={styles.riderQuickTitle}>Leaderboard</Text><Text style={styles.riderQuickText}>Weekly rider rank</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onProfile}><Text style={styles.riderQuickTitle}>Profile</Text><Text style={styles.riderQuickText}>Ratings and reviews</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onHelp}><Text style={styles.riderQuickTitle}>Help</Text><Text style={styles.riderQuickText}>Support and FAQs</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onIncident}><Text style={styles.riderQuickTitle}>Incident</Text><Text style={styles.riderQuickText}>Report safety issues</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onTraining}><Text style={styles.riderQuickTitle}>Training</Text><Text style={styles.riderQuickText}>Lessons and quiz</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onOrderDetail}><Text style={styles.riderQuickTitle}>Order #1294</Text><Text style={styles.riderQuickText}>Customer and items</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onReferral}><Text style={styles.riderQuickTitle}>Referrals</Text><Text style={styles.riderQuickText}>Invite and earn</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onTickets}><Text style={styles.riderQuickTitle}>Tickets</Text><Text style={styles.riderQuickText}>History and resolved</Text></TouchableOpacity></View>
        <ImageBackground source={{ uri: data.heatmapUrl }} style={styles.riderMapCard} imageStyle={styles.riderMapImage}>
          <View style={styles.surgeBadge}><Text style={styles.surgeText}>{data.surge.label}</Text></View>
        </ImageBackground>
        <MapPanel title={maps.rider.deliveryRequest.title || 'Delivery request map'} subtitle="Pickup, drop-off, and live rider position" map={maps.rider.deliveryRequest.map} actionUrl={maps.rider.deliveryRequest.acceptUrl} actionLabel="Navigate" />
        <View style={styles.deliveryRequestCard}>
          <View style={styles.sectionHeadingRow}><Text style={styles.checkoutSectionTitle}>{data.request.title}</Text><Text style={styles.countdownText}>{data.request.countdownSeconds}s</Text></View>
          <View style={styles.deliveryPoint}><AppIcon name="pin" size={15} color={colors.primary} style={styles.inlineIcon} /><View><Text style={styles.vendorName}>Pickup: {data.request.pickup.name}</Text><Text style={styles.restaurantMeta}>{data.request.pickup.distance}</Text></View></View>
          <View style={styles.deliveryPoint}><AppIcon name="flag" size={15} color={colors.primary} style={styles.inlineIcon} /><View><Text style={styles.vendorName}>Drop-off: {data.request.dropoff.area}</Text><Text style={styles.restaurantMeta}>{data.request.dropoff.distance}</Text></View></View>
          <View style={styles.payoutRow}><Text style={styles.upperLabel}>Estimated Payout</Text><Text style={styles.totalAmount}>{data.request.payout}</Text></View>
          <TouchableOpacity style={styles.placeOrderButton} onPress={onAccept}><Text style={styles.placeOrderText}>{data.request.status === 'accepted' ? data.request.acceptedMessage : 'Accept Order'}</Text></TouchableOpacity>
        </View>
      </ScrollView>
      <BottomNav active="Deliveries" variant="rider" />
      <SourceLedger />
    </View>
  );
}

function ActiveDeliveryScreen({ data, onBack, onArrived, onPickup }: { data: ActiveDeliveryPayload; onBack: () => void; onArrived: () => void; onPickup: () => void }) {
  const maps = useContext(MapsContext) || fallbackMaps;
  const navigationUrl = data.pickupConfirmed ? maps.rider.activeDelivery.toCustomerUrl : maps.rider.activeDelivery.toVendorUrl;
  return (
    <View style={styles.riderShell}>
      <View style={styles.riderTop}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}><AppIcon name="back" size={20} color={colors.primary} /></TouchableOpacity>
        <Text style={styles.riderBrand}>SokoEats</Text>
        <View style={styles.onlinePill}><AppIcon name="online" size={9} color={colors.secondary} /><Text style={styles.onlinePillText}>ONLINE</Text></View>
      </View>
      <View style={styles.activeDeliveryHeader}>
        <View><Text style={styles.upperLabel}>Order #{data.order.code}</Text><Text style={styles.checkoutTitle}>ETA {data.order.eta}</Text></View>
        <Text style={styles.countdownText}>Status: {data.order.status}</Text>
      </View>
      <View style={styles.deliveryProgress}><View style={[styles.deliveryProgressFill, { width: `${data.order.progressPercent}%` as `${number}%` }]} /></View>
      <TouchableOpacity style={styles.fullMap} activeOpacity={0.92} onPress={() => openExternalUrl(navigationUrl)}>
        <Image source={{ uri: staticMapUrl(maps.rider.activeDelivery.map) }} style={styles.fullMapPreview} />
        <View style={styles.destinationMarker}><Text style={styles.destinationText}>{data.destinationLabel}</Text></View>
        <View style={styles.navigationBadge}><AppIcon name="pin" size={16} color={colors.onPrimaryContainer} /><Text style={styles.destinationText}>{data.pickupConfirmed ? 'Navigate to customer' : 'Navigate to vendor'}</Text></View>
      </TouchableOpacity>
      <View style={styles.vendorPickupCard}>
        <Image source={{ uri: data.vendor.imageUrl }} style={styles.orderImage} />
        <View style={{ flex: 1 }}><Text style={styles.vendorName}>{data.vendor.name}</Text><Text style={styles.restaurantMeta}>{data.vendor.address}</Text><View style={styles.restaurantStats}><Text style={styles.timeText}>{data.vendor.badge}</Text><Text style={styles.statText}>Prep time: {data.vendor.prepTime}</Text></View></View>
        <TouchableOpacity style={styles.iconCircle}><AppIcon name="call" size={19} color={colors.primary} /></TouchableOpacity>
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
  return <View style={styles.riderTop}><TouchableOpacity style={styles.backButton} onPress={onBack}><AppIcon name="back" size={20} color={colors.primary} /></TouchableOpacity><Text style={styles.riderBrand}>{title}</Text><View style={styles.onlinePill}><AppIcon name="online" size={9} color={colors.secondary} /><Text style={styles.onlinePillText}>ONLINE</Text></View></View>;
}

function RiderWelcomeScreen({ data, onBack, onNext }: { data: GenericPayload; onBack: () => void; onNext: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Rider Onboarding" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Image source={{ uri: data.heroImageUrl }} style={styles.riderHeroImage} /><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.subtitle}</Text>{data.benefits.map((benefit: GenericPayload) => <View style={styles.onboardingInfoRow} key={benefit.title}><AppIcon name={String(benefit.icon || 'check') as IconName} size={16} color={colors.primary} style={styles.inlineIcon} /><View><Text style={styles.vendorName}>{benefit.title}</Text><Text style={styles.restaurantMeta}>{benefit.body}</Text></View></View>)}<TouchableOpacity style={styles.placeOrderButton} onPress={onNext}><Text style={styles.placeOrderText}>Get Started</Text></TouchableOpacity><Text style={styles.secureText}>{data.footer}</Text></ScrollView><SourceLedger /></View>;
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
  return <View style={styles.riderShell}><RiderScreenHeader title="Earnings" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Text style={styles.checkoutSubtitle}>Habari, {data.riderName}!</Text><Text style={styles.checkoutTitle}>{data.title}</Text><View style={styles.balanceCard}><Text style={styles.upperLabel}>Available Balance</Text><Text style={styles.balanceText}>{data.balance}</Text><Text style={styles.restaurantMeta}>{data.lastPayout}</Text><TouchableOpacity style={styles.primaryButton} onPress={onCashOut}><Text style={styles.primaryButtonText}>Cash Out</Text></TouchableOpacity></View><View style={styles.riderStats}>{data.cards.map((card: GenericPayload) => <View style={styles.riderStat} key={card.label}><Text style={styles.upperLabel}>{card.label}</Text><Text style={styles.riderStatValue}>{card.value}</Text></View>)}</View><View style={styles.deliveryRequestCard}><Text style={styles.vendorName}>{data.chart.title}</Text><Text style={styles.restaurantMeta}>Total: {data.chart.total}</Text><View style={styles.mobileChart}>{data.chart.days.map((day: GenericPayload) => <View style={styles.mobileChartBar} key={day.day + day.value}><View style={[styles.mobileChartFill, { height: String(day.value) + '%' as any }]} /><Text style={styles.categoryLabel}>{day.day}</Text></View>)}</View></View>{data.transactions.map((tx: GenericPayload) => <View style={styles.priceLine} key={tx.label}><View><Text style={styles.vendorName}>{tx.label}</Text><Text style={styles.restaurantMeta}>{tx.time}</Text></View><Text style={[styles.priceValue, tx.tone === 'credit' && styles.discountText]}>{tx.amount}</Text></View>)}<ImageBackground source={{ uri: data.mapImageUrl }} style={styles.riderMiniMap} imageStyle={styles.riderMapImage}><Text style={styles.surgeText}>{data.activity}</Text><Text style={styles.secureText}>{data.location}</Text></ImageBackground></ScrollView><BottomNav active="Earnings" variant="rider" /><SourceLedger /></View>;
}

function RiderPayoutScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.status} onBack={onBack} /><View style={[styles.riderContent, styles.centerPanel]}><View style={styles.successIcon}><AppIcon name="check" size={46} color={colors.secondary} /></View><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.balanceText}>{data.amount}</Text>{[['Sent to', data.sentTo], ['Recipient', data.recipient], ['Transaction ID', data.transactionId], ['Date & Time', data.dateTime], ['Fee', String(data.fee) + ' ' + String(data.feeLabel)]].map(([label, value]) => <View style={styles.priceLine} key={label}><Text style={styles.priceLabel}>{label}</Text><Text style={styles.priceValue}>{value}</Text></View>)}<TouchableOpacity style={styles.primaryButton}><Text style={styles.primaryButtonText}>Share Receipt</Text></TouchableOpacity><TouchableOpacity style={styles.placeOrderButton} onPress={onBack}><Text style={styles.placeOrderText}>Back to Dashboard</Text></TouchableOpacity></View><BottomNav active="Earnings" variant="rider" /><SourceLedger /></View>;
}

function RiderLeaderboardScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Leaderboard" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.tabsRow}>{data.tabs.map((tab: string, index: number) => <Text style={[styles.tabPill, index === 0 && styles.tabPillActive]} key={tab}>{tab}</Text>)}</View><View style={styles.podium}>{data.podium.map((rider: GenericPayload) => <View style={styles.podiumCard} key={rider.name}><Image source={{ uri: rider.avatarUrl }} style={styles.avatar} /><Text style={styles.totalAmount}>{rider.rank}</Text><Text style={styles.vendorName}>{rider.name}</Text><Text style={styles.restaurantMeta}>{rider.badge || rider.deliveries}</Text></View>)}</View><Text style={styles.checkoutSectionTitle}>Top Riders</Text>{data.riders.map((rider: GenericPayload) => <View style={styles.leaderRow} key={rider.name}><Text style={styles.totalAmount}>{rider.rank}</Text><View style={{ flex: 1 }}><Text style={styles.vendorName}>{rider.name} {rider.badge || ''}</Text><Text style={styles.restaurantMeta}>{rider.quality}</Text></View><Text style={styles.priceValue}>{rider.orders}</Text></View>)}<View style={styles.smsCard}><Text style={styles.vendorName}>{data.encouragement}</Text><Text style={styles.smsBody}>{data.target}</Text><Text style={styles.totalAmount}>{data.weeklyEarnings}</Text></View></ScrollView><BottomNav active="Earnings" variant="rider" /><SourceLedger /></View>;
}

function RiderProfileScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Rider Profile" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.profileHero}><Image source={{ uri: data.rider.avatarUrl }} style={styles.profileAvatar} /><Text style={styles.checkoutTitle}>{data.rider.name}</Text><Text style={styles.restaurantMeta}>{data.rider.since}</Text><Text style={styles.restaurantMeta}>{data.rider.vehicle}</Text><Text style={styles.balanceText}>{data.rider.rating}</Text><Text style={styles.upperLabel}>{data.rider.reviews}</Text></View><View style={styles.riderStats}>{data.stats.map((stat: GenericPayload) => <View style={styles.riderStat} key={stat.label}><Text style={styles.riderStatValue}>{stat.value}</Text><Text style={styles.upperLabel}>{stat.label}</Text></View>)}</View><View style={styles.deliveryRequestCard}><Text style={styles.vendorName}>Ratings Breakdown</Text>{data.ratingBreakdown.map((row: GenericPayload) => <View style={styles.ratingLine} key={row.stars}><Text>{row.stars}</Text><View style={styles.deliveryProgress}><View style={[styles.deliveryProgressFill, { width: String(row.value) + '%' as any }]} /></View></View>)}</View><View style={styles.riderQuickGrid}>{data.qualities.map((item: GenericPayload) => <View style={styles.riderQuickButton} key={item.label}><Text style={styles.riderQuickTitle}>{item.label}</Text><Text style={styles.riderQuickText}>{item.value}</Text></View>)}</View><Text style={styles.checkoutSectionTitle}>Achievements</Text><View style={styles.tabsRow}>{data.achievements.map((item: string) => <Text style={styles.tabPillActive} key={item}>{item}</Text>)}</View><Text style={styles.checkoutSectionTitle}>Recent Feedback</Text>{data.feedback.map((entry: GenericPayload) => <View style={styles.uploadCard} key={entry.customer}><Text style={styles.avatarInitial}>{entry.initials}</Text><View style={{ flex: 1 }}><Text style={styles.vendorName}>{entry.customer}</Text><Text style={styles.restaurantMeta}>{entry.age}</Text><Text style={styles.smsBody}>{entry.body}</Text></View></View>)}</ScrollView><BottomNav active="Account" variant="rider" /><SourceLedger /></View>;
}


function RiderIncidentScreen({ data, onBack, onSubmitted }: { data: GenericPayload; onBack: () => void; onSubmitted?: () => void }) {
  const maps = useContext(MapsContext) || fallbackMaps;
  const [category, setCategory] = useState(data.categories[0]);
  const [urgency, setUrgency] = useState(data.urgencyLevels[1]);
  const [description, setDescription] = useState('');
  const submit = async () => { await sokoeatsApi('/api/rider/incidents', { method: 'POST', body: JSON.stringify({ category, urgency, description: description || 'Reported from mobile incident form.' }) }).catch(() => null); onSubmitted ? onSubmitted() : onBack(); };
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.emergencyCard}><Text style={styles.checkoutSectionTitle}>{data.dangerTitle}</Text><Text style={styles.smsBody}>{data.dangerBody}</Text><TouchableOpacity style={styles.primaryButton}><Text style={styles.primaryButtonText}>Call Dispatch</Text></TouchableOpacity></View><Text style={styles.upperLabel}>Category</Text><View style={styles.tabsRow}>{data.categories.map((item: string) => <Text onPress={() => setCategory(item)} style={item === category ? styles.tabPillActive : styles.tabPill} key={item}>{item}</Text>)}</View><Text style={styles.upperLabel}>Urgency Level</Text><View style={styles.tabsRow}>{data.urgencyLevels.map((item: string) => <Text onPress={() => setUrgency(item)} style={item === urgency ? styles.tabPillActive : styles.tabPill} key={item}>{item}</Text>)}</View><View style={styles.formFieldCard}><Text style={styles.upperLabel}>Detailed Description</Text><TextInput style={styles.formFieldInput} value={description} onChangeText={setDescription} multiline placeholder="Tell dispatch what happened" placeholderTextColor={colors.outline} /></View><MapPanel title={maps.rider.safety.title || 'Safety incident location'} subtitle="Attach the exact incident location before submitting" map={maps.rider.safety.map} actionUrl={maps.rider.safety.dispatchUrl} actionLabel="Open location" /><View style={styles.riderQuickGrid}>{data.evidenceImages.map((uri: string) => <Image source={{ uri }} style={styles.evidenceThumb} key={uri} />)}</View><Text style={styles.secureText}>{data.legal}</Text><TouchableOpacity style={styles.placeOrderButton} onPress={submit}><Text style={styles.placeOrderText}>Submit Report</Text></TouchableOpacity></ScrollView><BottomNav active="Alerts" variant="rider" /><SourceLedger /></View>;
}

function RiderHelpCenterScreen({ data, onBack, onChat, onIncident }: { data: GenericPayload; onBack: () => void; onChat: () => void; onIncident: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Image source={{ uri: data.heroImageUrl }} style={styles.riderMiniMap} /><View style={styles.riderQuickGrid}><TouchableOpacity style={styles.riderQuickButton} onPress={onChat}><Text style={styles.riderQuickTitle}>{data.primaryActions[0].title}</Text><Text style={styles.riderQuickText}>{data.primaryActions[0].body}</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onIncident}><Text style={styles.riderQuickTitle}>{data.primaryActions[1].title}</Text><Text style={styles.riderQuickText}>{data.primaryActions[1].body}</Text></TouchableOpacity></View><Text style={styles.checkoutTitle}>{data.headline}</Text>{data.categories.map((item: GenericPayload) => <View style={styles.uploadCard} key={item.title}><View><Text style={styles.vendorName}>{item.title}</Text><Text style={styles.restaurantMeta}>{item.body}</Text></View><AppIcon name="chevron" size={18} color={colors.primary} /></View>)}<Text style={styles.checkoutSectionTitle}>Common Questions</Text>{data.questions.map((item: string) => <Text style={styles.helpQuestion} key={item}>{item}</Text>)}</ScrollView><BottomNav active="Alerts" variant="rider" /><SourceLedger /></View>;
}

function RiderLiveChatScreen({ data, onBack, onSend }: { data: GenericPayload; onBack: () => void; onSend: (body: string) => void }) {
  const [body, setBody] = useState('');
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><View style={styles.chatAgent}><Text style={styles.vendorName}>Support Agent: {data.agent.name}</Text><Text style={styles.discountText}>{data.agent.status}</Text></View><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.smsCard}><Text style={styles.smsBody}>{data.tip}</Text></View>{data.messages.map((message: GenericPayload, index: number) => <View style={[styles.chatBubble, message.mine && styles.chatBubbleMine]} key={String(index)}><Text style={styles.vendorName}>{message.sender}</Text><Text style={styles.smsBody}>{message.body}</Text>{message.imageUrl && <Image source={{ uri: message.imageUrl }} style={styles.chatImage} />}<Text style={styles.secureText}>{message.time}</Text></View>)}</ScrollView><View style={styles.chatComposer}><TextInput style={styles.chatInput} value={body} onChangeText={setBody} placeholder="Message support" placeholderTextColor={colors.outline} /><TouchableOpacity style={styles.primaryButton} onPress={() => { if (body.trim()) { onSend(body); setBody(''); } }}><Text style={styles.primaryButtonText}>Send</Text></TouchableOpacity></View><SourceLedger /></View>;
}

function RiderOrderDetailScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={'Order #' + data.code} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.deliveryRequestCard}><Text style={styles.upperLabel}>Current Status</Text><Text style={styles.checkoutTitle}>{data.status}</Text><View style={styles.tabsRow}>{data.timeline.map((item: string) => <Text style={styles.tabPillActive} key={item}>{item}</Text>)}</View></View><View style={styles.deliveryRequestCard}><Text style={styles.checkoutSectionTitle}>Customer Information</Text><Text style={styles.vendorName}>{data.customer.name}</Text><Text style={styles.restaurantMeta}>{data.customer.phone}</Text><Text style={styles.restaurantMeta}>{data.customer.address}</Text><Text style={styles.restaurantMeta}>{data.customer.note}</Text></View><Text style={styles.checkoutSectionTitle}>Order Items</Text>{data.items.map((item: GenericPayload) => <View style={styles.uploadCard} key={item.name}><Image source={{ uri: item.imageUrl }} style={styles.thumbSquare} /><View style={{ flex: 1 }}><Text style={styles.vendorName}>{item.quantity} {item.name}</Text><Text style={styles.restaurantMeta}>{item.note}</Text></View><Text style={styles.priceValue}>{item.price}</Text></View>)}<View style={styles.breakdownCard}>{Object.entries(data.payment).map(([label, value]) => <View style={styles.priceLine} key={label}><Text style={styles.priceLabel}>{label}</Text><Text style={styles.priceValue}>{String(value)}</Text></View>)}<Text style={styles.secureText}>Rider: {data.rider}</Text></View></ScrollView><SourceLedger /></View>;
}

function RiderTrainingScreen({ data, onBack, onLesson }: { data: GenericPayload; onBack: () => void; onLesson: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Rider Onboarding" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.subtitle}</Text><View style={styles.balanceCard}><Text style={styles.upperLabel}>{data.progress}</Text><Text style={styles.vendorName}>{data.completed}</Text></View><Text style={styles.checkoutSectionTitle}>Curriculum</Text>{data.modules.map((item: GenericPayload, index: number) => <TouchableOpacity style={styles.uploadCard} key={item.title} onPress={index === 1 ? onLesson : undefined}><Image source={item.imageUrl ? { uri: item.imageUrl } : undefined as any} style={styles.thumbSquare} /><View style={{ flex: 1 }}><Text style={styles.vendorName}>{item.title}</Text><Text style={styles.restaurantMeta}>{item.duration}</Text></View><Text style={item.status === 'COMPLETED' ? styles.discountText : styles.changeText}>{item.action}</Text></TouchableOpacity>)}<View style={styles.smsCard}><Text style={styles.smsBody}>{data.support}</Text></View></ScrollView><SourceLedger /></View>;
}

function RiderLessonScreen({ data, onBack, onQuiz }: { data: GenericPayload; onBack: () => void; onQuiz: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Customer Service" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Image source={{ uri: data.imageUrl }} style={styles.riderHeroImage} /><Text style={styles.upperLabel}>{data.step} - {data.module}</Text><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.countdownText}>{data.duration}</Text>{data.sections.map((section: GenericPayload) => <View style={styles.deliveryRequestCard} key={section.title}><Text style={styles.vendorName}>{section.title}</Text><Text style={styles.smsBody}>{section.body}</Text></View>)}<View style={styles.smsCard}><Text style={styles.vendorName}>The Pro Tip</Text><Text style={styles.smsBody}>{data.proTip}</Text><Text style={styles.secureText}>{data.quote}</Text></View><TouchableOpacity style={styles.placeOrderButton} onPress={onQuiz}><Text style={styles.placeOrderText}>Take Quiz</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}

function RiderQuizScreen({ data, onBack, onSubmit }: { data: GenericPayload; onBack: () => void; onSubmit: (selectedIndex: number) => void }) {
  const [selected, setSelected] = useState(1);
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Text style={styles.upperLabel}>{data.progress}</Text><Text style={styles.checkoutTitle}>{data.question}</Text>{data.options.map((option: string, index: number) => <Text onPress={() => setSelected(index)} style={selected === index ? styles.quizOptionActive : styles.quizOption} key={option}>{option}</Text>)}<View style={styles.smsCard}><Text style={styles.vendorName}>Rider Pro Tip</Text><Text style={styles.smsBody}>{data.tip}</Text></View><TouchableOpacity style={styles.placeOrderButton} onPress={() => onSubmit(selected)}><Text style={styles.placeOrderText}>Submit Answer</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}

function RiderQuizResultsScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Rider Training" onBack={onBack} /><ScrollView contentContainerStyle={[styles.riderContent, styles.centerPanel]}><Image source={{ uri: data.imageUrl }} style={styles.successImage} /><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.body}</Text><Text style={styles.balanceText}>{data.score}</Text><Text style={styles.discountText}>{data.accuracy}</Text><View style={styles.smsCard}><Text style={styles.vendorName}>New Badge Earned</Text><Text style={styles.totalAmount}>{data.badge}</Text></View><Text style={styles.checkoutSectionTitle}>Knowledge Check</Text>{data.mastered.map((item: string) => <Text style={styles.helpQuestion} key={item}>Mastered: {item}</Text>)}<View style={styles.emergencyCard}><Text style={styles.vendorName}>Quick Review Needed</Text><Text style={styles.smsBody}>{data.review}</Text></View><TouchableOpacity style={styles.placeOrderButton} onPress={onBack}><Text style={styles.placeOrderText}>Return to Dashboard</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}


function ReferralHomeScreen({ data, onBack, onInvite, onShare, onRewards }: { data: GenericPayload; onBack: () => void; onInvite: () => void; onShare: () => void; onRewards: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="SokoEats Referrals" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Image source={{ uri: data.heroImages[0] }} style={styles.riderHeroImage} /><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.subtitle}</Text><View style={styles.balanceCard}><Text style={styles.upperLabel}>Your Personal Code</Text><Text style={styles.balanceText}>{data.code}</Text></View><View style={styles.riderStats}><View style={styles.riderStat}><Text style={styles.riderStatValue}>{data.earnedTotal}</Text><Text style={styles.upperLabel}>Earned Total</Text></View><View style={styles.riderStat}><Text style={styles.riderStatValue}>{data.activeMembers}</Text><Text style={styles.upperLabel}>Community Members</Text></View></View><Text style={styles.vendorName}>Community Progress</Text><Text style={styles.restaurantMeta}>{data.progress} - Next Reward: {data.nextReward}</Text><View style={styles.riderQuickGrid}><TouchableOpacity style={styles.riderQuickButton} onPress={onInvite}><Text style={styles.riderQuickTitle}>Invite Friends</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onShare}><Text style={styles.riderQuickTitle}>Share Template</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onRewards}><Text style={styles.riderQuickTitle}>Rewards</Text></TouchableOpacity></View><Text style={styles.checkoutSectionTitle}>Community Activity</Text>{data.activity.map((item: GenericPayload) => <View style={styles.uploadCard} key={item.name}><View><Text style={styles.vendorName}>{item.name}</Text><Text style={styles.restaurantMeta}>{item.body}</Text></View><Text style={styles.discountText}>{item.reward || item.age}</Text></View>)}</ScrollView><BottomNav active="Account" variant="rider" /><SourceLedger /></View>;
}

function SelectContactsScreen({ data, onBack, onSent }: { data: GenericPayload; onBack: () => void; onSent: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}>{data.contacts.map((contact: GenericPayload) => <TouchableOpacity style={styles.uploadCard} key={contact.id} onPress={() => toggle(contact.id)}>{contact.avatarUrl ? <Image source={{ uri: contact.avatarUrl }} style={styles.avatar} /> : <Text style={styles.avatarInitial}>{contact.initials}</Text>}<View style={{ flex: 1 }}><Text style={styles.vendorName}>{contact.name}</Text><Text style={styles.restaurantMeta}>{contact.phone}</Text></View><Text style={selected.includes(contact.id) ? styles.discountText : styles.changeText}>{selected.includes(contact.id) ? 'Selected' : 'Invite'}</Text></TouchableOpacity>)}</ScrollView><View style={styles.placeOrderBar}><TouchableOpacity style={styles.placeOrderButton} onPress={() => onSent(selected.length ? selected : ['jabari', 'zuri', 'amani'])}><Text style={styles.placeOrderText}>Send Invitations ({selected.length})</Text></TouchableOpacity></View><SourceLedger /></View>;
}

function ReferralSentScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Referral Sent" onBack={onBack} /><ScrollView contentContainerStyle={[styles.riderContent, styles.centerPanel]}><Image source={{ uri: data.images[0] }} style={styles.successImage} /><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.body}</Text><View style={styles.smsCard}><Text style={styles.vendorName}>Potential Reward</Text><Text style={styles.totalAmount}>{data.potentialReward}</Text></View><Text style={styles.secureText}>JOIN THE COMMUNITY</Text><Text style={styles.balanceText}>{data.community}</Text><TouchableOpacity style={styles.placeOrderButton} onPress={onBack}><Text style={styles.placeOrderText}>Back to Home</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}

function ReferralShareScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Share the Vibe" onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Image source={{ uri: data.imageUrl }} style={styles.riderHeroImage} /><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.countdownText}>{data.badge}</Text><Text style={styles.checkoutSubtitle}>{data.subtitle}</Text><View style={styles.deliveryRequestCard}><Text style={styles.smsBody}>{data.message}</Text><Text style={styles.totalAmount}>{data.code}</Text><Text style={styles.changeText}>{data.link}</Text></View><View style={styles.riderQuickGrid}>{data.channels.map((channel: string) => <TouchableOpacity style={styles.riderQuickButton} key={channel}><Text style={styles.riderQuickTitle}>{channel}</Text></TouchableOpacity>)}</View><Text style={styles.secureText}>{data.reward}</Text></ScrollView><BottomNav active="Account" variant="rider" /><SourceLedger /></View>;
}

function ReferralRewardsScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Image source={{ uri: data.images[0] }} style={styles.riderHeroImage} /><View style={styles.balanceCard}><Text style={styles.upperLabel}>Total Earned</Text><Text style={styles.balanceText}>{data.totalEarned}</Text><TouchableOpacity style={styles.primaryButton}><Text style={styles.primaryButtonText}>Redeem to Wallet</Text></TouchableOpacity></View><View style={styles.riderStats}><View style={styles.riderStat}><Text style={styles.riderStatValue}>{data.successfulReferrals}</Text><Text style={styles.upperLabel}>Successful Referrals</Text></View><View style={styles.riderStat}><Text style={styles.riderStatValue}>{data.pendingRewards}</Text><Text style={styles.upperLabel}>Pending Rewards</Text></View></View>{data.friends.map((friend: GenericPayload) => <View style={styles.uploadCard} key={friend.name}><View><Text style={styles.vendorName}>{friend.name}</Text><Text style={styles.restaurantMeta}>{friend.status}</Text></View><Text style={styles.discountText}>{friend.reward || 'Pending'}</Text></View>)}<View style={styles.smsCard}><Text style={styles.vendorName}>Next Reward: Gold Tier</Text><Text style={styles.smsBody}>{data.nextReward}</Text><Text style={styles.countdownText}>{data.progress}</Text></View><Text style={styles.checkoutSectionTitle}>Harambee Activity</Text>{data.activity.map((item: string) => <Text style={styles.helpQuestion} key={item}>{item}</Text>)}</ScrollView><SourceLedger /></View>;
}

function IncidentConfirmationScreen({ data, onBack, onTicket }: { data: GenericPayload; onBack: () => void; onTicket: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Incident Reporting" onBack={onBack} /><ScrollView contentContainerStyle={[styles.riderContent, styles.centerPanel]}><Image source={{ uri: data.imageUrl }} style={styles.successImage} /><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.body}</Text><Text style={styles.totalAmount}>Ref ID: {data.refId}</Text><Text style={styles.checkoutSectionTitle}>Next Steps</Text>{data.steps.map((step: string, index: number) => <View style={styles.uploadCard} key={step}><Text style={styles.totalAmount}>{index + 1}</Text><Text style={[styles.smsBody, { flex: 1 }]}>{step}</Text></View>)}<View style={styles.smsCard}><Text style={styles.vendorName}>Safety First</Text><Text style={styles.smsBody}>{data.tip}</Text></View><TouchableOpacity style={styles.primaryButton}><Text style={styles.primaryButtonText}>Call Dispatch Now</Text></TouchableOpacity><TouchableOpacity style={styles.placeOrderButton} onPress={onTicket}><Text style={styles.placeOrderText}>View Ticket Status</Text></TouchableOpacity></ScrollView><BottomNav active="Alerts" variant="rider" /><SourceLedger /></View>;
}

function SupportTicketHistoryScreen({ data, onBack, onTicket }: { data: GenericPayload; onBack: () => void; onTicket: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.tabsRow}>{data.tabs.map((tab: string, index: number) => <Text style={index === 0 ? styles.tabPillActive : styles.tabPill} key={tab}>{tab}</Text>)}</View>{data.tickets.map((ticket: GenericPayload) => <TouchableOpacity style={styles.deliveryRequestCard} key={ticket.code} onPress={ticket.code === '#INC-82941' ? onTicket : undefined}><View style={styles.sectionHeadingRow}><Text style={styles.upperLabel}>{ticket.category}</Text><Text style={ticket.status === 'RESOLVED' ? styles.discountText : styles.countdownText}>{ticket.status}</Text></View><Text style={styles.vendorName}>{ticket.title}</Text><Text style={styles.restaurantMeta}>{ticket.code} - {ticket.updated}</Text><Text style={styles.smsBody}>{ticket.body}</Text></TouchableOpacity>)}<View style={styles.smsCard}><Text style={styles.vendorName}>Still need help?</Text><Text style={styles.smsBody}>{data.support}</Text><Text style={styles.changeText}>START NEW TICKET</Text></View></ScrollView><BottomNav active="Alerts" variant="rider" /><SourceLedger /></View>;
}

function ResolvedTicketScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={'Ticket #' + data.code} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.profileHero}><Image source={{ uri: data.images[0] }} style={styles.profileAvatar} /><Text style={styles.discountText}>{data.status}</Text><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.restaurantMeta}>{data.resolvedAt}</Text></View><View style={styles.deliveryRequestCard}><Text style={styles.upperLabel}>{data.agent.label}</Text><Text style={styles.restaurantMeta}>{data.agent.time}</Text><Text style={styles.smsBody}>{data.message}</Text></View><Text style={styles.checkoutSectionTitle}>How was your experience?</Text><View style={styles.ratingStars}>{[0, 1, 2, 3, 4].map((star) => <AppIcon key={star} name="star" size={25} color={colors.tertiary} />)}</View><View style={styles.smsCard}><Text style={styles.vendorName}>View Original Report</Text><Text style={styles.smsBody}>{data.originalReport}</Text></View><TouchableOpacity style={styles.placeOrderButton} onPress={onBack}><Text style={styles.placeOrderText}>Back to History</Text></TouchableOpacity></ScrollView><BottomNav active="Alerts" variant="rider" /><SourceLedger /></View>;
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
          <AppIcon name="star" size={13} color={colors.tertiaryFixedDim} style={styles.inlineIcon} />
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

function RatingControl({ value, onRate }: { value: number; onRate: (value: number) => void }) {
  return (
    <View style={styles.ratingControlRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onRate(star)} hitSlop={8} activeOpacity={0.72}>
          <AppIcon name="star" size={20} color={star <= value ? colors.tertiaryFixedDim : colors.outlineVariant} />
        </TouchableOpacity>
      ))}
      <Text style={styles.ratingHint}>{value}/5</Text>
    </View>
  );
}

function ShopCard({ shop, rating, onRate, onReorder, onOpen }: { shop: ShopListing; rating: number; onRate: (rating: number) => void; onReorder: () => void; onOpen: () => void }) {
  return (
    <TouchableOpacity style={styles.shopCard} onPress={onOpen} activeOpacity={0.9}>
      <Image source={{ uri: shop.image }} style={styles.shopImage} />
      <View style={styles.shopCardBody}>
        <View style={styles.sectionHeadingRowCompact}>
          <View style={{ flex: 1 }}>
            <Text style={styles.upperLabel}>{shop.badge} - {shop.distance}</Text>
            <Text style={styles.restaurantName}>{shop.name}</Text>
            <Text style={styles.restaurantMeta}>{shop.meta}</Text>
          </View>
          <View style={styles.timeBadge}><Text style={styles.timeText}>{shop.time}</Text></View>
        </View>
        <View style={styles.restaurantStats}>
          <Text style={styles.statText}>delivery {shop.delivery}</Text>
          <Text style={styles.statText}>{shop.minimum}</Text>
        </View>
        <View style={styles.shopItemChips}>
          {shop.popularItems.map((item) => <Text style={styles.shopItemChip} key={item}>{item}</Text>)}
        </View>
        <RatingControl value={rating} onRate={onRate} />
        <View style={styles.shopActionRow}>
          <TouchableOpacity style={styles.openShopButton} onPress={onOpen} activeOpacity={0.86}>
            <AppIcon name="grid" size={17} color={colors.primary} />
            <Text style={styles.openShopText}>Open shop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reorderButton, styles.reorderButtonCompact]} onPress={onReorder} activeOpacity={0.86}>
            <AppIcon name="bag" size={17} color={colors.onPrimaryContainer} />
            <Text style={styles.reorderText}>Reorder</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}


function ShopDetailScreen({ shop, sections, loading, onBack, onAddItem, onCheckout }: { shop: ShopListing; sections: ShopMenuSection[]; loading: boolean; onBack: () => void; onAddItem: (shop: ShopListing, item: ShopMenuItem, quantity: number) => void; onCheckout: () => void }) {
  const [activeSection, setActiveSection] = useState('All');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addedCount, setAddedCount] = useState(0);
  useEffect(() => { setActiveSection('All'); setAddedCount(0); setQuantities({}); }, [shop.id]);
  const visibleSections = activeSection === 'All' ? sections : sections.filter((section) => section.title === activeSection);
  const selectedCount = addedCount;
  const changeQuantity = (itemId: string, delta: number) => setQuantities((prev) => ({ ...prev, [itemId]: Math.max(1, (prev[itemId] || 1) + delta) }));
  const addItem = (item: ShopMenuItem) => {
    const quantity = quantities[item.id] || 1;
    onAddItem(shop, item, quantity);
    setAddedCount((prev) => prev + quantity);
    Alert.alert('Added to basket', quantity + 'x ' + item.name + ' added from ' + shop.name + '.');
  };
  return (
    <View style={styles.shell}>
      <CustomerScreenHeader title={shop.name} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: shop.image }} style={styles.shopDetailHeroImage} />
        <View style={styles.shopDetailSummary}>
          <Text style={styles.upperLabel}>{shop.badge} - {shop.distance}</Text>
          <Text style={styles.checkoutTitle}>{shop.name}</Text>
          <Text style={styles.checkoutSubtitle}>{shop.meta}</Text>
          <View style={styles.shopDetailStatsRow}>
            <View style={styles.shopDetailStat}><AppIcon name="star" size={15} color={colors.tertiaryFixedDim} /><Text style={styles.statText}>{shop.rating.toFixed(1)}</Text></View>
            <View style={styles.shopDetailStat}><AppIcon name="bike" size={15} color={colors.primary} /><Text style={styles.statText}>{shop.time}</Text></View>
            <View style={styles.shopDetailStat}><AppIcon name="receipt" size={15} color={colors.secondary} /><Text style={styles.statText}>{shop.minimum}</Text></View>
          </View>
        </View>
        <View style={styles.shopSectionRail}>
          {['All', ...sections.map((section) => section.title)].map((title) => (
            <TouchableOpacity key={title} style={[styles.shopSectionChip, activeSection === title && styles.shopSectionChipActive]} onPress={() => setActiveSection(title)} activeOpacity={0.82}>
              <Text style={[styles.shopSectionChipText, activeSection === title && styles.shopSectionChipTextActive]}>{title}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {loading && <Text style={styles.secureText}>Refreshing vendor uploads...</Text>}
        {visibleSections.map((section) => (
          <View key={section.id || section.title} style={styles.shopMenuSection}>
            <Text style={styles.checkoutSectionTitle}>{section.title}</Text>
            {!!section.description && <Text style={styles.restaurantMeta}>{section.description}</Text>}
            {section.items.map((item) => {
              const quantity = quantities[item.id] || 1;
              return (
                <View key={item.id} style={styles.shopMenuItemCard}>
                  <View style={styles.shopMenuItemInfo}>
                    <View style={styles.sectionHeadingRowCompact}>
                      <Text style={styles.vendorName}>{item.name}</Text>
                      {item.popular && <Text style={styles.shopPopularBadge}>Popular</Text>}
                    </View>
                    {!!item.description && <Text style={styles.restaurantMeta}>{item.description}</Text>}
                    <Text style={styles.shopMenuItemPrice}>{money(item.price)}{item.unitLabel ? ' / ' + item.unitLabel : ''}</Text>
                  </View>
                  <View style={styles.shopQuantityPanel}>
                    <View style={styles.quantityStepper}>
                      <TouchableOpacity style={styles.quantityStepButton} onPress={() => changeQuantity(item.id, -1)}><Text style={styles.quantityStepText}>-</Text></TouchableOpacity>
                      <Text style={styles.quantityStepValue}>{quantity}</Text>
                      <TouchableOpacity style={styles.quantityStepButton} onPress={() => changeQuantity(item.id, 1)}><Text style={styles.quantityStepText}>+</Text></TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.shopAddButton} onPress={() => addItem(item)} activeOpacity={0.86}>
                      <AppIcon name="bag" size={15} color={colors.onPrimaryContainer} />
                      <Text style={styles.reorderText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={styles.shopBasketBar}>
        <TouchableOpacity style={styles.placeOrderButton} onPress={selectedCount ? onCheckout : () => Alert.alert('Choose products', 'Add at least one product before reviewing your basket.')} activeOpacity={0.86}>
          <AppIcon name="bag" size={18} color={colors.onPrimaryContainer} />
          <Text style={styles.placeOrderText}>Review basket</Text>
        </TouchableOpacity>
      </View>
      <SourceLedger />
    </View>
  );
}


function WalletHomeScreen({ data, onBack, onTopUp, onWithdraw, onScan, onHistory }: { data: GenericPayload; onBack: () => void; onTopUp: () => void; onWithdraw: () => void; onScan: () => void; onHistory: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><ImageBackground source={{ uri: data.imageUrl }} style={styles.balanceCard} imageStyle={styles.riderMapImage}><Text style={styles.upperLabel}>Wallet Balance</Text><Text style={styles.balanceText}>{data.balance}</Text><Text style={styles.countdownText}>{data.points}</Text></ImageBackground><View style={styles.riderQuickGrid}><TouchableOpacity style={styles.riderQuickButton} onPress={onTopUp}><Text style={styles.riderQuickTitle}>Top Up</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onWithdraw}><Text style={styles.riderQuickTitle}>Withdraw</Text></TouchableOpacity><TouchableOpacity style={styles.riderQuickButton} onPress={onScan}><Text style={styles.riderQuickTitle}>Scan Pay</Text></TouchableOpacity></View><View style={styles.sectionHeadingRow}><Text style={styles.checkoutSectionTitle}>Active Vouchers</Text><Text style={styles.changeText}>View All</Text></View>{data.vouchers.map((voucher: GenericPayload) => <View style={styles.uploadCard} key={voucher.title}><View style={{ flex: 1 }}><Text style={styles.upperLabel}>{voucher.tag}</Text><Text style={styles.vendorName}>{voucher.title}</Text><Text style={styles.restaurantMeta}>{voucher.body}</Text><Text style={styles.secureText}>{voucher.expiry}</Text></View><Text style={styles.discountText}>Apply</Text></View>)}<TouchableOpacity style={styles.smsCard} onPress={onHistory}><Text style={styles.vendorName}>{data.referral.title}</Text><Text style={styles.smsBody}>{data.referral.body}</Text><Text style={styles.changeText}>See History</Text></TouchableOpacity><Text style={styles.checkoutSectionTitle}>Recent Activity</Text>{data.activity.map((tx: GenericPayload) => <View style={styles.priceLine} key={tx.label}><View><Text style={styles.vendorName}>{tx.label}</Text><Text style={styles.restaurantMeta}>{tx.time}</Text></View><Text style={tx.tone === 'credit' ? styles.discountText : styles.priceValue}>{tx.amount}</Text></View>)}</ScrollView><BottomNav active="Wallet" /><SourceLedger /></View>;
}

function WalletTopUpScreen({ data, onBack, onSubmit }: { data: GenericPayload; onBack: () => void; onSubmit: (amount: number) => void }) {
  const [amount, setAmount] = useState('1000');
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.balanceCard}><Text style={styles.upperLabel}>Current Balance</Text><Text style={styles.balanceText}>{data.currentBalance}</Text><Text style={styles.countdownText}>{data.memberLevel}</Text></View><View style={styles.formFieldCard}><Text style={styles.upperLabel}>Enter Amount</Text><TextInput style={styles.formFieldInput} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="KES" placeholderTextColor={colors.outline} /></View><View style={styles.tabsRow}>{data.presets.map((preset: string) => <Text style={styles.tabPillActive} onPress={() => setAmount(preset.replace(/\D/g, ''))} key={preset}>{preset}</Text>)}</View><Text style={styles.checkoutSectionTitle}>Select Payment Method</Text>{data.methods.map((method: GenericPayload) => <View style={styles.uploadCard} key={method.title}><View style={{ flex: 1 }}><Text style={styles.vendorName}>{method.title}</Text><Text style={styles.restaurantMeta}>{method.body}</Text></View><Text style={method.badge ? styles.discountText : styles.changeText}>{method.badge || 'Select'}</Text></View>)}<View style={styles.smsCard}><Text style={styles.smsBody}>{data.tip}</Text><Text style={styles.secureText}>{data.bonus}</Text></View><View style={styles.priceLine}><Text style={styles.priceLabel}>Transaction Fee</Text><Text style={styles.priceValue}>{data.fee}</Text></View><TouchableOpacity style={styles.placeOrderButton} onPress={() => onSubmit(Number(amount) || 1000)}><Text style={styles.placeOrderText}>Top Up Now</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}

function WalletWithdrawScreen({ data, onBack, onSubmit }: { data: GenericPayload; onBack: () => void; onSubmit: (amount: number) => void }) {
  const [amount, setAmount] = useState('500');
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.balanceCard}><Text style={styles.upperLabel}>Current Balance</Text><Text style={styles.balanceText}>{data.currentBalance}</Text></View><View style={styles.formFieldCard}><Text style={styles.upperLabel}>Withdrawal Amount</Text><TextInput style={styles.formFieldInput} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="KES" placeholderTextColor={colors.outline} /></View><View style={styles.tabsRow}>{data.presets.map((preset: string) => <Text style={styles.tabPillActive} onPress={() => setAmount(preset.replace(/\D/g, ''))} key={preset}>{preset}</Text>)}</View><View style={styles.deliveryRequestCard}><Text style={styles.upperLabel}>Withdraw To</Text><Text style={styles.vendorName}>{data.destination.title}</Text><Text style={styles.restaurantMeta}>{data.destination.phone}</Text><Text style={styles.changeText}>Change</Text></View><View style={styles.breakdownCard}>{Object.entries(data.summary).map(([label, value]) => <View style={styles.priceLine} key={label}><Text style={styles.priceLabel}>{label}</Text><Text style={styles.priceValue}>{String(value)}</Text></View>)}</View><Text style={styles.secureText}>{data.assurance}</Text><TouchableOpacity style={styles.placeOrderButton} onPress={() => onSubmit(Number(amount) || 500)}><Text style={styles.placeOrderText}>Confirm Withdrawal</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}

function ScanQrScreen({ data, onBack, onContinue }: { data: GenericPayload; onBack: () => void; onContinue: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ImageBackground source={{ uri: data.imageUrl }} style={[styles.riderContent, styles.centerPanel]} imageStyle={styles.riderMapImage}><View style={styles.deliveryRequestCard}><Text style={styles.checkoutTitle}>{data.frameLabel}</Text><Text style={styles.checkoutSubtitle}>{data.subtitle}</Text><View style={styles.riderQuickGrid}>{data.actions.map((action: string) => <View style={styles.riderQuickButton} key={action}><Text style={styles.riderQuickTitle}>{action}</Text></View>)}</View></View><View style={styles.smsCard}><Text style={styles.vendorName}>{data.fallback}</Text></View><TouchableOpacity style={styles.placeOrderButton} onPress={onContinue}><Text style={styles.placeOrderText}>Continue</Text></TouchableOpacity></ImageBackground><BottomNav active="Wallet" /><SourceLedger /></View>;
}

function ConfirmPaymentScreen({ data, onBack, onConfirm }: { data: GenericPayload; onBack: () => void; onConfirm: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><Image source={{ uri: data.images[0] }} style={styles.successImage} /><Text style={styles.checkoutTitle}>{data.vendor.name}</Text><Text style={styles.restaurantMeta}>{data.vendor.location}</Text><View style={styles.balanceCard}><Text style={styles.upperLabel}>Amount to Pay</Text><Text style={styles.balanceText}>{data.amount}</Text><Text style={styles.restaurantMeta}>Available Balance {data.balance}</Text></View><View style={styles.smsCard}><Text style={styles.vendorName}>Soko Points</Text><Text style={styles.totalAmount}>You'll earn {data.points.earn}</Text><Text style={styles.secureText}>{data.points.next}</Text></View><View style={styles.formFieldCard}><Text style={styles.upperLabel}>{data.noteLabel}</Text><TextInput style={styles.formFieldInput} placeholder="Add a note" placeholderTextColor={colors.outline} /></View><Text style={styles.secureText}>{data.assurance}</Text><TouchableOpacity style={styles.placeOrderButton} onPress={onConfirm}><Text style={styles.placeOrderText}>Confirm Payment</Text></TouchableOpacity><Text style={styles.secureText}>{data.secure}</Text></ScrollView><SourceLedger /></View>;
}

function PaymentSuccessfulScreen({ data, onBack, onHistory }: { data: GenericPayload; onBack: () => void; onHistory: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title="Scan to Pay" onBack={onBack} /><ScrollView contentContainerStyle={[styles.riderContent, styles.centerPanel]}><Image source={{ uri: data.imageUrl }} style={styles.successImage} /><View style={styles.successIcon}><AppIcon name="check" size={46} color={colors.secondary} /></View><Text style={styles.checkoutTitle}>{data.title}</Text><Text style={styles.checkoutSubtitle}>{data.body}</Text><Text style={styles.balanceText}>{data.amount}</Text><Text style={styles.vendorName}>{data.vendor}</Text><Text style={styles.discountText}>{data.points}</Text><Text style={styles.totalAmount}>{data.transactionId}</Text><Text style={styles.smsBody}>{data.message}</Text><TouchableOpacity style={styles.primaryButton} onPress={onHistory}><Text style={styles.primaryButtonText}>View Receipt</Text></TouchableOpacity><TouchableOpacity style={styles.placeOrderButton} onPress={onBack}><Text style={styles.placeOrderText}>Return to Wallet</Text></TouchableOpacity></ScrollView><SourceLedger /></View>;
}

function TransactionHistoryScreen({ data, onBack }: { data: GenericPayload; onBack: () => void }) {
  return <View style={styles.riderShell}><RiderScreenHeader title={data.title} onBack={onBack} /><ScrollView contentContainerStyle={styles.riderContent}><View style={styles.tabsRow}>{data.tabs.map((tab: string, index: number) => <Text style={index === 0 ? styles.tabPillActive : styles.tabPill} key={tab}>{tab}</Text>)}</View><View style={styles.tabsRow}>{data.ranges.map((range: string, index: number) => <Text style={index === 0 ? styles.tabPillActive : styles.tabPill} key={range}>{range}</Text>)}</View>{data.transactions.map((tx: GenericPayload) => <View style={styles.deliveryRequestCard} key={tx.id}><View style={styles.sectionHeadingRow}><Text style={styles.vendorName}>{tx.label}</Text><Text style={tx.tone === 'credit' ? styles.discountText : styles.priceValue}>{tx.amount}</Text></View><Text style={styles.restaurantMeta}>{tx.time}</Text><Text style={styles.secureText}>ID: {tx.id} - {tx.status}</Text></View>)}<TouchableOpacity style={styles.primaryButton}><Text style={styles.primaryButtonText}>Download Statement</Text></TouchableOpacity><Text style={styles.secureText}>{data.footer}</Text></ScrollView><BottomNav active="Wallet" /><SourceLedger /></View>;
}

function BottomNav({ active = 'Home', variant }: { active?: string; variant?: BottomNavVariant } = {}) {
  const navigate = useContext(BottomNavNavigationContext);
  const insets = useSafeAreaInsets();
  const footerDeviceClearance = Math.max(insets.bottom + 16, 52);
  const bottomNavSafeStyle = useMemo(
    () => ({
      minHeight: 78 + footerDeviceClearance,
      paddingBottom: footerDeviceClearance,
    }),
    [footerDeviceClearance]
  );
  const resolvedVariant: BottomNavVariant = variant || (['Deliveries', 'Earnings', 'Alerts'].includes(active) ? 'rider' : 'customer');
  const tabs: BottomNavItem[] = resolvedVariant === 'rider'
    ? [
        { icon: 'home', label: 'Home', screen: 'riderHome' },
        { icon: 'bike', label: 'Deliveries', screen: 'riderHome' },
        { icon: 'cash', label: 'Earnings', screen: 'riderEarnings' },
        { icon: 'bell', label: 'Alerts', screen: 'supportTicketHistory' },
        { icon: 'person', label: 'Account', screen: 'riderProfile' },
      ]
    : [
        { icon: 'home', label: 'Home', screen: 'home' },
        { icon: 'grid', label: 'Categories', screen: 'categories' },
        { icon: 'receipt', label: 'Orders', screen: 'orders' },
        { icon: 'heart', label: 'Favourites', screen: 'favourites' },
        { icon: 'person', label: 'Account', screen: 'accountAccess' },
      ];

  return (
    <View style={[styles.bottomNav, bottomNavSafeStyle]}>
      {tabs.map((tab) => {
        const selected = tab.label === active;
        return (
          <TouchableOpacity key={tab.label} style={[styles.navItem, selected && styles.navItemActive]} onPress={() => navigate?.(tab.screen)} activeOpacity={0.82}>
            <AppIcon name={tab.icon} size={18} color={selected ? colors.onPrimaryContainer : colors.onSurfaceVariant} />
            <Text style={[styles.navLabel, selected && styles.navLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CheckoutScreen({
  subtotal,
  deliveryFee,
  serviceFee,
  discount,
  total,
  items,
  shop,
  paymentMethod,
  onPaymentChange,
  onBack,
}: {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount: number;
  total: number;
  items: OrderItem[];
  shop: ShopListing | null;
  paymentMethod: PaymentMethod;
  onPaymentChange: (method: PaymentMethod) => void;
  onBack: () => void;
}) {
  const maps = useContext(MapsContext) || fallbackMaps;
  const insets = useSafeAreaInsets();
  const checkoutFooterSafeStyle = useMemo(() => ({ paddingBottom: Math.max(insets.bottom + 48, 84) }), [insets.bottom]);
  const [phone, setPhone] = useState('');
  const [placing, setPlacing] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<CheckoutPayment | null>(null);
  const [cardCheckoutOpened, setCardCheckoutOpened] = useState(false);
  const [mpesaModalVisible, setMpesaModalVisible] = useState(false);
  const [mpesaPaymentPhone, setMpesaPaymentPhone] = useState('');
  const [mpesaModalError, setMpesaModalError] = useState('');
  const [checkoutStatus, setCheckoutStatus] = useState('Payment is required before SokoEats submits this order.');

  const createOrderAfterPayment = async (reference: string) => {
    const mobile = normalizeCheckoutPhone(phone);
    if (!mobile) {
      Alert.alert('Mobile number required', 'Enter a valid Kenyan mobile number for payment and order updates.');
      return;
    }
    setPlacing(true);
    try {
      const confirmed = await sokoeatsApi<{ payment: CheckoutPayment }>(`/api/payments/${reference}/confirm`, { method: 'POST' });
      if (confirmed.payment.status !== 'paid') {
        const providerMessage = confirmed.payment.providerMessage || confirmed.payment.promptMessage || 'Payment is still pending. Complete the prompt before SokoEats places the order.';
        setPendingPayment(confirmed.payment);
        setCheckoutStatus(providerMessage);
        Alert.alert(confirmed.payment.status === 'failed' ? 'M-Pesa payment failed' : 'Payment pending', providerMessage);
        return;
      }
      const result = await sokoeatsApi<CheckoutOrderResult>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: 'Amina Customer',
          customerEmail: 'amina@sokoeats.co.ke',
          phone: mobile,
          vendorSlug: shop?.id || 'nairobi-grill-house',
          deliveryAddress: 'Apartment 4B, Central Business District, Nairobi',
          notes: 'Customer confirmed order updates by SMS.',
          discountCode: 'SOKO25',
          paymentMethod,
          paymentReference: reference,
          items: items.map((item) => ({ menuItemName: item.name, quantity: Number.parseInt(item.quantity, 10) || 1, notes: item.note || null })),
        }),
      });
      setPendingPayment(null);
      setCheckoutStatus(`Order ${result.order.code} placed. SMS updates are enabled for ${mobile}.`);
      Alert.alert('Order placed', `SokoEats received payment and placed order ${result.order.code}. SMS updates will be sent to ${mobile}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      setCheckoutStatus(message);
      Alert.alert('Checkout blocked', message);
    } finally {
      setPlacing(false);
    }
  };

  const startPayment = async (paymentPhone?: string) => {
    const mobile = normalizeCheckoutPhone(paymentPhone !== undefined ? paymentPhone : phone);
    if (!mobile) {
      const message = paymentMethod === 'mpesa'
        ? 'Enter the Safaricom M-Pesa number that should receive the STK prompt.'
        : 'Enter a valid Kenyan mobile number for payment verification and order updates.';
      if (paymentMethod === 'mpesa') setMpesaModalError(message);
      else Alert.alert('Mobile number required', message);
      return;
    }
    console.info('[SokoEats][M-Pesa][mobile] payment:start', { method: paymentMethod, amount: total, phone: maskCheckoutPhone(paymentPhone !== undefined ? paymentPhone : phone) });
    setPlacing(true);
    try {
      console.info('[SokoEats][M-Pesa][mobile] checkout-request', { method: paymentMethod, amount: total, phone: maskCheckoutPhone(mobile) });
      const { payment } = await sokoeatsApi<{ payment: CheckoutPayment }>('/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ method: paymentMethod, amount: total, currency: 'KES', phone: mobile, email: 'amina@sokoeats.co.ke', customerName: 'Amina Customer' }),
      });
      setPhone(mobile.replace('+254', ''));
      console.info('[SokoEats][M-Pesa][mobile] checkout-response', { reference: payment.reference, status: payment.status, providerReference: payment.providerReference, providerMessage: payment.providerMessage || payment.promptMessage || null });
      setPendingPayment(payment);
      setCardCheckoutOpened(false);
      if (paymentMethod === 'mpesa') {
        const mpesaMessage = payment.providerMessage || payment.promptMessage || 'Check your phone for the Safaricom M-Pesa STK prompt, enter your PIN, then return to place the order.';
        setCheckoutStatus(mpesaMessage);
        setMpesaModalVisible(false);
        setMpesaPaymentPhone('');
        setMpesaModalError('');
        return;
      }
      setCheckoutStatus('Paystack checkout is ready. Tap Pay with card to enter your card details securely.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start payment';
      console.warn('[SokoEats][M-Pesa][mobile] checkout-error', { method: paymentMethod, phone: maskCheckoutPhone(paymentPhone !== undefined ? paymentPhone : phone), message });
      setCheckoutStatus(message);
      if (paymentMethod === 'mpesa') setMpesaModalError(message);
      else Alert.alert('Payment required', message);
    } finally {
      setPlacing(false);
    }
  };

  const submitMpesaNumber = () => {
    console.info('[SokoEats][M-Pesa][mobile] modal-submit', { phone: maskCheckoutPhone(mpesaPaymentPhone), amount: total });
    setMpesaModalError('');
    void startPayment(mpesaPaymentPhone);
  };

  const checkoutAction = () => {
    if (!pendingPayment) {
      if (paymentMethod === 'mpesa') {
        console.info('[SokoEats][M-Pesa][mobile] modal-open', { amount: total });
        setMpesaPaymentPhone('');
        setMpesaModalError('');
        setMpesaModalVisible(true);
        return;
      }
      void startPayment();
      return;
    }
    if (paymentMethod === 'card' && pendingPayment.actionUrl && !cardCheckoutOpened) {
      setCardCheckoutOpened(true);
      setCheckoutStatus('Complete Paystack card payment, then return to SokoEats and confirm payment to place your order.');
      void Linking.openURL(pendingPayment.actionUrl).catch(() => {
        setCardCheckoutOpened(false);
        Alert.alert('Paystack unavailable', 'Unable to open Paystack checkout. Try again.');
      });
      return;
    }
    void createOrderAfterPayment(pendingPayment.reference);
  };
  const checkoutLabel = placing
    ? 'Processing...'
    : pendingPayment && paymentMethod === 'card' && pendingPayment.actionUrl && !cardCheckoutOpened
      ? 'Pay with card'
      : pendingPayment
        ? paymentMethod === 'mpesa' ? 'Confirm M-Pesa Payment' : 'Confirm Payment & Place Order'
        : paymentMethod === 'mpesa' ? 'Pay with M-Pesa' : 'Pay with card';
  const choosePaymentMethod = (method: PaymentMethod) => {
    if (method === paymentMethod) return;
    setPendingPayment(null);
    setCardCheckoutOpened(false);
    setCheckoutStatus('Payment is required before SokoEats submits this order.');
    onPaymentChange(method);
  };
  return (
    <View style={styles.checkoutShell}>
      <View style={styles.checkoutHeader}>
        <View style={styles.checkoutHeaderLeft}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <AppIcon name="back" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.checkoutBrand}>SokoEats</Text>
        </View>
        <View style={styles.checkoutHeaderRight}>
          <AppIcon name="bell" size={19} color={colors.primary} />
          <Image source={{ uri: images.checkoutAvatar }} style={styles.checkoutAvatar} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.checkoutContent} showsVerticalScrollIndicator={false}>
        <View style={styles.checkoutIntro}>
          <Text style={styles.checkoutTitle}>Checkout</Text>
          <Text style={styles.checkoutSubtitle}>Review your order from {shop?.name || 'Nairobi Grill House'}</Text>
        </View>

        <View style={styles.premiumCard}>
          <View style={styles.addressTop}>
            <View style={styles.addressTitleRow}>
              <View style={styles.addressIcon}>
                <AppIcon name="pin" size={18} color={colors.primary} />
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

        <MapPanel title={maps.customer.checkout.title || 'Checkout delivery route'} subtitle={`ETA ${maps.customer.checkout.route?.etaMinutes || 18} min - ${maps.customer.checkout.route?.distanceKm || 4.2} km`} map={maps.customer.checkout.map} actionUrl={maps.customer.checkout.navigationUrl} actionLabel="Directions" />

        <Text style={styles.checkoutSectionTitle}>Order Review</Text>
        <View style={styles.orderCard}>
          <View style={styles.vendorRow}>
            <Image source={{ uri: shop?.image || images.checkoutMeal }} style={styles.orderImage} />
            <View>
              <Text style={styles.vendorName}>{shop?.name || 'Nairobi Grill House'}</Text>
              <Text style={styles.checkoutSubtitle}>{shop ? shop.distance + ' away - ' + shop.time : '2.4 km away - 25-35 mins'}</Text>
            </View>
          </View>
          <View style={styles.orderItems}>
            {items.map((item) => (
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
          onPress={() => choosePaymentMethod('mpesa')}
        />
        <PaymentOption
          active={paymentMethod === 'card'}
          title="Pay with card"
          subtitle="Powered by Paystack"
          icon="card"
          onPress={() => choosePaymentMethod('card')}
        />

        <View style={styles.smsCard}>
          <View style={styles.smsTitleRow}>
            <AppIcon name="sms" size={20} color={colors.primary} />
            <Text style={styles.smsTitle}>Order Updates</Text>
          </View>
          <Text style={styles.smsBody}>Confirm your mobile number to receive real-time delivery tracking via SMS.</Text>
          <View style={styles.phoneInputWrap}>
            <Text style={styles.countryCode}>+254</Text>
            <TextInput style={styles.phoneInput} keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="Your Safaricom M-Pesa number" placeholderTextColor={colors.outline} />
          </View>
        </View>

        <View style={styles.smsCard}>
          <Text style={styles.vendorName}>Payment Gate</Text>
          <Text style={styles.smsBody}>{checkoutStatus}</Text>
          {pendingPayment && <Text style={styles.secureText}>Reference: {pendingPayment.reference}</Text>}
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

      <View style={[styles.placeOrderBar, checkoutFooterSafeStyle]}>
        <TouchableOpacity style={[styles.placeOrderButton, placing && styles.disabledButton]} activeOpacity={0.86} disabled={placing} onPress={checkoutAction}>
          <AppIcon name="bag" size={20} color={colors.onPrimary} style={styles.inlineIcon} />
          <Text style={styles.placeOrderText}>{checkoutLabel}</Text>
        </TouchableOpacity>
        <View style={styles.secureRow}><AppIcon name="lock" size={14} color={colors.onSurfaceVariant} /><Text style={styles.secureText}>Secure payment powered by SokoPay</Text></View>
      </View>
      <Modal visible={mpesaModalVisible} transparent animationType="fade" onRequestClose={() => !placing && setMpesaModalVisible(false)}>
        <View style={styles.mpesaModalOverlay}>
          <View style={styles.mpesaModalCard}>
            <View style={styles.mpesaModalIconWrap}>
              <Text style={styles.mpesaModalIcon}>M</Text>
            </View>
            <Text style={styles.mpesaModalTitle}>Pay with M-Pesa</Text>
            <Text style={styles.mpesaModalBody}>Enter the Safaricom number that should receive the STK push. Keep your phone unlocked and enter your M-Pesa PIN when the prompt appears.</Text>
            <View style={styles.mpesaModalInputWrap}>
              <Text style={styles.mpesaModalCountry}>+254</Text>
              <TextInput
                style={styles.mpesaModalInput}
                keyboardType="phone-pad"
                value={mpesaPaymentPhone}
                onChangeText={(value) => { setMpesaPaymentPhone(value); if (mpesaModalError) setMpesaModalError(''); }}
                placeholder="7XX XXX XXX"
                placeholderTextColor={colors.outline}
                autoFocus
              />
            </View>
            {!!mpesaModalError && <Text style={styles.mpesaModalError}>{mpesaModalError}</Text>}
            <View style={styles.mpesaModalActions}>
              <TouchableOpacity style={styles.mpesaModalSecondaryButton} disabled={placing} onPress={() => setMpesaModalVisible(false)}>
                <Text style={styles.mpesaModalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mpesaModalPrimaryButton, placing && styles.disabledButton]} disabled={placing} onPress={submitMpesaNumber}>
                <Text style={styles.mpesaModalPrimaryText}>{placing ? 'Sending...' : 'OK, send STK'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  splashPage: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 28,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
  },
  brandStack: {
    alignItems: 'center',
    marginTop: 22,
    paddingBottom: 30,
    zIndex: 2,
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
    paddingTop: 24,
    zIndex: 1,
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
    marginTop: 14,
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
  buttonArrowImage: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
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
    paddingBottom: 150,
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
  categoryItemActive: {
    transform: [{ translateY: -2 }],
  },
  categoryIconBoxActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  categoryLabelActive: {
    color: colors.primary,
  },
  shopCategoryHero: {
    marginTop: 24,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
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
    flexWrap: 'wrap',
  },
  shopCard: {
    marginTop: 18,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    shadowColor: '#2d3446',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  shopImage: {
    width: '100%',
    height: 150,
    backgroundColor: colors.surfaceContainerHigh,
  },
  shopCardBody: {
    padding: 16,
  },
  sectionHeadingRowCompact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  shopItemChips: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shopItemChip: {
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerLow,
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ratingControlRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  ratingHint: {
    marginLeft: 4,
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '800',
  },
  reorderButton: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reorderText: {
    color: colors.onPrimaryContainer,
    fontSize: 13,
    fontWeight: '900',
  },

  shopActionRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  openShopButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  openShopText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  reorderButtonCompact: {
    flex: 1,
    marginTop: 0,
  },
  shopDetailHeroImage: {
    width: '100%',
    height: 190,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerHigh,
  },
  shopDetailSummary: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  shopDetailStatsRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  shopDetailStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  shopSectionRail: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shopSectionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shopSectionChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryContainer,
  },
  shopSectionChipText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900',
  },
  shopSectionChipTextActive: {
    color: colors.primary,
  },
  shopMenuSection: {
    marginTop: 22,
  },
  shopMenuItemCard: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
  },
  shopMenuItemInfo: {
    flex: 1,
  },
  shopPopularBadge: {
    borderRadius: 999,
    backgroundColor: colors.tertiaryFixedDim,
    color: colors.onTertiaryFixed,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  shopMenuItemPrice: {
    marginTop: 8,
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  shopQuantityPanel: {
    width: 92,
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
  },
  quantityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerLow,
    padding: 4,
  },
  quantityStepButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityStepText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  quantityStepValue: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '900',
  },
  shopAddButton: {
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  shopBasketBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
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
    paddingTop: 12,
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
    paddingBottom: 220,
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
  mpesaModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 20, 18, 0.58)',
    justifyContent: 'center',
    padding: 24,
  },
  mpesaModalCard: {
    borderRadius: 22,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 22,
    shadowColor: '#10231d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 14,
  },
  mpesaModalIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  mpesaModalIcon: {
    color: colors.onSecondary,
    fontSize: 24,
    fontWeight: '900',
  },
  mpesaModalTitle: {
    color: colors.onBackground,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '900',
    marginBottom: 8,
  },
  mpesaModalBody: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  mpesaModalInputWrap: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  mpesaModalCountry: {
    paddingLeft: 16,
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant,
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  mpesaModalInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '800',
    paddingRight: 16,
  },
  mpesaModalError: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  mpesaModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  mpesaModalSecondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  mpesaModalSecondaryText: {
    color: colors.onSurfaceVariant,
    fontWeight: '900',
  },
  mpesaModalPrimaryButton: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  mpesaModalPrimaryText: {
    color: colors.onPrimary,
    fontWeight: '900',
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
    backgroundColor: colors.surface,
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
    paddingBottom: 150,
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
  successIcon: { alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  balanceCard: { borderRadius: 20, backgroundColor: colors.primaryContainer, padding: 18, marginVertical: 16 },
  balanceText: { color: colors.primary, fontSize: 34, lineHeight: 40, fontWeight: '900', marginVertical: 8 },
  mobileChart: { height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14 },
  mobileChartBar: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  mobileChartFill: { width: '100%', borderRadius: 8, backgroundColor: colors.primaryContainer },
  riderMiniMap: { height: 148, borderRadius: 16, overflow: 'hidden', marginTop: 12, padding: 14, justifyContent: 'flex-end' },
  tabsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  tabPill: { borderRadius: 999, backgroundColor: colors.surfaceContainerHigh, color: colors.onSurfaceVariant, paddingHorizontal: 14, paddingVertical: 8, fontWeight: '800' },
  tabPillActive: { borderRadius: 999, backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer, paddingHorizontal: 14, paddingVertical: 8, fontWeight: '900', overflow: 'hidden' },
  authModeSwitch: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  authPillText: { color: colors.onSurfaceVariant, fontWeight: '800' },
  authPillActiveText: { color: colors.onPrimaryContainer, fontWeight: '900' },
  authRoleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  authRoleCard: { width: '48%', minHeight: 112, borderRadius: 14, backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant, padding: 12, gap: 6 },
  authRoleCardActive: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  authRoleSubtitle: { color: colors.onSurfaceVariant, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  googleAuthButton: { minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginBottom: 12 },
  googleMark: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceContainerHigh, color: colors.primary, textAlign: 'center', lineHeight: 26, fontWeight: '900' },
  googleAuthText: { color: colors.onSurface, fontWeight: '900', fontSize: 15 },
  authMessage: { color: colors.error, fontWeight: '800', marginBottom: 12, lineHeight: 18 },
  signedInCard: { borderRadius: 16, backgroundColor: colors.surfaceContainerLowest, padding: 16, marginBottom: 14, gap: 8 },
  podium: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginBottom: 22 },
  podiumCard: { flex: 1, borderRadius: 16, backgroundColor: colors.surfaceContainerLowest, padding: 12, alignItems: 'center' },
  leaderRow: { borderRadius: 14, backgroundColor: colors.surfaceContainerLowest, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12, alignItems: 'center' },
  profileHero: { alignItems: 'center', borderRadius: 20, backgroundColor: colors.surfaceContainerLowest, padding: 18, marginBottom: 16 },
  profileAvatar: { width: 92, height: 92, borderRadius: 46, marginBottom: 12 },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  avatarInitial: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer, textAlign: 'center', textAlignVertical: 'center', fontWeight: '900' },
  emergencyCard: { borderRadius: 16, backgroundColor: colors.errorContainer, padding: 16, marginBottom: 16 },
  evidenceThumb: { width: '48%', height: 110, borderRadius: 12, backgroundColor: colors.surfaceContainerHigh },
  helpQuestion: { borderRadius: 12, backgroundColor: colors.surfaceContainerLowest, padding: 14, marginBottom: 10, color: colors.onSurface, fontWeight: '800' },
  chatAgent: { padding: 14, backgroundColor: colors.surfaceContainerLowest, flexDirection: 'row', justifyContent: 'space-between' },
  chatBubble: { borderRadius: 16, backgroundColor: colors.surfaceContainerLowest, padding: 14, marginBottom: 12, maxWidth: '88%' },
  chatBubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.primaryFixed },
  chatImage: { width: 180, height: 120, borderRadius: 12, marginTop: 8 },
  chatComposer: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: colors.surfaceContainerLowest },
  chatInput: { flex: 1, borderRadius: 12, backgroundColor: colors.surfaceContainer, paddingHorizontal: 12, color: colors.onSurface },
  thumbSquare: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.surfaceContainerHigh },
  quizOption: { borderRadius: 14, backgroundColor: colors.surfaceContainerLowest, padding: 14, marginBottom: 10, color: colors.onSurfaceVariant, fontWeight: '800' },
  quizOptionActive: { borderRadius: 14, backgroundColor: colors.primaryContainer, padding: 14, marginBottom: 10, color: colors.onPrimaryContainer, fontWeight: '900', overflow: 'hidden' },

  inlineIcon: {
    marginRight: 6,
  },
  searchActionButton: {
    marginLeft: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchActionIcon: {
    marginLeft: 12,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ratingStars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 12,
  },
  mapPanel: {
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 12,
    marginVertical: 14,
    shadowColor: '#2d3446',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  mapPreview: {
    width: '100%',
    height: 178,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerHigh,
    marginTop: 10,
  },
  mapAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fullMapPreview: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  navigationBadge: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 28,
    borderRadius: 999,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
