if(!localStorage.getItem("token")){
    window.location.href = "../login.html";
}

const role = (localStorage.getItem("role") || "").toLowerCase();
if(role !== "admin" && role !== "manager"){
    alert("Only Admin and Manager can edit general machines.");
    window.location.href = "general-machine.html";
}

const machineIdParam = new URLSearchParams(window.location.search).get("id");
if(!machineIdParam){
    alert("Machine ID is missing.");
    window.location.href = "general-machine.html";
}

let generalCustomers = [];

function forceUppercaseInput(inputId){
    const el = document.getElementById(inputId);
    if(!el) return;
    el.style.textTransform = "uppercase";
    el.addEventListener("input", () => {
        const cursor = el.selectionStart;
        el.value = String(el.value || "").toUpperCase();
        try{ el.setSelectionRange(cursor, cursor); }catch(_err){}
    });
}

["machineId", "model", "machineTitle", "serialNo"].forEach(forceUppercaseInput);

function fillAddressFromCustomer(){
    const customerId = Number(document.getElementById("customerId").value);
    const selected = generalCustomers.find(c => Number(c.id) === customerId);
    document.getElementById("address").value = selected ? (selected.address || "") : "";
}

async function loadGeneralCustomers(){
    try{
        const customers = await request("/customers", "GET");
        generalCustomers = customers.filter(c => String(c.customer_mode || "").toLowerCase() === "general");

        const customerSelect = document.getElementById("customerId");
        customerSelect.innerHTML = "<option value=''>Select General Customer</option>";
        generalCustomers.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.innerText = c.name;
            customerSelect.appendChild(opt);
        });
    }catch(err){
        alert(err.message || "Failed to load customers");
    }
}

async function loadMachine(){
    try{
        const machine = await request(`/general-machines/${machineIdParam}`, "GET");
        document.getElementById("machineId").value = machine.machine_id || "";
        document.getElementById("address").value = machine.address || "";
        document.getElementById("model").value = machine.model || "";
        document.getElementById("machineTitle").value = machine.machine_title || "";
        document.getElementById("serialNo").value = machine.serial_no || "";
        document.getElementById("entryDate").value = machine.entry_date || new Date().toISOString().slice(0, 10);
        document.getElementById("startCount").value = machine.start_count ?? 0;
        document.getElementById("customerId").value = machine.customer_id || "";
    }catch(err){
        alert(err.message || "Failed to load general machine");
        window.location.href = "general-machine.html";
    }
}

document.getElementById("customerId").addEventListener("change", fillAddressFromCustomer);

document.getElementById("generalMachineForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const customerId = Number(document.getElementById("customerId").value);
    const selectedCustomer = generalCustomers.find(c => Number(c.id) === customerId);
    if(!selectedCustomer){
        alert("Please select a valid General customer.");
        return;
    }

    const payload = {
        machine_id: document.getElementById("machineId").value,
        customer_id: customerId,
        customer_name: selectedCustomer.name,
        address: document.getElementById("address").value.trim(),
        model: document.getElementById("model").value,
        machine_title: document.getElementById("machineTitle").value,
        serial_no: document.getElementById("serialNo").value,
        entry_date: document.getElementById("entryDate").value,
        start_count: Number.parseInt(document.getElementById("startCount").value, 10)
    };

    if(!payload.entry_date){
        alert("Please select entry date.");
        return;
    }

    if(Number.isNaN(payload.start_count)){
        alert("Entry date and Start Count must be valid.");
        return;
    }

    try{
        await request(`/general-machines/${machineIdParam}`, "PUT", payload);
        showMessageBox("General machine updated successfully");
        window.location.href = "general-machine.html";
    }catch(err){
        alert(err.message || "Failed to update general machine");
    }
});

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "../login.html";
}

(async function init(){
    await loadGeneralCustomers();
    await loadMachine();
})();
