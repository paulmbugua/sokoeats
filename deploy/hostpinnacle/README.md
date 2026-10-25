# SokoEats HostPinnacle production

This directory defines the private production stack used to migrate SokoEats
from Railway and Cloudflare Workers to the HostPinnacle VPS. PostgreSQL and all
application ports remain private Docker-network services. Public traffic enters
only through a dedicated Cloudflare Tunnel.

## Service map

| Public hostname | Private service |
| --- | --- |
| `sokoeats.co.ke` | `http://web:3000` |
| `www.sokoeats.co.ke` | `http://web:3000` |
| `server.sokoeats.co.ke` | `http://backend:4000` |
| `admin.sokoeats.co.ke` | `http://admin:8080` |
| `admin-operations.sokoeats.co.ke` | `http://operations:8080` |

Cloudflare R2 remains the system of record for product images and private rider
documents. The private `sokoeats-docs` bucket must not have a public domain or
public development URL. `R2_PUBLIC_BASE_URL_DOCS` is intentionally absent.

## VPS layout and secrets

Install the repository at `/opt/apps/sokoeats`. Create these untracked files on
the VPS with mode `0600`:

- `.env`: Compose settings, generated database password, public build settings,
  and the dedicated Cloudflare Tunnel ID.
- `secrets/cloudflared/config.yml` and tunnel credential JSON: the locally
  managed ingress map and dedicated tunnel credential.
- `secrets/backend.env`: copied production API credentials and policy settings,
  excluding `DATABASE_URL`, `PGSSL`, `PORT`, `NODE_ENV`, `API_PUBLIC_URL`, and
  `WEB_APP_URL`, which Compose controls.
- `secrets/backup.env`: dedicated R2 backup credentials and an age public
  recipient. Keep the corresponding age private identity off the VPS.
- `secrets/source-db.env`: temporary `SOURCE_DATABASE_URL` for Railway. Delete it
  after migration validation.

Never reuse the application R2 key for backups. Give the backup key access only
to its dedicated private bucket/prefix. Keep all example placeholders empty.

## Build and private staging

```bash
cd /opt/apps/sokoeats/deploy/hostpinnacle
cp .env.example .env
mkdir -p secrets migration-work
chmod 0700 secrets migration-work
cp secrets/backend.env.example secrets/backend.env
cp secrets/backup.env.example secrets/backup.env
chmod 0600 .env secrets/*.env

docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml build
docker compose --env-file .env -f compose.yml up -d postgres
./scripts/migrate-source-db.sh
docker compose --env-file .env -f compose.yml up -d migrate backend web admin operations backup
./scripts/verify.sh
```

The tunnel has a `cutover` profile and is not started during private staging.
The one-shot `migrate` service uses a PostgreSQL advisory lock and must finish
before the API starts.

## Database migration

The migration script uses `pg_dump` custom format, validates the archive,
restores into a clean private target schema, and compares critical source/target
counts for tables, users, orders, vendors, and tickets. Run it once for staging
and again during the final write freeze so that no Railway writes are omitted.
The target uses PostgreSQL 18 to match the current Railway production major
version; do not downgrade the target volume in place.

Do not expose PostgreSQL on a host port. Do not delete Railway after cutover; it
is the immediate rollback target until written acceptance and retention expiry.

## Encrypted backups

The backup container runs daily and performs all of these steps:

1. Creates a consistent custom-format dump.
2. Validates the archive and restores it into an isolated disposable database.
3. Encrypts it using age before it enters persistent backup storage.
4. Uploads the encrypted archive and checksum to dedicated private R2 storage.
5. Removes expired local encrypted copies.

Run and verify the first backup before cutover:

```bash
docker compose --env-file .env -f compose.yml run --rm backup backup-now
```

Download one encrypted archive to a controlled recovery machine and run
`sokoeats-restore` with the off-server identity to prove decryption and restore.

## Cloudflare Tunnel

Create one dedicated locally managed tunnel named `sokoeats-hostpinnacle` and
configure the service map above. Use HTTP origins because traffic remains on the
private Docker network. Add a final catch-all rule returning HTTP 404. Copy
`cloudflared.config.yml.example` to `secrets/cloudflared/config.yml`, substitute
the tunnel ID, and keep the credential JSON in that private directory.

Snapshot the zone before changing routes:

```powershell
./scripts/snapshot-dns.ps1 -ApiToken $env:CLOUDFLARE_API_TOKEN
```

The snapshot and tunnel credentials are migration artifacts and must not be committed.
Preserve MX, SPF, DKIM, DMARC, CAA, verification, R2, and unrelated records.

After private validation and the final Railway snapshot, start the connector:

```bash
docker compose --env-file .env -f compose.yml --profile cutover up -d cloudflared
```

Route one hostname at a time: admin operations, admin, API, `www`, then apex. Validate
TLS, API readiness, browser CORS, login, checkout, Paystack webhooks, Maps,
uploads, private-document review, email, push notifications, rider workflows,
and admin approval after every relevant route.

## Routine operations

```bash
docker compose --env-file .env -f compose.yml ps
./scripts/verify.sh
docker compose --env-file .env -f compose.yml logs --since=30m backend
docker compose --env-file .env -f compose.yml pull postgres cloudflared
```

Container logs rotate at five 20 MB files. Services restart unless stopped.
Apply image updates deliberately and run the acceptance checklist afterward.

See [ACCEPTANCE.md](./ACCEPTANCE.md) and [ROLLBACK.md](./ROLLBACK.md).
