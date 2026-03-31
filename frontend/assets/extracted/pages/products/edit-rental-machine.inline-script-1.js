if(!localStorage.getItem("token")){
    window.location.href = "../login.html";
}

const role = (localStorage.getItem("role") || "").toLowerCase();
if(role !== "admin" && role !== "manager"){
    alert("Only Admin and Manager can edit rental machines.");
    window.location.href = "machine.html";
}

const machineIdParam = new URLSearchParams(window.location.search).get("id");
if(!machineIdParam){
    alert("Machine ID is missing.");
    window.location.href = "machine.html";
}

let rentalCustomers = [];

function forceUppercaseInput(inputId){
    const el = document.getElementById(inputId);
    if(!el) return;
    el.style.textTransform = "uppercase";
    el.addEventListener("input", () => {
        const cursor = el.selectionStart;
        el.value = String(el.value || "").toUpperCase();
        try{
            el.setSelectionRange(cursor, cursor);
        }catch(_err){
        }
    });
}

["machineId", "model", "machineTitle", "serialNo"].forEach(forceUppercaseInput);
document.getElementById("startCount").addEventListener("input", () => {
    const start = Number.parseInt(document.getElementById("startCount").value, 10);
    document.getElementById("updatedCount").value = Number.isNaN(start) ? "0" : String(start);
});

function fillAddressFromCustomer(){
    const customerId = Number(document.getElementById("customerId").value);
    const selected = rentalCustomers.find(c => Number(c.id) === customerId);
    document.getElementById("address").value = selected ? (selected.address || "") : "";
}

async function loadRentalCustomers(){
    try{
        const customers = await request("/customers", "GET");
        rentalCustomers = customers.filter(c => String(c.customer_mode || "").toLowerCase() === "rental");

        const customerSelect = document.getElementById("customerId");
        customerSelect.innerHTML = "<option value=''>Select Rental Customer</option>";
        rentalCustomers.forEach(c => {
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
        const machine = await request(`/rental-machines/${machineIdParam}`, "GET");
        document.getElementById("machineId").value = machine.machine_id || "";
        document.getElementById("address").value = machine.address || "";
        document.getElementById("model").value = machine.model || "";
        document.getElementById("machineTitle").value = machine.machine_title || "";
        document.getElementById("serialNo").value = machine.serial_no || "";
        document.getElementById("startCount").value = machine.start_count ?? 0;
        document.getElementById("pagePerPrice").value = machine.page_per_price ?? 0;
        document.getElementById("updatedCount").value = machine.updated_count ?? (machine.start_count ?? 0);
        document.getElementById("customerId").value = machine.customer_id || "";
    }catch(err){
        alert(err.message || "Failed to load rental machine");
        window.location.href = "machine.html";
    }
}

document.getElementById("customerId").addEventListener("change", fillAddressFromCustomer);

document.getElementById("rentalMachineForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const customerId = Number(document.getElementById("customerId").value);
    const selectedCustomer = rentalCustomers.find(c => Number(c.id) === customerId);
    if(!selectedCustomer){
        alert("Please select a valid Rental customer.");
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
        start_count: Number.parseInt(document.getElementById("startCount").value, 10),
        page_per_price: Number.parseFloat(document.getElementById("pagePerPrice").value),
        updated_count: Number.parseInt(document.getElementById("updatedCount").value, 10)
    };

    if(Number.isNaN(payload.start_count) || Number.isNaN(payload.updated_count) || Number.isNaN(payload.page_per_price)){
        alert("Start Count, Updated Count and Page per price must be valid numbers.");
        return;
    }

    try{
        await request(`/rental-machines/${machineIdParam}`, "PUT", payload);
        showMessageBox("Rental machine updated successfully");
        window.location.href = "machine.html";
    }catch(err){
        alert(err.message || "Failed to update rental machine");
    }
});

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "../login.html";
}

(async function init(){
    await loadRentalCustomers();
    await loadMachine();
})();
