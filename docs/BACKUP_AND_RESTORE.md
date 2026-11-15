# Database Backup & Restore Runbook (PMS-081)

## 1. Recovery Objectives (MVP Baseline)

- **RPO (Recovery Point Objective):** 24 hours (daily automated `pg_dump` snapshots + WAL archiving on managed Postgres in production).
- **RTO (Recovery Time Objective):** < 30 minutes to provision a clean database and restore from the latest `.dump` archive.

---

## 2. Backup & Restore Scripts

- **Backup script:** `infra/scripts/backup_db.sh`
  - Uses `pg_dump -Fc --no-owner --no-acl` against the Docker Compose `db` service (`postgres:16-alpine`).
  - Saves compressed archives into `infra/backups/pms_<YYYYMMDD_HHMMSS>.dump` (gitignored).
- **Restore script:** `infra/scripts/restore_db.sh`
  - Accepts `<path-to-dump>` and `[target-db]` (defaults to `pms_restore_test` so non-production verification never overwrites the primary `pms` database).

---

## 3. Standard Commands (Git Bash / Linux / macOS)

### Take a backup
```bash
cd "/c/New folder/PMS"
./infra/scripts/backup_db.sh
```

### Restore into a non-production verification database
```bash
cd "/c/New folder/PMS"
./infra/scripts/restore_db.sh ./infra/backups/pms_YYYYMMDD_HHMMSS.dump pms_restore_test
```

### Verify restored tables and row counts
```bash
docker compose -f infra/docker-compose.yml exec -T db psql -U pms -d pms_restore_test -c "
  SELECT
    (SELECT count(*) FROM organizations_organization) AS orgs,
    (SELECT count(*) FROM properties_unit) AS units,
    (SELECT count(*) FROM accounts_user) AS users;
"
```

### Clean up non-production verification database
```bash
docker compose -f infra/docker-compose.yml exec -T db psql -U pms -d postgres -c "DROP DATABASE pms_restore_test;"
```

### Production Cutover / Disaster Recovery Restore (to `pms`)
1. Stop API writers (`runserver` / gunicorn / worker processes) to prevent split-brain writes.
2. Take a safety dump of current state if the database is still reachable.
3. Run `./infra/scripts/restore_db.sh <verified-dump-file> pms`.
4. Run `python manage.py migrate --check` and verify `GET /api/v1/health/` returns `{"status": "ok", "database": "ok"}` before re-enabling traffic.

---

## 4. Executed Non-Production Restore Verification

- **Environment:** Docker `infra-db-1` (`postgres:16-alpine`, port `5433` mapped to container `5432`)
- **Procedure executed:**
  1. Generated compressed archive `./infra/backups/pms_20261115_114408.dump` via `./infra/scripts/backup_db.sh`.
  2. Restored archive into isolated database `pms_restore_test` via `./infra/scripts/restore_db.sh`.
  3. Compared row counts across source (`pms`) and restored (`pms_restore_test`):
     - `pms`: `orgs = 1`, `units = 2`, `users = 1`
     - `pms_restore_test`: `orgs = 1`, `units = 2`, `users = 1`
  4. Dropped temporary database `pms_restore_test` after verification.
