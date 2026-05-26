const addServiceFormEl = document.getElementById("addServiceForm");
const serviceDateEl = document.getElementById("serviceDate");
const serviceTypeEl = document.getElementById("serviceType");
const serviceModeWrapEl = document.getElementById("serviceModeWrap");
const serviceModeEl = document.getElementById("serviceMode");
const customerIdEl = document.getElementById("customerId");
const machineIdEl = document.getElementById("machineId");
const serviceSpareEl = document.getElementById("serviceSpare");
const counterValueEl = document.getElementById("counterValue");
const noteTextEl = document.getElementById("noteText");
const noteWrapEl = document.getElementById("noteWrap");
const commentTextEl = document.getElementById("commentText");
const machineHelpTextEl = document.getElementById("machineHelpText");

const SPARE_OPTIONS = [
    "Copier",
    "Printer",
    "Drum Assembly",
    "Developer assembly",
    "CIS",
    "Laser Assembly",
    "M/Board",
    "P/Board",
    "Drum OPC",
    "Cleaning Blade",
    "Developer Rollor",
    "Developer",
    "Pickup Rollor",
    "S/Pad",
    "Other",
];
const SPARE_LOOKUP = Object.fromEntries(SPARE_OPTIONS.map((label) => [String(label).toLowerCase(), label]));
const NOTE_SPARE_SET = new Set(["copier", "printer", "other"]);

const today = new Date();
serviceDateEl.value = today.toISOString().slice(0, 10);

let customerRows = [];
const machineCache = {
    general: null,
    rental: null,
};

function normalizeServiceType(value) {
    const raw = String(value || "").trim().toLowerCase();
    return raw === "rental" ? "rental" : "general";
}

function normalizeServiceMode(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "breakdown" || raw === "service") return raw;
    return "";
}

function normalizeServiceSpare(value) {
    const raw = String(value || "").trim().toLowerCase();
    return raw && SPARE_LOOKUP[raw] ? SPARE_LOOKUP[raw] : "";
}

function updateNoteVisibility() {
    const spare = normalizeServiceSpare(serviceSpareEl?.value);
    const shouldShow = NOTE_SPARE_SET.has(String(spare || "").toLowerCase());
    if (noteWrapEl) {
        noteWrapEl.style.display = shouldShow ? "" : "none";
    }
    if (noteTextEl) {
        noteTextEl.disabled = !shouldShow;
        if (!shouldShow) {
            noteTextEl.value = "";
        }
    }
}

function updateModeVisibility() {
    const serviceType = normalizeServiceType(serviceTypeEl.value);
    const isGeneral = serviceType === "general";
    if (serviceModeWrapEl) {
        serviceModeWrapEl.style.display = isGeneral ? "" : "none";
    }
    if (serviceModeEl) {
        serviceModeEl.disabled = !isGeneral;
        if (isGeneral) {
            const normalized = normalizeServiceMode(serviceModeEl.value);
            serviceModeEl.value = normalized || "service";
        } else {
            serviceModeEl.value = "";
        }
    }
}

function selectedCustomerId() {
    const id = Number.parseInt(customerIdEl.value, 10);
    return Number.isFinite(id) && id > 0 ? id : 0;
}

function setMachineHint(message) {
    machineHelpTextEl.textContent = message;
}

function setMachineOptions(rows) {
    machineIdEl.innerHTML = `<option value="">Select Machine</option>`;
    rows.forEach((row) => {
        const machineId = Number(row.id);
        if (!Number.isFinite(machineId) || machineId <= 0) return;

        const option = document.createElement("option");
        option.value = String(machineId);
        const machineCode = String(row.machine_id || "").trim();
        const machineTitle = String(row.machine_title || "").trim();
        option.textContent = [machineCode, machineTitle].filter(Boolean).join(" - ") || `Machine #${machineId}`;
        machineIdEl.appendChild(option);
    });
}

function setCustomerOptions() {
    const serviceType = normalizeServiceType(serviceTypeEl.value);
    const filteredCustomers = (Array.isArray(customerRows) ? customerRows : [])
        .filter((row) => String(row.customer_mode || "").trim().toLowerCase() === serviceType)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    customerIdEl.innerHTML = `<option value="">Select Customer</option>`;
    filteredCustomers.forEach((row) => {
        const id = Number(row.id);
        if (!Number.isFinite(id) || id <= 0) return;

        const option = document.createElement("option");
        option.value = String(id);
        option.textContent = String(row.name || "").trim() || `Customer #${id}`;
        customerIdEl.appendChild(option);
    });

    machineIdEl.innerHTML = `<option value="">Select Machine</option>`;
    setMachineHint("Select customer first.");
}

async function fetchMachinesByType(serviceType) {
    if (serviceType === "rental") {
        if (!Array.isArray(machineCache.rental)) {
            const rows = await request("/rental-machines", "GET");
            machineCache.rental = Array.isArray(rows) ? rows : [];
        }
        return machineCache.rental;
    }

    if (!Array.isArray(machineCache.general)) {
        const rows = await request("/general-machines", "GET");
        machineCache.general = Array.isArray(rows) ? rows : [];
    }
    return machineCache.general;
}

async function refreshMachineOptions() {
    const customerId = selectedCustomerId();
    if (!customerId) {
        setMachineOptions([]);
        setMachineHint("Select customer first.");
        return;
    }

    const serviceType = normalizeServiceType(serviceTypeEl.value);
    try {
        const rows = await fetchMachinesByType(serviceType);
        const filteredRows = rows.filter((row) => Number(row.customer_id) === customerId);
        setMachineOptions(filteredRows);
        if (!filteredRows.length) {
            setMachineHint("No machines found for selected customer.");
        } else {
            setMachineHint(`${filteredRows.length} machine(s) available.`);
        }
    } catch (_err) {
        setMachineOptions([]);
        setMachineHint("Failed to load machines.");
    }
}

async function loadInitialData() {
    try {
        const rows = await request("/customers", "GET");
        customerRows = Array.isArray(rows) ? rows : [];
        setCustomerOptions();
    } catch (_err) {
        customerIdEl.innerHTML = `<option value="">Failed to load customers</option>`;
        setMachineHint("Failed to load customers.");
    }
}

serviceTypeEl.addEventListener("change", async () => {
    updateModeVisibility();
    setCustomerOptions();
    await refreshMachineOptions();
});

customerIdEl.addEventListener("change", async () => {
    await refreshMachineOptions();
});

serviceSpareEl?.addEventListener("change", () => {
    updateNoteVisibility();
});

addServiceFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    const service_date = String(serviceDateEl.value || "").trim();
    const service_type = normalizeServiceType(serviceTypeEl.value);
    const service_mode = service_type === "general" ? normalizeServiceMode(serviceModeEl?.value) : "";
    const customer_id = selectedCustomerId();
    const machine_ref_id = Number.parseInt(machineIdEl.value, 10);
    const service_spare = normalizeServiceSpare(serviceSpareEl?.value);
    const counter_value = String(counterValueEl.value || "").trim();
    const service_note = String(noteTextEl?.value || "").trim();
    const comment_text = String(commentTextEl.value || "").trim();

    if (!service_date) {
        alert("Service date is required.");
        return;
    }
    if (!customer_id) {
        alert("Please select a customer.");
        return;
    }
    if (service_type === "general" && !service_mode) {
        alert("Please select a mode.");
        return;
    }
    if (!Number.isFinite(machine_ref_id) || machine_ref_id <= 0) {
        alert("Please select a machine.");
        return;
    }
    if (!service_spare) {
        alert("Please select a spare.");
        return;
    }
    if (!counter_value) {
        alert("Counter is required.");
        return;
    }

    const payload = {
        service_date,
        service_type,
        service_mode,
        customer_id,
        machine_ref_id,
        service_spare,
        service_note,
        counter_value,
        comment_text,
    };

    try {
        await request("/services", "POST", payload);
        showMessageBox("Service added successfully.");
        setTimeout(() => {
            window.location.href = "service-list.html";
        }, 500);
    } catch (err) {
        alert(err.message || "Failed to add service.");
    }
});

updateModeVisibility();
updateNoteVisibility();
loadInitialData();
