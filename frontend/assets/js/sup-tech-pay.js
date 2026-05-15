let supTechPayRows = [];

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFilteredRows() {
  const searchInput = document.getElementById("supTechSearch");
  const technicianFilter = document.getElementById("supTechTechnicianFilter");
  const keyword = String(searchInput?.value || "").trim().toLowerCase();
  const selectedTechnician = String(technicianFilter?.value || "").trim().toLowerCase();

  return supTechPayRows.filter((row) => {
    const haystack = [
      row.invoice_no,
      row.customer_name,
      row.support_technician,
      row.payment_status,
    ]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");
    const rowTechnician = String(row.support_technician || "").trim().toLowerCase();
    const matchesKeyword = !keyword || haystack.includes(keyword);
    const matchesTechnician = !selectedTechnician || rowTechnician === selectedTechnician;
    return matchesKeyword && matchesTechnician;
  });
}

function populateTechnicianFilter() {
  const technicianFilter = document.getElementById("supTechTechnicianFilter");
  if (!technicianFilter) return;

  const previousValue = String(technicianFilter.value || "").trim();
  const technicians = Array.from(
    new Set(
      supTechPayRows
        .map((row) => String(row.support_technician || "").trim())
        .filter((name) => name.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  technicianFilter.innerHTML = [
    '<option value="">All Support Technicians</option>',
    ...technicians.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
  ].join("");

  if (previousValue && technicians.includes(previousValue)) {
    technicianFilter.value = previousValue;
  } else {
    technicianFilter.value = "";
  }
}

function renderSupTechPayRows() {
  const body = document.getElementById("supTechPayBody");
  if (!body) return;

  const rows = getFilteredRows();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;">No support technician invoices found.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const status = String(row.payment_status || "Pending").trim().toLowerCase() === "paid" ? "Paid" : "Pending";
      const statusClass = status === "Paid" ? "status-paid" : "status-pending";
      return `
        <tr class="sup-tech-row" data-invoice-id="${row.invoice_id}">
          <td>${escapeHtml(row.invoice_no)}</td>
          <td>${escapeHtml(row.customer_name)}</td>
          <td>${formatDate(row.invoice_date)}</td>
          <td>${escapeHtml(row.support_technician)}</td>
          <td>${formatCurrency(row.total_amount)}</td>
          <td>${formatCurrency(row.support_tech_pay_amount)}</td>
          <td><span class="status-badge ${statusClass}">${status}</span></td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll(".sup-tech-row").forEach((rowEl) => {
    rowEl.addEventListener("click", () => {
      const invoiceId = Number(rowEl.getAttribute("data-invoice-id") || 0);
      if (!invoiceId) return;
      window.location.href = `sup-tech-pay-update.html?invoiceId=${invoiceId}`;
    });
  });
}

async function loadSupTechPayRows() {
  const body = document.getElementById("supTechPayBody");
  if (body) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>`;
  }

  try {
    supTechPayRows = await request("/support-tech-pay/invoices", "GET");
    populateTechnicianFilter();
    renderSupTechPayRows();
  } catch (err) {
    if (body) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center;">${escapeHtml(err.message || "Failed to load data.")}</td></tr>`;
    }
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to load support technician invoices.", "error");
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("supTechSearch");
  const technicianFilter = document.getElementById("supTechTechnicianFilter");

  searchInput?.addEventListener("input", renderSupTechPayRows);
  technicianFilter?.addEventListener("change", renderSupTechPayRows);
  loadSupTechPayRows();
});
