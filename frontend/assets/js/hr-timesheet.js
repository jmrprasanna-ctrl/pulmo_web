function fmtDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

let currentMonthlyRows = [];
let currentUserOptions = [];
let canEditDatesRuntime = false;
let editorBusy = false;

const TIMESHEET_PATH = "/hr/time-sheet.html";

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

function canEditTimesheetDates() {
  if (typeof window.hasUserActionPermission === "function") {
    return window.hasUserActionPermission(TIMESHEET_PATH, "edit");
  }
  try {
    const raw = JSON.parse(localStorage.getItem("userAllowedActionsRuntime") || "[]");
    if (!Array.isArray(raw)) return false;
    const key = `${TIMESHEET_PATH}::edit`;
    return raw.map((x) => String(x || "").toLowerCase()).includes(key);
  } catch (_err) {
    return false;
  }
}

function toHoursValue(row) {
  const providedHours = Number(row?.duration_hours);
  if (Number.isFinite(providedHours)) return providedHours;
  const minutes = Number(row?.duration_minutes);
  if (!Number.isFinite(minutes)) return null;
  return minutes / 60;
}

function toOvertimeValue(hours) {
  if (hours == null || !Number.isFinite(hours)) return null;
  return Math.max(hours - 8, 0);
}

function getEditorElements() {
  return {
    editor: document.getElementById("tsEditor"),
    logId: document.getElementById("tsEditLogId"),
    user: document.getElementById("tsEditUser"),
    checkIn: document.getElementById("tsEditCheckIn"),
    checkOut: document.getElementById("tsEditCheckOut"),
    saveBtn: document.getElementById("tsEditSaveBtn"),
    cancelBtn: document.getElementById("tsEditCancelBtn"),
  };
}

function formatForDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function nowForDateTimeInput() {
  const now = new Date();
  now.setSeconds(0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toggleEditorAccessUI() {
  const editBtn = document.getElementById("tsEditLogBtn");
  if (editBtn) editBtn.style.display = canEditDatesRuntime ? "" : "none";

  const { editor } = getEditorElements();
  if (editor && !canEditDatesRuntime) {
    editor.classList.remove("active");
  }
}

function bindEditorUserOptions() {
  const { user } = getEditorElements();
  if (!user) return;

  if (!canViewAllUsers()) {
    user.innerHTML = `<option value="">My Logs</option>`;
    user.disabled = true;
    return;
  }

  const options = Array.isArray(currentUserOptions) ? currentUserOptions : [];
  user.innerHTML = [
    `<option value="">Select user</option>`,
    ...options.map((entry) => {
      const id = Number(entry.user_id || 0);
      const name = String(entry.username || `User ${id}`).trim() || `User ${id}`;
      return `<option value="${id}">${name}</option>`;
    }),
  ].join("");
  user.disabled = false;
}

function openEditorForNewLog() {
  if (!canEditDatesRuntime) return;
  const { editor, logId, user, checkIn, checkOut } = getEditorElements();
  if (!editor || !logId || !checkIn || !checkOut) return;

  logId.value = "";
  checkIn.value = nowForDateTimeInput();
  checkOut.value = "";

  if (user && canViewAllUsers()) {
    const listUserFilter = document.getElementById("tsUserFilter");
    const selectedUser = String(listUserFilter?.value || "").trim();
    user.value = selectedUser || "";
    user.disabled = false;
  }

  editor.classList.add("active");
}

function openEditorForRow(logIdValue) {
  if (!canEditDatesRuntime) return;
  const logId = Number(logIdValue || 0);
  if (!Number.isFinite(logId) || logId <= 0) return;

  const row = currentMonthlyRows.find((entry) => Number(entry?.id || 0) === logId);
  if (!row) return;

  const { editor, logId: logIdEl, user, checkIn, checkOut } = getEditorElements();
  if (!editor || !logIdEl || !checkIn || !checkOut) return;

  logIdEl.value = String(logId);
  checkIn.value = formatForDateTimeInput(row.check_in_at);
  checkOut.value = formatForDateTimeInput(row.check_out_at);

  if (user && canViewAllUsers()) {
    user.value = String(Number(row.user_id || 0) || "");
    user.disabled = true;
  }

  editor.classList.add("active");
}

function closeEditor() {
  const { editor, logId, checkIn, checkOut, user } = getEditorElements();
  if (!editor) return;
  editor.classList.remove("active");
  if (logId) logId.value = "";
  if (checkIn) checkIn.value = "";
  if (checkOut) checkOut.value = "";
  if (user && canViewAllUsers()) {
    user.disabled = false;
  }
}

function setEditorBusy(busy) {
  editorBusy = !!busy;
  const { saveBtn, cancelBtn } = getEditorElements();
  if (saveBtn) saveBtn.disabled = !!busy;
  if (cancelBtn) cancelBtn.disabled = !!busy;
}

async function saveEditorLog() {
  if (!canEditDatesRuntime || editorBusy) return;

  const { logId, user, checkIn, checkOut } = getEditorElements();
  if (!logId || !checkIn || !checkOut) return;

  const editingLogId = Number(logId.value || 0);
  const payload = {
    check_in_at: String(checkIn.value || "").trim(),
    check_out_at: String(checkOut.value || "").trim() || null,
  };

  if (!payload.check_in_at) {
    if (window.showMessageBox) showMessageBox("Check In date/time is required.", "error");
    return;
  }

  if (!editingLogId && canViewAllUsers()) {
    const selectedUserId = Number(user?.value || 0);
    if (!Number.isFinite(selectedUserId) || selectedUserId <= 0) {
      if (window.showMessageBox) showMessageBox("Please select a user.", "error");
      return;
    }
    payload.user_id = selectedUserId;
  }

  setEditorBusy(true);
  try {
    const endpoint = editingLogId
      ? `/hr/timesheet/log/${editingLogId}`
      : "/hr/timesheet/log";
    const method = editingLogId ? "PUT" : "POST";
    const res = await request(endpoint, method, payload);
    if (window.showMessageBox) {
      showMessageBox(res?.message || "Timesheet log saved successfully.");
    }
    closeEditor();
    await loadMonthly();
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to save timesheet log.", "error");
    } else {
      alert(err.message || "Failed to save timesheet log.");
    }
  } finally {
    setEditorBusy(false);
  }
}

function renderRows(rows) {
  const body = document.getElementById("tsBody");
  if (!body) return;

  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;">No timesheet logs found.</td></tr>`;
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
      <td>${(() => {
        const hours = toHoursValue(row);
        const overtime = toOvertimeValue(hours);
        return overtime == null ? "-" : overtime.toFixed(2);
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
    { title: "Role", x: 118 },
    { title: "Check In", x: 170 },
    { title: "In Location", x: 305 },
    { title: "Check Out", x: 415 },
    { title: "Out Location", x: 555 },
    { title: "Hours", x: 700 },
    { title: "O.T", x: 765 },
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
    const overtime = toOvertimeValue(hours);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(String(row.username || "-").slice(0, 16), columns[0].x, y);
    doc.text(String(row.role || "-").slice(0, 10), columns[1].x, y);
    doc.text(fmtDateTime(row.check_in_at).slice(0, 26), columns[2].x, y);
    doc.text(gpsLabel(row.check_in_lat, row.check_in_lng, row.check_in_location_label).slice(0, 18), columns[3].x, y);
    doc.text(fmtDateTime(row.check_out_at).slice(0, 26), columns[4].x, y);
    doc.text(gpsLabel(row.check_out_lat, row.check_out_lng, row.check_out_location_label).slice(0, 18), columns[5].x, y);
    doc.text(hours == null ? "-" : hours.toFixed(2), columns[6].x, y);
    doc.text(overtime == null ? "-" : overtime.toFixed(2), columns[7].x, y);
    y += rowHeight;
  }

  const safeMonth = selectedMonth.replace(/[^0-9-]/g, "");
  const profileName = sanitizeFilePart(resolveProfileNameForFile()) || "user";
  doc.save(`timesheet-${profileName}-${safeMonth}.pdf`);
}

function bindUserFilter(userOptions) {
  const userFilter = document.getElementById("tsUserFilter");
  currentUserOptions = Array.isArray(userOptions) ? userOptions : [];
  if (!userFilter) {
    bindEditorUserOptions();
    return;
  }
  if (!canViewAllUsers()) {
    userFilter.innerHTML = `<option value="">My Logs</option>`;
    userFilter.disabled = true;
    bindEditorUserOptions();
    return;
  }
  const prev = String(userFilter.value || "");
  userFilter.innerHTML = [
    `<option value="">All Users</option>`,
    ...currentUserOptions.map((x) => `<option value="${Number(x.user_id || 0)}">${String(x.username || `User ${x.user_id}`)}</option>`),
  ].join("");
  if (prev && Array.from(userFilter.options).some((o) => o.value === prev)) {
    userFilter.value = prev;
  }
  bindEditorUserOptions();
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
  if (typeof data?.can_edit_dates === "boolean") {
    canEditDatesRuntime = data.can_edit_dates;
  } else {
    canEditDatesRuntime = canEditTimesheetDates();
  }
  toggleEditorAccessUI();
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
  const editLogBtn = document.getElementById("tsEditLogBtn");
  const userFilter = document.getElementById("tsUserFilter");
  const { saveBtn, cancelBtn } = getEditorElements();

  savePdfBtn?.addEventListener("click", exportTimeSheetMonthlyPdf);
  editLogBtn?.addEventListener("click", openEditorForNewLog);
  saveBtn?.addEventListener("click", () => saveEditorLog());
  cancelBtn?.addEventListener("click", () => closeEditor());

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
