const PAYSLIP_LIST_PATH = "/hr/payslip.html";
const PAYSLIP_VIEW_PATH = "/hr/payslip-view.html";

const payslipViewState = {
  userId: 0,
  month: "",
  company: null,
  payslip: null,
};

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatAmount(value, options = {}) {
  const amount = toNumber(value);
  const dashForZero = options.dashForZero === true;
  if (dashForZero && Math.abs(amount) < 0.0001) return "-";
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getQueryUserId() {
  const params = new URLSearchParams(window.location.search || "");
  const value = Number(params.get("userId") || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getQueryMonth() {
  const params = new URLSearchParams(window.location.search || "");
  const raw = String(params.get("month") || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 7);
}

function getSelectedMonth() {
  const monthInput = document.getElementById("payslipViewMonth");
  const raw = String(monthInput?.value || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return getQueryMonth();
}

function monthLabelFromYearMonth(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return raw || "Month";
  const [year, month] = raw.split("-").map((x) => Number(x));
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function showStatus(message = "", type = "success") {
  const hint = document.getElementById("payslipStatusHint");
  if (!hint) return;
  hint.textContent = String(message || "");
  hint.style.color = type === "error" ? "#b33232" : "#45617c";
}

function setActionBusy(isBusy) {
  const saveBtn = document.getElementById("savePayslipPdfBtn");
  const sendBtn = document.getElementById("sendPayslipEmailBtn");
  if (saveBtn) saveBtn.disabled = !!isBusy;
  if (sendBtn) sendBtn.disabled = !!isBusy;
}

function rowTemplate(label, type, amount, options = {}) {
  const css = options.total ? "pv-row total" : "pv-row";
  const displayAmount = formatAmount(amount, { dashForZero: options.dashForZero });
  return `
    <div class="${css}">
      <div class="name">${escapeHtml(label)}</div>
      <div>${escapeHtml(type)}</div>
      <div class="amount">${escapeHtml(displayAmount)}</div>
    </div>
  `;
}

function renderBasicBlock(payslip) {
  const block = document.getElementById("pvBasicBlock");
  if (!block) return;
  const salary = payslip?.salary || {};
  block.innerHTML = [
    rowTemplate("Basic Salary", "Salary", salary.basic_sallary),
    rowTemplate("Nopay", "Less", salary.no_pay_amount, { dashForZero: true }),
    rowTemplate("Salary For MSPS", "Net Basic", salary.salary_for_msps, { total: true }),
  ].join("");
}

function renderAllowanceBlock(payslip) {
  const block = document.getElementById("pvAllowanceBlock");
  if (!block) return;
  const salary = payslip?.salary || {};
  const allowances = Array.isArray(salary.allowances) ? salary.allowances : [];
  const rows = [
    rowTemplate("Add:", "Allowances", 0, { dashForZero: true }),
    ...allowances.map((item) =>
      rowTemplate(String(item?.name || "Allowance"), "Amount", Number(item?.amount || 0), { dashForZero: true })
    ),
    rowTemplate("OT Payment", `${formatAmount(salary.ot_pay_per_hour)} x ${formatAmount(payslip?.attendance?.ot_hours)} hrs`, salary.ot_pay_amount, { dashForZero: true }),
    rowTemplate("Total Additions", "Total", salary.allowances_total + salary.ot_pay_amount, { total: true }),
    rowTemplate("Gross Pay", "Final", salary.gross_pay, { total: true }),
  ];
  block.innerHTML = rows.join("");
}

function renderDeductionBlock(payslip) {
  const block = document.getElementById("pvDeductionBlock");
  if (!block) return;
  const salary = payslip?.salary || {};
  const deductions = Array.isArray(salary.deductions) ? salary.deductions : [];
  const rows = [
    rowTemplate("Less:", "Deductions", 0, { dashForZero: true }),
    ...deductions.map((item) =>
      rowTemplate(String(item?.name || "Deduction"), "Amount", Number(item?.amount || 0), { dashForZero: true })
    ),
    rowTemplate("Total Deduction", "Total", salary.deductions_total, { total: true }),
    rowTemplate("Net Salary", "Take Home", salary.net_sallary, { total: true }),
    rowTemplate("Co. Cont. To MSPS @ 12%", "Company", salary.company_cont_msps, { dashForZero: true }),
    rowTemplate("Co. Cont. To ETF @ 3%", "Company", salary.company_cont_etf, { dashForZero: true }),
  ];
  block.innerHTML = rows.join("");
}

function renderSummary(payslip) {
  const attendance = payslip?.attendance || {};
  const leave = payslip?.leave || {};
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };
  setText("pvPresentDays", String(Number(attendance.present_days || 0)));
  setText("pvWorkingDays", formatAmount(attendance.working_days));
  setText("pvWorkingHours", formatAmount(attendance.working_hours));
  setText("pvOtHours", formatAmount(attendance.ot_hours));
  setText("pvFullLeave", formatAmount(leave.full_leave_days));
  setText("pvHalfLeave", formatAmount(leave.half_day_leave_count));
}

function renderPayslip(response) {
  payslipViewState.company = response?.company || {};
  payslipViewState.payslip = response?.payslip || null;
  const company = payslipViewState.company || {};
  const payslip = payslipViewState.payslip || {};
  const user = payslip.user || {};

  document.getElementById("pvCompanyName").textContent = toSafeText(company.company_name, "PULMO TECHNOLOGIES");
  document.getElementById("pvCompanyCode").textContent = `Company Code: ${toSafeText(company.company_code, "-")}`;
  document.getElementById("pvCompanyEmail").textContent = `Email: ${toSafeText(company.company_email, "-")}`;
  document.getElementById("pvPeriodTitle").textContent = `Pay Advice ${toSafeText(payslip.month_label, monthLabelFromYearMonth(payslip.month))}`;
  document.getElementById("pvPeriodRange").textContent = `${toSafeText(payslip.period_start, "-")} to ${toSafeText(payslip.period_end, "-")}`;
  document.getElementById("pvEmployeeName").textContent = toSafeText(user.profile_name || user.username, "-");
  document.getElementById("pvEmployeeNo").textContent = toSafeText(user.employee_no || user.user_id, "-");
  document.getElementById("pvEmployeeRole").textContent = toSafeText(user.role, "-");

  renderBasicBlock(payslip);
  renderAllowanceBlock(payslip);
  renderDeductionBlock(payslip);
  renderSummary(payslip);
}

async function loadPayslip() {
  const month = getSelectedMonth();
  const query = new URLSearchParams();
  query.set("month", month);
  const data = await request(`/hr/payslip/${encodeURIComponent(String(payslipViewState.userId))}?${query.toString()}`, "GET");
  payslipViewState.month = month;
  renderPayslip(data || {});
}

function buildPayslipPdfDoc() {
  const jspdfRef = window.jspdf;
  if (!jspdfRef || !jspdfRef.jsPDF) {
    throw new Error("PDF library not loaded.");
  }
  const { jsPDF } = jspdfRef;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const company = payslipViewState.company || {};
  const payslip = payslipViewState.payslip || {};
  const user = payslip.user || {};
  const salary = payslip.salary || {};
  const attendance = payslip.attendance || {};
  const leave = payslip.leave || {};

  const left = 36;
  const right = 560;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 36;
  const rowHeight = 16;

  const ensureSpace = (need = 26) => {
    if (y + need > pageHeight - 28) {
      doc.addPage();
      y = 36;
    }
  };

  const drawAmountRow = (name, type, amount, options = {}) => {
    ensureSpace(rowHeight);
    doc.setFont("helvetica", options.total ? "bold" : "normal");
    doc.text(String(name || "-"), left, y);
    doc.text(String(type || "-"), left + 250, y);
    const formattedAmount = formatAmount(amount, { dashForZero: options.dashForZero });
    doc.text(formattedAmount, right - doc.getTextWidth(formattedAmount), y);
    y += rowHeight;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(String(company.company_name || "PULMO TECHNOLOGIES"), left, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Company Code: ${toSafeText(company.company_code, "-")}`, left, y);
  y += 12;
  doc.text(`Email: ${toSafeText(company.company_email, "-")}`, left, y);
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Pay Advice ${toSafeText(payslip.month_label, monthLabelFromYearMonth(payslip.month))}`, left, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Period: ${toSafeText(payslip.period_start, "-")} to ${toSafeText(payslip.period_end, "-")}`, left, y);
  y += 12;
  doc.text(`Employee Name: ${toSafeText(user.profile_name || user.username, "-")}`, left, y);
  y += 12;
  doc.text(`Employee No: ${toSafeText(user.employee_no || user.user_id, "-")}`, left, y);
  y += 12;
  doc.text(`Role: ${toSafeText(user.role, "-")}`, left, y);
  y += 18;
  doc.line(left, y, right, y);
  y += 14;

  drawAmountRow("Basic Salary", "Salary", salary.basic_sallary);
  drawAmountRow("Nopay", "Less", salary.no_pay_amount, { dashForZero: true });
  drawAmountRow("Salary For MSPS", "Net Basic", salary.salary_for_msps, { total: true });
  y += 8;

  drawAmountRow("Add:", "Allowances", 0, { dashForZero: true });
  const allowances = Array.isArray(salary.allowances) ? salary.allowances : [];
  allowances.forEach((item) => {
    drawAmountRow(String(item?.name || "Allowance"), "Amount", Number(item?.amount || 0), { dashForZero: true });
  });
  drawAmountRow("OT Payment", `${formatAmount(salary.ot_pay_per_hour)} x ${formatAmount(attendance.ot_hours)} hrs`, salary.ot_pay_amount, { dashForZero: true });
  drawAmountRow("Total Additions", "Total", toNumber(salary.allowances_total) + toNumber(salary.ot_pay_amount), { total: true });
  drawAmountRow("Gross Pay", "Final", salary.gross_pay, { total: true });
  y += 8;

  drawAmountRow("Less:", "Deductions", 0, { dashForZero: true });
  const deductions = Array.isArray(salary.deductions) ? salary.deductions : [];
  deductions.forEach((item) => {
    drawAmountRow(String(item?.name || "Deduction"), "Amount", Number(item?.amount || 0), { dashForZero: true });
  });
  drawAmountRow("Total Deduction", "Total", salary.deductions_total, { total: true });
  drawAmountRow("Net Salary", "Take Home", salary.net_sallary, { total: true });
  drawAmountRow("Co. Cont. To MSPS @ 12%", "Company", salary.company_cont_msps, { dashForZero: true });
  drawAmountRow("Co. Cont. To ETF @ 3%", "Company", salary.company_cont_etf, { dashForZero: true });

  y += 10;
  ensureSpace(70);
  doc.line(left, y, right, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Attendance/Leave Summary", left, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const summaryLines = [
    `Present Days: ${Number(attendance.present_days || 0)}`,
    `Working Days (Calculated): ${formatAmount(attendance.working_days)}`,
    `IN/OUT Working Hours: ${formatAmount(attendance.working_hours)}`,
    `OT Hours: ${formatAmount(attendance.ot_hours)}`,
    `Full Leave Days: ${formatAmount(leave.full_leave_days)}`,
    `Half Day Leave Count: ${formatAmount(leave.half_day_leave_count)}`,
  ];
  summaryLines.forEach((line) => {
    ensureSpace(rowHeight);
    doc.text(line, left, y);
    y += rowHeight;
  });

  y += 8;
  ensureSpace(20);
  doc.setFont("helvetica", "bold");
  doc.text("This is a computer generated pay slip, no signature required.", left, y);

  return doc;
}

function buildPayslipFileName() {
  const payslip = payslipViewState.payslip || {};
  const user = payslip.user || {};
  const profile = String(user.profile_name || user.username || "user")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "-");
  const month = String(payslip.month || payslipViewState.month || getSelectedMonth() || "month").trim();
  return `payslip-${profile}-${month}.pdf`;
}

function savePayslipPdf() {
  try {
    const doc = buildPayslipPdfDoc();
    doc.save(buildPayslipFileName());
    showStatus(`PDF saved at ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    showStatus(err.message || "Failed to save PDF.", "error");
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to save PDF.", "error");
    }
  }
}

async function sendPayslipEmail() {
  if (!payslipViewState.userId) return;
  setActionBusy(true);
  showStatus("Sending email...");
  try {
    const doc = buildPayslipPdfDoc();
    const dataUri = doc.output("datauristring");
    const commaIndex = dataUri.indexOf(",");
    const base64 = commaIndex === -1 ? "" : dataUri.slice(commaIndex + 1);
    if (!base64) {
      throw new Error("Failed to generate payslip PDF.");
    }

    const response = await request(
      `/hr/payslip/${encodeURIComponent(String(payslipViewState.userId))}/send-email`,
      "POST",
      {
        month: getSelectedMonth(),
        attachment_pdf_base64: `data:application/pdf;base64,${base64}`,
        attachment_file_name: buildPayslipFileName(),
      }
    );
    showStatus(response?.message || "Payslip email sent.");
    if (window.showMessageBox) {
      showMessageBox(response?.message || "Payslip email sent.");
    }
  } catch (err) {
    showStatus(err.message || "Failed to send payslip email.", "error");
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to send payslip email.", "error");
    } else {
      alert(err.message || "Failed to send payslip email.");
    }
  } finally {
    setActionBusy(false);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.__waitForUserAccessPermissions === "function") {
    await window.__waitForUserAccessPermissions();
  }

  if (!hasPagePermission(PAYSLIP_VIEW_PATH, ["view"])) {
    if (window.showMessageBox) {
      showMessageBox("You do not have access to Payslip View page.", "error");
    }
    window.location.href = "payslip.html";
    return;
  }

  payslipViewState.userId = getQueryUserId();
  if (!payslipViewState.userId) {
    if (window.showMessageBox) {
      showMessageBox("Invalid payslip user selection.", "error");
    }
    window.location.href = "payslip.html";
    return;
  }

  const monthInput = document.getElementById("payslipViewMonth");
  monthInput.value = getQueryMonth();
  payslipViewState.month = monthInput.value;

  const saveBtn = document.getElementById("savePayslipPdfBtn");
  const sendBtn = document.getElementById("sendPayslipEmailBtn");

  monthInput?.addEventListener("change", async () => {
    try {
      await loadPayslip();
    } catch (err) {
      showStatus(err.message || "Failed to load payslip.", "error");
      if (window.showMessageBox) {
        showMessageBox(err.message || "Failed to load payslip.", "error");
      }
    }
  });
  saveBtn?.addEventListener("click", savePayslipPdf);
  sendBtn?.addEventListener("click", sendPayslipEmail);

  try {
    await loadPayslip();
  } catch (err) {
    showStatus(err.message || "Failed to load payslip.", "error");
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to load payslip.", "error");
    } else {
      alert(err.message || "Failed to load payslip.");
    }
  }
});
