function fmtDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

let currentMonthlyRows = [];

function gpsLabel(lat, lng, label) {
  const savedLabel = String(label || "").trim();
  if (savedLabel) return savedLabel;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return "-";
  return `${nLat.toFixed(6)}, ${nLng.toFixed(6)}`;
}

function getRole() {
  return String(localStorage.getItem("role") || "").toLowerCase();
}

function resolveProfileNameForFile() {
  const candidates = [
    localStorage.getItem("profileName"),
    localStorage.getItem("userName"),
    localStorage.getItem("userEmail"),
    localStorage.getItem("role"),
  ];
  for (const candidate of candidates) {
    const clean = String(candidate || "").trim();
    if (clean) return clean;
  }
  return "user";
}

function sanitizeFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function canViewAllUsers() {
  const role = getRole();
  return role === "admin" || role === "manager";
}

function toHoursValue(row) {
  const providedHours = Number(row?.duration_hours);
  if (Number.isFinite(providedHours)) return providedHours;
  const minutes = Number(row?.duration_minutes);
  if (!Number.isFinite(minutes)) return null;
  return minutes / 60;
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
      <td>${gpsLabel(row.check_in_lat, row.check_in_lng, row.check_in_location_label)}</td>
      <td>${fmtDateTime(row.check_out_at)}</td>
      <td>${gpsLabel(row.check_out_lat, row.check_out_lng, row.check_out_location_label)}</td>
      <td>${(() => {
        const hours = toHoursValue(row);
        return hours == null ? "-" : hours.toFixed(2);
      })()}</td>
    </tr>
  `).join("");
}

function exportTimeSheetMonthlyPdf() {
  const rows = Array.isArray(currentMonthlyRows) ? currentMonthlyRows : [];
  if (!rows.length) {
    if (window.showMessageBox) {
      showMessageBox("No timesheet logs available to export.", "error");
    }
    return;
  }

  const jspdfRef = window.jspdf;
  if (!jspdfRef || !jspdfRef.jsPDF) {
    if (window.showMessageBox) {
      showMessageBox("PDF library not loaded.", "error");
    }
    return;
  }

  const { jsPDF } = jspdfRef;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const left = 22;
  const right = 820;
  const rowHeight = 18;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 56;

  const monthEl = document.getElementById("tsMonth");
  const userFilter = document.getElementById("tsUserFilter");
  const selectedMonth = String(monthEl?.value || new Date().toISOString().slice(0, 7));
  const selectedUserText = userFilter?.selectedOptions?.[0]?.textContent?.trim() || "All Users";

  const columns = [
    { title: "User", x: 24 },
    { title: "Role", x: 140 },
    { title: "Check In", x: 200 },
    { title: "In Location", x: 345 },
    { title: "Check Out", x: 470 },
    { title: "Out Location", x: 620 },
    { title: "Hours", x: 760 }
  ];

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    columns.forEach((col) => doc.text(col.title, col.x, y));
    y += 8;
    doc.line(left, y, right, y);
    y += 12;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Monthly Time Sheet", left, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Month: ${selectedMonth}`, left, 44);
  doc.text(`User: ${selectedUserText}`, left + 140, 44);
  doc.text(`Generated: ${new Date().toLocaleString()}`, left + 320, 44);

  drawHeader();

  for (const row of rows) {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 36;
      drawHeader();
    }
    const hours = toHoursValue(row);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(String(row.username || "-").slice(0, 16), columns[0].x, y);
    doc.text(String(row.role || "-").slice(0, 10), columns[1].x, y);
    doc.text(fmtDateTime(row.check_in_at).slice(0, 26), columns[2].x, y);
    doc.text(gpsLabel(row.check_in_lat, row.check_in_lng, row.check_in_location_label).slice(0, 18), columns[3].x, y);
    doc.text(fmtDateTime(row.check_out_at).slice(0, 26), columns[4].x, y);
    doc.text(gpsLabel(row.check_out_lat, row.check_out_lng, row.check_out_location_label).slice(0, 18), columns[5].x, y);
    doc.text(hours == null ? "-" : hours.toFixed(2), columns[6].x, y);
    y += rowHeight;
  }

  const safeMonth = selectedMonth.replace(/[^0-9-]/g, "");
  const profileName = sanitizeFilePart(resolveProfileNameForFile()) || "user";
  doc.save(`timesheet-${profileName}-${safeMonth}.pdf`);
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
  currentMonthlyRows = Array.isArray(data?.rows) ? data.rows : [];
  renderRows(currentMonthlyRows);
}

window.addEventListener("DOMContentLoaded", () => {
  const monthEl = document.getElementById("tsMonth");
  if (monthEl) {
    monthEl.value = new Date().toISOString().slice(0, 7);
  }
  const savePdfBtn = document.getElementById("tsSavePdfBtn");
  const userFilter = document.getElementById("tsUserFilter");
  savePdfBtn?.addEventListener("click", exportTimeSheetMonthlyPdf);
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
