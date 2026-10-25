#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source_env="secrets/source-db.env"
[[ -f "$source_env" ]] || { echo "Missing ${source_env}" >&2; exit 1; }
set -a
source "$source_env"
set +a
SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL//$'\r'/}"
[[ -n "${SOURCE_DATABASE_URL:-}" ]] || { echo "SOURCE_DATABASE_URL is missing" >&2; exit 1; }
mkdir -p migration-work
chmod 0700 migration-work
stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
dump="migration-work/source-${stamp}.dump"
source_counts="migration-work/source-${stamp}-counts.csv"
target_counts="migration-work/target-${stamp}-counts.csv"
compose=(docker compose --env-file .env -f compose.yml)
count_sql="copy (select 'tables' as metric,count(*)::bigint as value from pg_catalog.pg_tables where schemaname='public' union all select 'users',count(*) from sokoeats_users union all select 'orders',count(*) from sokoeats_orders union all select 'vendors',count(*) from sokoeats_vendors union all select 'tickets',count(*) from sokoeats_tickets) to stdout with csv"

echo "Creating a consistent source snapshot..."
docker run --rm --env SOURCE_DATABASE_URL --env COUNT_SQL="$count_sql" --env DUMP_FILE="/work/source-${stamp}.dump" -v "$PWD/migration-work:/work" postgres:18-alpine \
  sh -ec 'pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$DUMP_FILE" "$SOURCE_DATABASE_URL"; pg_restore --list "$DUMP_FILE" >/dev/null; psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "$COUNT_SQL"' \
  >"$source_counts"

echo "Stopping writers and replacing the private target database..."
"${compose[@]}" stop backend 2>/dev/null || true
"${compose[@]}" up -d --wait postgres
"${compose[@]}" exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "drop schema public cascade; create schema public authorization current_user"'
"${compose[@]}" exec -T postgres sh -ec 'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <"$dump"
"${compose[@]}" exec -e COUNT_SQL="$count_sql" -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$COUNT_SQL"' >"$target_counts"

diff -u "$source_counts" "$target_counts"
echo "Database restore and critical row-count comparison passed."
echo "Keep ${dump} private until acceptance, then securely remove migration-work."
