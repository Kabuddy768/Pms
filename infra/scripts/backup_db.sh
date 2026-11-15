#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1

# Create a compressed custom-format PostgreSQL dump from the Docker Compose `db` service.
BACKUP_DIR="${1:-./infra/backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/pms_${STAMP}.dump"
TMP_PATH="/tmp/pms_${STAMP}.dump"

docker compose -f infra/docker-compose.yml exec -T db \
  pg_dump -U pms -d pms -Fc --no-owner --no-acl -f "$TMP_PATH"
docker compose -f infra/docker-compose.yml cp "db:${TMP_PATH}" "$OUT_FILE"
docker compose -f infra/docker-compose.yml exec -T db rm -f "$TMP_PATH"

echo "Created backup: $OUT_FILE"
