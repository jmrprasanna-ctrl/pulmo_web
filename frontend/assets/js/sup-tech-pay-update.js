const updatePageState = {
  invoiceId: 0,
  selectedImageBase64: "",
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

function renderMeta(invoice) {
  document.getElementById("invoiceNo").textContent = invoice.invoice_no || "-";
  document.getElementById("invoiceDate").textContent = fmtDate(invoice.invoice_date);
  document.getElementById("customerName").textContent = invoice.customer_name || "-";
  document.getElementById("supportTechnician").textContent = invoice.support_technician || "-";
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
  document.getElementById("supportTechPayAmount").value = fmtCurrency(payment.support_tech_pay_amount);
  document.getElementById("paymentMethod").value = payment.payment_method || "Cash";
  document.getElementById("paymentStatus").value = payment.payment_status || "Pending";

  const preview = document.getElementById("paymentProofPreview");
  const fileNameLabel = document.getElementById("paymentProofName");
  const imageUrl = String(payment.payment_proof_image_url || "").trim();

  if (imageUrl) {
    preview.src = imageUrl;
    preview.hidden = false;
    const pathParts = String(payment.payment_proof_image_path || "").split("/");
    fileNameLabel.textContent = pathParts[pathParts.length - 1] || "Saved image";
  } else {
    preview.src = "";
    preview.hidden = true;
    fileNameLabel.textContent = "No image selected";
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
    preview.src = dataUrl;
    preview.hidden = false;
    document.getElementById("paymentProofName").textContent = file.name || "Captured image";
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
    payment_status: document.getElementById("paymentStatus").value,
  };

  if (selectedImageBase64) {
    payload.payment_proof_image_base64 = selectedImageBase64;
  }

  const saveButton = event.target.querySelector('button[type="submit"]');
  if (saveButton) saveButton.disabled = true;

  try {
    await request(`/support-tech-pay/${invoiceId}`, "PUT", payload);
    updatePageState.selectedImageBase64 = "";
    if (window.showMessageBox) {
      showMessageBox("Sup.Tech Pay details saved successfully.");
    }
    await loadSupportTechPayDetail();
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
  const form = document.getElementById("supTechPayForm");

  captureButton?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", onImageSelected);
  form?.addEventListener("submit", onSavePayment);

  loadSupportTechPayDetail();
});
