const updatePageState = {
  invoiceId: 0,
  selectedImageBase64: "",
  invoiceAmount: 0,
  supportTechnicianPercentage: 0,
  proofObjectUrl: "",
  hasSavedPayment: false,
  detail: null,
};

function fmtCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
}

function toIsoDateValue(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read selected image."));
    reader.readAsDataURL(file);
  });
}

function loadImageElementFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to process image."));
    img.src = dataUrl;
  });
}

function bytesFromDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  const commaIndex = raw.indexOf(",");
  if (commaIndex === -1) return 0;
  const base64 = raw.slice(commaIndex + 1);
  return calculateBytesFromBase64(base64);
}

async function compressImageToTargetRangeDataUrl(file, minBytes = 50 * 1024, maxBytes = 100 * 1024) {
  const originalDataUrl = await toDataUrlFromFile(file);
  const image = await loadImageElementFromDataUrl(originalDataUrl);

  const scaleLevels = [1, 0.95, 0.9, 0.85, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4];
  const qualityLevels = [0.9, 0.84, 0.78, 0.72, 0.66, 0.6, 0.54, 0.48, 0.42, 0.36, 0.3, 0.24];

  let bestDataUrl = originalDataUrl;
  let bestBytes = bytesFromDataUrl(originalDataUrl);
  const preferredTarget = (minBytes + maxBytes) / 2;
  let bestInRange = null;
  let bestUnderMax = null;

  for (const scale of scaleLevels) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(image, 0, 0, width, height);

    for (const quality of qualityLevels) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const size = bytesFromDataUrl(dataUrl);
      if (size > 0 && size < bestBytes) {
        bestBytes = size;
        bestDataUrl = dataUrl;
      }
      if (size >= minBytes && size <= maxBytes) {
        const delta = Math.abs(size - preferredTarget);
        if (!bestInRange || delta < bestInRange.delta) {
          bestInRange = { dataUrl, bytes: size, delta };
        }
      } else if (size > 0 && size <= maxBytes) {
        if (!bestUnderMax || size > bestUnderMax.bytes) {
          bestUnderMax = { dataUrl, bytes: size };
        }
      }
    }
  }

  if (bestInRange) {
    return { dataUrl: bestInRange.dataUrl, bytes: bestInRange.bytes, inRange: true };
  }
  if (bestUnderMax) {
    return { dataUrl: bestUnderMax.dataUrl, bytes: bestUnderMax.bytes, inRange: false };
  }
  return { dataUrl: bestDataUrl, bytes: bestBytes };
}

function formatImageSizeFromBytes(bytes) {
  const numericBytes = Number(bytes || 0);
  if (!Number.isFinite(numericBytes) || numericBytes <= 0) return "-";
  const kiloBytes = numericBytes / 1024;
  if (kiloBytes >= 1024) {
    return `${(kiloBytes / 1024).toFixed(2)} MB`;
  }
  return `${kiloBytes.toFixed(2)} KB`;
}

function calculateBytesFromBase64(base64Value) {
  const base64 = String(base64Value || "").trim();
  if (!base64) return 0;
  const noPadLength = base64.replace(/=+$/, "").length;
  return Math.floor((noPadLength * 3) / 4);
}

function setProofBitrateFromBytes(bytes) {
  const bitrateLabel = document.getElementById("paymentProofBitrate");
  if (!bitrateLabel) return;
  bitrateLabel.textContent = `Image Size: ${formatImageSizeFromBytes(bytes)}`;
}

function revokeProofObjectUrl() {
  if (updatePageState.proofObjectUrl) {
    try {
      URL.revokeObjectURL(updatePageState.proofObjectUrl);
    } catch (_err) {
    }
    updatePageState.proofObjectUrl = "";
  }
}

function buildProofUrlFromStoredPath(storedPath) {
  const raw = String(storedPath || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const normalized = raw.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const marker = "/storage/";
  const markerIndex = lower.lastIndexOf(marker);

  let relPath = normalized.replace(/^\/+/, "");
  if (markerIndex !== -1) {
    relPath = normalized.slice(markerIndex + marker.length).replace(/^\/+/, "");
  } else if (relPath.toLowerCase().startsWith("storage/")) {
    relPath = relPath.slice("storage/".length);
  }

  return relPath ? `/storage/${relPath}` : "";
}

async function loadSavedImageBitrate(imageUrl) {
  try {
    const response = await fetch(imageUrl, { cache: "no-store" });
    if (!response.ok) {
      setProofBitrateFromBytes(0);
      return;
    }
    const blob = await response.blob();
    setProofBitrateFromBytes(blob.size || 0);
  } catch (_err) {
    setProofBitrateFromBytes(0);
  }
}

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
  if (selectedDb) headers["X-Database-Name"] = selectedDb;
  return headers;
}

function buildProofImageApiUrl(invoiceId) {
  const base = String(window.BASE_URL || "/api").replace(/\/+$/, "");
  return `${base}/support-tech-pay/${invoiceId}/proof-image`;
}

async function loadProofImageFromApi(invoiceId) {
  const numericInvoiceId = Number(invoiceId || 0);
  if (!numericInvoiceId) return false;
  try {
    const res = await fetch(buildProofImageApiUrl(numericInvoiceId), {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (!blob || !blob.size) return false;

    revokeProofObjectUrl();
    updatePageState.proofObjectUrl = URL.createObjectURL(blob);
    const preview = document.getElementById("paymentProofPreview");
    if (preview) {
      preview.src = updatePageState.proofObjectUrl;
      preview.hidden = false;
    }
    setProofBitrateFromBytes(blob.size);
    return true;
  } catch (_err) {
    return false;
  }
}

async function loadProofImageBase64Fallback() {
  const invoiceId = Number(updatePageState.invoiceId || 0);
  if (!invoiceId) return;

  try {
    const data = await request(`/support-tech-pay/${invoiceId}?include_image_base64=1`, "GET");
    const payment = data && data.payment ? data.payment : {};
    const imageBase64 = String(payment.payment_proof_image_base64 || "").trim();
    const imageMime = String(payment.payment_proof_image_mime || "").trim() || "image/jpeg";
    if (!imageBase64) {
      setProofBitrateFromBytes(0);
      return;
    }

    const preview = document.getElementById("paymentProofPreview");
    if (!preview) return;
    revokeProofObjectUrl();
    preview.src = `data:${imageMime};base64,${imageBase64}`;
    preview.hidden = false;
    setProofBitrateFromBytes(calculateBytesFromBase64(imageBase64));
  } catch (_err) {
    setProofBitrateFromBytes(0);
  }
}

function calculateSupportTechPayable(vendorPayAmount) {
  const invoiceAmount = Number(updatePageState.invoiceAmount || 0);
  const percentage = Number(updatePageState.supportTechnicianPercentage || 0);
  const vendor = Number(vendorPayAmount || 0);
  if (!Number.isFinite(invoiceAmount) || !Number.isFinite(percentage) || !Number.isFinite(vendor)) {
    return 0;
  }
  return Number((((invoiceAmount - vendor) * percentage) / 100).toFixed(2));
}

function updatePayableFromVendorInput() {
  const vendorInput = document.getElementById("vendorPayAmount");
  const supportInput = document.getElementById("supportTechPayAmount");
  if (!vendorInput || !supportInput) return;
  const payable = calculateSupportTechPayable(vendorInput.value);
  supportInput.value = fmtCurrency(payable);
}

function renderMeta(invoice) {
  const invoiceNo = String(invoice.invoice_no || "-").trim() || "-";
  const customerName = String(invoice.customer_name || "-").trim() || "-";
  const technician = String(invoice.support_technician || "-").trim() || "-";
  const invoiceDate = fmtDate(invoice.invoice_date);
  updatePageState.invoiceAmount = Number(invoice.total_amount || 0);
  const invoiceAmount = `Rs. ${fmtCurrency(updatePageState.invoiceAmount)}`;
  const techPercentage = Number(invoice.support_technician_percentage);
  updatePageState.supportTechnicianPercentage = Number.isFinite(techPercentage) ? techPercentage : 0;
  const techPercentageText = Number.isFinite(techPercentage) ? `${techPercentage.toFixed(2)}%` : "-";

  const titleInput = document.getElementById("invoiceTitle");
  if (titleInput) {
    titleInput.value = `Invoice ${invoiceNo}`;
  }

  const invoiceDateInput = document.getElementById("invoiceDate");
  if (invoiceDateInput) {
    invoiceDateInput.value = invoiceDate;
  }

  const invoiceAmountInput = document.getElementById("invoiceAmount");
  if (invoiceAmountInput) {
    invoiceAmountInput.value = invoiceAmount;
  }

  const customerInput = document.getElementById("customerName");
  if (customerInput) {
    customerInput.value = customerName;
  }

  const technicianInput = document.getElementById("supportTechnician");
  if (technicianInput) {
    technicianInput.value = technician;
  }

  const technicianPercentageInput = document.getElementById("supportTechnicianPercentage");
  if (technicianPercentageInput) {
    technicianPercentageInput.value = techPercentageText;
  }

}

function renderItems(items) {
  const body = document.getElementById("supTechPayItemsBody");
  if (!body) return;

  if (!Array.isArray(items) || !items.length) {
    body.innerHTML = `<tr><td colspan="3" style="text-align:center;">No items found.</td></tr>`;
    return;
  }

  body.innerHTML = items
    .map((item) => {
      const itemLabel = `${item.product_id || ""} ${item.description || item.model || ""}`.trim() || "-";
      return `
        <tr>
          <td>${escapeHtml(itemLabel)}</td>
          <td>${Number(item.qty || 0)}</td>
          <td>${fmtCurrency(item.sell_rate)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderPayment(payment) {
  updatePageState.hasSavedPayment = String(payment.payment_status || "").toLowerCase() === "paid";
  document.getElementById("vendorPayAmount").value = fmtCurrency(payment.vendor_pay_amount);
  updatePayableFromVendorInput();
  document.getElementById("paymentMethod").value = payment.payment_method || "Cash";
  const paymentDateInput = document.getElementById("paymentDate");
  if (paymentDateInput) {
    paymentDateInput.value = toIsoDateValue(payment.paid_at) || new Date().toISOString().slice(0, 10);
  }

  const preview = document.getElementById("paymentProofPreview");
  const fileNameLabel = document.getElementById("paymentProofName");
  const hasStoredImage = String(payment.payment_proof_image_path || "").trim().length > 0;

  if (hasStoredImage) {
    const pathParts = String(payment.payment_proof_image_path || "").split("/");
    fileNameLabel.textContent = pathParts[pathParts.length - 1] || "Saved image";
    loadProofImageFromApi(updatePageState.invoiceId).then((ok) => {
      if (!ok) {
        const imageUrl = String(payment.payment_proof_image_url || "").trim();
        const fallbackImageUrl = buildProofUrlFromStoredPath(payment.payment_proof_image_path || "");
        const resolvedImageUrl = imageUrl || fallbackImageUrl;
        if (resolvedImageUrl) {
          preview.src = resolvedImageUrl;
          preview.hidden = false;
          preview.onerror = () => loadProofImageBase64Fallback();
          preview.onload = () => {
            preview.onerror = null;
          };
          loadSavedImageBitrate(resolvedImageUrl);
        } else {
          loadProofImageBase64Fallback();
        }
      }
    });
  } else {
    revokeProofObjectUrl();
    preview.src = "";
    preview.hidden = true;
    fileNameLabel.textContent = "No image selected";
    setProofBitrateFromBytes(0);
  }
}

function buildPaymentPayload() {
  return {
    vendor_pay_amount: Number(document.getElementById("vendorPayAmount").value || 0),
    support_tech_pay_amount: Number(document.getElementById("supportTechPayAmount").value || 0),
    payment_method: document.getElementById("paymentMethod").value,
    paid_at: document.getElementById("paymentDate").value || null,
  };
}

function buildCurrentPaymentSnapshot() {
  return {
    vendor_pay_amount: Number(document.getElementById("vendorPayAmount")?.value || 0),
    support_tech_pay_amount: Number(document.getElementById("supportTechPayAmount")?.value || 0),
    payment_method: String(document.getElementById("paymentMethod")?.value || "Cash"),
    paid_at: String(document.getElementById("paymentDate")?.value || ""),
    payment_status: updatePageState.hasSavedPayment ? "Paid" : "Pending",
  };
}

function generateSupportTechPayDetailPdf() {
  const jspdfRef = window.jspdf;
  if (!jspdfRef || !jspdfRef.jsPDF) {
    throw new Error("PDF library not loaded.");
  }
  const { jsPDF } = jspdfRef;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const detail = updatePageState.detail || {};
  const invoice = detail.invoice || {};
  const items = Array.isArray(detail.items) ? detail.items : [];
  const paymentSnapshot = buildCurrentPaymentSnapshot();

  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 40;
  const right = 555;
  const rowHeight = 16;
  let y = 42;

  const ensureSpace = (required = 24) => {
    if (y + required > pageHeight - 32) {
      doc.addPage();
      y = 42;
    }
  };

  const writeLine = (label, value) => {
    ensureSpace(rowHeight + 4);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, left, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value || "-"), left + 170, y);
    y += rowHeight;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Support Technician Payment Detail", left, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
  y += 20;

  writeLine("Invoice No", invoice.invoice_no || "-");
  writeLine("Invoice Date", fmtDate(invoice.invoice_date));
  writeLine("Customer", invoice.customer_name || "-");
  writeLine("Support Technician", invoice.support_technician || "-");
  writeLine("Support Technician %", `${Number(invoice.support_technician_percentage || 0).toFixed(2)}%`);
  writeLine("Invoice Amount", fmtCurrency(invoice.total_amount));
  writeLine("Vendor Pay Amount", fmtCurrency(paymentSnapshot.vendor_pay_amount));
  writeLine("Support Tech Pay Amount", fmtCurrency(paymentSnapshot.support_tech_pay_amount));
  writeLine("Payment Method", paymentSnapshot.payment_method || "-");
  writeLine("Payment Date", paymentSnapshot.paid_at || "-");
  writeLine("Payment Status", paymentSnapshot.payment_status || "Pending");

  y += 8;
  ensureSpace(30);
  doc.setFont("helvetica", "bold");
  doc.text("Items", left, y);
  y += 10;
  doc.line(left, y, right, y);
  y += 14;
  doc.text("Item", left, y);
  doc.text("Qty", 380, y);
  doc.text("Sell Rate", 450, y);
  y += 8;
  doc.line(left, y, right, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  if (!items.length) {
    doc.text("No items found.", left, y);
  } else {
    items.forEach((item) => {
      ensureSpace(rowHeight + 4);
      const itemLabel = `${item.product_id || ""} ${item.description || item.model || ""}`.trim() || "-";
      doc.text(itemLabel.slice(0, 55), left, y);
      doc.text(String(Number(item.qty || 0)), 380, y);
      doc.text(fmtCurrency(item.sell_rate), 450, y);
      y += rowHeight;
    });
  }

  const dataUri = doc.output("datauristring");
  const commaIndex = dataUri.indexOf(",");
  const base64 = commaIndex === -1 ? "" : dataUri.slice(commaIndex + 1);
  if (!base64) {
    throw new Error("Failed to generate payment detail PDF.");
  }
  return {
    base64,
    fileName: `sup-tech-pay-${String(invoice.invoice_no || updatePageState.invoiceId || "detail")}.pdf`,
  };
}

async function onSendPaymentEmail() {
  const { invoiceId } = updatePageState;
  if (!invoiceId) return;

  const sendButton = document.getElementById("sendSupTechPayEmailBtn");
  if (sendButton) sendButton.disabled = true;

  try {
    const pdf = generateSupportTechPayDetailPdf();
    const response = await request(`/support-tech-pay/${invoiceId}/send-email`, "POST", {
      attachment_pdf_base64: `data:application/pdf;base64,${pdf.base64}`,
      attachment_file_name: pdf.fileName,
    });
    if (window.showMessageBox) {
      showMessageBox(response?.message || "Payment detail email sent successfully.");
    }
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to send payment detail email.", "error");
    } else {
      alert(err.message || "Failed to send payment detail email.");
    }
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

async function onDeletePayment() {
  const { invoiceId, hasSavedPayment } = updatePageState;
  if (!invoiceId) return;

  if (!hasSavedPayment) {
    if (window.showMessageBox) {
      showMessageBox("No saved Sup.Tech Pay entry to delete.", "error");
    }
    return;
  }

  const ok = window.confirm("Delete this Sup.Tech Pay entry? This action cannot be undone.");
  if (!ok) return;

  const deleteButton = document.getElementById("deleteSupTechPayBtn");
  if (deleteButton) deleteButton.disabled = true;

  try {
    await request(`/support-tech-pay/${invoiceId}`, "DELETE");
    updatePageState.hasSavedPayment = false;
    updatePageState.selectedImageBase64 = "";
    if (window.showMessageBox) {
      showMessageBox("Sup.Tech Pay entry deleted successfully.");
    }
    window.setTimeout(() => {
      window.location.href = "sup-tech-pay.html";
    }, 250);
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to delete Sup.Tech Pay entry.", "error");
    } else {
      alert(err.message || "Failed to delete Sup.Tech Pay entry.");
    }
  } finally {
    if (deleteButton) deleteButton.disabled = false;
  }
}

async function loadSupportTechPayDetail() {
  const { invoiceId } = updatePageState;
  if (!invoiceId) return;
  try {
    const data = await request(`/support-tech-pay/${invoiceId}`, "GET");
    updatePageState.detail = data || null;
    renderMeta(data.invoice || {});
    renderItems(data.items || []);
    renderPayment(data.payment || {});
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to load payment detail.", "error");
    } else {
      alert(err.message || "Failed to load payment detail.");
    }
  }
}

async function onImageSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const compressed = await compressImageToTargetRangeDataUrl(file, 50 * 1024, 100 * 1024);
    updatePageState.selectedImageBase64 = compressed.dataUrl;
    const preview = document.getElementById("paymentProofPreview");
    revokeProofObjectUrl();
    preview.src = compressed.dataUrl;
    preview.hidden = false;
    document.getElementById("paymentProofName").textContent = file.name || "Captured image";
    setProofBitrateFromBytes(compressed.bytes || 0);
    if (((compressed.bytes || 0) < 50 * 1024 || (compressed.bytes || 0) > 100 * 1024) && window.showMessageBox) {
      showMessageBox("Image compressed, but exact 50KB-100KB range could not be reached.");
    }
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to read selected image.", "error");
    }
  }
}

async function onSavePayment(event) {
  event.preventDefault();
  const { invoiceId, selectedImageBase64 } = updatePageState;
  if (!invoiceId) return;

  const payload = buildPaymentPayload();

  if (selectedImageBase64) {
    payload.payment_proof_image_base64 = selectedImageBase64;
  }

  const saveButton = event.target.querySelector('button[type="submit"]');
  if (saveButton) saveButton.disabled = true;

  try {
    const response = await request(`/support-tech-pay/${invoiceId}`, "PUT", payload);
    updatePageState.selectedImageBase64 = "";
    if (window.showMessageBox) {
      showMessageBox("Sup.Tech Pay details saved successfully.");
    }
    const payment = response && response.payment ? response.payment : null;
    if (payment && payment.payment_proof_image_path) {
      const pathParts = String(payment.payment_proof_image_path || "").split("/");
      const fileNameLabel = document.getElementById("paymentProofName");
      if (fileNameLabel) {
        fileNameLabel.textContent = pathParts[pathParts.length - 1] || fileNameLabel.textContent;
      }
    }
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to save Sup.Tech Pay details.", "error");
    } else {
      alert(err.message || "Failed to save Sup.Tech Pay details.");
    }
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  updatePageState.invoiceId = Number(params.get("invoiceId") || 0);

  if (!updatePageState.invoiceId) {
    if (window.showMessageBox) {
      showMessageBox("Invoice id is missing in URL.", "error");
    }
    return;
  }

  const fileInput = document.getElementById("paymentProofFile");
  const captureButton = document.getElementById("captureProofBtn");
  const deleteButton = document.getElementById("deleteSupTechPayBtn");
  const sendEmailButton = document.getElementById("sendSupTechPayEmailBtn");
  const vendorPayInput = document.getElementById("vendorPayAmount");
  const form = document.getElementById("supTechPayForm");

  captureButton?.addEventListener("click", () => fileInput?.click());
  deleteButton?.addEventListener("click", onDeletePayment);
  sendEmailButton?.addEventListener("click", onSendPaymentEmail);
  fileInput?.addEventListener("change", onImageSelected);
  vendorPayInput?.addEventListener("input", updatePayableFromVendorInput);
  form?.addEventListener("submit", onSavePayment);

  loadSupportTechPayDetail();
});

window.addEventListener("beforeunload", () => {
  revokeProofObjectUrl();
});
