#!/usr/bin/env bash
set -euo pipefail

PM2_NAME="${PM2_NAME:-pulmo-backend}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:5000/api/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1}"

section() {
  echo
  echo "========================================"
  echo "$1"
  echo "========================================"
}

exists() {
  command -v "$1" >/dev/null 2>&1
}

ms_now() {
  date +%s%3N
}

http_timing() {
  local url="$1"
  local label="$2"
  if ! exists curl; then
    echo "${label}: curl not installed"
    return 0
  fi
  local out
  out="$(curl -sS -o /dev/null -w "code=%{http_code} dns=%{time_namelookup}s connect=%{time_connect}s ttfb=%{time_starttransfer}s total=%{time_total}s" "$url" || true)"
  echo "${label}: ${out}"
}

section "Server Snapshot"
echo "Host: $(hostname)"
echo "Time: $(date)"
echo "Uptime: $(uptime -p || true)"
echo "Load avg: $(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}' || echo 'n/a')"

section "CPU / Memory / Disk"
if exists top; then
  top -bn1 | sed -n '1,5p'
fi
echo
free -h || true
echo
df -h / | sed -n '1,2p' || true

section "Top Processes (CPU)"
if exists ps; then
  ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%cpu | sed -n '1,8p'
fi

section "Top Processes (Memory)"
if exists ps; then
  ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | sed -n '1,8p'
fi

section "HTTP Performance"
http_timing "${WEB_HEALTH_URL}" "Web"
http_timing "${API_HEALTH_URL}" "API"

section "PM2 Status"
if exists pm2; then
  pm2 status "${PM2_NAME}" || pm2 status || true
  echo
  pm2 logs "${PM2_NAME}" --lines 30 --nostream || true
else
  echo "pm2 not installed"
fi

section "Web Server Errors"
if [[ -f /var/log/apache2/error.log ]]; then
  echo "apache2 error.log (last 30):"
  tail -n 30 /var/log/apache2/error.log || true
elif [[ -f /var/log/httpd/error_log ]]; then
  echo "httpd error_log (last 30):"
  tail -n 30 /var/log/httpd/error_log || true
else
  echo "apache/httpd error log not found"
fi

if [[ -f /var/log/nginx/error.log ]]; then
  echo
  echo "nginx error.log (last 30):"
  tail -n 30 /var/log/nginx/error.log || true
fi

section "Summary"
echo "Performance report completed."
echo "Tip: run every 5-10 minutes during peak load and compare API total/ttfb and top CPU processes."

