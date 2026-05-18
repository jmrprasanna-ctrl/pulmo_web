const LEAVE_PAGE_PATH = "/hr/leave.html";
let selectedLeaveType = "full";
let canSaveLeave = false;

function normalizeRole() {
  return String(localStorage.getItem("role") || "").trim().toLowerCase();
}

function hasLeavePagePermission(actions = ["view"]) {
  const role = normalizeRole();
  const hasConfiguredAccess = typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions();
  if ((role === "admin" || role === "manager" || role === "user") && !hasConfiguredAccess) {
    return true;
  }

  const hasPath = typeof hasUserGrantedPath === "function" && hasUserGrantedPath(LEAVE_PAGE_PATH);
  const hasAction = typeof hasUserActionPermission === "function"
    && actions.some((action) => hasUserActionPermission(LEAVE_PAGE_PATH, action));
  return hasPath || hasAction;
}

function toSafeText(value, fallback = "-") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function toAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function showStatus(message = "", type = "success") {
  const hint = document.getElementById("leaveStatusHint");
  if (!hint) return;
  hint.textContent = String(message || "");
  hint.style.color = type === "error" ? "#b33232" : "#45617c";
}

function setBusy(isBusy) {
  const saveBtn = document.getElementById("leaveSaveBtn");
  if (!saveBtn) return;
  saveBtn.disabled = !!isBusy || !canSaveLeave;
}

function updateTileState() {
  const fullTile = document.getElementById("leaveTypeFull");
  const halfTile = document.getElementById("leaveTypeHalf");
  if (fullTile) {
    fullTile.classList.toggle("is-active", selectedLeaveType === "full");
  }
  if (halfTile) {
    halfTile.classList.toggle("is-active", selectedLeaveType === "half");
  }
}

function syncLeaveTypeInput() {
  const typeInput = document.getElementById("leaveTypeValue");
  if (!typeInput) return;
  typeInput.value = selectedLeaveType === "half" ? "Half Day Leave" : "Full Leave";
}

function syncDateFieldsForType() {
  const startEl = document.getElementById("leaveStartDate");
  const endEl = document.getElementById("leaveEndDate");
  if (!startEl || !endEl) return;

  if (selectedLeaveType === "half") {
    endEl.value = String(startEl.value || "");
    endEl.disabled = true;
  } else {
    endEl.disabled = false;
    if (!endEl.value && startEl.value) {
      endEl.value = startEl.value;
    }
  }
}

function setSelectedLeaveType(type) {
  const normalized = String(type || "").trim().toLowerCase().includes("half") ? "half" : "full";
  selectedLeaveType = normalized;
  updateTileState();
  syncLeaveTypeInput();
  syncDateFieldsForType();
}

function renderMeta(meta) {
  document.getElementById("leaveProfileName").value = toSafeText(meta?.profile_name);
  document.getElementById("leaveLoginUser").value = toSafeText(meta?.username);
  document.getElementById("leaveRole").value = toSafeText(meta?.role);
  document.getElementById("leaveSupiriorName").value = toSafeText(meta?.supirior_name, "Not set");
  document.getElementById("leaveFullCount").textContent = toAmount(meta?.tiles?.full_leave_days);
  document.getElementById("leaveHalfCount").textContent = toAmount(meta?.tiles?.half_day_leave_count);

  const monthHint = document.getElementById("leaveMonthHint");
  if (monthHint) {
    const month = String(meta?.month || "").trim();
    monthHint.textContent = month ? `This month leave summary: ${month}` : "This month leave summary";
  }
}

async function loadLeaveMeta() {
  const data = await request("/hr/leave/meta", "GET");
  renderMeta(data || {});
}

async function saveLeave() {
  if (!canSaveLeave) {
    if (window.showMessageBox) showMessageBox("You do not have add access for leave.", "error");
    return;
  }
  const startDate = String(document.getElementById("leaveStartDate")?.value || "").trim();
  const endInputValue = String(document.getElementById("leaveEndDate")?.value || "").trim();
  const endDate = selectedLeaveType === "half" ? startDate : endInputValue;
  const reason = String(document.getElementById("leaveReason")?.value || "").trim();

  if (!startDate || !endDate) {
    if (window.showMessageBox) showMessageBox("Please select leave start and end date.", "error");
    return;
  }
  if (endDate < startDate) {
    if (window.showMessageBox) showMessageBox("End date cannot be before start date.", "error");
    return;
  }

  setBusy(true);
  showStatus("Saving...");
  try {
    const result = await request("/hr/leave/apply", "POST", {
      leave_type: selectedLeaveType,
      start_date: startDate,
      end_date: endDate,
      reason,
    });

    if (window.showMessageBox) {
      showMessageBox(result?.message || "Leave saved successfully.", "success");
    }
    showStatus(`Saved at ${new Date().toLocaleString()}`);
    if (document.getElementById("leaveReason")) {
      document.getElementById("leaveReason").value = "";
    }
    if (result?.tiles) {
      document.getElementById("leaveFullCount").textContent = toAmount(result.tiles.full_leave_days);
      document.getElementById("leaveHalfCount").textContent = toAmount(result.tiles.half_day_leave_count);
    }
  } catch (err) {
    showStatus(err.message || "Failed to save leave.", "error");
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to save leave.", "error");
    } else {
      alert(err.message || "Failed to save leave.");
    }
  } finally {
    setBusy(false);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.__waitForUserAccessPermissions === "function") {
    await window.__waitForUserAccessPermissions();
  }

  if (!hasLeavePagePermission(["view"])) {
    if (window.showMessageBox) {
      showMessageBox("You do not have access to Leave page.", "error");
    }
    window.location.href = "../dashboard.html";
    return;
  }

  canSaveLeave = hasLeavePagePermission(["add", "edit"]);
  setBusy(false);
  setSelectedLeaveType("full");

  const fullTile = document.getElementById("leaveTypeFull");
  const halfTile = document.getElementById("leaveTypeHalf");
  const saveBtn = document.getElementById("leaveSaveBtn");
  const startDate = document.getElementById("leaveStartDate");
  const endDate = document.getElementById("leaveEndDate");

  const today = new Date().toISOString().slice(0, 10);
  if (startDate && !startDate.value) startDate.value = today;
  if (endDate && !endDate.value) endDate.value = today;
  syncDateFieldsForType();

  fullTile?.addEventListener("click", () => setSelectedLeaveType("full"));
  halfTile?.addEventListener("click", () => setSelectedLeaveType("half"));
  startDate?.addEventListener("change", () => syncDateFieldsForType());
  saveBtn?.addEventListener("click", saveLeave);

  if (!canSaveLeave) {
    if (startDate) startDate.disabled = true;
    if (endDate) endDate.disabled = true;
    const reasonEl = document.getElementById("leaveReason");
    if (reasonEl) reasonEl.disabled = true;
    fullTile && (fullTile.disabled = true);
    halfTile && (halfTile.disabled = true);
    showStatus("View only access.");
  }

  try {
    await loadLeaveMeta();
  } catch (err) {
    showStatus(err.message || "Failed to load leave page data.", "error");
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to load leave page data.", "error");
    }
  }
});
