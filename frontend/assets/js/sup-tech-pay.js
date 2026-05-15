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

function buildPaymentPayloadFromDetail(detail) {
  const payment = detail && detail.payment ? detail.payment : {};
  return {
    vendor_pay_amount: Number(payment.vendor_pay_amount || 0),
    support_tech_pay_amount: Number(payment.support_tech_pay_amount || 0),
    payment_method: payment.payment_method || "Cash",
    paid_at: payment.paid_at || null,
  };
}

function addPdfLine(doc, label, value, y) {
  doc.setFont("helvetica", "bold");
  doc.text(`${label}:`, 40, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(value || "-"), 180, y);
}

function buildPdfDataUrlFromDetail(detail) {
  const jspdfRef = window.jspdf;
  if (!jspdfRef || !jspdfRef.jsPDF) {
    throw new Error("PDF library not loaded.");
  }

  const { jsPDF } = jspdfRef;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const invoice = detail && detail.invoice ? detail.invoice : {};
  const payment = detail && detail.payment ? detail.payment : {};
  const items = Array.isArray(detail && detail.items) ? detail.items : [];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Sup.Tech Pay", 40, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 62);

  let y = 88;
  addPdfLine(doc, "Invoice No", invoice.invoice_no || "-", y); y += 18;
  addPdfLine(doc, "Invoice Date", formatDate(invoice.invoice_date), y); y += 18;
  addPdfLine(doc, "Customer", invoice.customer_name || "-", y); y += 18;
  addPdfLine(doc, "Support Technician", invoice.support_technician || "-", y); y += 18;
  addPdfLine(
    doc,
    "Technician Percentage",
    Number.isFinite(Number(invoice.support_technician_percentage))
      ? `${Number(invoice.support_technician_percentage).toFixed(2)}%`
      : "-",
    y
  ); y += 18;
  addPdfLine(doc, "Invoice Amount", `Rs. ${formatCurrency(invoice.total_amount)}`, y); y += 18;
  addPdfLine(doc, "Vendor Pay Amount", formatCurrency(payment.vendor_pay_amount), y); y += 18;
  addPdfLine(doc, "Support Tech Pay Amount", formatCurrency(payment.support_tech_pay_amount), y); y += 18;
  addPdfLine(doc, "Payment Method", payment.payment_method || "Cash", y); y += 18;
  addPdfLine(doc, "Payment Date", payment.paid_at || "-", y); y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Invoice Items", 40, y);
  y += 16;

  doc.setFontSize(10);
  doc.text("Item", 40, y);
  doc.text("Qty", 340, y);
  doc.text("Sell Rate", 400, y);
  y += 8;
  doc.line(40, y, 555, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  if (!items.length) {
    doc.text("No items found.", 40, y);
  } else {
    for (const item of items) {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 42;
      }
      const itemLabel = `${item.product_id || ""} ${item.description || item.model || ""}`.trim() || "-";
      doc.text(itemLabel.slice(0, 52), 40, y);
      doc.text(String(Number(item.qty || 0)), 340, y);
      doc.text(formatCurrency(item.sell_rate), 400, y);
      y += 14;
    }
  }

  return doc.output("datauristring");
}

async function savePdfForInvoice(invoiceId, triggerButton) {
  if (!invoiceId) return;
  if (triggerButton) triggerButton.disabled = true;

  try {
    const detail = await request(`/support-tech-pay/${invoiceId}`, "GET");
    const payload = buildPaymentPayloadFromDetail(detail);
    payload.payment_proof_pdf_base64 = buildPdfDataUrlFromDetail(detail);
    await request(`/support-tech-pay/${invoiceId}`, "PUT", payload);
    if (window.showMessageBox) {
      showMessageBox("Sup.Tech Pay PDF saved successfully.");
    }
    loadSupTechPayRows();
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to save Sup.Tech Pay PDF.", "error");
    }
  } finally {
    if (triggerButton) triggerButton.disabled = false;
  }
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
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;">No support technician invoices found.</td></tr>`;
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
          <td>
            <button type="button" class="icon-btn save-pdf-btn" data-action="save-pdf" data-invoice-id="${row.invoice_id}" aria-label="Save PDF" title="Save PDF">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3.5h9l3 3V20.5H6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                <path d="M15 3.5v4h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                <path d="M8.5 14.2h2.1a1.5 1.5 0 1 0 0-3H8.5v5.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M13.2 11.2h2.2v5.4h-2.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              </svg>
            </button>
          </td>
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

  body.querySelectorAll('button[data-action="save-pdf"]').forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const invoiceId = Number(btn.getAttribute("data-invoice-id") || 0);
      if (!invoiceId) return;
      savePdfForInvoice(invoiceId, btn);
    });
  });
}

async function loadSupTechPayRows() {
  const body = document.getElementById("supTechPayBody");
  if (body) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>`;
  }

  try {
    supTechPayRows = await request("/support-tech-pay/invoices", "GET");
    populateTechnicianFilter();
    renderSupTechPayRows();
  } catch (err) {
    if (body) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center;">${escapeHtml(err.message || "Failed to load data.")}</td></tr>`;
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
