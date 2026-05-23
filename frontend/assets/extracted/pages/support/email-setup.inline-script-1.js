const DEFAULT_COMPANY_NAME = "PULMO TECHNOLOGIES";
const DEFAULT_MAPPED_DB = "inventory";
let isLoadingMappedSetup = false;

function getRole() {
    return (localStorage.getItem("role") || "").toLowerCase();
}

function canManageEmailSetup() {
    const role = getRole();
    if (role === "admin" || role === "manager") return true;
    if (role === "user") {
        if (typeof window.hasUserGrantedPath === "function") {
            return window.hasUserGrantedPath("/support/email-setup.html");
        }
        return true;
    }
    return false;
}

function normalizeDbName(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeCompanyName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || DEFAULT_COMPANY_NAME;
}

function getMappedDatabaseSelect() {
    return document.getElementById("mappedDatabaseSelect");
}

function getMappedOptions(setup) {
    const list = Array.isArray(setup?.mapped_options) ? setup.mapped_options : [];
    const normalized = list
        .map((item) => ({
            database_name: normalizeDbName(item?.database_name),
            company_name: normalizeCompanyName(item?.company_name),
            email: normalizeEmail(item?.email),
        }))
        .filter((item) => !!item.database_name);
    const hasInventory = normalized.some((item) => item.database_name === DEFAULT_MAPPED_DB);
    if (!hasInventory) {
        normalized.unshift({
            database_name: DEFAULT_MAPPED_DB,
            company_name: DEFAULT_COMPANY_NAME,
            email: "pulmotechnoogies@gmail.com",
        });
    }
    return normalized;
}

function getSelectedMappedOption(setup) {
    const selectEl = getMappedDatabaseSelect();
    const mappedOptions = getMappedOptions(setup);
    const selectedDb = normalizeDbName(selectEl?.value || setup?.mapped_database_name || DEFAULT_MAPPED_DB);
    return mappedOptions.find((item) => item.database_name === selectedDb) || mappedOptions[0] || {
        database_name: DEFAULT_MAPPED_DB,
        company_name: DEFAULT_COMPANY_NAME,
        email: "pulmotechnoogies@gmail.com",
    };
}

function buildCompanySubject(subjectRaw, companyName) {
    const company = normalizeCompanyName(companyName);
    const subject = String(subjectRaw || "").trim();
    if (!subject) {
        return `Invoice {{invoice_no}} - ${company}`;
    }
    const parts = subject.split(" - ");
    if (parts.length >= 2) {
        const tail = String(parts[parts.length - 1] || "").trim();
        if (tail && !/\{\{[^}]+\}\}/.test(tail)) {
            parts[parts.length - 1] = company;
            return parts.join(" - ");
        }
    }
    if (subject.toLowerCase().includes(company.toLowerCase())) {
        return subject;
    }
    return `${subject} - ${company}`;
}

function refreshMappedHint(setup) {
    const hintEl = document.getElementById("mappedDefaultsHint");
    if (!hintEl) return;
    const selected = getSelectedMappedOption(setup);
    hintEl.textContent = `Mapped Company: ${selected.company_name || "-"} | Mapped Email: ${selected.email || "-"}`;
}

function fillMappedDatabaseSelect(setup) {
    const selectEl = getMappedDatabaseSelect();
    if (!selectEl) return;
    const mappedOptions = getMappedOptions(setup);
    selectEl.innerHTML = "";
    mappedOptions.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.database_name;
        opt.textContent = `${item.company_name} (${item.database_name})`;
        selectEl.appendChild(opt);
    });
    const preferredDb = normalizeDbName(setup?.mapped_database_name || setup?.database_name || DEFAULT_MAPPED_DB);
    if (mappedOptions.some((item) => item.database_name === preferredDb)) {
        selectEl.value = preferredDb;
    } else if (mappedOptions.length) {
        selectEl.value = mappedOptions[0].database_name;
    }
}

function applyMappedSelectionToBranding(setup, options = {}) {
    const selected = getSelectedMappedOption(setup);
    const companyName = normalizeCompanyName(selected.company_name);
    const companyEmail = normalizeEmail(selected.email);
    const fromNameEl = document.getElementById("from_name");
    const fromEmailEl = document.getElementById("from_email");
    const smtpUserEl = document.getElementById("smtp_user");
    const subjectEl = document.getElementById("subject_template");

    if (fromNameEl) fromNameEl.value = companyName;
    if (companyEmail) {
        if (fromEmailEl) fromEmailEl.value = companyEmail;
        if (smtpUserEl) smtpUserEl.value = companyEmail;
    }
    if (!options.keepSubject && subjectEl) {
        subjectEl.value = buildCompanySubject(subjectEl.value, companyName);
    }
    refreshMappedHint(setup);
}

function setForm(setup) {
    fillMappedDatabaseSelect(setup || {});
    document.getElementById("smtp_host").value = setup.smtp_host || "";
    document.getElementById("smtp_port").value = setup.smtp_port || 587;
    document.getElementById("smtp_user").value = setup.smtp_user || "";
    document.getElementById("smtp_pass").value = "";
    const hasPass = !!setup.has_smtp_pass;
    document.getElementById("smtpPassState").textContent = `Saved Password: ${hasPass ? "Yes" : "No"}`;
    document.getElementById("smtp_secure").checked = !!setup.smtp_secure;
    document.getElementById("from_name").value = setup.from_name || DEFAULT_COMPANY_NAME;
    document.getElementById("from_email").value = setup.from_email || "";
    document.getElementById("subject_template").value = setup.subject_template || `Invoice {{invoice_no}} - ${DEFAULT_COMPANY_NAME}`;
    document.getElementById("body_template").value = setup.body_template || `Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\n${DEFAULT_COMPANY_NAME}`;
    applyMappedSelectionToBranding(setup || {}, { keepSubject: false });
}

function applyTemplateByType() {
    const typeEl = document.getElementById("emailTemplateType");
    const subjectEl = document.getElementById("subject_template");
    const bodyEl = document.getElementById("body_template");
    if (!typeEl || !subjectEl || !bodyEl) return;

    const setup = window.__emailSetupData || {};
    const selectedMapped = getSelectedMappedOption(setup);
    const companyName = normalizeCompanyName(selectedMapped.company_name);
    const selectedType = String(typeEl.value || "").trim();

    if (selectedType === "frogot_password") {
        subjectEl.value = `Password Recovery - ${companyName}`;
        bodyEl.value = `Dear {{user_name}},\n\nYour email was matched successfully.\n\nEmail: {{email}}\nPassword: {{password}}\n\n${companyName}`;
        return;
    }
    if (selectedType === "quatation") {
        subjectEl.value = `Quatation {{quotation_no}} - ${companyName}`;
        bodyEl.value = `Dear {{customer_name}},\n\nPlease find attached your quatation {{quotation_no}}.\n\nTotal Amount: {{quotation_amount}}\nDate: {{quotation_date}}\n\nThank you.\n${companyName}`;
        return;
    }
    if (selectedType === "invoice") {
        subjectEl.value = `Invoice {{invoice_no}} - ${companyName}`;
        bodyEl.value = `Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nTotal Amount: {{total_amount}}\nDate: {{invoice_date}}\n\nThank you.\n${companyName}`;
        return;
    }
    if (selectedType === "support_technician") {
        subjectEl.value = `Support Technician Payment Detail - ${companyName}`;
        bodyEl.value = `Dear {{customer_name}},\n\nPlease find attached support technician payment details for invoice {{invoice_no}}.\n\nTotal Amount: {{total_amount}}\nDate: {{invoice_date}}\n\nThank you.\n${companyName}`;
        return;
    }
    if (selectedType === "vender") {
        subjectEl.value = `Vender Stock Report - ${companyName}`;
        bodyEl.value = `Dear {{customer_name}},\n\nPlease find attached vender stock report.\n\nReference: {{invoice_no}}\nDate: {{invoice_date}}\n\nThank you.\n${companyName}`;
    }
}

async function loadSetup(mappedDatabaseName) {
    try {
        const normalizedDb = normalizeDbName(mappedDatabaseName || "");
        const path = normalizedDb
            ? `/email-setup?mapped_database_name=${encodeURIComponent(normalizedDb)}`
            : "/email-setup";
        isLoadingMappedSetup = true;
        const setup = await request(path, "GET");
        window.__emailSetupData = setup || {};
        setForm(window.__emailSetupData);
    } catch (err) {
        alert(err.message || "Failed to load email setup");
    } finally {
        isLoadingMappedSetup = false;
    }
}

window.addEventListener("DOMContentLoaded", () => {
    if (!canManageEmailSetup()) {
        alert("Access denied.");
        window.location.href = "support.html";
        return;
    }

    window.__emailSetupData = window.__emailSetupData || {};

    const form = document.getElementById("emailSetupForm");
    const templateTypeEl = document.getElementById("emailTemplateType");
    const mappedDbSelect = getMappedDatabaseSelect();

    if (templateTypeEl) {
        templateTypeEl.addEventListener("change", applyTemplateByType);
    }
    if (mappedDbSelect) {
        mappedDbSelect.addEventListener("change", async () => {
            if (isLoadingMappedSetup) return;
            const selectedDb = normalizeDbName(mappedDbSelect.value || "");
            if (!selectedDb) return;
            await loadSetup(selectedDb);
        });
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const selectedMapped = getSelectedMappedOption(window.__emailSetupData || {});
        const payload = {
            mapped_database_name: selectedMapped.database_name || DEFAULT_MAPPED_DB,
            smtp_host: document.getElementById("smtp_host").value.trim(),
            smtp_port: Number(document.getElementById("smtp_port").value || 587),
            smtp_user: document.getElementById("smtp_user").value.trim(),
            smtp_pass: document.getElementById("smtp_pass").value.trim(),
            smtp_secure: !!document.getElementById("smtp_secure").checked,
            from_name: document.getElementById("from_name").value.trim(),
            from_email: document.getElementById("from_email").value.trim(),
            subject_template: document.getElementById("subject_template").value.trim(),
            body_template: document.getElementById("body_template").value,
        };

        if (!payload.smtp_host || !payload.smtp_user) {
            alert("SMTP Host and SMTP User are required.");
            return;
        }
        const hasSavedPassword = /yes$/i.test(String(document.getElementById("smtpPassState").textContent || "").trim());
        if (!payload.smtp_pass && !hasSavedPassword) {
            alert("Please enter SMTP Password (no saved password found).");
            return;
        }
        if (!payload.smtp_pass && hasSavedPassword) {
            const proceed = confirm("SMTP Password is empty. App will keep the existing saved password. Continue?");
            if (!proceed) return;
        }

        try {
            const res = await request("/email-setup", "POST", payload);
            showMessageBox("Email setup saved");
            document.getElementById("smtp_pass").value = "";
            if (res && res.setup) {
                window.__emailSetupData = res.setup;
                setForm(res.setup);
            }
        } catch (err) {
            alert(err.message || "Failed to save email setup");
        }
    });

    loadSetup();
});
