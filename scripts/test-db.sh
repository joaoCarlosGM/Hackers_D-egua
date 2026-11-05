#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Only a fresh disposable container is touched. Never accepts a remote URL.
container="hackers-db-test-$$"
docker_local() { env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"; }
trap 'docker_local rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker_local run -d --name "$container" -e POSTGRES_PASSWORD=local-test-only postgres:17-alpine -c wal_level=logical >/dev/null
ready=0
for ((i=0;i<40;i++)); do
 if docker_local exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=1; break; fi
 sleep 1
done
[ "$ready" -eq 1 ] || { docker_local logs "$container"; exit 1; }
psql_test() { docker_local exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 "$@"; }
psql_test < supabase/tests/bootstrap.sql
for migration in supabase/migrations/*.sql; do psql_test < "$migration"; done
psql_test < supabase/tests/acceptance.sql
psql_test < supabase/tests/assessments.sql
psql_test < supabase/tests/class_management.sql
psql_test < supabase/tests/team_management.sql
source scripts/test-class-concurrency.sh
psql_test < supabase/tests/persistence.sql
docker_local restart "$container" >/dev/null
ready=0
for ((i=0;i<40;i++)); do
 if docker_local exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=1; break; fi
 sleep 1
done
[ "$ready" -eq 1 ] || { docker_local logs "$container"; exit 1; }
psql_test < supabase/tests/after_restart.sql
