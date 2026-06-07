#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pulmo_web_UI}"
SOURCE_DB="${SOURCE_DB:-inventory}"
TARGET_DB="${TARGET_DB:-pulmodb}"
PM2_NAME="${PM2_NAME:-pulmo-backend}"
CONFIRM_COPY_TO_PULMODB="${CONFIRM_COPY_TO_PULMODB:-false}"
STOP_APP_FOR_COPY="${STOP_APP_FOR_COPY:-true}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/database/backups}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "ERROR: app directory not found: ${APP_DIR}"
  exit 1
fi

ENV_FILE="${APP_DIR}/backend/.env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

validate_db_name() {
  local name="$1"
  [[ "${name}" =~ ^[a-z0-9_]+$ ]]
}

if ! validate_db_name "${SOURCE_DB}" || ! validate_db_name "${TARGET_DB}"; then
  echo "ERROR: database names must use lowercase letters, numbers, and underscore only."
  exit 1
fi

if [[ "${SOURCE_DB}" == "${TARGET_DB}" ]]; then
  echo "ERROR: source and target database names are the same."
  exit 1
fi

command -v psql >/dev/null || { echo "ERROR: psql not found in PATH."; exit 1; }
command -v pg_dump >/dev/null || { echo "ERROR: pg_dump not found in PATH."; exit 1; }

export PGPASSWORD="${DB_PASSWORD}"
PSQL=(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}")
PG_DUMP=(pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}")

db_exists() {
  local db_name="$1"
  "${PSQL[@]}" -d postgres -At -v db_name="${db_name}" \
    -c "SELECT 1 FROM pg_database WHERE datname = :'db_name' LIMIT 1" | grep -q '^1$'
}

row_estimate() {
  local db_name="$1"
  "${PSQL[@]}" -d "${db_name}" -At \
    -c "SELECT COALESCE(SUM(n_live_tup), 0)::bigint FROM pg_stat_user_tables;"
}

echo "==> Database copy check"
echo "    host: ${DB_HOST}:${DB_PORT}"
echo "    source: ${SOURCE_DB}"
echo "    target: ${TARGET_DB}"

if ! db_exists "${SOURCE_DB}"; then
  echo "ERROR: source database does not exist: ${SOURCE_DB}"
  exit 1
fi

if ! db_exists "${TARGET_DB}"; then
  echo "ERROR: target database does not exist: ${TARGET_DB}"
  echo "Create ${TARGET_DB} first from the Database Create page, then rerun this script."
  exit 1
fi

echo "    source rows estimate: $(row_estimate "${SOURCE_DB}")"
echo "    target rows estimate before copy: $(row_estimate "${TARGET_DB}")"

if [[ "${CONFIRM_COPY_TO_PULMODB}" != "true" ]]; then
  echo
  echo "Dry run only. No data copied."
  echo "To copy ALL ${SOURCE_DB} data into ${TARGET_DB}, run:"
  echo "  CONFIRM_COPY_TO_PULMODB=true bash deploy/ubuntu24/copy_inventory_to_pulmodb.sh"
  exit 0
fi

mkdir -p "${BACKUP_DIR}"
backup_file="${BACKUP_DIR}/${TARGET_DB}_before_${SOURCE_DB}_copy_$(date +%Y%m%d_%H%M%S).dump"

if [[ "${STOP_APP_FOR_COPY}" == "true" ]] && command -v pm2 >/dev/null && pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  echo "==> Stopping PM2 app: ${PM2_NAME}"
  pm2 stop "${PM2_NAME}"
  restart_app="true"
else
  restart_app="false"
fi

cleanup() {
  if [[ "${restart_app}" == "true" ]]; then
    echo "==> Restarting PM2 app: ${PM2_NAME}"
    pm2 start "${PM2_NAME}" >/dev/null || pm2 restart "${PM2_NAME}" >/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Backing up target before overwrite"
"${PG_DUMP[@]}" -Fc -d "${TARGET_DB}" -f "${backup_file}"
echo "    backup: ${backup_file}"

echo "==> Terminating active target connections"
"${PSQL[@]}" -d postgres -v target="${TARGET_DB}" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'target' AND pid <> pg_backend_pid();" >/dev/null

echo "==> Clearing target schema"
"${PSQL[@]}" -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null

echo "==> Copying ${SOURCE_DB} schema and data into ${TARGET_DB}"
"${PG_DUMP[@]}" --no-owner --no-privileges -d "${SOURCE_DB}" | "${PSQL[@]}" -v ON_ERROR_STOP=1 -d "${TARGET_DB}" >/dev/null

echo "==> Copy complete"
echo "    target rows estimate after copy: $(row_estimate "${TARGET_DB}")"
