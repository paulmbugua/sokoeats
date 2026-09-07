# SokoEats Kenya pricing policy

Checkout prices come from a server-authoritative quote that remains valid for 15 minutes. Mobile and web must display the returned components without recalculating the final amount locally.

## Basket minimum

- Platform basket minimum: KES 300.
- Orders below KES 300 remain available and receive a KES 50 small-order fee.
- The customer sees how much more to add to remove the fee.
- Delivery pricing is not reduced for a small basket because the rider still completes the same pickup and drop-off route.

## Delivery fee

Google Routes supplies traffic-aware routed kilometres and minutes between the shop and the confirmed delivery pin.

- Base fee: KES 100.
- Rider minimum: KES 150, or a higher configured shop floor.
- Included route: first 2 km and first 15 minutes.
- Additional distance: KES 35 per routed kilometre.
- Additional traffic time: KES 3 per minute after 15 minutes.
- The result is rounded up to the nearest KES 5.
- A separately disclosed demand surcharge can apply. It is never hidden inside the route fee.

All amounts are configurable through the `SOKOEATS_*` pricing environment variables. Changes require a new quote and do not alter a paid order.

## VAT

The general VAT rate is 16%. VAT is calculated only from the taxable item subtotal for a VAT-registered partner. Zero-rated and exempt items contribute KES 0 VAT. A partner that is not recorded as VAT registered also contributes KES 0 VAT.

The checkout identifies the rate, taxable subtotal, and VAT amount. VAT registration and product tax classification must be verified before enabling collection in production. Tax treatment should be reviewed by a Kenyan tax professional whenever the business model or applicable legislation changes.
