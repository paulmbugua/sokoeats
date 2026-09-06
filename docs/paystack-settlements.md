# Paystack collections and settlements

## Collection model

SokoEats is the merchant of record for marketplace checkout. Both customer options use Paystack:

- **M-PESA** uses Paystack Charge with the `mobile_money` channel and `mpesa` provider. Paystack triggers the customer STK prompt.
- **Card** uses Paystack Transaction Initialize with `channels: ["card"]`.

An order can only be created after a signed `charge.success` webhook or server-side transaction verification confirms the exact reference, KES currency, and amount. Configure this one Paystack webhook URL:

```text
https://api.sokoeats.co.ke/api/payments/paystack/webhook
```

Do not configure the old Daraja callback. Refunds are submitted against the original Paystack transaction.

## Partner setup

Every verified vendor and rider receives a Paystack **transfer recipient code**. This is what SokoEats uses for controlled payouts after delivery.

- M-PESA wallet: `mobile_money`
- Till or Paybill: `mobile_money_business`
- Bank: `kepss`

Bank-settlement vendors also receive a Paystack **subaccount code** for reconciliation. SokoEats does not split funds directly at checkout because that would release vendor money before delivery OTP confirmation and make disputes and refunds harder to control.

## Release policy

1. Customer payment is confirmed.
2. Vendor accepts the order.
3. Rider is assigned and confirms pickup.
4. Customer delivery OTP is confirmed.
5. New vendors become payable after T+1; standard vendors after six hours; trusted vendors enter the configured same-day cutoff batch.
6. Riders use a daily batch by default. Immediate payout is allowed only when the entitlement meets `RIDER_IMMEDIATE_MINIMUM`.
7. Open disputes freeze every unpaid instruction.
8. Due instructions for the same Paystack recipient are combined into one transfer batch.

The batch stores estimated and actual provider fees. The actual transfer fee is posted once to the double-entry ledger when Paystack confirms the transfer.

## Launch economics

The launch commission is 10% of vendor item subtotal and the standard customer service fee is 4%. The first completed order waives the service fee. Distance delivery fees fund the rider; dynamic surge is allocated 70% rider, 10% vendor, and 20% platform.

The admin endpoint below evaluates contribution after Paystack collection and amortized daily transfer fees:

```text
GET /api/admin/finance/unit-economics?subtotal=1000&deliveryFee=150&channel=mpesa&vendorBatchOrders=10&riderBatchDeliveries=10
```

Review contribution margins before changing commission, service fee, rider minimums, transfer frequency, or surge allocation.
