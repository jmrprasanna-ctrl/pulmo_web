function fmtDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function gpsLabel(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return "-";
  return `${nLat.toFixed(6)}, ${nLng.toFixed(6)}`;
}

function getRole() {
  return String(localStorage.getItem("role") || "").toLowerCase();
}

function canViewAllUsers() {
  const role = getRole();
  return role === "admin" || role === "manager";
}

function renderRows(rows) {
  const body = document.getElementById("tsBody");
  if (!body) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;">No timesheet logs found.</td></tr>`;
    return;
  }
  body.innerHTML = list.map((row) => `
    <tr>
      <td>${String(row.username || "-")}</td>
      <td>${String(row.role || "-")}</td>
      <td>${fmtDateTime(row.check_in_at)}</td>
      <td>${gpsLabel(row.check_in_lat, row.check_in_lng)}</td>
      <td>${fmtDateTime(row.check_out_at)}</td>
      <td>${gpsLabel(row.check_out_lat, row.check_out_lng)}</td>
      <td>${row.duration_minutes == null ? "-" : Number(row.duration_minutes).toFixed(2)}</td>
    </tr>
  `).join("");
}

function bindUserFilter(userOptions) {
  const userFilter = document.getElementById("tsUserFilter");
  if (!userFilter) return;
  if (!canViewAllUsers()) {
    userFilter.innerHTML = `<option value="">My Logs</option>`;
    userFilter.disabled = true;
    return;
  }
  const prev = String(userFilter.value || "");
  const options = Array.isArray(userOptions) ? userOptions : [];
  userFilter.innerHTML = [
    `<option value="">All Users</option>`,
    ...options.map((x) => `<option value="${Number(x.user_id || 0)}">${String(x.username || `User ${x.user_id}`)}</option>`)
  ].join("");
  if (prev && Array.from(userFilter.options).some((o) => o.value === prev)) {
    userFilter.value = prev;
  }
}

async function loadMonthly() {
  const monthEl = document.getElementById("tsMonth");
  const userFilter = document.getElementById("tsUserFilter");
  const month = String(monthEl?.value || new Date().toISOString().slice(0, 7));
  const userId = String(userFilter?.value || "").trim();
  const params = new URLSearchParams();
  params.set("month", month);
  if (canViewAllUsers() && userId) {
    params.set("user_id", userId);
  }
  const data = await request(`/hr/timesheet/monthly?${params.toString()}`, "GET");
  bindUserFilter(data?.user_options || []);
  renderRows(data?.rows || []);
}

window.addEventListener("DOMContentLoaded", () => {
  const monthEl = document.getElementById("tsMonth");
  if (monthEl) {
    monthEl.value = new Date().toISOString().slice(0, 7);
  }
  const loadBtn = document.getElementById("tsLoadBtn");
  const userFilter = document.getElementById("tsUserFilter");
  loadBtn?.addEventListener("click", () => loadMonthly().catch((err) => {
    if (window.showMessageBox) showMessageBox(err.message || "Failed to load timesheet.", "error");
  }));
  monthEl?.addEventListener("change", () => loadMonthly().catch((err) => {
    if (window.showMessageBox) showMessageBox(err.message || "Failed to load timesheet.", "error");
  }));
  userFilter?.addEventListener("change", () => loadMonthly().catch((err) => {
    if (window.showMessageBox) showMessageBox(err.message || "Failed to load timesheet.", "error");
  }));
  loadMonthly().catch((err) => {
    if (window.showMessageBox) showMessageBox(err.message || "Failed to load timesheet.", "error");
  });
});
