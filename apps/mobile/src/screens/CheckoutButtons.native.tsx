// apps/mobile/src/screens/CheckoutButtons.native.tsx
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';

type Props = {
  priceLabel?: string;
  onStripe?: () => void;
  onPayPal?: () => void;
  loadingStripe?: boolean;
  loadingPayPal?: boolean;
  disabled?: boolean;
};

const CheckoutButtons: React.FC<Props> = ({
  priceLabel = 'Certificate: $9',
  onStripe,
  onPayPal,
  loadingStripe = false,
  loadingPayPal = false,
  disabled = false,
}) => {
  const stripeDisabled = disabled || loadingStripe;
  const paypalDisabled = disabled || loadingPayPal;

  return (
    <View style={styles.row} accessible accessibilityRole="toolbar">
      <Text style={styles.price} accessibilityLabel={`Price ${priceLabel}`}>
        {priceLabel}
      </Text>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Pay with Stripe"
        onPress={onStripe}
        disabled={stripeDisabled}
        style={[styles.btn, styles.stripe, stripeDisabled && styles.disabled]}
      >
        {loadingStripe ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Pay with Stripe</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Pay with PayPal"
        onPress={onPayPal}
        disabled={paypalDisabled}
        style={[styles.btn, styles.paypal, paypalDisabled && styles.disabled]}
      >
        {loadingPayPal ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.paypalText}>PayPal</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  paypal: {
    backgroundColor: '#ffc439',
  },
  paypalText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  price: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginRight: 4,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  stripe: {
    backgroundColor: '#4f46e5', // indigo-600
  },
});

export default CheckoutButtons;
