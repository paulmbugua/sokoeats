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

type Screen = 'splash' | 'onboarding' | 'home' | 'checkout';
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

function BottomNav() {
  const tabs = [
    ['home', 'Home'],
    ['grid', 'Categories'],
    ['receipt', 'Orders'],
    ['heart', 'Favourites'],
    ['person', 'Account'],
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map(([icon, label], index) => (
        <View key={label} style={[styles.navItem, index === 0 && styles.navItemActive]}>
          <Text style={[styles.navIcon, index === 0 && styles.navIconActive]}>{icon}</Text>
          <Text style={[styles.navLabel, index === 0 && styles.navLabelActive]}>{label}</Text>
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
});
