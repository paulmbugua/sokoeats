# Production acceptance

Do not decommission Railway or the existing Cloudflare Workers until every
required item is recorded as passed.

## Infrastructure

- [ ] Compose configuration contains no published application/database ports.
- [ ] PostgreSQL, backend, web, admin, operations, backup, and tunnel are healthy.
- [ ] VPS firewall permits only SSH and any pre-existing approved services.
- [ ] Tunnel is dedicated to SokoEats and its ingress ends with a 404 rule.
- [ ] Current DNS is snapshotted; mail and verification records are unchanged.
- [ ] JSON logs rotate and service restart policies are active.

## Data and recovery

- [ ] Final source dump completed after a documented write freeze.
- [ ] Source/target table, user, order, vendor, and ticket counts match.
- [ ] The API reports database readiness from the restored database.
- [ ] An encrypted backup is present locally and in off-server private storage.
- [ ] A downloaded encrypted backup passes checksum, decryption, and restore test.
- [ ] Age private identity is stored off-server in an approved recovery location.

## Public workflows

- [ ] Apex and `www` load over TLS with correct static assets and metadata.
- [ ] Platform admin and store operations load and survive deep-link refresh.
- [ ] Buyer email login, Google login, logout, and profile completion work.
- [ ] Merchant registration, product management, order handling, and approval work.
- [ ] Rider/foot-courier registration, private document upload, review, and notification work.
- [ ] Product image upload and delivery via R2 work.
- [ ] Private documents have short-lived signed URLs and no public bucket URL.
- [ ] Cart, delivery pricing/surge, Paystack payment, webhook, and order settlement work.
- [ ] Maps, tracking, customer-care tickets, email, and push notifications work.
- [ ] Mobile production build uses `https://server.sokoeats.co.ke` successfully.

## Observation and acceptance

- [ ] No new backend 5xx, database, CORS, tunnel, or webhook errors during observation.
- [ ] Railway and old Workers remain unchanged and available for rollback.
- [ ] The owner has provided final written production acceptance.
