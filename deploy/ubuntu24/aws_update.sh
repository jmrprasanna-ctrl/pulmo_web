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

cd "${APP_DIR}"

echo "==> Fetching latest code"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Installing Node dependencies (no lockfile write)"
npm install --no-package-lock

if [[ -f "${APP_DIR}/backend/package.json" ]]; then
  echo "==> Installing backend dependencies (no lockfile write)"
  npm --prefix backend install --no-package-lock
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

for i in {1..15}; do
  if curl -fsS "${API_HEALTH_URL}" >/dev/null; then
    echo "    api ok: ${API_HEALTH_URL}"
    echo "==> Update completed successfully"
    exit 0
  fi
  sleep 2
done

echo "ERROR: api health check failed after retries"
pm2 logs "${PM2_NAME}" --lines 120
exit 1
