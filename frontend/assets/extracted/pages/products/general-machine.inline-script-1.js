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
const canAddGeneralMachine = canAccessPath("/products/add-general-machine.html");
const canEditGeneralMachine = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/products/general-machine.html", "edit"));
const canDeleteGeneralMachine = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/products/general-machine.html", "delete"));
const isReadOnlyUser = !canEditGeneralMachine && !canDeleteGeneralMachine;
const addMachineBtn = document.getElementById("addMachineBtn");
const machineSearchEl = document.getElementById("machineSearch");
let allMachines = [];

if(addMachineBtn && !canAddGeneralMachine){
    addMachineBtn.style.display = "none";
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
                        ${canEditGeneralMachine ? `<a class="btn machine-action-btn" href="edit-general-machine.html?id=${m.id}">Edit</a>` : ""}
                        ${canDeleteGeneralMachine ? `<button class="btn btn-danger btn-inline machine-action-btn" type="button" onclick="deleteMachine(${m.id})">Delete</button>` : ""}
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
        allMachines = await request("/general-machines", "GET");
        applyMachineFilter();
    }catch(err){
        alert(err.message || "Failed to load general machines");
    }
}

if(machineSearchEl){
    machineSearchEl.addEventListener("input", applyMachineFilter);
}

async function deleteMachine(id){
    if(!confirm("Delete this general machine?")) return;
    try{
        await request(`/general-machines/${id}`, "DELETE");
        showMessageBox("General machine deleted");
        await loadMachines();
    }catch(err){
        alert(err.message || "Failed to delete general machine");
    }
}

function savePDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("General Machines", 14, 20);
    let y = 30;
    const rows = document.querySelectorAll("#machineTable tbody tr");
    rows.forEach(r => {
        const cells = Array.from(r.children).slice(0, 7).map(td => td.innerText);
        doc.text(cells.join(" | "), 14, y);
        y += 8;
    });
    doc.save("General_Machines.pdf");
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "../login.html";
}

loadMachines();
