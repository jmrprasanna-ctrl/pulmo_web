if(!localStorage.getItem("token")){
    window.location.href = "../login.html";
}

const role = (localStorage.getItem("role") || "").toLowerCase();

let generalCustomers = [];
const defaultPhotocopierModels = ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"];

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

["machineId", "machineTitle", "serialNo"].forEach(forceUppercaseInput);

async function generateMachineId(){
    try{
        const last = await request("/general-machines/last-id", "GET");
        const lastCode = last && last.machine_id ? String(last.machine_id).toUpperCase() : "";
        const lastNumber = lastCode.startsWith("GTR") ? parseInt(lastCode.slice(3), 10) : 0;
        const nextNumber = Number.isNaN(lastNumber) ? 1 : lastNumber + 1;
        document.getElementById("machineId").value = "GTR" + String(nextNumber).padStart(4, "0");
    }catch(_err){
        document.getElementById("machineId").value = "GTR0001";
    }
}

function fillAddressFromCustomer(){
    const customerId = Number(document.getElementById("customerId").value);
    const selected = generalCustomers.find(c => Number(c.id) === customerId);
    document.getElementById("address").value = selected ? (selected.address || "") : "";
}

function setDefaultEntryDate(){
    const entryDateEl = document.getElementById("entryDate");
    if(!entryDateEl) return;
    entryDateEl.value = new Date().toISOString().slice(0, 10);
}

async function loadGeneralCustomers(){
    try{
        const customers = await request("/customers", "GET");
        generalCustomers = customers
            .filter(c => String(c.customer_mode || "").toLowerCase() === "general")
            .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" }));

        const customerSelect = document.getElementById("customerId");
        customerSelect.innerHTML = "<option value=''>Select General Customer</option>";

        generalCustomers.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.innerText = c.name;
            customerSelect.appendChild(opt);
        });

        if(!generalCustomers.length){
            const opt = document.createElement("option");
            opt.value = "";
            opt.innerText = "No General customers found";
            customerSelect.appendChild(opt);
        }
    }catch(err){
        alert(err.message || "Failed to load customers");
    }
}

async function loadPhotocopierModels(){
    const modelSelect = document.getElementById("model");
    if(!modelSelect) return;
    modelSelect.innerHTML = "<option value=''>Select Photocopier Model</option>";

    try{
        let models = [];
        try{
            const rows = await request("/category-model-options?category=Photocopier", "GET");
            models = Array.from(new Set(
                (Array.isArray(rows) ? rows : [])
                    .map((row) => String(row.model_name || "").trim().toUpperCase())
                    .filter(Boolean)
            )).sort((a, b) => a.localeCompare(b));
        }catch(_err){
            models = [];
        }

        if(!models.length){
            const products = await request("/products", "GET");
            models = Array.from(new Set(
                (Array.isArray(products) ? products : [])
                    .filter((p) => {
                        const categoryName = String((p.Category && p.Category.name) || p.category || "").trim().toLowerCase();
                        return categoryName === "photocopier";
                    })
                    .map((p) => String(p.model || "").trim().toUpperCase())
                    .filter(Boolean)
            )).sort((a, b) => a.localeCompare(b));
        }

        if(!models.length){
            models = defaultPhotocopierModels.slice();
        }

        models.forEach((model) => {
            const opt = document.createElement("option");
            opt.value = model;
            opt.innerText = model;
            modelSelect.appendChild(opt);
        });
    }catch(_err){
        modelSelect.innerHTML = "<option value=''>Failed to load models</option>";
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
        await request("/general-machines", "POST", payload);
        showMessageBox("General machine saved successfully");
        document.getElementById("generalMachineForm").reset();
        setDefaultEntryDate();
        await generateMachineId();
        await loadGeneralCustomers();
        await loadPhotocopierModels();
    }catch(err){
        alert(err.message || "Failed to save general machine");
    }
});

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "../login.html";
}

generateMachineId();
loadGeneralCustomers();
loadPhotocopierModels();
setDefaultEntryDate();
