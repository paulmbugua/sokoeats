#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_LOCAL_RETENTION_DAYS:-14}"
SCHEDULE_UTC="${BACKUP_SCHEDULE_UTC:-02:30}"

log() { printf '%s [backup] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
require_env() { [[ -n "${!1:-}" ]] || { log "required variable is missing: $1"; return 1; }; }

restore_test() {
  local dump_path="$1" test_db="${PGDATABASE}_restore_test_$(date -u +%s)"
  log "starting isolated restore test"
  createdb --maintenance-db=postgres "$test_db"
  trap 'dropdb --if-exists --maintenance-db=postgres "$test_db" >/dev/null 2>&1 || true' RETURN
  pg_restore --exit-on-error --no-owner --no-privileges --dbname="$test_db" "$dump_path"
  local table_count
  table_count="$(psql --dbname="$test_db" -Atqc "select count(*) from pg_catalog.pg_tables where schemaname='public'")"
  [[ "$table_count" =~ ^[1-9][0-9]*$ ]] || { log "restore test contains no public tables"; return 1; }
  log "restore test passed (${table_count} public tables)"
  dropdb --if-exists --maintenance-db=postgres "$test_db"
  trap - RETURN
}

backup_now() {
  require_env BACKUP_AGE_RECIPIENT
  require_env BACKUP_S3_BUCKET
  require_env BACKUP_S3_ENDPOINT
  mkdir -p "$BACKUP_DIR"
  local stamp base temporary encrypted manifest target
  stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  base="sokoeats-${PGDATABASE}-${stamp}"
  temporary="/tmp/${base}.dump"
  encrypted="${BACKUP_DIR}/${base}.dump.age"
  manifest="${encrypted}.sha256"
  target="s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-sokoeats/postgres}/"
  trap 'rm -f "$temporary"' EXIT

  log "creating PostgreSQL custom-format backup"
  pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$temporary"
  pg_restore --list "$temporary" >/dev/null
  restore_test "$temporary"
  age --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted" "$temporary"
  sha256sum "$encrypted" >"$manifest"
  chmod 0600 "$encrypted" "$manifest"
  rm -f "$temporary"
  trap - EXIT

  aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$encrypted" "$target" --only-show-errors
  aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$manifest" "$target" --only-show-errors
  find "$BACKUP_DIR" -type f \( -name '*.dump.age' -o -name '*.sha256' \) -mtime "+${RETENTION_DAYS}" -delete
  log "encrypted backup uploaded and completed"
}

seconds_until_schedule() {
  local now target
  now="$(date -u +%s)"
  target="$(date -u -d "today ${SCHEDULE_UTC}" +%s)"
  (( target > now )) || target="$(date -u -d "tomorrow ${SCHEDULE_UTC}" +%s)"
  echo $((target - now))
}

case "${1:-daemon}" in
  backup-now) backup_now ;;
  daemon)
    while true; do
      wait_seconds="$(seconds_until_schedule)"
      log "next backup scheduled in ${wait_seconds}s"
      sleep "$wait_seconds"
      backup_now || log "backup failed; retrying at the next scheduled run"
    done
    ;;
  *) echo "usage: sokoeats-backup [daemon|backup-now]" >&2; exit 2 ;;
esac
