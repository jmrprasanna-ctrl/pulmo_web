const PAYSLIP_LIST_PATH = "/hr/payslip.html";
const PAYSLIP_VIEW_PATH = "/hr/payslip-view.html";

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

function toSafeText(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getSelectedMonth() {
  const monthInput = document.getElementById("payslipMonth");
  const raw = String(monthInput?.value || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 7);
}

function renderRows(rows) {
  const body = document.getElementById("payslipUsersBody");
  if (!body) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;">No users found.</td></tr>`;
    return;
  }

  const canOpenDetail = hasPagePermission(PAYSLIP_VIEW_PATH, ["view"]);
  body.innerHTML = "";
  const month = getSelectedMonth();

  list.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = canOpenDetail ? "payslip-row-clickable" : "";
    tr.innerHTML = `
      <td>${toSafeText(row.profile_name, toSafeText(row.username))}</td>
      <td>${toSafeText(row.username)}</td>
      <td>${toSafeText(row.role)}</td>
      <td>${toSafeText(row.department)}</td>
      <td>${toSafeText(row.email)}</td>
      <td>${toSafeText(row.employee_no)}</td>
      <td>${toMoney(row.basic_sallary)}</td>
    `;

    if (canOpenDetail) {
      const userId = Number(row.user_id || 0);
      tr.addEventListener("click", () => {
        if (!Number.isFinite(userId) || userId <= 0) return;
        const query = new URLSearchParams();
        query.set("userId", String(userId));
        query.set("month", month);
        window.location.href = `payslip-view.html?${query.toString()}`;
      });
    }
    body.appendChild(tr);
  });
}

async function loadPayslipUsers() {
  const month = getSelectedMonth();
  const query = new URLSearchParams();
  query.set("month", month);
  const response = await request(`/hr/payslip/users?${query.toString()}`, "GET");
  renderRows(response?.rows || []);
}

window.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.__waitForUserAccessPermissions === "function") {
    await window.__waitForUserAccessPermissions();
  }

  if (!hasPagePermission(PAYSLIP_LIST_PATH, ["view"])) {
    if (window.showMessageBox) {
      showMessageBox("You do not have access to Payslip page.", "error");
    }
    window.location.href = "../dashboard.html";
    return;
  }

  const monthInput = document.getElementById("payslipMonth");
  if (monthInput && !monthInput.value) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  monthInput?.addEventListener("change", () => {
    loadPayslipUsers().catch((err) => {
      if (window.showMessageBox) {
        showMessageBox(err.message || "Failed to load payslip users.", "error");
      }
    });
  });

  try {
    await loadPayslipUsers();
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to load payslip users.", "error");
    } else {
      alert(err.message || "Failed to load payslip users.");
    }
  }
});
