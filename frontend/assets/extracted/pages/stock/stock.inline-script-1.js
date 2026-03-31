const role = (localStorage.getItem("role") || "").toLowerCase();
const allowedPaths = (() => {
    try{
        const rows = JSON.parse(localStorage.getItem("userAllowedPathsRuntime") || "[]");
        return new Set((Array.isArray(rows) ? rows : []).map((x) => String(x || "").trim().toLowerCase()));
    }catch(_err){
        return new Set();
    }
})();
const canAccessStock = (role === "admin" || role === "manager")
    ? true
    : (role === "user" && allowedPaths.has("/stock/stock.html"));
if(!canAccessStock){
    window.location.href = "../dashboard.html";
}

const stockSearchEl = document.getElementById("stockSearch");
const stockModelFilterEl = document.getElementById("stockModelFilter");
const stockSourceFilterEl = document.getElementById("stockSourceFilter");
const clearVendorStockBtnEl = document.getElementById("clearVendorStockBtn");
let allStockProducts = [];

function classifyVendorSource(vendorName){
    const name = String(vendorName || "").trim().toLowerCase();
    if(!name) return "VENDER";
    if(name.includes("pulmo")) return "PULMO";
    if(name.includes("other")) return "OTHER";
    return "VENDER";
}

function getSourceProducts(){
    const source = String(stockSourceFilterEl.value || "ALL").toUpperCase();
    if(source === "ALL"){
        return allStockProducts.slice();
    }
    return allStockProducts.filter((p) => classifyVendorSource(p?.Vendor?.name) === source);
}

function renderStocks(rows){
    const tbody = document.querySelector("#stockTable tbody");
    tbody.innerHTML = "";
    const canManage = true;
    rows.forEach((p) => {
        const tr = document.createElement("tr");
        const categoryName = p.Category ? p.Category.name : "";
        const displayedCount = canManage ? Number(p.count || 0) : 0;
        tr.innerHTML = `
            <td>${p.product_id || ""}</td>
            <td>${p.description || ""}</td>
            <td>${p.model || ""}</td>
            <td>${categoryName}</td>
            <td>${displayedCount}</td>
            <td>
                <div class="stock-actions">
                    <input type="number" class="stock-qty" id="qty-${p.id}" min="0" step="1" value="1" ${canManage ? "" : "disabled"}>
                    <button class="btn btn-inline" type="button" onclick="adjustStock(${p.id}, 'add')" ${canManage ? "" : "disabled"}>Add</button>
                    <button class="btn btn-inline" type="button" onclick="adjustStock(${p.id}, 'remove')" ${canManage ? "" : "disabled"}>Reduce</button>
                    <button class="btn btn-inline" type="button" onclick="adjustStock(${p.id}, 'set')" ${canManage ? "" : "disabled"}>Set</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function populateModelFilter(rows){
    const previous = stockModelFilterEl.value;
    const seen = new Set();
    rows.forEach((p) => {
        const model = String(p.model || "").trim();
        if(model) seen.add(model);
    });
    const models = Array.from(seen).sort((a,b) => a.localeCompare(b));

    stockModelFilterEl.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Models";
    stockModelFilterEl.appendChild(allOpt);

    models.forEach((model) => {
        const opt = document.createElement("option");
        opt.value = model;
        opt.textContent = model;
        stockModelFilterEl.appendChild(opt);
    });

    if(previous && models.includes(previous)){
        stockModelFilterEl.value = previous;
    }
}

function applyStockFilter(){
    const sourceRows = getSourceProducts();
    const q = (stockSearchEl.value || "").trim().toLowerCase();
    const selectedModel = (stockModelFilterEl.value || "").trim().toLowerCase();

    populateModelFilter(sourceRows);

    if(!q && !selectedModel){
        renderStocks(sourceRows);
        return;
    }

    const filtered = sourceRows.filter((p) => {
        const categoryName = p.Category ? p.Category.name : "";
        const model = p.model || "";
        const modelMatch = !selectedModel || String(model).toLowerCase() === selectedModel;
        if(!modelMatch) return false;

        return [p.product_id, p.description, categoryName]
            .concat(model)
            .some((v) => String(v || "").toLowerCase().includes(q));
    });
    renderStocks(filtered);
}

async function loadStocks(){
    try{
        allStockProducts = await request("/stocks","GET");
        applyStockFilter();
    }catch(err){
        alert(err.message || "Failed to load stocks");
    }
}

async function adjustStock(productId, action){
    const qtyEl = document.getElementById(`qty-${productId}`);
    const quantity = Number(qtyEl ? qtyEl.value : 0);
    if(!Number.isFinite(quantity) || quantity < 0){
        alert("Enter a valid quantity.");
        return;
    }
    try{
        await request("/stocks/adjust","POST",{
            product_id: productId,
            action,
            quantity
        });
        showMessageBox("Stock updated");
        loadStocks();
    }catch(err){
        alert(err.message || "Failed to update stock");
    }
}

async function clearVendorStocks(){
    const selectedSource = String(stockSourceFilterEl.value || "ALL").toUpperCase();
    if(selectedSource !== "VENDER"){
        alert("Please select 'Vender' in source list before clear stock.");
        return;
    }
    if(!confirm("Clear current stock to 0 for all Vender source products?")) return;

    try{
        const result = await request("/stocks/clear-vendor","POST");
        showMessageBox(result?.message || "Vender stock cleared.");
        await loadStocks();
    }catch(err){
        alert(err.message || "Failed to clear vender stock");
    }
}

stockSearchEl.addEventListener("input", applyStockFilter);
stockModelFilterEl.addEventListener("change", applyStockFilter);
stockSourceFilterEl.addEventListener("change", () => {
    stockModelFilterEl.value = "";
    applyStockFilter();
});
clearVendorStockBtnEl.addEventListener("click", clearVendorStocks);
loadStocks();
