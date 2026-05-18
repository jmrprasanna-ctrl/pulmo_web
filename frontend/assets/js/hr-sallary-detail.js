const SALLARY_LIST_PATH = "/hr/sallary.html";
const SALLARY_DETAIL_PATH = "/hr/sallary-detail.html";
let currentSallaryUserId = 0;
let canEditSallaryDetail = false;

function normalizeRole() {
  return String(localStorage.getItem("role") || "").trim().toLowerCase();
}

function hasPagePermission(path, actions = ["view"]) {
  const role = normalizeRole();
  const hasConfiguredAccess = typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions();
  if ((role === "admin" || role === "manager" || role === "user") && !hasConfiguredAccess) {
    return true;
  }

  const hasPath = typeof hasUserGrantedPath === "function" && hasUserGrantedPath(path);
  const hasAction = typeof hasUserActionPermission === "function"
    && actions.some((action) => hasUserActionPermission(path, action));
  return hasPath || hasAction;
}

function getQueryUserId() {
  const params = new URLSearchParams(window.location.search || "");
  const value = Number(params.get("userId") || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function toSafeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toAmount(value, fallback = "") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed.toFixed(2);
}

function resolveFixedSallaryCycle(anchorValue) {
  const anchor = anchorValue ? new Date(anchorValue) : new Date();
  const base = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();

  let startYear = year;
  let startMonth = month;
  let endYear = year;
  let endMonth = month;

  if (day >= 20) {
    if (month === 11) {
      endYear = year + 1;
      endMonth = 0;
    } else {
      endMonth = month + 1;
    }
  } else if (month === 0) {
    startYear = year - 1;
    startMonth = 11;
  } else {
    startMonth = month - 1;
  }

  const startDate = new Date(Date.UTC(startYear, startMonth, 20)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(endYear, endMonth, 20)).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function applyFixedSallaryDates(anchorValue) {
  const cycle = resolveFixedSallaryCycle(anchorValue);
  const startEl = document.getElementById("sdSalaryStartDate");
  const endEl = document.getElementById("sdSalaryEndDate");
  if (startEl) startEl.value = cycle.startDate;
  if (endEl) endEl.value = cycle.endDate;
  return cycle;
}

function showStatus(message = "", type = "success") {
  const hint = document.getElementById("sdStatusHint");
  if (hint) {
    hint.textContent = String(message || "");
    hint.style.color = type === "error" ? "#b33232" : "#45617c";
  }
}

function setBusy(isBusy) {
  const btn = document.getElementById("sdUpdateBtn");
  if (!btn) return;
  btn.disabled = !!isBusy || !canEditSallaryDetail;
  btn.classList.toggle("is-busy", !!isBusy);
}

function toggleOtherBankField() {
  const bank = document.getElementById("sdBankName");
  const wrap = document.getElementById("sdOtherBankWrap");
  if (!bank || !wrap) return;
  const isOther = String(bank.value || "").trim() === "OTHER";
  wrap.style.display = isOther ? "" : "none";
}

function createAllowanceRow(allowance = {}) {
  const row = document.createElement("div");
  row.className = "allowance-row";
  row.innerHTML = `
    <input type="text" class="allowance-name" placeholder="Allowance name" value="${toSafeText(allowance.name)}">
    <input type="number" class="allowance-amount" min="0" step="0.01" placeholder="0.00" value="${Number.isFinite(Number(allowance.amount)) ? Number(allowance.amount) : ""}">
    <button type="button" class="allowance-icon-btn allowance-remove" aria-label="Remove allowance" title="Remove allowance">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.5 9.5v8M14.5 9.5v8M6 7.5h12M10 7.5V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M8 7.5l.6 11a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;

  const removeBtn = row.querySelector(".allowance-remove");
  if (removeBtn) {
    removeBtn.disabled = !canEditSallaryDetail;
    removeBtn.addEventListener("click", () => {
      const list = document.getElementById("sdAllowancesList");
      if (!list) return;
      row.remove();
      if (!list.children.length) {
        list.appendChild(createAllowanceRow());
      }
    });
  }

  const nameInput = row.querySelector(".allowance-name");
  const amountInput = row.querySelector(".allowance-amount");
  if (nameInput) nameInput.disabled = !canEditSallaryDetail;
  if (amountInput) amountInput.disabled = !canEditSallaryDetail;

  return row;
}

function createDeductionRow(deduction = {}) {
  const row = document.createElement("div");
  row.className = "allowance-row";
  row.innerHTML = `
    <input type="text" class="deduction-name" placeholder="Deduction name" value="${toSafeText(deduction.name)}">
    <input type="number" class="deduction-amount" min="0" step="0.01" placeholder="0.00" value="${Number.isFinite(Number(deduction.amount)) ? Number(deduction.amount) : ""}">
    <button type="button" class="allowance-icon-btn allowance-remove deduction-remove" aria-label="Remove deduction" title="Remove deduction">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.5 9.5v8M14.5 9.5v8M6 7.5h12M10 7.5V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M8 7.5l.6 11a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;

  const removeBtn = row.querySelector(".deduction-remove");
  if (removeBtn) {
    removeBtn.disabled = !canEditSallaryDetail;
    removeBtn.addEventListener("click", () => {
      const list = document.getElementById("sdDeductionsList");
      if (!list) return;
      row.remove();
      if (!list.children.length) {
        list.appendChild(createDeductionRow());
      }
    });
  }

  const nameInput = row.querySelector(".deduction-name");
  const amountInput = row.querySelector(".deduction-amount");
  if (nameInput) nameInput.disabled = !canEditSallaryDetail;
  if (amountInput) amountInput.disabled = !canEditSallaryDetail;

  return row;
}

function renderAllowances(allowances) {
  const list = document.getElementById("sdAllowancesList");
  if (!list) return;
  list.innerHTML = "";
  const rows = Array.isArray(allowances) ? allowances : [];
  if (!rows.length) {
    list.appendChild(createAllowanceRow());
    return;
  }
  rows.forEach((item) => {
    list.appendChild(createAllowanceRow(item || {}));
  });
}

function renderDeductions(deductions) {
  const list = document.getElementById("sdDeductionsList");
  if (!list) return;
  list.innerHTML = "";
  const rows = Array.isArray(deductions) ? deductions : [];
  if (!rows.length) {
    list.appendChild(createDeductionRow());
    return;
  }
  rows.forEach((item) => {
    list.appendChild(createDeductionRow(item || {}));
  });
}

function collectAllowances() {
  const list = document.getElementById("sdAllowancesList");
  if (!list) return [];
  return Array.from(list.querySelectorAll(".allowance-row")).map((row) => {
    const name = toSafeText(row.querySelector(".allowance-name")?.value);
    const amountRaw = Number(row.querySelector(".allowance-amount")?.value);
    const amount = Number.isFinite(amountRaw) ? Number(amountRaw.toFixed(2)) : 0;
    return { name, amount };
  }).filter((entry) => entry.name || entry.amount > 0);
}

function collectDeductions() {
  const list = document.getElementById("sdDeductionsList");
  if (!list) return [];
  return Array.from(list.querySelectorAll(".allowance-row")).map((row) => {
    const name = toSafeText(row.querySelector(".deduction-name")?.value);
    const amountRaw = Number(row.querySelector(".deduction-amount")?.value);
    const amount = Number.isFinite(amountRaw) ? Number(amountRaw.toFixed(2)) : 0;
    return { name, amount };
  }).filter((entry) => entry.name || entry.amount > 0);
}

function setEditableState(canEdit) {
  const editableIds = [
    "sdBankName",
    "sdOtherBankName",
    "sdBankAccount",
    "sdBasicSallary",
    "sdWorkingDays",
    "sdOtPayAmount",
    "sdAddAllowanceBtn",
    "sdAddDeductionBtn",
  ];
  editableIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = !canEdit;
    }
  });
  const startDateInput = document.getElementById("sdSalaryStartDate");
  const endDateInput = document.getElementById("sdSalaryEndDate");
  if (startDateInput) startDateInput.disabled = true;
  if (endDateInput) endDateInput.disabled = true;
  const updateBtn = document.getElementById("sdUpdateBtn");
  if (updateBtn) {
    updateBtn.disabled = !canEdit;
  }
}

function setWorkSummaryFields(totalWorkingHours = "", totalOtHours = "") {
  const workingHoursEl = document.getElementById("sdCalculatedWorkingHours");
  const otHoursEl = document.getElementById("sdCalculatedOtHours");
  if (workingHoursEl) workingHoursEl.value = totalWorkingHours;
  if (otHoursEl) otHoursEl.value = totalOtHours;
}

async function loadWorkSummaryByRange() {
  applyFixedSallaryDates();
  const startDate = toSafeText(document.getElementById("sdSalaryStartDate")?.value);
  const endDate = toSafeText(document.getElementById("sdSalaryEndDate")?.value);
  if (!startDate || !endDate || !currentSallaryUserId) {
    setWorkSummaryFields("", "");
    return;
  }
  if (endDate < startDate) {
    setWorkSummaryFields("", "");
    showStatus("End date cannot be before start date.", "error");
    return;
  }

  try {
    const query = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    const summary = await request(`/hr/sallary/${encodeURIComponent(String(currentSallaryUserId))}/work-summary?${query.toString()}`, "GET");
    const workingHours = toAmount(summary?.total_working_hours, "0.00");
    const otHours = toAmount(summary?.total_ot_hours, "0.00");
    setWorkSummaryFields(workingHours, otHours);

    const workingDaysInput = document.getElementById("sdWorkingDays");
    const calculatedWorkingDays = Number(summary?.calculated_working_days);
    if (workingDaysInput && Number.isFinite(calculatedWorkingDays)) {
      workingDaysInput.value = calculatedWorkingDays.toFixed(2);
    }
  } catch (err) {
    setWorkSummaryFields("", "");
    showStatus(err.message || "Failed to calculate working hours.", "error");
  }
}

function fillDetail(data) {
  document.getElementById("sdProfileName").value = toSafeText(data?.profile_name, "-");
  document.getElementById("sdLoginUser").value = toSafeText(data?.username, "-");
  document.getElementById("sdRole").value = toSafeText(data?.role, "-");
  document.getElementById("sdDepartment").value = toSafeText(data?.department, "-");
  document.getElementById("sdEmail").value = toSafeText(data?.email, "-");
  document.getElementById("sdMobile").value = toSafeText(data?.mobile, "-");
  document.getElementById("sdAddress").value = toSafeText(data?.address, "-");

  const bankSelect = document.getElementById("sdBankName");
  const otherBankInput = document.getElementById("sdOtherBankName");
  const bankName = toSafeText(data?.bank_name);
  const otherBankName = toSafeText(data?.other_bank_name);
  const hasKnownBank = !!(bankSelect && Array.from(bankSelect.options).some((option) => option.value === bankName));
  if (bankSelect) {
    if (hasKnownBank) {
      bankSelect.value = bankName;
    } else if (bankName) {
      bankSelect.value = "OTHER";
      if (otherBankInput) otherBankInput.value = bankName;
    } else {
      bankSelect.value = "";
    }
  }
  if (otherBankInput && otherBankName) {
    otherBankInput.value = otherBankName;
  }

  document.getElementById("sdBankAccount").value = toSafeText(data?.bank_account);
  const basicSallary = Number(data?.basic_sallary);
  document.getElementById("sdBasicSallary").value = Number.isFinite(basicSallary) ? basicSallary.toFixed(2) : "";
  applyFixedSallaryDates();
  document.getElementById("sdWorkingDays").value = Number.isFinite(Number(data?.working_days))
    ? Number(data.working_days).toFixed(2)
    : "";
  document.getElementById("sdOtPayAmount").value = Number.isFinite(Number(data?.ot_pay_amount))
    ? Number(data.ot_pay_amount).toFixed(2)
    : "";
  renderAllowances(Array.isArray(data?.allowances) ? data.allowances : []);
  renderDeductions(Array.isArray(data?.deductions) ? data.deductions : []);
  setWorkSummaryFields("", "");
  toggleOtherBankField();
}

async function loadDetail() {
  const detail = await request(`/hr/sallary/${encodeURIComponent(String(currentSallaryUserId))}`, "GET");
  fillDetail(detail || {});
}

async function saveDetail() {
  if (!canEditSallaryDetail) {
    if (window.showMessageBox) showMessageBox("You do not have edit access.", "error");
    return;
  }

  const bankName = toSafeText(document.getElementById("sdBankName")?.value);
  const otherBankName = toSafeText(document.getElementById("sdOtherBankName")?.value);
  const bankAccount = toSafeText(document.getElementById("sdBankAccount")?.value);
  const basicRaw = Number(document.getElementById("sdBasicSallary")?.value);
  const salaryStartDate = toSafeText(document.getElementById("sdSalaryStartDate")?.value);
  const salaryEndDate = toSafeText(document.getElementById("sdSalaryEndDate")?.value);
  const workingDaysRaw = Number(document.getElementById("sdWorkingDays")?.value);
  const otPayAmountRaw = Number(document.getElementById("sdOtPayAmount")?.value);
  const allowances = collectAllowances();
  const deductions = collectDeductions();

  if (bankName === "OTHER" && !otherBankName) {
    if (window.showMessageBox) showMessageBox("Enter other bank name.", "error");
    return;
  }
  if (salaryStartDate && salaryEndDate && salaryEndDate < salaryStartDate) {
    if (window.showMessageBox) showMessageBox("End date cannot be before start date.", "error");
    return;
  }

  const payload = {
    bank_name: bankName,
    other_bank_name: bankName === "OTHER" ? otherBankName : "",
    bank_account: bankAccount,
    basic_sallary: Number.isFinite(basicRaw) ? basicRaw : 0,
    salary_start_date: salaryStartDate,
    salary_end_date: salaryEndDate,
    working_days: Number.isFinite(workingDaysRaw) ? workingDaysRaw : 0,
    ot_pay_amount: Number.isFinite(otPayAmountRaw) ? otPayAmountRaw : 0,
    allowances,
    deductions,
  };

  setBusy(true);
  showStatus("Saving...");
  try {
    const response = await request(`/hr/sallary/${encodeURIComponent(String(currentSallaryUserId))}`, "PUT", payload);
    if (window.showMessageBox) {
      showMessageBox(response?.message || "Sallary details saved.", "success");
    }
    showStatus(`Updated at ${new Date().toLocaleString()}`);
    if (response?.detail) {
      fillDetail(response.detail);
    }
  } catch (err) {
    showStatus(err.message || "Failed to save.", "error");
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to save sallary detail.", "error");
    } else {
      alert(err.message || "Failed to save sallary detail.");
    }
  } finally {
    setBusy(false);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.__waitForUserAccessPermissions === "function") {
    await window.__waitForUserAccessPermissions();
  }

  if (!hasPagePermission(SALLARY_DETAIL_PATH, ["view", "edit"])) {
    if (window.showMessageBox) {
      showMessageBox("You do not have access to Sallary Detail page.", "error");
    }
    window.location.href = "sallary.html";
    return;
  }

  currentSallaryUserId = getQueryUserId();
  if (!currentSallaryUserId) {
    if (window.showMessageBox) {
      showMessageBox("Invalid user selection for sallary detail.", "error");
    }
    window.location.href = "sallary.html";
    return;
  }

  canEditSallaryDetail = hasPagePermission(SALLARY_DETAIL_PATH, ["edit"]);
  setEditableState(canEditSallaryDetail);

  const bankSelect = document.getElementById("sdBankName");
  const addAllowanceBtn = document.getElementById("sdAddAllowanceBtn");
  const addDeductionBtn = document.getElementById("sdAddDeductionBtn");
  const updateBtn = document.getElementById("sdUpdateBtn");
  const startDateInput = document.getElementById("sdSalaryStartDate");
  const endDateInput = document.getElementById("sdSalaryEndDate");

  bankSelect?.addEventListener("change", toggleOtherBankField);
  startDateInput?.addEventListener("change", () => {
    loadWorkSummaryByRange();
  });
  endDateInput?.addEventListener("change", () => {
    loadWorkSummaryByRange();
  });
  addAllowanceBtn?.addEventListener("click", () => {
    const list = document.getElementById("sdAllowancesList");
    if (!list) return;
    list.appendChild(createAllowanceRow());
  });
  addDeductionBtn?.addEventListener("click", () => {
    const list = document.getElementById("sdDeductionsList");
    if (!list) return;
    list.appendChild(createDeductionRow());
  });
  updateBtn?.addEventListener("click", () => {
    saveDetail();
  });

  try {
    await loadDetail();
    await loadWorkSummaryByRange();
    if (!canEditSallaryDetail) {
      showStatus("View only access.");
    }
  } catch (err) {
    showStatus(err.message || "Failed to load detail.", "error");
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to load sallary detail.", "error");
    } else {
      alert(err.message || "Failed to load sallary detail.");
    }
  }
});
