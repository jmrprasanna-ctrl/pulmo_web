if(!localStorage.getItem("token")){
    window.location.href = "../login.html";
}

const role = (localStorage.getItem("role") || "").toLowerCase();
const selectedDb = (localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const canDeleteAddedConsumables = role === "admin"
    || role === "manager"
    || isTrainingUser
    || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/products/add-rental-consumable.html", "delete"));

let consumableProducts = [];
let pendingItems = [];
let rentalMachines = [];

function getTodayLocalIso(){
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

async function loadRentalMachines(){
    try{
        const rows = await request("/rental-machines", "GET");
        rentalMachines = Array.isArray(rows) ? rows : [];
        const select = document.getElementById("rentalMachineId");
        select.innerHTML = "<option value=''>Select Rental Machine</option>";
        rentalMachines.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m.id;
            const machineId = m.machine_id || `M-${m.id}`;
            const customerName = m.customer_name || (m.Customer ? m.Customer.name : "");
            const serialNo = m.serial_no || "";
            opt.innerText = `${machineId} - ${customerName}${serialNo ? ` (${serialNo})` : ""}`;
            select.appendChild(opt);
        });
    }catch(err){
        alert(err.message || "Failed to load rental machines");
    }
}

async function loadConsumableProducts(){
    try{
        const products = await request("/products", "GET");
        consumableProducts = Array.isArray(products) ? products : [];
    }catch(err){
        alert(err.message || "Failed to load products");
    }
}

function getProductSearchText(product){
    const productId = String(product.product_id || `ID:${product.id}`);
    const description = String(product.description || "Unnamed");
    const category = String(product.Category ? (product.Category.name || "") : "");
    const model = String(product.model || "");
    const vendor = String(product.Vendor ? (product.Vendor.name || "") : "");
    return `${productId} ${description} ${category} ${model} ${vendor}`.toLowerCase();
}

function productDisplayLabel(product){
    const productId = String(product.product_id || `ID:${product.id}`);
    const description = String(product.description || "Unnamed");
    const category = String(product.Category ? (product.Category.name || "-") : "-");
    const model = String(product.model || "-");
    const vendor = String(product.Vendor ? (product.Vendor.name || "-") : "-");
    return `${productId} | ${description} | ${category} | ${model} | ${vendor}`;
}

function renderProductSearchResults(query){
    const resultsEl = document.getElementById("productSearchResults");
    const q = String(query || "").trim().toLowerCase();
    let rows = consumableProducts;
    if(q){
        rows = consumableProducts.filter(p => getProductSearchText(p).includes(q));
    }
    rows = rows.slice(0, 40);

    if(!rows.length){
        resultsEl.innerHTML = `<div class="product-search-empty">No products found.</div>`;
        resultsEl.style.display = "block";
        return;
    }

    resultsEl.innerHTML = rows.map((p) => `
        <div class="product-search-item" data-id="${p.id}">${productDisplayLabel(p)}</div>
    `).join("");
    resultsEl.style.display = "block";
}

function selectProductById(id){
    const productId = Number(id);
    const product = consumableProducts.find(p => Number(p.id) === productId);
    if(!product) return;
    document.getElementById("consumableProductId").value = String(product.id);
    document.getElementById("productSearchInput").value = productDisplayLabel(product);
    document.getElementById("productSearchResults").style.display = "none";
}

function renderPending(){
    const tbody = document.querySelector("#pendingTable tbody");
    tbody.innerHTML = "";
    pendingItems.forEach((item, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.consumable_name}</td>
            <td>${item.quantity}</td>
            <td>${Number(item.total_price || 0).toFixed(2)}</td>
            <td>${item.count ?? 0}</td>
            <td>
                <div class="consumable-action-row">
                    <button class="btn btn-danger btn-inline consumable-action-btn" type="button" onclick="removePending(${index})">Remove</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function removePending(index){
    pendingItems.splice(index, 1);
    renderPending();
}
window.removePending = removePending;

function addPendingItem(){
    const productId = Number(document.getElementById("consumableProductId").value);
    const quantity = Number.parseInt(document.getElementById("quantity").value, 10);
    const count = Number.parseInt(document.getElementById("count").value, 10);
    const product = consumableProducts.find(p => Number(p.id) === productId);

    if(!product || Number.isNaN(quantity) || quantity <= 0 || Number.isNaN(count) || count <= 0){
        alert("Please select consumable and valid quantity/count (Count must be greater than 0).");
        return;
    }

    pendingItems.push({
        product_id: product.id,
        consumable_name: String(product.description || product.product_id || "").toUpperCase(),
        quantity,
        count,
        unit_price: Number(product.dealer_price || 0),
        total_price: Number(product.dealer_price || 0) * quantity
    });

    renderPending();
    document.getElementById("consumableProductId").value = "";
    document.getElementById("productSearchInput").value = "";
    document.getElementById("quantity").value = "1";
    document.getElementById("count").value = "1";
}

document.getElementById("addItemBtn").addEventListener("click", addPendingItem);

const productSearchInput = document.getElementById("productSearchInput");
const productSearchResults = document.getElementById("productSearchResults");
if(productSearchInput && productSearchResults){
    productSearchInput.addEventListener("input", (e) => {
        document.getElementById("consumableProductId").value = "";
        renderProductSearchResults(e.target.value);
    });
    productSearchInput.addEventListener("focus", (e) => {
        renderProductSearchResults(e.target.value);
    });
    productSearchInput.addEventListener("blur", () => {
        setTimeout(() => {
            productSearchResults.style.display = "none";
        }, 150);
    });
    productSearchResults.addEventListener("mousedown", (e) => {
        const item = e.target.closest(".product-search-item");
        if(!item) return;
        selectProductById(item.dataset.id);
    });
}

async function loadAddedConsumables(){
    try{
        const rows = await request("/rental-machine-consumables", "GET");
        const tbody = document.querySelector("#consumableTable tbody");
        tbody.innerHTML = "";
        const grouped = new Map();
        rows.forEach(r => {
            const key = r.save_batch_id || `ROW-${r.id}`;
            if(!grouped.has(key)){
                grouped.set(key, {
                    entry: key,
                    machineId: r.RentalMachine ? (r.RentalMachine.machine_id || "") : "",
                    customer: r.Customer ? (r.Customer.name || "") : "",
                    consumables: [],
                    totalQty: 0,
                    totalPrice: 0,
                    counts: []
                });
            }
            const g = grouped.get(key);
            g.consumables.push(`${r.consumable_name || ""} (${r.quantity ?? 0})`);
            g.totalQty += Number(r.quantity || 0);
            g.totalPrice += Number((r.Product ? r.Product.dealer_price : 0) || 0) * Number(r.quantity || 0);
            const c = Number(r.count || 0);
            if(c > 0){
                g.counts.push(c);
            }
        });

        grouped.forEach(g => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${g.entry}</td>
                <td>${g.machineId || "-"}</td>
                <td>${g.customer}</td>
                <td>${g.consumables.join(", ")}</td>
                <td>${g.totalQty}</td>
                <td>${Number(g.totalPrice || 0).toFixed(2)}</td>
                <td>${g.counts.length ? g.counts.join(", ") : "-"}</td>
                <td>
                    <div class="consumable-action-row">
                        ${canDeleteAddedConsumables
                            ? `<button class="btn btn-danger btn-inline consumable-action-btn" type="button" onclick="deleteAddedEntry('${String(g.entry).replace(/'/g, "\\'")}')">Delete</button>`
                            : "-"}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }catch(err){
        alert(err.message || "Failed to load consumables");
    }
}

async function saveEntry(){
    const rentalMachineId = Number(document.getElementById("rentalMachineId").value);
    const entryDate = String(document.getElementById("entryDate").value || "").trim();
    const selectedMachine = rentalMachines.find(m => Number(m.id) === rentalMachineId);
    const customerId = Number(selectedMachine ? selectedMachine.customer_id : 0);
    if(!selectedMachine || !customerId){
        alert("Please select Rental machine.");
        return;
    }
    if(!entryDate){
        alert("Please select entry date.");
        return;
    }
    if(!pendingItems.length){
        alert("Please add at least one consumable.");
        return;
    }

    try{
        await request("/rental-machine-consumables/batch", "POST", {
            rental_machine_id: rentalMachineId,
            customer_id: customerId,
            entry_date: entryDate,
            items: pendingItems
        });
        showMessageBox("Consumables saved in one entry");
        pendingItems = [];
        renderPending();
        await loadAddedConsumables();
    }catch(err){
        alert(err.message || "Failed to save consumables");
    }
}

document.getElementById("consumableForm").addEventListener("submit", (e) => {
    e.preventDefault();
});
document.getElementById("saveEntryBtn").addEventListener("click", saveEntry);

async function deleteAddedEntry(entryId){
    if(!canDeleteAddedConsumables){
        alert("You do not have permission to delete consumable entries.");
        return;
    }
    if(!entryId) return;
    if(!confirm("Delete this added consumables entry?")) return;

    try{
        if(String(entryId).startsWith("ROW-")){
            const rowId = Number(String(entryId).slice(4));
            if(Number.isFinite(rowId) && rowId > 0){
                await request(`/rental-machine-consumables/${rowId}`, "DELETE");
            }else{
                throw new Error("Invalid row entry id");
            }
        }else{
            await request(`/rental-machine-consumables/batch/${encodeURIComponent(entryId)}`, "DELETE");
        }
        showMessageBox("Consumables entry deleted");
        await loadAddedConsumables();
    }catch(err){
        alert(err.message || "Failed to delete added consumables entry");
    }
}
window.deleteAddedEntry = deleteAddedEntry;

function saveAddedConsumablesPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("Added Rental Consumables", 14, 20);
    let y = 30;
    const rows = document.querySelectorAll("#consumableTable tbody tr");
    rows.forEach(r => {
        const cells = Array.from(r.children).slice(0, 7).map(td => td.innerText);
        doc.text(cells.join(" | "), 14, y);
        y += 8;
    });
    doc.save("Added_Rental_Consumables.pdf");
}
window.saveAddedConsumablesPDF = saveAddedConsumablesPDF;

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "../login.html";
}

(async function init(){
    document.getElementById("entryDate").value = getTodayLocalIso();
    await loadRentalMachines();
    await loadConsumableProducts();
    await loadAddedConsumables();
})();
