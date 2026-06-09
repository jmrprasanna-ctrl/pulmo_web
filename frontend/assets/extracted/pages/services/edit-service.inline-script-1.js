const editServiceFormEl = document.getElementById("editServiceForm");
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
const commentTextEl = document.getElementById("commentText");
const commentWrapEl = document.getElementById("commentWrap");
const machineHelpTextEl = document.getElementById("machineHelpText");
const saveServiceBtn = document.getElementById("saveServiceBtn");
const deleteServiceBtn = document.getElementById("deleteServiceBtn");

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
const COMMENT_SPARE_SET = new Set(["copier", "printer", "other"]);

const rawRole = String(localStorage.getItem("role") || "").toLowerCase();
const role = ["coordinator", "cordinator", "co-ordinator", "co ordinator", "co_ordinator"].includes(rawRole) ? "user" : rawRole;
const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const canManage = role === "admin" || role === "manager" || isTrainingUser;
const canEditService = canManage
    ? true
    : (role === "user"
        ? (typeof hasUserActionPermission === "function"
            ? (
                hasUserActionPermission("/services/service-list.html", "edit")
                || hasUserActionPermission("/services/edit-service.html", "edit")
            )
            : false)
        : false);
const canDeleteService = canManage
    ? true
    : (role === "user"
        ? (typeof hasUserActionPermission === "function"
            ? (
                hasUserActionPermission("/services/edit-service.html", "delete")
                || hasUserActionPermission("/services/service-list.html", "delete")
            )
            : false)
        : false);

const serviceId = Number.parseInt(new URLSearchParams(window.location.search).get("id"), 10);
if (!Number.isFinite(serviceId) || serviceId <= 0) {
    alert("Invalid visit id.");
    window.location.href = "service-list.html";
    throw new Error("Invalid visit id.");
}

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

function updateCommentVisibility() {
    if (commentWrapEl) {
        commentWrapEl.style.display = "";
    }
    if (commentTextEl) {
        commentTextEl.disabled = !canEditService;
    }
}

function updateModeVisibility() {
    const serviceType = normalizeServiceType(serviceTypeEl.value);
    const isGeneral = serviceType === "general";
    if (serviceModeWrapEl) {
        serviceModeWrapEl.style.display = isGeneral ? "" : "none";
    }
    if (serviceModeEl) {
        serviceModeEl.disabled = !isGeneral || !canEditService;
        if (isGeneral) {
            serviceModeEl.value = normalizeServiceMode(serviceModeEl.value) || "service";
        } else {
            serviceModeEl.value = "";
        }
    }
}

function setMachineOptions(rows, preferredMachineId = 0) {
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

    if (preferredMachineId) {
        const preferred = String(preferredMachineId);
        const exists = Array.from(machineIdEl.options).some((opt) => opt.value === preferred);
        machineIdEl.value = exists ? preferred : "";
    }
}

function setCustomerOptions(preferredCustomerId = 0) {
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

    if (preferredCustomerId) {
        const preferred = String(preferredCustomerId);
        const exists = Array.from(customerIdEl.options).some((opt) => opt.value === preferred);
        customerIdEl.value = exists ? preferred : "";
    }
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

function setTechnicianSelection(preferredTechnicianId = 0, preferredTechnicianName = "") {
    const normalizedId = Number(preferredTechnicianId || 0);
    const matched = technicianRows.find((row) => Number(row.id || 0) === normalizedId) || null;
    if (matched) {
        technicianSearchEl.value = formatTechnicianLabel(matched);
        technicianUserIdEl.value = String(Number(matched.id || 0));
        return;
    }
    technicianSearchEl.value = String(preferredTechnicianName || "").trim();
    technicianUserIdEl.value = normalizedId > 0 ? String(normalizedId) : "";
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

async function refreshMachineOptions(preferredMachineId = 0) {
    const customerId = selectedCustomerId();
    if (!customerId) {
        setMachineOptions([], 0);
        setMachineHint("Select customer first.");
        return;
    }

    const serviceType = normalizeServiceType(serviceTypeEl.value);
    try {
        const rows = await fetchMachinesByType(serviceType);
        const filteredRows = rows.filter((row) => Number(row.customer_id) === customerId);
        setMachineOptions(filteredRows, preferredMachineId);
        if (!filteredRows.length) {
            setMachineHint("No machines found for selected customer.");
        } else {
            setMachineHint(`${filteredRows.length} machine(s) available.`);
        }
    } catch (_err) {
        setMachineOptions([], 0);
        setMachineHint("Failed to load machines.");
    }
}

async function loadCustomers() {
    try {
        const rows = await request("/customers", "GET");
        customerRows = Array.isArray(rows) ? rows : [];
    } catch (_err) {
        customerRows = [];
    }
}

async function loadTechnicians() {
    try {
        const rows = await request("/users/assignable", "GET");
        const filtered = (Array.isArray(rows) ? rows : [])
            .filter((row) => !row?.is_directory_mapped_user)
            .filter((row) => isTechnicianDepartment(row?.department))
            .sort((left, right) => formatTechnicianLabel(left).localeCompare(formatTechnicianLabel(right)));
        setTechnicianOptions(filtered);
    } catch (_err) {
        setTechnicianOptions([]);
        setTechnicianHint("Failed to load technician users.");
    }
}

function applyPermissionState() {
    if (saveServiceBtn && !canEditService) {
        saveServiceBtn.style.display = "none";
    }
    if (deleteServiceBtn && !canDeleteService) {
        deleteServiceBtn.style.display = "none";
    }
    if (!canEditService) {
        [serviceDateEl, serviceTypeEl, serviceModeEl, customerIdEl, machineIdEl, technicianSearchEl, serviceSpareEl, counterValueEl, commentTextEl].forEach((el) => {
            if (el) el.disabled = true;
        });
    }
}

async function loadServiceEntry() {
    const row = await request(`/services/${serviceId}`, "GET");
    serviceDateEl.value = String(row.service_date || "").slice(0, 10);
    serviceTypeEl.value = normalizeServiceType(row.service_type);
    serviceModeEl.value = normalizeServiceMode(row.service_mode) || "service";
    serviceSpareEl.value = normalizeServiceSpare(row.service_spare);
    counterValueEl.value = String(row.counter_value || "");
    commentTextEl.value = String(row.comment_text || "");
    setTechnicianSelection(Number(row.technician_user_id || 0), String(row.technician_name || ""));

    setCustomerOptions(Number(row.customer_id || 0));
    await refreshMachineOptions(Number(row.machine_ref_id || 0));
    updateModeVisibility();
    updateCommentVisibility();
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
    updateCommentVisibility();
});

technicianSearchEl?.addEventListener("input", () => {
    syncTechnicianSelection();
});

technicianSearchEl?.addEventListener("change", () => {
    syncTechnicianSelection();
});

editServiceFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canEditService) return;

    const service_date = String(serviceDateEl.value || "").trim();
    const service_type = normalizeServiceType(serviceTypeEl.value);
    const service_mode = service_type === "general" ? normalizeServiceMode(serviceModeEl.value) : "";
    const customer_id = selectedCustomerId();
    const machine_ref_id = Number.parseInt(machineIdEl.value, 10);
    const technician_user_id = selectedTechnicianId();
    const service_spare = normalizeServiceSpare(serviceSpareEl?.value);
    const counter_value = String(counterValueEl.value || "").trim();
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
        counter_value,
        comment_text,
    };

    try {
        await request(`/services/${serviceId}`, "PUT", payload);
        showMessageBox("Visit updated successfully.");
        setTimeout(() => {
            window.location.href = "service-list.html";
        }, 500);
    } catch (err) {
        alert(err.message || "Failed to update visit.");
    }
});

deleteServiceBtn?.addEventListener("click", async () => {
    if (!canDeleteService) return;
    if (!confirm("Delete this visit entry?")) return;

    try {
        await request(`/services/${serviceId}`, "DELETE");
        showMessageBox("Visit deleted successfully.");
        setTimeout(() => {
            window.location.href = "service-list.html";
        }, 500);
    } catch (err) {
        alert(err.message || "Failed to delete visit.");
    }
});

(async () => {
    if (!canEditService && !canDeleteService) {
        alert("You do not have permission to access this page.");
        window.location.href = "service-list.html";
        return;
    }
    applyPermissionState();
    updateModeVisibility();
    updateCommentVisibility();
    await Promise.all([loadCustomers(), loadTechnicians()]);
    try {
        await loadServiceEntry();
    } catch (err) {
        alert(err.message || "Failed to load visit entry.");
        window.location.href = "service-list.html";
    }
})();
