#!/usr/bin/env bash
# Runs all Supabase migrations + RLS tests against a throwaway local PostgreSQL.
# Needs PostgreSQL server binaries (initdb, pg_ctl, psql) and a non-root user.
#   bash scripts/test-db-local.sh
# This does NOT touch your Supabase project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [ -z "$PG_BIN" ] || [ ! -x "$PG_BIN/initdb" ]; then
  echo "PostgreSQL server binaries not found (set PG_BIN=/path/to/bin)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/local/00_supabase_stub.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
done
for test in "$ROOT"/supabase/tests/local/step*_test.sql; do
  echo "Running $(basename "$test")"
  "${PSQL[@]}" -o /dev/null -f "$test" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
done
