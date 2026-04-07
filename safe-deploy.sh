#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pulmo_web_UI}"
BRANCH="${1:-main}"
DBS="${DBS:-inventory,demo}"
PM2_NAME="${PM2_NAME:-pulmo-backend}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:5000/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
HEALTH_DELAY_SECONDS="${HEALTH_DELAY_SECONDS:-2}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "ERROR: app directory not found: ${APP_DIR}"
  exit 1
fi

if [[ -z "${DB_PASSWORD:-}" ]]; then
  echo "ERROR: DB_PASSWORD is not set."
  echo "Example: export DB_PASSWORD='your_postgres_password'"
  exit 1
fi

cd "${APP_DIR}"

echo "==> Updating code"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Installing dependencies"
npm install --no-package-lock
if [[ -f "${APP_DIR}/backend/package.json" ]]; then
  npm --prefix backend install --no-package-lock
fi

echo "==> Running baseline migration (${DBS})"
npm run migrate:baseline -- --databases="${DBS}"

echo "==> Restarting PM2 app (${PM2_NAME})"
pm2 restart "${PM2_NAME}"

echo "==> Health check (retries: ${HEALTH_RETRIES}, delay: ${HEALTH_DELAY_SECONDS}s)"
health_ok="false"
for ((i=1; i<=HEALTH_RETRIES; i++)); do
  if curl -fsS "${API_HEALTH_URL}" >/dev/null; then
    health_ok="true"
    echo "    health ok on attempt ${i}"
    break
  fi
  echo "    waiting for API... attempt ${i}/${HEALTH_RETRIES}"
  sleep "${HEALTH_DELAY_SECONDS}"
done

if [[ "${health_ok}" != "true" ]]; then
  echo "ERROR: health check failed after ${HEALTH_RETRIES} attempts"
  exit 1
fi

echo "==> Deploy OK"
