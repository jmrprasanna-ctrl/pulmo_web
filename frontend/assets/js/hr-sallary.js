const SALLARY_LIST_PATH = "/hr/sallary.html";
const SALLARY_DETAIL_PATH = "/hr/sallary-detail.html";

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

function renderRows(rows) {
  const body = document.getElementById("sallaryTableBody");
  if (!body) return;
  const list = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;">No users found.</td></tr>`;
    return;
  }

  const canOpenDetail = hasPagePermission(SALLARY_DETAIL_PATH, ["view", "edit"]);
  body.innerHTML = "";

  list.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = canOpenDetail ? "sallary-row-clickable" : "";
    tr.innerHTML = `
      <td>${toSafeText(row.profile_name, toSafeText(row.username))}</td>
      <td>${toSafeText(row.username)}</td>
      <td>${toSafeText(row.role)}</td>
      <td>${toSafeText(row.department)}</td>
      <td>${toSafeText(row.email)}</td>
      <td>${toSafeText(row.mobile)}</td>
      <td>${toMoney(row.basic_sallary)}</td>
      <td>${toSafeText(row.bank_name)}</td>
    `;

    if (canOpenDetail) {
      const userId = Number(row.user_id || 0);
      tr.addEventListener("click", () => {
        if (!Number.isFinite(userId) || userId <= 0) return;
        window.location.href = `sallary-detail.html?userId=${encodeURIComponent(String(userId))}`;
      });
    }

    body.appendChild(tr);
  });
}

async function loadSallaryUsers() {
  const data = await request("/hr/sallary/users", "GET");
  renderRows(data?.rows || []);
}

window.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.__waitForUserAccessPermissions === "function") {
    await window.__waitForUserAccessPermissions();
  }

  if (!hasPagePermission(SALLARY_LIST_PATH, ["view"])) {
    if (window.showMessageBox) {
      showMessageBox("You do not have access to Sallary page.", "error");
    }
    window.location.href = "../dashboard.html";
    return;
  }

  try {
    await loadSallaryUsers();
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to load sallary users.", "error");
    } else {
      alert(err.message || "Failed to load sallary users.");
    }
  }
});
