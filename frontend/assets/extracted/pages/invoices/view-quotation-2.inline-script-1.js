let latestInvoiceData = null;
let templateDataUrl = "";
let templatePlacement = { dx: 0, dy: 0, w: 1240, h: 1754 };
const BASE_W = 1240;
const BASE_H = 1754;
let qut2PreviewCustomerName = "";
const currentRole = String(localStorage.getItem("role") || "").trim().toLowerCase();
const canConfigurePreview = currentRole === "admin" || currentRole === "manager";
let invMapFlags = null;
let qut2RenderVisibilityFromDb = null;
let qut2RenderOverridesFromDb = null;
let qut2ItemNameOverridesByInvoice = {};
let qut2ItemRateOverridesByInvoice = {};
let qut2RenderDbName = "";

function hasMappedFeature(featureKey){
    if(!invMapFlags) return true;
    return !!invMapFlags[featureKey];
}

async function loadInvMapFlags(){
    try{
        const res = await request("/users/inv-map/me", "GET");
        const flags = res && res.feature_flags && typeof res.feature_flags === "object" ? res.feature_flags : null;
        invMapFlags = flags;
        const renderVisibility = res && res.quotation2_render_visibility && typeof res.quotation2_render_visibility === "object"
            ? res.quotation2_render_visibility
            : null;
        const renderOverrides = res && res.quotation2_render_overrides && typeof res.quotation2_render_overrides === "object"
            ? res.quotation2_render_overrides
            : null;
        qut2RenderVisibilityFromDb = renderVisibility;
        qut2RenderOverridesFromDb = renderOverrides;
        qut2RenderDbName = String(res?.mapping?.database_name || "").trim();
    }catch(_err){
        invMapFlags = null;
        qut2RenderVisibilityFromDb = null;
        qut2RenderOverridesFromDb = null;
        qut2RenderDbName = "";
    }
}
const OVERLAY = {
    // Keep neutral mapping to preserve original-template alignment
    shiftX: 0,
    shiftY: 0,
    fontScale: 1,
    rowGap: 0
};
const INPUT_FONT_SIZE = 25;
const INPUT_FONT_FAMILY = "Calibri";
let sign1Enabled = false;
let sign1Image = null;
let sign1LoadFailedNotified = false;
let seal1Enabled = false;
let seal1Image = null;
let seal1LoadFailedNotified = false;
const LAYOUT_STEP = 4;
const layoutState = {
    customerName: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    customerAddress: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    customerTel: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    serialNo: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    date: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    invoiceNo: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    machineTitle: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    supportTechnician: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    paymentMethod: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    amountWords: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    totalAmount: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    important: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    itemNo: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    description: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    qty: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    rate: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    vat: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    grossAmount: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    logoWithName: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    addressColombo: { x: 0, y: 0, font: 25, fontFamily: "Bahnschrift", fontWeight: "normal" },
    addressV: { x: 0, y: 0, font: 25, fontFamily: "Bahnschrift", fontWeight: "normal" },
    signC: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    signV: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    sealC: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    sealV: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" },
    count: { x: 0, y: 0, font: 25, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" }
};
let selectedLayoutTarget = "customerName";
const POS = {
    customer: { x: 165, nameY: 490, addressY: 530, telY: 606, vatY: 646, w: 440, fs: 17 },
    meta: { dateX: 794, noX: 794, dateY: 490, noY: 530, refY: 570, supportY: 610, w: 360, fs: 17 },
    paymentMethod: { labelX: 920, labelY: 513, optionsX: 920, optionsY: 537, gapX: 86, creditExtraX: 12, fs: 20 },
    machineInfo: { countX: 60, serialX: 520, y: 610, countW: 180, serialW: 320, countOffsetX: 100, countOffsetY: 28, countFs: 25, serialOffsetX: 10, serialOffsetY: 26, serialFs: 25, fs: 17 },
    table: { x: 35, y: 660, c1: 50, c2: 800, c3: 890, c4: 985, c5: 1065, rowStart: 62, rowH: 38, fs: 13 },
    important: { x: 67, y: 1295, rowH: 40, w: 980, maxRows: 4, fs: 25 },
    amountWords: { x: 175, yFromTable: 790, yInCell: 28, w: 840, fs: 25 },
    addressBlockColombo: { x: 822, y: 80, lineH: 34, fs: 25 },
    addressBlockV: { x: 822, y: 80, lineH: 34, fs: 25 },
    sign1: { x: 46, y: 1496, w: 300, h: 130 },
    signV: { x: 46, y: 1496, w: 300, h: 130 },
    seal1: { x: 297, y: 1452, w: 235, h: 110 },
    sealV: { x: 297, y: 1452, w: 235, h: 110 },
    total: { yFromTable: 790, yInCell: 28, fs: 14 }
};

function getLayoutConfig(key){
    return layoutState[key] || { x: 0, y: 0, font: INPUT_FONT_SIZE, fontFamily: INPUT_FONT_FAMILY, fontWeight: "normal" };
}

function getLayoutFont(key, fallback){
    const val = Number(getLayoutConfig(key).font);
    return Number.isFinite(val) && val > 0 ? val : fallback;
}

function getLayoutFontFamily(key, fallback){
    const family = String(getLayoutConfig(key).fontFamily || "").trim();
    return family || fallback;
}

function getLayoutFontWeight(key){
    return String(getLayoutConfig(key).fontWeight || "normal").toLowerCase() === "bold" ? "bold" : "normal";
}

function getLayoutVisible(key){
    return getLayoutConfig(key).visible !== false;
}

function money(value){
    return Number(value || 0).toFixed(2);
}

function toNumeric(value, fallback = 0){
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function calculateGrossFromRate(item, rateValue){
    const qty = toNumeric(item?.qty, 0);
    const vatPercent = toNumeric(item?.vat, 0);
    const base = qty * toNumeric(rateValue, 0);
    const gross = base + ((base * vatPercent) / 100);
    return Number.isFinite(gross) ? gross : 0;
}

function asDate(value){
    const dt = new Date(value);
    if(Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-GB");
}

function loadImage(src){
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function ensureSign1Image(){
    if(sign1Image) return sign1Image;
    try{
        const token = localStorage.getItem("token");
        const res = await fetch(`${BASE_URL}/invoices/sign-q2-image`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if(!res.ok){
            sign1Image = null;
            return null;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        sign1Image = await loadImage(objectUrl);
        URL.revokeObjectURL(objectUrl);
        return sign1Image;
    }catch(_err){
        sign1Image = null;
        return null;
    }
}

async function ensureSeal1Image(){
    if(seal1Image) return seal1Image;
    try{
        const token = localStorage.getItem("token");
        const res = await fetch(`${BASE_URL}/invoices/seal-q2-image`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if(!res.ok){
            seal1Image = null;
            return null;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        seal1Image = await loadImage(objectUrl);
        URL.revokeObjectURL(objectUrl);
        return seal1Image;
    }catch(_err){
        seal1Image = null;
        return null;
    }
}

function fitText(ctx, text, x, y, maxWidth, size=12, weight="normal", fontFamily="Arial"){
    let fontSize = size;
    const value = String(text || "");
    while(fontSize >= 8){
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
        if(ctx.measureText(value).width <= maxWidth) break;
        fontSize -= 1;
    }
    ctx.fillText(value, x, y);
}

function drawRight(ctx, text, rightX, y, maxWidth, size=12, weight="normal", fontFamily="Arial"){
    const prevAlign = ctx.textAlign;
    let fontSize = size;
    const value = String(text || "");
    while(fontSize >= 8){
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
        if(ctx.measureText(value).width <= maxWidth) break;
        fontSize -= 1;
    }
    ctx.textAlign = "right";
    ctx.fillText(value, rightX, y);
    ctx.textAlign = prevAlign;
}

function drawRightFixed(ctx, text, rightX, y, size=12, weight="normal", fontFamily="Arial"){
    const prevAlign = ctx.textAlign;
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.fillText(String(text || ""), rightX, y);
    ctx.textAlign = prevAlign;
}

function drawFixedText(ctx, text, x, y, size=12, weight="normal", fontFamily="Arial", maxWidth=null){
    let fontSize = size;
    const value = String(text || "");
    if(Number.isFinite(maxWidth) && maxWidth > 0){
        while(fontSize >= 8){
            ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
            if(ctx.measureText(value).width <= maxWidth) break;
            fontSize -= 1;
        }
    }else{
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    }
    ctx.fillText(value, x, y);
}

function drawMultilineFixedText(ctx, lines, x, y, lineHeight, size=12, weight="normal", fontFamily="Arial", maxWidth=null){
    const safeLines = Array.isArray(lines) ? lines : [];
    safeLines.forEach((line, idx) => {
        drawFixedText(ctx, String(line || ""), x, y + (idx * lineHeight), size, weight, fontFamily, maxWidth);
    });
}

function numberToWords(num){
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const scales = ["", "Thousand", "Million", "Billion", "Trillion"];

    const underThousand = (n) => {
        let out = "";
        const h = Math.floor(n / 100);
        const r = n % 100;
        if (h) out += `${ones[h]} Hundred`;
        if (r) {
            if (out) out += " ";
            if (r < 20) out += ones[r];
            else {
                out += tens[Math.floor(r / 10)];
                if (r % 10) out += ` ${ones[r % 10]}`;
            }
        }
        return out.trim();
    };

    let n = Math.floor(Math.abs(Number(num) || 0));
    if (!n) return "Zero";

    let parts = [];
    let scaleIndex = 0;
    while (n > 0) {
        const chunk = n % 1000;
        if (chunk) {
            const chunkWords = underThousand(chunk);
            const scale = scales[scaleIndex];
            parts.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
        }
        n = Math.floor(n / 1000);
        scaleIndex += 1;
    }
    return parts.join(" ").trim();
}

function amountInWords(amount){
    const words = numberToWords(amount);
    return `Rupees ${words} Only`;
}

function getImportantNotes(invoice){
    const rows = Array.isArray(invoice?.InvoiceImportants) ? invoice.InvoiceImportants : [];
    const fromRows = rows
        .map((row) => String(row?.note || "").trim())
        .filter(Boolean);
    if(fromRows.length) return fromRows;

    if(Array.isArray(invoice?.importants)){
        return invoice.importants
            .map((v) => String(v || "").trim())
            .filter(Boolean);
    }
    return [];
}

function mapFactory(){
    const p = templatePlacement || { dx: 0, dy: 0, w: BASE_W, h: BASE_H };
    const sx = p.w / BASE_W;
    const sy = p.h / BASE_H;
    const sf = (sx + sy) / 2;
    return {
        x: (v) => p.dx + ((v + OVERLAY.shiftX) * sx),
        y: (v) => p.dy + ((v + OVERLAY.shiftY) * sy),
        w: (v) => v * sx,
        h: (v) => v * sy,
        fs: (v) => Math.max(8, v * sf * OVERLAY.fontScale)
    };
}

async function fetchInvoiceData(){
    const id = new URLSearchParams(window.location.search).get("id");
    if(!id) throw new Error("Invoice id is missing.");

    const invoice = await request(`/invoices/${id}`, "GET");
    let customer = invoice.Customer || {};
    if(customer && customer.id){
        try{
            customer = await request(`/customers/${customer.id}`, "GET");
        }catch(_err){
        }
    }

    const totals = invoice.print_totals || {};
    const items = Array.isArray(invoice.InvoiceItems) ? invoice.InvoiceItems : [];
    return {
        invoice,
        customer,
        items,
        total_amount: Number(totals.total_amount || invoice.total_amount || 0)
    };
}

async function fetchTemplatePdfBuffer(){
    if(!hasMappedFeature("quotation2")){
        throw new Error("Quotation 2 function is not mapped for this user and database.");
    }
    const token = localStorage.getItem("token");
    const res = await fetch(`${BASE_URL}/invoices/quotation-2-template-pdf`, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    });
    if(!res.ok){
        throw new Error("Failed to load invoice template PDF from backend.");
    }
    return res.arrayBuffer();
}

async function ensureTemplateDataUrl(width, height){
    if(templateDataUrl) return templateDataUrl;

    if(!window.pdfjsLib){
        throw new Error("pdf.js is not loaded.");
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const buffer = await fetchTemplatePdfBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await doc.getPage(1);

    const vp0 = page.getViewport({ scale: 1 });
    const scale = Math.min(width / vp0.width, height / vp0.height);
    const vp = page.getViewport({ scale });

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.round(vp.width);
    pageCanvas.height = Math.round(vp.height);
    const pctx = pageCanvas.getContext("2d");
    pctx.fillStyle = "#fff";
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    await page.render({ canvasContext: pctx, viewport: vp }).promise;

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const octx = out.getContext("2d");
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, width, height);

    const dx = (width - pageCanvas.width) / 2;
    const dy = (height - pageCanvas.height) / 2;
    octx.drawImage(pageCanvas, dx, dy);
    templatePlacement = { dx, dy, w: pageCanvas.width, h: pageCanvas.height };
    templateDataUrl = out.toDataURL("image/png");
    return templateDataUrl;
}

async function drawInvoice(data, mimeType="image/png", renderSize=null){
    const W = renderSize && renderSize.width ? renderSize.width : 1240;
    const H = renderSize && renderSize.height ? renderSize.height : 1754;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);

    try{
        const bgUrl = await ensureTemplateDataUrl(W, H);
        const bg = await loadImage(bgUrl);
        ctx.drawImage(bg, 0, 0, W, H);
    }catch(_err){
        // Fallback when template PDF cannot be loaded
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 1;
        ctx.strokeRect(18, 18, W - 36, H - 36);
    }

    const c = data.customer || {};
    const m = mapFactory();

    // Customer block
    ctx.fillStyle = "#000";
    const normalFs = m.fs(POS.customer.fs);
    const rowFs = m.fs(POS.table.fs);
    const totalFs = m.fs(POS.total.fs);
    const customerNameCfg = getLayoutConfig("customerName");
    const customerAddressCfg = getLayoutConfig("customerAddress");
    const customerTelCfg = getLayoutConfig("customerTel");
    const customerNameFont = getLayoutFont("customerName", INPUT_FONT_SIZE);
    const customerAddressFont = getLayoutFont("customerAddress", INPUT_FONT_SIZE);
    const customerTelFont = getLayoutFont("customerTel", INPUT_FONT_SIZE);
    const customerNameFamily = getLayoutFontFamily("customerName", INPUT_FONT_FAMILY);
    const customerAddressFamily = getLayoutFontFamily("customerAddress", INPUT_FONT_FAMILY);
    const customerTelFamily = getLayoutFontFamily("customerTel", INPUT_FONT_FAMILY);
    const customerNameWeight = getLayoutFontWeight("customerName");
    const customerAddressWeight = getLayoutFontWeight("customerAddress");
    const customerTelWeight = getLayoutFontWeight("customerTel");
    const dateCfg = getLayoutConfig("date");
    const invoiceNoCfg = getLayoutConfig("invoiceNo");
    const machineTitleCfg = getLayoutConfig("machineTitle");
    const supportTechnicianCfg = getLayoutConfig("supportTechnician");
    const dateFont = getLayoutFont("date", INPUT_FONT_SIZE);
    const invoiceNoFont = getLayoutFont("invoiceNo", INPUT_FONT_SIZE);
    const machineTitleFont = getLayoutFont("machineTitle", INPUT_FONT_SIZE);
    const supportTechnicianFont = getLayoutFont("supportTechnician", INPUT_FONT_SIZE);
    const dateFamily = getLayoutFontFamily("date", INPUT_FONT_FAMILY);
    const invoiceNoFamily = getLayoutFontFamily("invoiceNo", INPUT_FONT_FAMILY);
    const machineTitleFamily = getLayoutFontFamily("machineTitle", INPUT_FONT_FAMILY);
    const supportTechnicianFamily = getLayoutFontFamily("supportTechnician", INPUT_FONT_FAMILY);
    const dateWeight = getLayoutFontWeight("date");
    const invoiceNoWeight = getLayoutFontWeight("invoiceNo");
    const machineTitleWeight = getLayoutFontWeight("machineTitle");
    const supportTechnicianWeight = getLayoutFontWeight("supportTechnician");
    ctx.font = `${normalFs}px Arial`;
    const displayCustomerName = String(qut2PreviewCustomerName || "").trim() || c.name || "";
    if(getLayoutVisible("customerName")){
        fitText(ctx, displayCustomerName, m.x(POS.customer.x + customerNameCfg.x), m.y(POS.customer.nameY - 103 + customerNameCfg.y), m.w(POS.customer.w), customerNameFont, customerNameWeight, customerNameFamily);
    }
    if(getLayoutVisible("customerAddress")){
        fitText(ctx, c.address || "", m.x(POS.customer.x + customerAddressCfg.x), m.y(POS.customer.addressY - 103 + customerAddressCfg.y), m.w(POS.customer.w), customerAddressFont, customerAddressWeight, customerAddressFamily);
    }
    if(getLayoutVisible("customerTel")){
        fitText(ctx, c.tel || "", m.x(POS.customer.x + customerTelCfg.x), m.y(POS.customer.telY - 95 + customerTelCfg.y), m.w(POS.customer.w), customerTelFont, customerTelWeight, customerTelFamily);
    }
    fitText(ctx, c.vat_number || "", m.x(POS.customer.x), m.y(POS.customer.vatY - 95), m.w(POS.customer.w), INPUT_FONT_SIZE, "normal", "Calibri");

    // Invoice meta block
    if(getLayoutVisible("date")){
        fitText(ctx, asDate(data.invoice.quotation2_date || data.invoice.quotation_date || data.invoice.invoice_date || data.invoice.createdAt), m.x(POS.meta.dateX + 205 + dateCfg.x), m.y(POS.meta.dateY - 105 + dateCfg.y), m.w(POS.meta.w), dateFont, dateWeight, dateFamily);
    }
    if(getLayoutVisible("invoiceNo")){
        fitText(ctx, data.invoice.invoice_no || "", m.x(POS.meta.noX + 205 + invoiceNoCfg.x), m.y(POS.meta.noY - 112 + invoiceNoCfg.y), m.w(POS.meta.w), invoiceNoFont, invoiceNoWeight, invoiceNoFamily);
    }
    if(getLayoutVisible("machineTitle")){
        fitText(ctx, data.invoice.machine_description || "", m.x(POS.meta.noX + 205 + machineTitleCfg.x), m.y(POS.meta.refY - 117 + machineTitleCfg.y), m.w(POS.meta.w), machineTitleFont, machineTitleWeight, machineTitleFamily);
    }
    if(getLayoutVisible("supportTechnician")){
        fitText(ctx, data.invoice.support_technician || "", m.x(POS.meta.noX + 205 + supportTechnicianCfg.x), m.y(POS.meta.supportY - 125 + supportTechnicianCfg.y), m.w(POS.meta.w), supportTechnicianFont, supportTechnicianWeight, supportTechnicianFamily);
    }

    // Payment method block (Cash / Cheque / Credit)
    const selectedPaymentMethod = String(data.invoice.payment_method || "Cash").trim().toLowerCase();
    const paymentMethodCfg = getLayoutConfig("paymentMethod");
    const paymentMethodFont = getLayoutFont("paymentMethod", INPUT_FONT_SIZE);
    const paymentMethodFamily = getLayoutFontFamily("paymentMethod", INPUT_FONT_FAMILY);
    const paymentMethodWeight = getLayoutFontWeight("paymentMethod");
    const paymentOptions = [
        { key: "cash", label: "Cash", x: POS.paymentMethod.optionsX },
        { key: "cheque", label: "Cheque", x: POS.paymentMethod.optionsX + POS.paymentMethod.gapX },
        { key: "credit", label: "Credit", x: POS.paymentMethod.optionsX + (POS.paymentMethod.gapX * 2) + (POS.paymentMethod.creditExtraX || 0) }
    ];
    if(getLayoutVisible("paymentMethod")) paymentOptions.forEach((opt) => {
        const x = m.x(opt.x + paymentMethodCfg.x);
        const y = m.y(POS.paymentMethod.optionsY + paymentMethodCfg.y);
        const isSelected = selectedPaymentMethod === opt.key;
        const fs = paymentMethodFont;
        const currentWeight = isSelected ? "bold" : paymentMethodWeight;
        ctx.font = `${currentWeight} ${fs}px ${paymentMethodFamily}`;
        ctx.fillText(opt.label, x, y);
        if(!isSelected){
            const textWidth = ctx.measureText(opt.label).width;
            const lineY = y - (fs * 0.32);
            ctx.beginPath();
            ctx.lineWidth = Math.max(1, fs * 0.08);
            ctx.moveTo(x, lineY);
            ctx.lineTo(x + textWidth, lineY);
            ctx.strokeStyle = "#000";
            ctx.stroke();
        }
    });

    // Count + Serial row
    const countCfg = getLayoutConfig("count");
    const countFontSize = getLayoutFont("count", INPUT_FONT_SIZE);
    const countFontFamily = getLayoutFontFamily("count", INPUT_FONT_FAMILY);
    const countWeight = getLayoutFontWeight("count");
    if(getLayoutVisible("count")){
        fitText(
            ctx,
            String(data.invoice.machine_count ?? ""),
            m.x(POS.machineInfo.countX + POS.machineInfo.countOffsetX + countCfg.x),
            m.y(POS.machineInfo.y - 95 + POS.machineInfo.countOffsetY + countCfg.y),
            m.w(POS.machineInfo.countW),
            countFontSize,
            countWeight,
            countFontFamily
        );
    }
    if(getLayoutVisible("serialNo")){
        fitText(
            ctx,
            data.invoice.serial_no || "",
            m.x(POS.machineInfo.serialX + POS.machineInfo.serialOffsetX + getLayoutConfig("serialNo").x),
            m.y(POS.machineInfo.y - 95 + POS.machineInfo.serialOffsetY + getLayoutConfig("serialNo").y),
            m.w(POS.machineInfo.serialW),
            getLayoutFont("serialNo", INPUT_FONT_SIZE),
            getLayoutFontWeight("serialNo"),
            getLayoutFontFamily("serialNo", INPUT_FONT_FAMILY)
        );
    }

    // Items table values
    const tableX = m.x(POS.table.x);
    const tableY = m.y(POS.table.y);
    const tableW = m.w(BASE_W - 70);
    const c1 = tableX + m.w(POS.table.c1);
    const c2 = tableX + m.w(POS.table.c2);
    const c3 = tableX + m.w(POS.table.c3);
    const c4 = tableX + m.w(POS.table.c4);
    const c5 = tableX + m.w(POS.table.c5);
    const tableRight = tableX + tableW;

    const itemNoCfg = getLayoutConfig("itemNo");
    const descriptionCfg = getLayoutConfig("description");
    const qtyCfg = getLayoutConfig("qty");
    const rateCfg = getLayoutConfig("rate");
    const vatCfg = getLayoutConfig("vat");
    const grossCfg = getLayoutConfig("grossAmount");
    const itemNoFontSize = getLayoutFont("itemNo", INPUT_FONT_SIZE);
    const descriptionFontSize = getLayoutFont("description", INPUT_FONT_SIZE);
    const qtyFontSize = getLayoutFont("qty", INPUT_FONT_SIZE);
    const rateFontSize = getLayoutFont("rate", INPUT_FONT_SIZE);
    const vatFontSize = getLayoutFont("vat", INPUT_FONT_SIZE);
    const grossFontSize = getLayoutFont("grossAmount", INPUT_FONT_SIZE);
    const itemNoFontFamily = getLayoutFontFamily("itemNo", INPUT_FONT_FAMILY);
    const descriptionFontFamily = getLayoutFontFamily("description", INPUT_FONT_FAMILY);
    const qtyFontFamily = getLayoutFontFamily("qty", INPUT_FONT_FAMILY);
    const rateFontFamily = getLayoutFontFamily("rate", INPUT_FONT_FAMILY);
    const vatFontFamily = getLayoutFontFamily("vat", INPUT_FONT_FAMILY);
    const grossFontFamily = getLayoutFontFamily("grossAmount", INPUT_FONT_FAMILY);
    const itemNoWeight = getLayoutFontWeight("itemNo");
    const descriptionWeight = getLayoutFontWeight("description");
    const qtyWeight = getLayoutFontWeight("qty");
    const rateWeight = getLayoutFontWeight("rate");
    const vatWeight = getLayoutFontWeight("vat");
    const grossWeight = getLayoutFontWeight("grossAmount");
    ctx.font = `${rowFs}px Arial`;
    let y = tableY + m.h(POS.table.rowStart - 86);
    const rowH = m.h(POS.table.rowH + OVERLAY.rowGap);
    const currentInvoiceItemNameOverrides = getCurrentInvoiceItemNameOverrides();
    const currentInvoiceItemRateOverrides = getCurrentInvoiceItemRateOverrides();
    let previewTotalAmount = 0;
    const allItems = Array.isArray(data.items) ? data.items : [];
    allItems.forEach((item, idx) => {
        const rowKey = String(idx + 1);
        const overrideRate = sanitizeQut2RateValue(currentInvoiceItemRateOverrides[rowKey]);
        if(Number.isFinite(overrideRate)){
            previewTotalAmount += calculateGrossFromRate(item, overrideRate);
        }else{
            previewTotalAmount += toNumeric(item?.gross, 0);
        }
    });
    data.items.slice(0, 18).forEach((item, idx) => {
        const product = item.Product || {};
        const code = product.product_id || "";
        const defaultDesc = String(product.description || product.model || "").trim();
        const overrideDesc = sanitizeQut2ItemName(currentInvoiceItemNameOverrides[String(idx + 1)] || "");
        const desc = overrideDesc || defaultDesc;
        const descriptionText = overrideDesc ? desc : `${code} ${desc}`.trim();
        const rateOverrideValue = sanitizeQut2RateValue(currentInvoiceItemRateOverrides[String(idx + 1)]);
        const displayRate = Number.isFinite(rateOverrideValue) ? rateOverrideValue : toNumeric(item.rate, 0);
        const displayGross = Number.isFinite(rateOverrideValue)
            ? calculateGrossFromRate(item, displayRate)
            : toNumeric(item.gross, 0);
        if(getLayoutVisible("itemNo")) fitText(ctx, String(idx + 1), tableX + m.w(32 + itemNoCfg.x), y + m.h(itemNoCfg.y), m.w(34), itemNoFontSize, itemNoWeight, itemNoFontFamily);
        if(getLayoutVisible("description")) fitText(ctx, descriptionText, c1 + m.w(28 + descriptionCfg.x), y + m.h(descriptionCfg.y), c2 - c1 - m.w(16), descriptionFontSize, descriptionWeight, descriptionFontFamily);
        if(getLayoutVisible("qty")) drawRight(ctx, String(item.qty || 0), c3 + m.w(12 + qtyCfg.x) - m.w(190), y + m.h(qtyCfg.y), c3 - c2 - m.w(16), qtyFontSize, qtyWeight, qtyFontFamily);
        if(getLayoutVisible("rate")) drawRightFixed(ctx, money(displayRate), c4 + m.w(12 + rateCfg.x) - m.w(150), y + m.h(rateCfg.y), rateFontSize, rateWeight, rateFontFamily);
        if(getLayoutVisible("vat")) drawRight(ctx, `${money(item.vat)}%`, c5 + m.w(12 + vatCfg.x) - m.w(150), y + m.h(vatCfg.y), c5 - c4 - m.w(16), vatFontSize, vatWeight, vatFontFamily);
        if(getLayoutVisible("grossAmount")) drawRight(ctx, money(displayGross), tableRight + m.w(12 + grossCfg.x) - m.w(40), y + m.h(grossCfg.y), tableRight - c5 - m.w(16), grossFontSize, grossWeight, grossFontFamily);
        y += rowH;
    });

    // Total
    ctx.font = `bold ${totalFs}px Arial`;
    const amountY = tableY + m.h(POS.total.yFromTable);
    const totalAmountCfg = getLayoutConfig("totalAmount");
    if(getLayoutVisible("totalAmount")){
        drawRight(
            ctx,
            money(previewTotalAmount),
            tableRight - m.w(28 - totalAmountCfg.x),
            amountY + m.h(POS.total.yInCell - 247 + totalAmountCfg.y),
            tableRight - c5 - m.w(16),
            getLayoutFont("totalAmount", INPUT_FONT_SIZE),
            getLayoutFontWeight("totalAmount"),
            getLayoutFontFamily("totalAmount", INPUT_FONT_FAMILY)
        );
    }

    // Amount in words
    const amountWordsCfg = getLayoutConfig("amountWords");
    if(getLayoutVisible("amountWords")){
        drawFixedText(
            ctx,
            amountInWords(previewTotalAmount),
            m.x(POS.amountWords.x + amountWordsCfg.x),
            tableY + m.h(POS.amountWords.yFromTable + POS.amountWords.yInCell - 247 + amountWordsCfg.y),
            getLayoutFont("amountWords", INPUT_FONT_SIZE),
            getLayoutFontWeight("amountWords"),
            getLayoutFontFamily("amountWords", INPUT_FONT_FAMILY)
        );
    }

    // Important notes
    const importantCfg = getLayoutConfig("important");
    if(getLayoutVisible("important")){
        const importantNotes = getImportantNotes(data.invoice);
        let importantY = m.y(POS.important.y + importantCfg.y);
        const importantGap = m.h(POS.important.rowH);
        const importantX = m.x(POS.important.x + importantCfg.x);
        const contentRight = m.x(BASE_W - 70);
        const importantMaxW = Math.max(m.w(120), contentRight - importantX - m.w(8));
        importantNotes.slice(0, POS.important.maxRows).forEach((note, idx) => {
            drawFixedText(
                ctx,
                `${idx + 1}. ${note}`,
                importantX,
                importantY,
                getLayoutFont("important", INPUT_FONT_SIZE),
                getLayoutFontWeight("important"),
                getLayoutFontFamily("important", INPUT_FONT_FAMILY),
                importantMaxW
            );
            importantY += importantGap;
        });
    }

    // Optional signature image
    if(sign1Enabled && getLayoutVisible("signC")){
        const signImg = await ensureSign1Image();
        if(signImg){
            const signCfg = getLayoutConfig("signC");
            ctx.drawImage(
                signImg,
                m.x(POS.sign1.x + signCfg.x),
                m.y(POS.sign1.y + signCfg.y),
                m.w(POS.sign1.w),
                m.h(POS.sign1.h)
            );
        }else if(!sign1LoadFailedNotified){
            sign1LoadFailedNotified = true;
            alert("Sign 1 image not found. Expected file: frontend/assets/images/pulmo-sign-1.png");
        }
    }

    // Optional seal image
    if(seal1Enabled && getLayoutVisible("sealC")){
        const sealImg = await ensureSeal1Image();
        if(sealImg){
            const sealCfg = getLayoutConfig("sealC");
            ctx.drawImage(
                sealImg,
                m.x(POS.seal1.x + sealCfg.x),
                m.y(POS.seal1.y + sealCfg.y),
                m.w(POS.seal1.w),
                m.h(POS.seal1.h)
            );
        }else if(!seal1LoadFailedNotified){
            seal1LoadFailedNotified = true;
            alert("SEAL 1 image not found. Expected file: frontend/assets/images/pulmo-seal-1.png");
        }
    }

    if(mimeType === "image/jpeg") return canvas.toDataURL("image/jpeg", 0.78);
    return canvas.toDataURL("image/png");
}

async function refreshPreviewFromLatest(){
    if(!latestInvoiceData) return;
    const preview = await drawInvoice(latestInvoiceData, "image/jpeg");
    document.getElementById("invoicePreview").src = preview;
}

function syncQut2DateInput(){
    const input = document.getElementById("qut2DateInput");
    if(!input || !latestInvoiceData || !latestInvoiceData.invoice) return;
    const raw = String(latestInvoiceData.invoice.quotation2_date || latestInvoiceData.invoice.quotation_date || latestInvoiceData.invoice.invoice_date || "").trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
        input.value = raw;
    }
}

function syncQut2CustomerNameInput(){
    const input = document.getElementById("qut2CustomerNameInput");
    if(!input || !latestInvoiceData) return;
    const overrideName = String(qut2PreviewCustomerName || "").trim();
    const fallbackName = String(latestInvoiceData.customer?.name || "").trim();
    input.value = overrideName || fallbackName;
}

async function updateQuotation2DateFromTile(){
    const input = document.getElementById("qut2DateInput");
    const invoiceId = new URLSearchParams(window.location.search).get("id");
    if(!input || !invoiceId) return;
    const value = String(input.value || "").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)){
        alert("Enter a valid Qut 2 Date.");
        return;
    }
    try{
        const res = await request(`/invoices/${invoiceId}/payment`, "PUT", { quotation2_date: value });
        if(!latestInvoiceData) latestInvoiceData = { invoice: {} };
        if(!latestInvoiceData.invoice) latestInvoiceData.invoice = {};
        latestInvoiceData.invoice.quotation2_date = res?.invoice?.quotation2_date || value;
        await refreshPreviewFromLatest();
        if(typeof showMessageBox === "function"){
            showMessageBox("Qut 2 Date updated");
        }
    }catch(err){
        alert(err.message || "Failed to update Qut 2 Date");
    }
}

async function updateQuotation2CustomerNameFromTile(){
    const input = document.getElementById("qut2CustomerNameInput");
    if(!input) return;
    const value = String(input.value || "").trim();
    if(!value){
        alert("Enter a customer name.");
        return;
    }
    qut2PreviewCustomerName = value;
    await refreshPreviewFromLatest();
    if(typeof showMessageBox === "function"){
        showMessageBox("Qut 2 customer updated");
    }
}

function applyPreviewAccessByRole(){
    const addressControls = document.querySelector(".invoice-address-controls");
    const layoutControls = document.querySelector(".invoice-layout-controls");
    if(!canConfigurePreview){
        if(addressControls) addressControls.style.display = "none";
        if(layoutControls) layoutControls.style.display = "none";
        return;
    }
    if(addressControls) addressControls.style.display = "flex";
    updateNavigationTileByEditToggle();
}

function updateNavigationTileByEditToggle(){
    const layoutControls = document.querySelector(".invoice-layout-controls");
    const editChk = document.getElementById("editModeChk");
    if(!layoutControls) return;
    if(!canConfigurePreview){
        layoutControls.style.display = "none";
        return;
    }
    layoutControls.style.display = (editChk && !editChk.checked) ? "none" : "flex";
}

function initEditModeControl(){
    const editChk = document.getElementById("editModeChk");
    if(!editChk) return;
    editChk.checked = false;
    editChk.addEventListener("change", () => {
        updateNavigationTileByEditToggle();
    });
    updateNavigationTileByEditToggle();
}

function initSignControl(){
    const signChk = document.getElementById("sign1Chk");
    if(!signChk) return;
    const allowed = hasMappedFeature("sign_q2") || hasMappedFeature("sign_c");
    signChk.checked = !!allowed;
    sign1Enabled = !!allowed;
    signChk.disabled = !allowed;
    if(!allowed) return;
    signChk.addEventListener("change", async () => {
        sign1Enabled = !!signChk.checked;
        if(sign1Enabled){
            sign1LoadFailedNotified = false;
        }
        await refreshPreviewFromLatest();
    });
}

function initSealControl(){
    const sealChk = document.getElementById("seal1Chk");
    if(!sealChk) return;
    const allowed = hasMappedFeature("seal_q2") || hasMappedFeature("seal_c");
    sealChk.checked = !!allowed;
    seal1Enabled = !!allowed;
    sealChk.disabled = !allowed;
    if(!allowed) return;
    sealChk.addEventListener("change", async () => {
        seal1Enabled = !!sealChk.checked;
        if(seal1Enabled){
            seal1LoadFailedNotified = false;
        }
        await refreshPreviewFromLatest();
    });
}

function syncLayoutEditorSelects(){
    const fontSelect = document.getElementById("layoutFontSelect");
    const fontFamilySelect = document.getElementById("layoutFontFamilySelect");
    const weightSelect = document.getElementById("layoutWeightSelect");
    const previewSelect = document.getElementById("layoutPreviewSelect");
    if(!fontSelect || !fontFamilySelect || !weightSelect || !previewSelect) return;
    const cfg = getLayoutConfig(selectedLayoutTarget);
    const value = String(cfg.font || INPUT_FONT_SIZE);
    const hasOption = Array.from(fontSelect.options).some((opt) => opt.value === value);
    fontSelect.value = hasOption ? value : String(INPUT_FONT_SIZE);
    const familyValue = String(cfg.fontFamily || INPUT_FONT_FAMILY);
    const hasFamily = Array.from(fontFamilySelect.options).some((opt) => opt.value === familyValue);
    fontFamilySelect.value = hasFamily ? familyValue : INPUT_FONT_FAMILY;
    weightSelect.value = String(cfg.fontWeight || "normal").toLowerCase() === "bold" ? "bold" : "normal";
    previewSelect.value = getLayoutVisible(selectedLayoutTarget) ? "true" : "false";
}

function updateRenderInputToggleText(){
    const toggle = document.getElementById("renderInputToggle");
    const targetSelect = document.getElementById("layoutTargetSelect");
    if(!toggle || !targetSelect) return;
    const total = targetSelect.options.length;
    let visibleCount = 0;
    Array.from(targetSelect.options).forEach((opt) => {
        if(getLayoutVisible(String(opt.value || ""))){
            visibleCount += 1;
        }
    });
    toggle.textContent = `Render Inputs (${visibleCount}/${total})`;
}

function syncRenderInputChecklist(){
    const panel = document.getElementById("renderInputChecklist");
    if(!panel) return;
    panel.querySelectorAll("input[type='checkbox'][data-layout-key]").forEach((input) => {
        const key = String(input.getAttribute("data-layout-key") || "").trim();
        input.checked = getLayoutVisible(key);
    });
    updateRenderInputToggleText();
}

function getCurrentInvoiceKey(){
    const invoiceId = Number(new URLSearchParams(window.location.search).get("id") || 0);
    if(Number.isFinite(invoiceId) && invoiceId > 0){
        return String(invoiceId);
    }
    const fallbackInvoiceId = Number(latestInvoiceData?.invoice?.id || 0);
    if(Number.isFinite(fallbackInvoiceId) && fallbackInvoiceId > 0){
        return String(fallbackInvoiceId);
    }
    return "";
}

function sanitizeQut2ItemName(value){
    return String(value || "").trim().slice(0, 300);
}

function sanitizeQut2RateValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return null;
    return numeric;
}

function getCurrentInvoiceItemNameOverrides(){
    const invoiceKey = getCurrentInvoiceKey();
    if(!invoiceKey) return {};
    const map = qut2ItemNameOverridesByInvoice[invoiceKey];
    return map && typeof map === "object" ? map : {};
}

function getCurrentInvoiceItemRateOverrides(){
    const invoiceKey = getCurrentInvoiceKey();
    if(!invoiceKey) return {};
    const map = qut2ItemRateOverridesByInvoice[invoiceKey];
    return map && typeof map === "object" ? map : {};
}

function getCurrentInvoiceItemNameOverride(rowNumber){
    const key = String(Number(rowNumber || 0));
    if(!/^\d+$/.test(key)) return "";
    const map = getCurrentInvoiceItemNameOverrides();
    return sanitizeQut2ItemName(map[key] || "");
}

function getCurrentInvoiceItemRateOverride(rowNumber){
    const key = String(Number(rowNumber || 0));
    if(!/^\d+$/.test(key)) return null;
    const map = getCurrentInvoiceItemRateOverrides();
    const value = sanitizeQut2RateValue(map[key]);
    return Number.isFinite(value) ? value : null;
}

function setCurrentInvoiceItemNameOverride(rowNumber, customName){
    const invoiceKey = getCurrentInvoiceKey();
    const rowKey = String(Number(rowNumber || 0));
    if(!invoiceKey || !/^\d+$/.test(rowKey)) return;
    if(!qut2ItemNameOverridesByInvoice[invoiceKey] || typeof qut2ItemNameOverridesByInvoice[invoiceKey] !== "object"){
        qut2ItemNameOverridesByInvoice[invoiceKey] = {};
    }
    const safeName = sanitizeQut2ItemName(customName);
    if(!safeName){
        delete qut2ItemNameOverridesByInvoice[invoiceKey][rowKey];
        if(!Object.keys(qut2ItemNameOverridesByInvoice[invoiceKey]).length){
            delete qut2ItemNameOverridesByInvoice[invoiceKey];
        }
        return;
    }
    qut2ItemNameOverridesByInvoice[invoiceKey][rowKey] = safeName;
}

function setCurrentInvoiceItemRateOverride(rowNumber, customRate){
    const invoiceKey = getCurrentInvoiceKey();
    const rowKey = String(Number(rowNumber || 0));
    if(!invoiceKey || !/^\d+$/.test(rowKey)) return;
    if(!qut2ItemRateOverridesByInvoice[invoiceKey] || typeof qut2ItemRateOverridesByInvoice[invoiceKey] !== "object"){
        qut2ItemRateOverridesByInvoice[invoiceKey] = {};
    }
    const safeRate = sanitizeQut2RateValue(customRate);
    if(!Number.isFinite(safeRate)){
        delete qut2ItemRateOverridesByInvoice[invoiceKey][rowKey];
        if(!Object.keys(qut2ItemRateOverridesByInvoice[invoiceKey]).length){
            delete qut2ItemRateOverridesByInvoice[invoiceKey];
        }
        return;
    }
    qut2ItemRateOverridesByInvoice[invoiceKey][rowKey] = safeRate;
}

function buildQut2LayoutStatePayload(){
    const out = {};
    Object.entries(layoutState).forEach(([key, cfg]) => {
        if(!cfg || typeof cfg !== "object") return;
        const next = {};
        const x = Number(cfg.x);
        const y = Number(cfg.y);
        const font = Number(cfg.font);
        const fontFamily = String(cfg.fontFamily || "").trim().slice(0, 80);
        const fontWeight = String(cfg.fontWeight || "normal").toLowerCase() === "bold" ? "bold" : "normal";
        if(Number.isFinite(x)) next.x = x;
        if(Number.isFinite(y)) next.y = y;
        if(Number.isFinite(font) && font > 0) next.font = font;
        if(fontFamily) next.fontFamily = fontFamily;
        next.fontWeight = fontWeight;
        if(typeof cfg.visible === "boolean"){
            next.visible = cfg.visible;
        }
        out[key] = next;
    });
    return out;
}

function buildQut2RenderOverridesPayload(){
    return {
        item_names_by_invoice: qut2ItemNameOverridesByInvoice,
        item_rates_by_invoice: qut2ItemRateOverridesByInvoice,
        layout_state: buildQut2LayoutStatePayload()
    };
}

function applyPersistedQut2RenderOverrides(){
    const sourceNameMap = qut2RenderOverridesFromDb
        && typeof qut2RenderOverridesFromDb === "object"
        && qut2RenderOverridesFromDb.item_names_by_invoice
        && typeof qut2RenderOverridesFromDb.item_names_by_invoice === "object"
        ? qut2RenderOverridesFromDb.item_names_by_invoice
        : {};
    const sourceRateMap = qut2RenderOverridesFromDb
        && typeof qut2RenderOverridesFromDb === "object"
        && qut2RenderOverridesFromDb.item_rates_by_invoice
        && typeof qut2RenderOverridesFromDb.item_rates_by_invoice === "object"
        ? qut2RenderOverridesFromDb.item_rates_by_invoice
        : {};
    const sourceLayoutState = qut2RenderOverridesFromDb
        && typeof qut2RenderOverridesFromDb === "object"
        && qut2RenderOverridesFromDb.layout_state
        && typeof qut2RenderOverridesFromDb.layout_state === "object"
        ? qut2RenderOverridesFromDb.layout_state
        : {};
    const nextNames = {};
    const nextRates = {};
    Object.entries(sourceNameMap).forEach(([invoiceKey, itemMap]) => {
        const safeInvoiceKey = String(invoiceKey || "").trim();
        if(!/^\d+$/.test(safeInvoiceKey) || !itemMap || typeof itemMap !== "object") return;
        const normalizedItemMap = {};
        Object.entries(itemMap).forEach(([rowNumber, name]) => {
            const safeRowNumber = String(rowNumber || "").trim();
            if(!/^\d+$/.test(safeRowNumber)) return;
            const safeName = sanitizeQut2ItemName(name);
            if(!safeName) return;
            normalizedItemMap[safeRowNumber] = safeName;
        });
        if(Object.keys(normalizedItemMap).length){
            nextNames[safeInvoiceKey] = normalizedItemMap;
        }
    });
    Object.entries(sourceRateMap).forEach(([invoiceKey, itemMap]) => {
        const safeInvoiceKey = String(invoiceKey || "").trim();
        if(!/^\d+$/.test(safeInvoiceKey) || !itemMap || typeof itemMap !== "object") return;
        const normalizedItemMap = {};
        Object.entries(itemMap).forEach(([rowNumber, rate]) => {
            const safeRowNumber = String(rowNumber || "").trim();
            if(!/^\d+$/.test(safeRowNumber)) return;
            const safeRate = sanitizeQut2RateValue(rate);
            if(!Number.isFinite(safeRate)) return;
            normalizedItemMap[safeRowNumber] = safeRate;
        });
        if(Object.keys(normalizedItemMap).length){
            nextRates[safeInvoiceKey] = normalizedItemMap;
        }
    });
    Object.entries(sourceLayoutState).forEach(([layoutKey, rawCfg]) => {
        const cfg = rawCfg && typeof rawCfg === "object" ? rawCfg : null;
        const target = layoutState[layoutKey];
        if(!cfg || !target) return;
        const x = Number(cfg.x);
        const y = Number(cfg.y);
        const font = Number(cfg.font);
        const fontFamily = String(cfg.fontFamily || "").trim();
        const fontWeight = String(cfg.fontWeight || "").trim().toLowerCase() === "bold" ? "bold" : "normal";
        if(Number.isFinite(x)) target.x = x;
        if(Number.isFinite(y)) target.y = y;
        if(Number.isFinite(font) && font > 0) target.font = font;
        if(fontFamily) target.fontFamily = fontFamily;
        target.fontWeight = fontWeight;
        if(typeof cfg.visible === "boolean") target.visible = cfg.visible;
    });
    qut2ItemNameOverridesByInvoice = nextNames;
    qut2ItemRateOverridesByInvoice = nextRates;
}

function applyPersistedQut2RenderVisibility(){
    if(!qut2RenderVisibilityFromDb || typeof qut2RenderVisibilityFromDb !== "object") return;
    const targetSelect = document.getElementById("layoutTargetSelect");
    if(!targetSelect) return;
    Array.from(targetSelect.options).forEach((opt) => {
        const key = String(opt.value || "").trim();
        if(!key) return;
        if(Object.prototype.hasOwnProperty.call(qut2RenderVisibilityFromDb, key)){
            getLayoutConfig(key).visible = !!qut2RenderVisibilityFromDb[key];
        }
    });
}

async function savePersistedQut2RenderVisibility(){
    try{
        const targetSelect = document.getElementById("layoutTargetSelect");
        if(!targetSelect) return;
        const renderVisibility = {};
        Array.from(targetSelect.options).forEach((opt) => {
            const key = String(opt.value || "").trim();
            if(!key) return;
            renderVisibility[key] = !!getLayoutVisible(key);
        });
        await request("/users/inv-map/me/quotation2-render-inputs", "PUT", {
            database_name: qut2RenderDbName || undefined,
            render_visibility: renderVisibility,
            render_overrides: buildQut2RenderOverridesPayload()
        });
    }catch(_err){
    }
}

function initRenderInputChecklist(){
    const dropdown = document.getElementById("renderInputDropdown");
    const toggle = document.getElementById("renderInputToggle");
    const panel = document.getElementById("renderInputChecklist");
    const targetSelect = document.getElementById("layoutTargetSelect");
    if(!dropdown || !toggle || !panel || !targetSelect) return;

    const options = Array.from(targetSelect.options).map((opt) => ({
        key: String(opt.value || "").trim(),
        label: String(opt.textContent || "").trim()
    }));
    let panelOpen = false;

    const placePanel = () => {
        const rect = toggle.getBoundingClientRect();
        const top = rect.bottom + 6;
        let left = rect.left;
        const maxLeft = window.innerWidth - 280;
        if(left > maxLeft){
            left = Math.max(8, maxLeft);
        }
        panel.style.top = `${Math.max(8, top)}px`;
        panel.style.left = `${Math.max(8, left)}px`;
    };

    panel.innerHTML = "";
    options.forEach((item) => {
        if(!item.key) return;
        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "flex-start";
        row.style.gap = "8px";
        row.style.padding = "4px 2px";
        row.style.cursor = "pointer";
        row.style.whiteSpace = "nowrap";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("data-layout-key", item.key);
        input.style.width = "16px";
        input.style.minWidth = "16px";
        input.style.maxWidth = "16px";
        input.style.height = "16px";
        input.style.margin = "0";
        input.style.padding = "0";
        input.style.appearance = "auto";
        input.style.webkitAppearance = "checkbox";
        input.style.accentColor = "#0f6abf";
        input.style.flex = "0 0 16px";
        input.checked = getLayoutVisible(item.key);
        input.addEventListener("change", async () => {
            getLayoutConfig(item.key).visible = !!input.checked;
            if(!input.checked && selectedLayoutTarget === item.key){
                const fallback = options.find((o) => getLayoutVisible(o.key));
                if(fallback){
                    selectedLayoutTarget = fallback.key;
                    targetSelect.value = fallback.key;
                    syncLayoutEditorSelects();
                }
            }
            syncRenderInputChecklist();
            await savePersistedQut2RenderVisibility();
            await refreshPreviewFromLatest();
        });

        const text = document.createElement("span");
        text.textContent = item.label;
        text.style.fontWeight = "500";
        text.style.whiteSpace = "normal";
        text.style.lineHeight = "1.2";
        text.style.wordBreak = "break-word";
        text.addEventListener("click", () => {
            selectedLayoutTarget = item.key;
            targetSelect.value = item.key;
            syncLayoutEditorSelects();
            toggleQut2ItemEditControls();
        });

        row.appendChild(input);
        row.appendChild(text);
        panel.appendChild(row);
    });

    toggle.addEventListener("click", (ev) => {
        ev.stopPropagation();
        panelOpen = !panelOpen;
        if(panelOpen){
            placePanel();
            panel.style.display = "block";
        }else{
            panel.style.display = "none";
        }
    });

    document.addEventListener("click", (ev) => {
        if(!dropdown.contains(ev.target)){
            panel.style.display = "none";
            panelOpen = false;
        }
    });
    window.addEventListener("resize", () => {
        if(panelOpen){
            placePanel();
        }
    });
    window.addEventListener("scroll", () => {
        if(panelOpen){
            placePanel();
        }
    }, true);

    syncRenderInputChecklist();
}

async function moveSelectedLayout(dx, dy){
    const cfg = getLayoutConfig(selectedLayoutTarget);
    cfg.x += dx;
    cfg.y += dy;
    await savePersistedQut2RenderVisibility();
    await refreshPreviewFromLatest();
}

function getInvoiceItemLabel(item, index){
    const product = item && item.Product ? item.Product : {};
    const code = String(product.product_id || "").trim();
    const desc = String(product.description || product.model || "").trim();
    const defaultLabel = desc || code || `Item ${index + 1}`;
    return `${index + 1} - ${defaultLabel}`.trim();
}

function getInvoiceItemDefaultName(rowNumber){
    const index = Number(rowNumber || 0) - 1;
    if(!Number.isFinite(index) || index < 0) return "";
    const item = Array.isArray(latestInvoiceData?.items) ? latestInvoiceData.items[index] : null;
    if(!item) return "";
    const product = item.Product || {};
    return String(product.description || product.model || "").trim();
}

function getInvoiceItemDefaultRate(rowNumber){
    const index = Number(rowNumber || 0) - 1;
    if(!Number.isFinite(index) || index < 0) return "";
    const item = Array.isArray(latestInvoiceData?.items) ? latestInvoiceData.items[index] : null;
    if(!item) return "";
    const numeric = Number(item.rate || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : "";
}

function isQut2ItemOverrideTarget(){
    return selectedLayoutTarget === "itemNo" || selectedLayoutTarget === "rate";
}

function syncQut2ItemOverrideInput(){
    const rowSelect = document.getElementById("layoutItemRowSelect");
    const input = document.getElementById("layoutItemNameInput");
    const valueLabel = document.getElementById("itemEditValueLabel");
    if(!rowSelect || !input || !valueLabel) return;
    if(selectedLayoutTarget === "rate"){
        valueLabel.textContent = "Rate";
        input.placeholder = "Custom rate";
        input.inputMode = "decimal";
    }else{
        valueLabel.textContent = "Item Name";
        input.placeholder = "Custom item name";
        input.inputMode = "text";
    }
    const selectedRow = String(rowSelect.value || "").trim();
    if(selectedLayoutTarget === "rate"){
        const overrideRate = getCurrentInvoiceItemRateOverride(selectedRow);
        if(Number.isFinite(overrideRate)){
            input.value = Number(overrideRate).toFixed(2);
            return;
        }
        input.value = getInvoiceItemDefaultRate(selectedRow);
        return;
    }
    const overrideValue = getCurrentInvoiceItemNameOverride(selectedRow);
    if(overrideValue){
        input.value = overrideValue;
        return;
    }
    input.value = getInvoiceItemDefaultName(selectedRow);
}

function syncQut2ItemOverrideRowOptions(){
    const rowSelect = document.getElementById("layoutItemRowSelect");
    if(!rowSelect) return;
    const items = Array.isArray(latestInvoiceData?.items) ? latestInvoiceData.items : [];
    rowSelect.innerHTML = "";
    if(!items.length){
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "No items";
        rowSelect.appendChild(emptyOption);
        rowSelect.disabled = true;
        const input = document.getElementById("layoutItemNameInput");
        if(input) input.value = "";
        return;
    }
    rowSelect.disabled = false;
    items.forEach((item, idx) => {
        const rowNumber = String(idx + 1);
        const option = document.createElement("option");
        option.value = rowNumber;
        option.textContent = getInvoiceItemLabel(item, idx);
        rowSelect.appendChild(option);
    });
    rowSelect.value = rowSelect.options[0].value;
    syncQut2ItemOverrideInput();
}

function toggleQut2ItemEditControls(){
    const wrap = document.getElementById("itemEditControls");
    const rowLabel = document.getElementById("itemEditRowLabel");
    if(!wrap || !rowLabel) return;
    wrap.style.display = isQut2ItemOverrideTarget() ? "flex" : "none";
    rowLabel.textContent = "Item";
    if(isQut2ItemOverrideTarget()){
        syncQut2ItemOverrideInput();
    }
}

async function applyQut2ItemNameOverrideFromControl(){
    const rowSelect = document.getElementById("layoutItemRowSelect");
    const input = document.getElementById("layoutItemNameInput");
    if(!rowSelect || !input || rowSelect.disabled || !isQut2ItemOverrideTarget()) return;
    const selectedRow = String(rowSelect.value || "").trim();
    if(!selectedRow){
        return;
    }
    if(selectedLayoutTarget === "rate"){
        const nextRate = sanitizeQut2RateValue(input.value);
        if(!Number.isFinite(nextRate)){
            alert("Enter a valid rate value.");
            return;
        }
        setCurrentInvoiceItemRateOverride(selectedRow, nextRate);
    }else{
        setCurrentInvoiceItemNameOverride(selectedRow, input.value);
    }
    syncQut2ItemOverrideInput();
    await savePersistedQut2RenderVisibility();
    await refreshPreviewFromLatest();
}

async function clearQut2ItemNameOverrideFromControl(){
    const rowSelect = document.getElementById("layoutItemRowSelect");
    if(!rowSelect || rowSelect.disabled || !isQut2ItemOverrideTarget()) return;
    const selectedRow = String(rowSelect.value || "").trim();
    if(!selectedRow){
        return;
    }
    if(selectedLayoutTarget === "rate"){
        setCurrentInvoiceItemRateOverride(selectedRow, null);
    }else{
        setCurrentInvoiceItemNameOverride(selectedRow, "");
    }
    syncQut2ItemOverrideInput();
    await savePersistedQut2RenderVisibility();
    await refreshPreviewFromLatest();
}

function initLayoutEditor(){
    const targetSelect = document.getElementById("layoutTargetSelect");
    const fontSelect = document.getElementById("layoutFontSelect");
    const fontFamilySelect = document.getElementById("layoutFontFamilySelect");
    const weightSelect = document.getElementById("layoutWeightSelect");
    const previewSelect = document.getElementById("layoutPreviewSelect");
    const leftBtn = document.getElementById("moveLeftBtn");
    const rightBtn = document.getElementById("moveRightBtn");
    const upBtn = document.getElementById("moveUpBtn");
    const downBtn = document.getElementById("moveDownBtn");
    const itemRowSelect = document.getElementById("layoutItemRowSelect");
    const itemNameInput = document.getElementById("layoutItemNameInput");
    const saveItemNameBtn = document.getElementById("saveItemNameOverrideBtn");
    const clearItemNameBtn = document.getElementById("clearItemNameOverrideBtn");

    if(!targetSelect || !fontSelect || !fontFamilySelect || !weightSelect || !previewSelect || !leftBtn || !rightBtn || !upBtn || !downBtn){
        return;
    }

    targetSelect.value = selectedLayoutTarget;
    applyPersistedQut2RenderVisibility();
    applyPersistedQut2RenderOverrides();
    syncLayoutEditorSelects();
    syncRenderInputChecklist();
    toggleQut2ItemEditControls();

    targetSelect.addEventListener("change", () => {
        selectedLayoutTarget = targetSelect.value || "customerName";
        syncLayoutEditorSelects();
        syncRenderInputChecklist();
        toggleQut2ItemEditControls();
    });

    fontSelect.addEventListener("change", async () => {
        const nextFont = Number(fontSelect.value || INPUT_FONT_SIZE);
        if(Number.isFinite(nextFont) && nextFont > 0){
            getLayoutConfig(selectedLayoutTarget).font = nextFont;
            await savePersistedQut2RenderVisibility();
            await refreshPreviewFromLatest();
        }
    });

    fontFamilySelect.addEventListener("change", async () => {
        const nextFamily = String(fontFamilySelect.value || INPUT_FONT_FAMILY).trim();
        getLayoutConfig(selectedLayoutTarget).fontFamily = nextFamily || INPUT_FONT_FAMILY;
        await savePersistedQut2RenderVisibility();
        await refreshPreviewFromLatest();
    });

    weightSelect.addEventListener("change", async () => {
        const nextWeight = String(weightSelect.value || "normal").toLowerCase() === "bold" ? "bold" : "normal";
        getLayoutConfig(selectedLayoutTarget).fontWeight = nextWeight;
        await savePersistedQut2RenderVisibility();
        await refreshPreviewFromLatest();
    });

    previewSelect.addEventListener("change", async () => {
        getLayoutConfig(selectedLayoutTarget).visible = previewSelect.value !== "false";
        syncRenderInputChecklist();
        await savePersistedQut2RenderVisibility();
        await refreshPreviewFromLatest();
    });

    leftBtn.addEventListener("click", async () => moveSelectedLayout(-LAYOUT_STEP, 0));
    rightBtn.addEventListener("click", async () => moveSelectedLayout(LAYOUT_STEP, 0));
    upBtn.addEventListener("click", async () => moveSelectedLayout(0, -LAYOUT_STEP));
    downBtn.addEventListener("click", async () => moveSelectedLayout(0, LAYOUT_STEP));

    if(itemRowSelect){
        itemRowSelect.addEventListener("change", () => {
            syncQut2ItemOverrideInput();
        });
    }
    if(saveItemNameBtn){
        saveItemNameBtn.addEventListener("click", async () => {
            await applyQut2ItemNameOverrideFromControl();
        });
    }
    if(clearItemNameBtn){
        clearItemNameBtn.addEventListener("click", async () => {
            await clearQut2ItemNameOverrideFromControl();
        });
    }
    if(itemNameInput){
        itemNameInput.addEventListener("keydown", async (ev) => {
            if(ev.key === "Enter"){
                ev.preventDefault();
                await applyQut2ItemNameOverrideFromControl();
            }
        });
    }
}

async function renderInvoice(){
    try{
        latestInvoiceData = await fetchInvoiceData();
        qut2PreviewCustomerName = String(latestInvoiceData?.customer?.name || "").trim();
        syncQut2ItemOverrideRowOptions();
        syncQut2DateInput();
        syncQut2CustomerNameInput();
        await refreshPreviewFromLatest();
    }catch(err){
        alert(err.message || "Failed to load invoice details");
    }
}

async function printPDF(){
    if(!latestInvoiceData){
        alert("Invoice preview is not ready yet.");
        return;
    }
    try{
        const rendered = await buildQuotation2RenderedPdf();
        rendered.doc.save(rendered.fileName);
    }catch(err){
        alert(err.message || "Failed to export PDF");
    }
}

async function buildQuotation2RenderedPdf(){
    if(!latestInvoiceData){
        await renderInvoice();
    }
    if(!latestInvoiceData){
        throw new Error("Invoice preview is not ready yet.");
    }
    const image = await drawInvoice(latestInvoiceData, "image/jpeg", { width: BASE_W, height: BASE_H });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4", compress: true });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 18;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const ratio = 1754 / 1240;

    let imgW = maxW;
    let imgH = imgW * ratio;
    if(imgH > maxH){
        imgH = maxH;
        imgW = imgH / ratio;
    }
    const x = (pageW - imgW) / 2;
    const y = (pageH - imgH) / 2;

    doc.addImage(image, "JPEG", x, y, imgW, imgH, undefined, "MEDIUM");
    const invoiceNo = String(latestInvoiceData.invoice.invoice_no || "Details").trim();
    const customerName = String((latestInvoiceData.customer && latestInvoiceData.customer.name) || "Customer").trim();
    const safeCustomer = customerName.replace(/[\\/:*?"<>|]/g, "_");
    const safeInvoiceNo = invoiceNo.replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `Quotation_2_${safeInvoiceNo}_${safeCustomer}.pdf`;
    const pdfBlob = doc.output("blob");
    return { doc, pdfBlob, fileName };
}

async function emailInvoice(){
    if(!latestInvoiceData){
        alert("Invoice details are not ready yet.");
        return;
    }

    const invoiceId = new URLSearchParams(window.location.search).get("id");
    if(!invoiceId){
        alert("Invoice id is missing.");
        return;
    }

    try{
        const res = await request(`/invoices/${invoiceId}/send-email`, "POST");
        if(typeof showMessageBox === "function"){
            showMessageBox(res.message || "Invoice email sent");
        }else{
            alert(res.message || "Invoice email sent");
        }
    }catch(err){
        alert(err.message || "Failed to send invoice email");
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    await loadInvMapFlags();
    const saveQut2DateBtn = document.getElementById("saveQut2DateBtn");
    if(saveQut2DateBtn){
        saveQut2DateBtn.addEventListener("click", updateQuotation2DateFromTile);
    }
    const saveQut2CustomerNameBtn = document.getElementById("saveQut2CustomerNameBtn");
    if(saveQut2CustomerNameBtn){
        saveQut2CustomerNameBtn.addEventListener("click", updateQuotation2CustomerNameFromTile);
    }
    applyPreviewAccessByRole();
    if(canConfigurePreview){
        initEditModeControl();
        initSignControl();
        initSealControl();
        initRenderInputChecklist();
        initLayoutEditor();
    }
    renderInvoice();
});
