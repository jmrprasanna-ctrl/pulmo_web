const updatePageState = {
  invoiceId: 0,
  selectedImageBase64: "",
  invoiceAmount: 0,
  supportTechnicianPercentage: 0,
  proofObjectUrl: "",
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

function formatImageBitrateFromBytes(bytes) {
  const numericBytes = Number(bytes || 0);
  if (!Number.isFinite(numericBytes) || numericBytes <= 0) return "-";
  const kiloBits = (numericBytes * 8) / 1024;
  if (kiloBits >= 1024) {
    return `${(kiloBits / 1024).toFixed(2)} Mb`;
  }
  return `${kiloBits.toFixed(2)} Kb`;
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
  bitrateLabel.textContent = `Bitrate: ${formatImageBitrateFromBytes(bytes)}`;
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
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;">No items found.</td></tr>`;
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
          <td>${fmtCurrency(item.dealer_price)}</td>
          <td>${fmtCurrency(item.line_sell_total)}</td>
          <td>${fmtCurrency(item.line_vendor_total)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderPayment(payment) {
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

async function loadSupportTechPayDetail() {
  const { invoiceId } = updatePageState;
  if (!invoiceId) return;
  try {
    const data = await request(`/support-tech-pay/${invoiceId}`, "GET");
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
    const dataUrl = await toDataUrlFromFile(file);
    updatePageState.selectedImageBase64 = dataUrl;
    const preview = document.getElementById("paymentProofPreview");
    revokeProofObjectUrl();
    preview.src = dataUrl;
    preview.hidden = false;
    document.getElementById("paymentProofName").textContent = file.name || "Captured image";
    setProofBitrateFromBytes(file.size || 0);
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

  const payload = {
    vendor_pay_amount: Number(document.getElementById("vendorPayAmount").value || 0),
    support_tech_pay_amount: Number(document.getElementById("supportTechPayAmount").value || 0),
    payment_method: document.getElementById("paymentMethod").value,
    paid_at: document.getElementById("paymentDate").value || null,
  };

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
  const vendorPayInput = document.getElementById("vendorPayAmount");
  const form = document.getElementById("supTechPayForm");

  captureButton?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", onImageSelected);
  vendorPayInput?.addEventListener("input", updatePayableFromVendorInput);
  form?.addEventListener("submit", onSavePayment);

  loadSupportTechPayDetail();
});

window.addEventListener("beforeunload", () => {
  revokeProofObjectUrl();
});
