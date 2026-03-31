const role = (localStorage.getItem("role") || "").toLowerCase();
const selectedDb = (localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const allowedPaths = (() => {
    try{
        const rows = JSON.parse(localStorage.getItem("userAllowedPathsRuntime") || "[]");
        return new Set((Array.isArray(rows) ? rows : []).map((x) => String(x || "").trim().toLowerCase()));
    }catch(_err){
        return new Set();
    }
})();
const canManage = role === "admin" || role === "manager" || isTrainingUser;
const canAccessPath = (path) => (canManage)
    ? true
    : (role === "user" && allowedPaths.has(String(path || "").trim().toLowerCase()));
const canAddMachine = canAccessPath("/products/add-rental-machine.html");
const canEditRentalMachine = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/products/machine.html", "edit"));
const canDeleteRentalMachine = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/products/machine.html", "delete"));
const canAddRentalCount = canAccessPath("/products/add-rental-count.html");
const canAddConsumables = canAccessPath("/products/add-rental-consumable.html");
const isReadOnlyUser = !canEditRentalMachine && !canDeleteRentalMachine;
const addMachineBtn = document.getElementById("addMachineBtn");
const rentalCountBtn = document.getElementById("rentalCountBtn");
const consumablesBtn = document.getElementById("consumablesBtn");
const machineSearchEl = document.getElementById("machineSearch");
let allMachines = [];

if(addMachineBtn && !canAddMachine){
    addMachineBtn.style.display = "none";
}
if(consumablesBtn && !canAddConsumables){
    consumablesBtn.style.display = "none";
}
if(rentalCountBtn && !canAddRentalCount){
    rentalCountBtn.style.display = "none";
}

if(isReadOnlyUser){
    const actionHeader = document.querySelector("#machineTable thead th:last-child");
    if(actionHeader && actionHeader.innerText.toLowerCase().includes("action")){
        actionHeader.remove();
    }
}

function renderMachines(machines){
    const tbody = document.querySelector("#machineTable tbody");
    tbody.innerHTML = "";

    machines.forEach(m => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${m.machine_id || ""}</td>
            <td>${m.customer_name || (m.Customer ? m.Customer.name : "")}</td>
            <td>${m.address || ""}</td>
            <td>${m.model || ""}</td>
            <td>${m.machine_title || ""}</td>
            <td>${m.serial_no || ""}</td>
            <td>${m.start_count ?? 0}</td>
        `;

        if(!isReadOnlyUser){
            tr.innerHTML += `
                <td>
                    <div class="machine-action-row">
                        ${canEditRentalMachine ? `<a class="btn machine-action-btn" href="edit-rental-machine.html?id=${m.id}">Edit</a>` : ""}
                        ${canDeleteRentalMachine ? `<button class="btn btn-danger btn-inline machine-action-btn" type="button" onclick="deleteMachine(${m.id})">Delete</button>` : ""}
                    </div>
                </td>
            `;
        }

        tbody.appendChild(tr);
    });
}

function applyMachineFilter(){
    const query = (machineSearchEl?.value || "").trim().toLowerCase();
    if(!query){
        renderMachines(allMachines);
        return;
    }

    const filtered = allMachines.filter(m => {
        const customerName = m.customer_name || (m.Customer ? m.Customer.name : "");
        return [m.machine_id, customerName, m.serial_no]
            .some(v => String(v || "").toLowerCase().includes(query));
    });
    renderMachines(filtered);
}

async function loadMachines(){
    try{
        allMachines = await request("/rental-machines", "GET");
        applyMachineFilter();
    }catch(err){
        alert(err.message || "Failed to load rental machines");
    }
}

if(machineSearchEl){
    machineSearchEl.addEventListener("input", applyMachineFilter);
}

async function deleteMachine(id){
    if(!confirm("Delete this rental machine?")) return;
    try{
        await request(`/rental-machines/${id}`, "DELETE");
        showMessageBox("Rental machine deleted");
        await loadMachines();
    }catch(err){
        alert(err.message || "Failed to delete rental machine");
    }
}

function savePDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("Rental Machines", 14, 20);
    let y = 30;
    const rows = document.querySelectorAll("#machineTable tbody tr");
    rows.forEach(r => {
        const cells = Array.from(r.children).slice(0, 7).map(td => td.innerText);
        doc.text(cells.join(" | "), 14, y);
        y += 8;
    });
    doc.save("Rental_Machines.pdf");
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "../login.html";
}

loadMachines();
