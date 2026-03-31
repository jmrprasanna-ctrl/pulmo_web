if(!localStorage.getItem("token")){
    window.location.href = "../login.html";
}

const role = (localStorage.getItem("role") || "").toLowerCase();
const selectedDb = (localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const canDeleteCount = role === "admin"
    || role === "manager"
    || isTrainingUser
    || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/products/add-rental-count.html", "delete"));

let allMachines = [];
let allRentalCounts = [];

function normalizeTransaction(raw){
    const value = String(raw || "").trim().toUpperCase();
    if(!value) return "";
    if(value.startsWith("RMC-")) return value;
    if(value.startsWith("RMC")) return `RMC-${value.slice(3)}`;
    return value;
}

async function generateTransactionId(){
    try{
        const last = await request("/rental-machine-counts/last-id", "GET");
        const lastId = String(last && last.transaction_id ? last.transaction_id : "").toUpperCase();
        const num = lastId.startsWith("RMC-") ? Number.parseInt(lastId.slice(4), 10) : 0;
        const next = Number.isNaN(num) ? 1 : num + 1;
        document.getElementById("transactionId").value = `RMC-${String(next).padStart(4, "0")}`;
    }catch(_err){
        document.getElementById("transactionId").value = `RMC-${Date.now()}`;
    }
}

async function loadMachines(){
    try{
        const rows = await request("/rental-machines", "GET");
        allMachines = Array.isArray(rows) ? rows : [];
        const select = document.getElementById("rentalMachineId");
        select.innerHTML = "<option value=''>Select Rental Machine</option>";
        allMachines.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m.id;
            const machineId = m.machine_id || "MACHINE";
            const machineTitle = String(m.machine_title || "").trim() || "UNTITLED";
            const customer = m.customer_name || (m.Customer ? m.Customer.name : "");
            opt.innerText = `${machineId} - ${machineTitle} - ${customer || "NO CUSTOMER"}`;
            select.appendChild(opt);
        });
        populateMachineTitleFilter();
    }catch(err){
        alert(err.message || "Failed to load rental machines");
    }
}

function populateMachineTitleFilter(){
    const filter = document.getElementById("machineTitleFilter");
    const current = String(filter.value || "");
    filter.innerHTML = "<option value=''>All Machine Titles</option>";
    allMachines.forEach(m => {
        const opt = document.createElement("option");
        const title = String(m.machine_title || "").trim();
        const customer = String(m.customer_name || (m.Customer ? m.Customer.name : "") || "").trim();
        opt.value = String(m.id);
        opt.textContent = `${title || "UNTITLED"} - ${customer || "NO CUSTOMER"}`;
        filter.appendChild(opt);
    });

    if(current && allMachines.some(m => String(m.id) === current)){
        filter.value = current;
    }
}

async function onMachineChange(){
    const machineId = Number(document.getElementById("rentalMachineId").value);
    const machine = allMachines.find(m => Number(m.id) === machineId);
    document.getElementById("customerName").value = machine
        ? (machine.customer_name || (machine.Customer ? machine.Customer.name : ""))
        : "";

    if(!machineId){
        document.getElementById("inputCount").value = "";
        document.getElementById("updatedCount").value = "";
        renderRentalCounts();
        return;
    }

    try{
        const next = await request(`/rental-machine-counts/next-count?rental_machine_id=${machineId}`, "GET");
        const input = Number(next.next_input_count || 0);
        document.getElementById("inputCount").value = String(input);
        document.getElementById("updatedCount").value = String(input);
        renderRentalCounts();
    }catch(err){
        document.getElementById("inputCount").value = String(machine ? (machine.updated_count ?? machine.start_count ?? 0) : 0);
        document.getElementById("updatedCount").value = document.getElementById("inputCount").value;
        renderRentalCounts();
        alert(err.message || "Failed to load next input count");
    }
}

function renderRentalCounts(){
    const tbody = document.querySelector("#rentalCountTable tbody");
    const selectedMachineId = Number(document.getElementById("rentalMachineId").value);
    const selectedTitleMachineId = Number(document.getElementById("machineTitleFilter").value);
    const rows = allRentalCounts.filter(r => {
        if(selectedMachineId && Number(r.rental_machine_id) !== selectedMachineId){
            return false;
        }
        if(selectedTitleMachineId && Number(r.rental_machine_id) !== selectedTitleMachineId){
            return false;
        }
        return true;
    });

    tbody.innerHTML = "";
    rows.forEach(r => {
        const tr = document.createElement("tr");
        const rowDate = r.entry_date || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0,10) : "");
        const dateText = rowDate ? new Date(`${rowDate}T00:00:00`).toLocaleDateString() : "";
        const machineId = r.RentalMachine ? (r.RentalMachine.machine_id || "") : "";
        const machineTitle = r.RentalMachine ? (r.RentalMachine.machine_title || "") : "";
        const customer = r.Customer ? (r.Customer.name || "") : "";
        const inputCount = Number(r.input_count || 0);
        const updatedCount = Number(r.updated_count || 0);
        const priceAmount = (updatedCount - inputCount) * 1;
        tr.innerHTML = `
            <td>${r.transaction_id || ""}</td>
            <td>${machineId}</td>
            <td>${machineTitle}</td>
            <td>${customer}</td>
            <td>${inputCount}</td>
            <td>${updatedCount}</td>
            <td>${priceAmount.toFixed(2)}</td>
            <td>${dateText}</td>
            <td>${canDeleteCount ? `<button class="btn btn-danger" type="button" onclick="deleteRentalCount(${Number(r.id)})">Delete</button>` : "-"}</td>
        `;
        tbody.appendChild(tr);
    });

    if(!rows.length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="9" style="text-align:center;">No rental count records found.</td>`;
        tbody.appendChild(tr);
    }
}

async function loadRentalCounts(){
    try{
        const rows = await request("/rental-machine-counts", "GET");
        allRentalCounts = Array.isArray(rows) ? rows : [];
        renderRentalCounts();
    }catch(err){
        alert(err.message || "Failed to load rental counts");
    }
}

document.getElementById("transactionId").addEventListener("blur", (e) => {
    e.target.value = normalizeTransaction(e.target.value);
});

document.getElementById("rentalMachineId").addEventListener("change", onMachineChange);
document.getElementById("machineTitleFilter").addEventListener("change", renderRentalCounts);

document.getElementById("rentalCountForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const rental_machine_id = Number(document.getElementById("rentalMachineId").value);
    const updated_count = Number.parseInt(document.getElementById("updatedCount").value, 10);
    const transaction_id = normalizeTransaction(document.getElementById("transactionId").value);
    const entry_date = String(document.getElementById("entryDate").value || "").trim();

    if(!Number.isFinite(rental_machine_id) || rental_machine_id <= 0 || Number.isNaN(updated_count)){
        alert("Please select rental machine and enter valid updated count.");
        return;
    }
    if(!entry_date){
        alert("Please select entry date.");
        return;
    }
    if(updated_count < 0){
        alert("Updated count cannot be negative.");
        return;
    }

    try{
        await request("/rental-machine-counts", "POST", {
            transaction_id,
            rental_machine_id,
            updated_count,
            entry_date
        });
        showMessageBox("Rental count saved successfully");
        await loadMachines();
        await loadRentalCounts();
        await generateTransactionId();
        document.getElementById("rentalMachineId").value = "";
        document.getElementById("customerName").value = "";
        document.getElementById("inputCount").value = "";
        document.getElementById("updatedCount").value = "";
        renderRentalCounts();
    }catch(err){
        alert(err.message || "Failed to save rental count");
    }
});

async function deleteRentalCount(id){
    const rowId = Number(id);
    if(!Number.isFinite(rowId) || rowId <= 0) return;
    if(!confirm("Delete this rental count record?")) return;

    try{
        await request(`/rental-machine-counts/${rowId}`, "DELETE");
        showMessageBox("Rental count record deleted");
        await loadMachines();
        await loadRentalCounts();
        await onMachineChange();
    }catch(err){
        alert(err.message || "Failed to delete rental count record");
    }
}
window.deleteRentalCount = deleteRentalCount;

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "../login.html";
}

(async function init(){
    document.getElementById("entryDate").value = new Date().toISOString().slice(0, 10);
    await loadMachines();
    await loadRentalCounts();
    await generateTransactionId();
})();
