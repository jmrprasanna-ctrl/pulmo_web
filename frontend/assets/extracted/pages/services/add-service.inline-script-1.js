const addServiceFormEl = document.getElementById("addServiceForm");
const serviceDateEl = document.getElementById("serviceDate");
const serviceTypeEl = document.getElementById("serviceType");
const serviceModeWrapEl = document.getElementById("serviceModeWrap");
const serviceModeEl = document.getElementById("serviceMode");
const customerIdEl = document.getElementById("customerId");
const machineIdEl = document.getElementById("machineId");
const technicianSearchEl = document.getElementById("technicianSearch");
const technicianOptionsEl = document.getElementById("technicianOptions");
const technicianUserIdEl = document.getElementById("technicianUserId");
const technicianHelpTextEl = document.getElementById("technicianHelpText");
const serviceSpareEl = document.getElementById("serviceSpare");
const counterValueEl = document.getElementById("counterValue");
const noteTextEl = document.getElementById("noteText");
const noteWrapEl = document.getElementById("noteWrap");
const commentTextEl = document.getElementById("commentText");
const machineHelpTextEl = document.getElementById("machineHelpText");
const servicePageTitleEl = document.getElementById("servicePageTitle");
const serviceBackLinkEl = document.getElementById("serviceBackLink");
const saveServiceBtn = document.getElementById("saveServiceBtn");

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
const requestedMode = normalizeServiceMode(new URLSearchParams(window.location.search).get("mode"));
const addServiceRawRole = String(localStorage.getItem("role") || "").toLowerCase();
const addServiceRole = ["coordinator", "cordinator", "co-ordinator", "co ordinator", "co_ordinator"].includes(addServiceRawRole) ? "user" : addServiceRawRole;
const addServiceSelectedDb = String(localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const addServiceIsTrainingUser = addServiceRole === "user" && addServiceSelectedDb === "demo";
const addServiceCanManage = addServiceRole === "admin" || addServiceRole === "manager" || addServiceIsTrainingUser;
const canCreateService = addServiceCanManage
    ? true
    : (addServiceRole === "user"
        ? (typeof hasUserActionPermission === "function"
            ? (
                hasUserActionPermission("/services/service-list.html", "add")
                || hasUserActionPermission("/services/breakdown-list.html", "add")
                || hasUserActionPermission("/services/add-service.html", "add")
            )
            : false)
        : false);

let customerRows = [];
let technicianRows = [];
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

function resolveServiceReturnPage(serviceType, serviceMode) {
    return normalizeServiceType(serviceType) === "general" && normalizeServiceMode(serviceMode) === "breakdown"
        ? "breakdown-list.html"
        : "service-list.html";
}

function buildServiceReturnUrl(serviceType, serviceMode, createdRow = null) {
    const returnPage = resolveServiceReturnPage(serviceType, serviceMode);
    if (returnPage !== "breakdown-list.html") {
        return returnPage;
    }

    const params = new URLSearchParams();
    const rowId = Number.parseInt(createdRow?.id, 10);
    const rowDate = String(createdRow?.service_date || serviceDateEl?.value || "").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(rowDate)) {
        params.set("month", rowDate.slice(0, 7));
    }
    if (Number.isFinite(rowId) && rowId > 0) {
        params.set("highlight", String(rowId));
    }

    const query = params.toString();
    return query ? `${returnPage}?${query}` : returnPage;
}

function applyAddPageContext() {
    const returnPage = resolveServiceReturnPage(serviceTypeEl?.value, serviceModeEl?.value);
    const isBreakdown = returnPage === "breakdown-list.html";
    const pageTitle = isBreakdown ? "Create Breakdown" : "Add Visit";
    const backLabel = isBreakdown ? "Back to breakdown page" : "Back to customer visits";

    if (servicePageTitleEl) {
        servicePageTitleEl.innerText = pageTitle;
    }
    document.title = `${pageTitle} - AXIS CMS SYSTEM`;
    if (serviceBackLinkEl) {
        serviceBackLinkEl.href = returnPage;
        serviceBackLinkEl.setAttribute("aria-label", backLabel);
        serviceBackLinkEl.setAttribute("title", backLabel);
    }
}

function normalizeDepartmentToken(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z]+/g, "");
}

function isTechnicianDepartment(value) {
    const token = normalizeDepartmentToken(value);
    return token === "technician" || token === "tech";
}

function formatTechnicianLabel(row) {
    const id = Number(row?.id || 0);
    const username = String(row?.username || "").trim();
    const email = String(row?.email || "").trim();
    const base = username || email || `User #${id}`;
    if (email && email.toLowerCase() !== base.toLowerCase()) {
        return `${base} (${email})`;
    }
    return base;
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
    applyAddPageContext();
}

function selectedCustomerId() {
    const id = Number.parseInt(customerIdEl.value, 10);
    return Number.isFinite(id) && id > 0 ? id : 0;
}

function selectedTechnicianId() {
    const id = Number.parseInt(technicianUserIdEl?.value, 10);
    return Number.isFinite(id) && id > 0 ? id : 0;
}

function setMachineHint(message) {
    machineHelpTextEl.textContent = message;
}

function setTechnicianHint(message) {
    if (technicianHelpTextEl) {
        technicianHelpTextEl.textContent = message;
    }
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

function setTechnicianOptions(rows) {
    technicianRows = Array.isArray(rows) ? rows : [];
    if (technicianOptionsEl) {
        technicianOptionsEl.innerHTML = "";
        technicianRows.forEach((row) => {
            const option = document.createElement("option");
            option.value = formatTechnicianLabel(row);
            technicianOptionsEl.appendChild(option);
        });
    }
    setTechnicianHint(technicianRows.length ? `${technicianRows.length} technician user(s) available.` : "No technician users found.");
}

function syncTechnicianSelection() {
    const rawValue = String(technicianSearchEl?.value || "").trim().toLowerCase();
    const matched = technicianRows.find((row) => formatTechnicianLabel(row).trim().toLowerCase() === rawValue);
    if (technicianUserIdEl) {
        technicianUserIdEl.value = matched ? String(Number(matched.id || 0)) : "";
    }
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
        const [customers, users] = await Promise.all([
            request("/customers", "GET"),
            request("/users/assignable", "GET"),
        ]);
        customerRows = Array.isArray(customers) ? customers : [];
        setCustomerOptions();
        const filteredTechnicians = (Array.isArray(users) ? users : [])
            .filter((row) => !row?.is_directory_mapped_user)
            .filter((row) => isTechnicianDepartment(row?.department))
            .sort((left, right) => formatTechnicianLabel(left).localeCompare(formatTechnicianLabel(right)));
        setTechnicianOptions(filteredTechnicians);
    } catch (_err) {
        customerIdEl.innerHTML = `<option value="">Failed to load customers</option>`;
        setMachineHint("Failed to load customers.");
        setTechnicianOptions([]);
        setTechnicianHint("Failed to load technician users.");
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

technicianSearchEl?.addEventListener("input", () => {
    syncTechnicianSelection();
});

technicianSearchEl?.addEventListener("change", () => {
    syncTechnicianSelection();
});

serviceModeEl?.addEventListener("change", () => {
    applyAddPageContext();
});

addServiceFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canCreateService) {
        alert("You do not have permission to create this entry.");
        return;
    }

    const service_date = String(serviceDateEl.value || "").trim();
    const service_type = normalizeServiceType(serviceTypeEl.value);
    const service_mode = service_type === "general" ? normalizeServiceMode(serviceModeEl?.value) : "";
    const customer_id = selectedCustomerId();
    const machine_ref_id = Number.parseInt(machineIdEl.value, 10);
    const technician_user_id = selectedTechnicianId();
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
    if (String(technicianSearchEl?.value || "").trim() && !technician_user_id) {
        alert("Please select a valid technician from the list.");
        return;
    }

    const payload = {
        service_date,
        service_type,
        service_mode,
        customer_id,
        machine_ref_id,
        technician_user_id: technician_user_id || null,
        service_spare,
        service_note,
        counter_value,
        comment_text,
    };

    try {
        const createdRow = await request("/services", "POST", payload);
        showMessageBox(resolveServiceReturnPage(service_type, service_mode) === "breakdown-list.html"
            ? "Breakdown created successfully."
            : "Visit added successfully.");
        const nextPage = buildServiceReturnUrl(service_type, service_mode, createdRow);
        setTimeout(() => {
            window.location.href = nextPage;
        }, 500);
    } catch (err) {
        alert(err.message || "Failed to add service.");
    }
});

if (requestedMode === "breakdown") {
    serviceTypeEl.value = "general";
    serviceModeEl.value = "breakdown";
}

if (saveServiceBtn && !canCreateService) {
    saveServiceBtn.style.display = "none";
}

updateModeVisibility();
updateNoteVisibility();
loadInitialData();
