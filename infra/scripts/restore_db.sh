#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1

# Restore a custom-format PostgreSQL dump into a target database inside the Docker Compose `db` service.
DUMP_FILE="${1:?Usage: restore_db.sh <path-to-dump> [target-db]}"
TARGET_DB="${2:-pms_restore_test}"
TMP_PATH="/tmp/pms_restore.dump"

docker compose -f infra/docker-compose.yml exec -T db \
  psql -U pms -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
docker compose -f infra/docker-compose.yml exec -T db \
  psql -U pms -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${TARGET_DB};"

docker compose -f infra/docker-compose.yml cp "$DUMP_FILE" "db:${TMP_PATH}"
docker compose -f infra/docker-compose.yml exec -T db \
  pg_restore -U pms -d "${TARGET_DB}" --no-owner --no-acl "$TMP_PATH"
docker compose -f infra/docker-compose.yml exec -T db rm -f "$TMP_PATH"

echo "Restored $DUMP_FILE into database '$TARGET_DB'."
