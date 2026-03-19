#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pulmo_web_UI}"
PM2_NAME="${PM2_NAME:-pulmo-backend}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:5000/api/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1}"

print_section() {
  echo
  echo "=============================="
  echo "$1"
  echo "=============================="
}

ok() {
  echo "[OK] $1"
}

warn() {
  echo "[WARN] $1"
}

fail() {
  echo "[FAIL] $1"
}

print_section "AWS Server - Basic Info"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "Date: $(date)"
echo "Kernel: $(uname -srmo)"
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  echo "OS: ${PRETTY_NAME:-unknown}"
fi

print_section "Runtime Versions"
if command -v node >/dev/null 2>&1; then ok "node $(node -v)"; else fail "node not installed"; fi
if command -v npm >/dev/null 2>&1; then ok "npm $(npm -v)"; else fail "npm not installed"; fi
if command -v pm2 >/dev/null 2>&1; then ok "pm2 $(pm2 -v)"; else warn "pm2 not installed"; fi
if command -v git >/dev/null 2>&1; then ok "git $(git --version | awk '{print $3}')"; else fail "git not installed"; fi

print_section "Resource Health"
echo "Uptime:"
uptime -p || true
echo
echo "Disk usage:"
df -h | sed -n '1,8p'
echo
echo "Memory usage:"
free -h || true
echo
echo "Load average:"
uptime | awk -F'load average:' '{print "load average:" $2}' || true

print_section "Service Status"
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active --quiet apache2 && ok "apache2 active" || warn "apache2 inactive"
  systemctl is-active --quiet postgresql && ok "postgresql active" || warn "postgresql inactive"
else
  warn "systemctl not available"
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
    ok "pm2 process '${PM2_NAME}' exists"
    pm2 status "${PM2_NAME}" || true
  else
    warn "pm2 process '${PM2_NAME}' not found"
  fi
fi

print_section "HTTP Health Endpoints"
if curl -fsS -I "${WEB_HEALTH_URL}" >/dev/null; then
  ok "web reachable: ${WEB_HEALTH_URL}"
else
  fail "web not reachable: ${WEB_HEALTH_URL}"
fi

if curl -fsS "${API_HEALTH_URL}" >/dev/null; then
  ok "api reachable: ${API_HEALTH_URL}"
else
  fail "api not reachable: ${API_HEALTH_URL}"
fi

print_section "App Directory Checks"
if [[ -d "${APP_DIR}" ]]; then
  ok "app dir exists: ${APP_DIR}"
else
  fail "app dir missing: ${APP_DIR}"
  exit 1
fi

if [[ -d "${APP_DIR}/.git" ]]; then
  ok "git repository detected"
  cd "${APP_DIR}"
  echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "Last commit:"
  git log -1 --oneline || true
  if [[ -n "$(git status --porcelain)" ]]; then
    warn "working tree has uncommitted changes"
  else
    ok "working tree clean"
  fi
else
  warn "no .git found in app dir"
fi

if [[ -f "${APP_DIR}/backend/.env" ]]; then
  ok "backend/.env found"
else
  warn "backend/.env not found"
fi

echo
echo "System check completed."
