set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pulmo_web_UI}"
PM2_NAME="${PM2_NAME:-pulmo-backend}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:5000/api/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1}"

print_section(){ echo; echo "=============================="; echo "$1"; echo "=============================="; }
ok(){ echo "[OK] $1"; }
warn(){ echo "[WARN] $1"; }
fail(){ echo "[FAIL] $1"; }

print_section "AWS Server - Basic Info"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "Date: $(date)"
echo "Kernel: $(uname -srmo)"
if [[ -f /etc/os-release ]]; then . /etc/os-release; echo "OS: ${PRETTY_NAME:-unknown}"; fi

print_section "Runtime Versions"
command -v node >/dev/null && ok "node $(node -v)" || fail "node not installed"
command -v npm  >/dev/null && ok "npm $(npm -v)"  || fail "npm not installed"
command -v pm2  >/dev/null && ok "pm2 $(pm2 -v)"  || warn "pm2 not installed"
command -v git  >/dev/null && ok "git $(git --version | awk '{print $3}')" || fail "git not installed"

print_section "Resource Health"
uptime -p || true
echo; df -h | sed -n '1,8p'
echo; free -h || true

print_section "Service Status"
if command -v systemctl >/dev/null; then
  if systemctl is-active --quiet httpd; then
    ok "httpd active"
  elif systemctl is-active --quiet apache2; then
    ok "apache2 active"
  else
    warn "http service inactive (httpd/apache2)"
  fi

  systemctl is-active --quiet postgresql && ok "postgresql active" || warn "postgresql inactive"
fi

if command -v pm2 >/dev/null; then
  if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
    ok "pm2 process '${PM2_NAME}' exists"
    pm2 status "${PM2_NAME}" || true
  else
    warn "pm2 process '${PM2_NAME}' not found"
  fi
fi

print_section "HTTP Health Endpoints"
curl -fsS -I "${WEB_HEALTH_URL}" >/dev/null && ok "web reachable: ${WEB_HEALTH_URL}" || fail "web not reachable: ${WEB_HEALTH_URL}"
curl -fsS "${API_HEALTH_URL}" >/dev/null && ok "api reachable: ${API_HEALTH_URL}" || fail "api not reachable: ${API_HEALTH_URL}"

print_section "App Directory Checks"
[[ -d "${APP_DIR}" ]] && ok "app dir exists: ${APP_DIR}" || { fail "app dir missing: ${APP_DIR}"; exit 1; }

if [[ -d "${APP_DIR}/.git" ]]; then
  ok "git repository detected"
  cd "${APP_DIR}"
  echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "Last commit:"; git log -1 --oneline || true
  [[ -n "$(git status --porcelain)" ]] && warn "working tree has uncommitted changes" || ok "working tree clean"
fi

[[ -f "${APP_DIR}/backend/.env" ]] && ok "backend/.env found" || warn "backend/.env not found"

echo; echo "System check completed."
