#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
compose=(docker compose --env-file .env -f compose.yml)

echo "Checking private container health..."
"${compose[@]}" ps
for service in postgres backend web admin operations backup; do
  cid="$("${compose[@]}" ps -q "$service")"
  [[ -n "$cid" ]] || { echo "${service}: container missing" >&2; exit 1; }
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
  [[ "$status" == healthy || "$status" == running ]] || { echo "${service}: unhealthy (${status})" >&2; exit 1; }
done

echo "Checking PostgreSQL and internal HTTP services..."
"${compose[@]}" exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "select count(*) from pg_catalog.pg_tables where schemaname='\''public'\''"' | grep -Eq '^[1-9][0-9]*$'
"${compose[@]}" exec -T backend node -e "fetch('http://127.0.0.1:4000/readyz').then(async r=>{const b=await r.json();if(r.status!==200||!b.ok)process.exit(1)})"
"${compose[@]}" exec -T web node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)})"
for service in admin operations; do
  "${compose[@]}" exec -T "$service" wget -q --spider http://127.0.0.1:8080/healthz
  "${compose[@]}" exec -T "$service" sh -ec "wget -qO- http://127.0.0.1:8080/a-route-that-does-not-exist | grep -q '<div id=\"root\"></div>'"
done
echo "All private-stack checks passed."
