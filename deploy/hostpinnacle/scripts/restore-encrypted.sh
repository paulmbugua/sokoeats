#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: sokoeats-restore <encrypted-backup.dump.age> <age-identity-file>" >&2
  exit 2
fi

encrypted="$1"
identity="$2"
manifest="${encrypted}.sha256"
temporary="$(mktemp /tmp/sokoeats-restore.XXXXXX.dump)"
test_db="${PGDATABASE}_manual_restore_test_$(date -u +%s)"
trap 'rm -f "$temporary"; dropdb --if-exists --maintenance-db=postgres "$test_db" >/dev/null 2>&1 || true' EXIT

[[ -f "$manifest" ]] && sha256sum -c "$manifest"
age --decrypt --identity "$identity" --output "$temporary" "$encrypted"
pg_restore --list "$temporary" >/dev/null
createdb --maintenance-db=postgres "$test_db"
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$test_db" "$temporary"
psql --dbname="$test_db" -Atqc "select count(*) from pg_catalog.pg_tables where schemaname='public'" | grep -Eq '^[1-9][0-9]*$'
echo "Encrypted backup restore test passed."
