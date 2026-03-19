#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
APP_DIR="${APP_DIR:-/var/www/pulmo_web_UI}"
PM2_NAME="${PM2_NAME:-pulmo-backend}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:5000/api/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1}"
RUN_DB_CLEANUP="${RUN_DB_CLEANUP:-false}"

echo "==> AWS update started"
echo "    app: ${APP_DIR}"
echo "    branch: ${BRANCH}"
echo "    pm2: ${PM2_NAME}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "ERROR: app directory not found: ${APP_DIR}"
  exit 1
fi

cd "${APP_DIR}"

echo "==> Fetching latest code"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Installing Node dependencies (root)"
npm install

if [[ -f "${APP_DIR}/backend/package.json" ]]; then
  echo "==> Installing backend dependencies"
  npm --prefix backend install
fi

if [[ "${RUN_DB_CLEANUP}" == "true" ]]; then
  echo "==> Running sample/test data cleanup (inventory + demo)"
  npm --prefix backend run cleanup:test-data
fi

echo "==> Restarting app via PM2"
if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  pm2 reload "${PM2_NAME}" || pm2 restart "${PM2_NAME}"
else
  pm2 start npm --name "${PM2_NAME}" -- run start
fi
pm2 save

echo "==> Health checks"
curl -fsS -I "${WEB_HEALTH_URL}" >/dev/null
echo "    web ok: ${WEB_HEALTH_URL}"
curl -fsS "${API_HEALTH_URL}" >/dev/null
echo "    api ok: ${API_HEALTH_URL}"

echo "==> Update completed successfully"
