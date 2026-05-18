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
    <button type="button" class="btn btn-danger allowance-remove" aria-label="Remove allowance">X</button>
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

function setEditableState(canEdit) {
  const editableIds = [
    "sdBankName",
    "sdOtherBankName",
    "sdBankAccount",
    "sdBasicSallary",
    "sdAddAllowanceBtn",
  ];
  editableIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = !canEdit;
    }
  });
  const updateBtn = document.getElementById("sdUpdateBtn");
  if (updateBtn) {
    updateBtn.disabled = !canEdit;
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
  renderAllowances(Array.isArray(data?.allowances) ? data.allowances : []);
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
  const allowances = collectAllowances();

  if (bankName === "OTHER" && !otherBankName) {
    if (window.showMessageBox) showMessageBox("Enter other bank name.", "error");
    return;
  }

  const payload = {
    bank_name: bankName,
    other_bank_name: bankName === "OTHER" ? otherBankName : "",
    bank_account: bankAccount,
    basic_sallary: Number.isFinite(basicRaw) ? basicRaw : 0,
    allowances,
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
  const updateBtn = document.getElementById("sdUpdateBtn");

  bankSelect?.addEventListener("change", toggleOtherBankField);
  addAllowanceBtn?.addEventListener("click", () => {
    const list = document.getElementById("sdAllowancesList");
    if (!list) return;
    list.appendChild(createAllowanceRow());
  });
  updateBtn?.addEventListener("click", () => {
    saveDetail();
  });

  try {
    await loadDetail();
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
