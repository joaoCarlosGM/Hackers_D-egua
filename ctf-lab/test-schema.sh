#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name="hpde-ctf-review-sql-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$name" -e POSTGRES_PASSWORD=test-only-local postgres:17-alpine >/dev/null
for i in $(seq 1 35); do
 docker exec "$name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
 sleep 1
done
psql_db(){ docker exec -i "$name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 "$@"; }
psql_db < supabase/tests/bootstrap.sql >/dev/null
for migration in supabase/migrations/*.sql; do
  case "$migration" in
   *202611180001_preserve_historical_ranking.sql|*202611190006_freeze_published_ranking.sql) continue;;
  esac
  echo "Schema applying $(basename "$migration")"
  psql_db < "$migration" >/dev/null
done
psql_db < ctf-lab/test-schema.sql
