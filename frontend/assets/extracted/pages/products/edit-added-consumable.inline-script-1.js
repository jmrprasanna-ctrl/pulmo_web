if(!localStorage.getItem("token")){
    window.location.href = "../login.html";
}

const EDIT_ADDED_CONSUMABLE_ACCESS_PATH = "/products/edit-added-consumable.html";
const EDIT_ADDED_CONSUMABLE_USER_ROLE_ALIASES = new Set([
    "user",
    "coordinator",
    "cordinator",
    "co-ordinator",
    "co ordinator",
    "co_ordinator"
]);
const entryId = String(new URLSearchParams(window.location.search).get("entry") || "").trim();

function redirectToConsumablesList(){
    window.location.href = "add-rental-consumable.html";
}

if(!entryId){
    alert("Entry id is missing.");
    redirectToConsumablesList();
}

function normalizeEditAddedConsumableRole(value){
    const raw = String(value || "").trim().toLowerCase();
    if(raw === "admin" || raw === "manager"){
        return raw;
    }
    if(EDIT_ADDED_CONSUMABLE_USER_ROLE_ALIASES.has(raw)){
        return "user";
    }
    return raw;
}

function canViewEditAddedConsumablePage(){
    const role = normalizeEditAddedConsumableRole(localStorage.getItem("role"));
    if(!role){
        return false;
    }

    const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
    if(role === "user" && selectedDb === "demo"){
        return true;
    }

    if(
        (role === "admin" || role === "manager")
        && typeof window.hasAccessConfigRestrictions === "function"
        && !window.hasAccessConfigRestrictions()
    ){
        return true;
    }

    if(typeof window.hasUserActionPermission === "function" && window.hasUserActionPermission(EDIT_ADDED_CONSUMABLE_ACCESS_PATH, "view")){
        return true;
    }

    return typeof window.hasUserGrantedPath === "function"
        && window.hasUserGrantedPath(EDIT_ADDED_CONSUMABLE_ACCESS_PATH);
}

async function ensureEditAddedConsumableAccess(){
    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }

    if(canViewEditAddedConsumablePage()){
        return true;
    }

    alert("You do not have permission to access Edit Added Consumables.");
    redirectToConsumablesList();
    return false;
}

function money(value){
    return Number(value || 0).toFixed(2);
}

async function loadEntry(){
    try{
        const rows = await request(`/rental-machine-consumables/entry/${encodeURIComponent(entryId)}`, "GET");
        const matched = Array.isArray(rows) ? rows : [];

        if(!matched.length){
            alert("Entry not found.");
            redirectToConsumablesList();
            return;
        }

        const first = matched[0];
        const machineId = first.RentalMachine ? (first.RentalMachine.machine_id || "") : "";
        const machineTitle = first.RentalMachine
            ? (first.RentalMachine.machine_title || first.RentalMachine.machine_name || first.RentalMachine.title || "")
            : "";
        const customer = first.Customer ? (first.Customer.name || "") : "";

        document.getElementById("entryValue").innerText = entryId;
        document.getElementById("machineValue").innerText = machineId || "-";
        document.getElementById("machineTitleValue").innerText = machineTitle || "-";
        document.getElementById("customerValue").innerText = customer || "-";

        const tbody = document.querySelector("#entryItemsTable tbody");
        tbody.innerHTML = "";
        matched.forEach((r) => {
            const qty = Number(r.quantity || 0);
            const hasExplicitTotal = r.total_price !== undefined && r.total_price !== null;
            const explicitTotal = Number(r.total_price);
            const hasExplicitUnit = r.unit_price !== undefined && r.unit_price !== null;
            const explicitUnit = Number(r.unit_price);
            const productUnit = Number(r.Product ? (r.Product.dealer_price || 0) : 0);
            const lineTotal = hasExplicitTotal
                ? explicitTotal
                : (hasExplicitUnit ? explicitUnit * qty : productUnit * qty);
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.consumable_name || ""}</td>
                <td>${qty}</td>
                <td>${money(lineTotal)}</td>
                <td>${Number(r.count || 0) || "-"}</td>
            `;
            tbody.appendChild(tr);
        });
    }catch(err){
        alert(err.message || "Failed to load entry.");
        redirectToConsumablesList();
    }
}

(async function init(){
    if(!entryId){
        return;
    }
    if(!(await ensureEditAddedConsumableAccess())){
        return;
    }
    await loadEntry();
})();
