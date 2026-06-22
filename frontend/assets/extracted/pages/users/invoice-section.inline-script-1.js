(function () {
    const PAGE_PATH = "/users/invoice-section.html";
    const LOGO_STORAGE_KEY = "invoice_logo_with_name_data_url";
    const ADDRESS_STORAGE_KEY = "invoice_selected_address_key";
    const IMPORTANT_STORAGE_KEY = "invoice_default_important_text";
    const byId = (id) => document.getElementById(id);
    const currentRole = String(localStorage.getItem("role") || "").trim().toLowerCase();
    const isAdminRole = currentRole === "admin";
    const currentUserId = Number(localStorage.getItem("userId") || 0);
    const storedUserRef = String(localStorage.getItem("userRef") || "").trim().toLowerCase();

    const mappedDbEl = byId("mappedDatabaseName");
    const targetUserFieldEl = byId("targetUserField");
    const targetUserEl = byId("targetUserSelect");
    const mappingStatusEl = byId("mappingStatusText");
    const saveTargetTextEl = byId("saveTargetText");
    const addressProfileEl = byId("addressProfileSelect");
    const defaultImportantTextEl = byId("defaultImportantText");
    const invoiceTemplateFileNameEl = byId("invoiceTemplateFileNameText");
    const invoiceTemplatePathEl = byId("invoiceTemplatePathText");
    const systemLogoFileNameEl = byId("systemLogoFileNameText");
    const systemLogoPathEl = byId("systemLogoPathText");
    const systemLogoPreviewWrapEl = byId("systemLogoPreviewWrap");
    const logoFileInputEl = byId("invoiceLogoFileInput");
    const logoBrowseBtnEl = byId("invoiceLogoBrowseBtn");
    const logoClearBtnEl = byId("invoiceLogoClearBtn");
    const logoPreviewWrapEl = byId("invoiceLogoPreviewWrap");
    const saveBtnEl = byId("saveInvoiceSectionBtn");

    let canEdit = true;
    let currentDatabaseName = "inventory";
    let currentTargetUserRef = "";
    let currentVisibility = {};
    let currentLayoutState = {};
    let currentLogoDataUrl = "";
    let currentDefaultImportantText = "";
    let currentPreferenceSummary = null;
    let mappedTargetEntries = [];

    function normalizeDatabaseName(value) {
        return String(value || "").trim().toLowerCase();
    }

    function normalizeUserRef(value) {
        return String(value || "").trim().toLowerCase();
    }

    function normalizeAddressKey(value) {
        return String(value || "").trim().toLowerCase() === "colombo" ? "colombo" : "v";
    }

    function normalizeImportantText(value) {
        return String(value || "")
            .replace(/\r/g, "")
            .split("\n")
            .map((line) => String(line || "").trim())
            .filter(Boolean)
            .join("\n")
            .slice(0, 2000);
    }

    function safeObject(value) {
        return value && typeof value === "object" ? value : {};
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function buildDatabaseLabel(databaseName, label) {
        const normalizedDb = normalizeDatabaseName(databaseName);
        const text = String(label || "").trim();
        if (text) return text;
        if (normalizedDb === "inventory") return "SYSTEM DEFAULT (inventory)";
        return normalizedDb || "inventory";
    }

    function buildTargetUserLabel(entry) {
        const username = String(entry?.username || "").trim();
        const email = String(entry?.email || "").trim();
        const safeUserId = Number(entry?.user_id || 0) || 0;
        const namePart = username || email || (safeUserId ? `User ${safeUserId}` : "Mapped User");
        return email && username && email.toLowerCase() !== username.toLowerCase()
            ? `${namePart} (${email})`
            : namePart;
    }

    function getSelfUserRef() {
        if (storedUserRef) return storedUserRef;
        if (currentUserId > 0) {
            return `inventory:${currentUserId}`;
        }
        return "";
    }

    function isSelfTarget() {
        const selfRef = normalizeUserRef(getSelfUserRef());
        return !selfRef || normalizeUserRef(currentTargetUserRef || selfRef) === selfRef;
    }

    function notify(message, type = "success", duration = 2600) {
        const text = String(message || "").trim();
        if (!text) return;
        if (typeof window.showMessageBox === "function") {
            window.showMessageBox(text, type, duration);
            return;
        }
        if (type === "error") {
            alert(text);
        } else {
            console.log(text);
        }
    }

    function setBusy(buttonEl, busy) {
        if (!buttonEl) return;
        buttonEl.disabled = !!busy;
        buttonEl.style.opacity = busy ? "0.65" : "";
    }

    function setText(el, value) {
        if (!el) return;
        el.textContent = value || "-";
    }

    function getSelectedTargetOptionLabel() {
        if (!targetUserEl || targetUserEl.selectedIndex < 0) {
            return "your current login user";
        }
        const selected = targetUserEl.options[targetUserEl.selectedIndex];
        return String(selected?.textContent || "").trim() || "your current login user";
    }

    function setMappingStatusText(text) {
        if (!mappingStatusEl) return;
        mappingStatusEl.textContent = text || "-";
    }

    function updateSaveTargetText() {
        if (!saveTargetTextEl) return;
        const label = isAdminRole ? getSelectedTargetOptionLabel() : "your current login user";
        saveTargetTextEl.textContent = `Saving invoice defaults for ${label} in ${currentDatabaseName || "inventory"}.`;
    }

    function renderLogoPreview() {
        if (!logoPreviewWrapEl) return;
        logoPreviewWrapEl.innerHTML = "";
        if (!currentLogoDataUrl) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent = "No Invoice Details custom logo selected yet.";
            logoPreviewWrapEl.appendChild(empty);
            return;
        }
        const image = document.createElement("img");
        image.src = currentLogoDataUrl;
        image.alt = "Invoice custom logo preview";
        logoPreviewWrapEl.appendChild(image);
    }

    function renderSystemLogoPreview() {
        if (!systemLogoPreviewWrapEl) return;
        systemLogoPreviewWrapEl.innerHTML = "";
        const logoDataUrl = String(currentPreferenceSummary?.logo_preview_data_url || "").trim();
        if (!logoDataUrl) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent = "No system logo uploaded for the selected target user.";
            systemLogoPreviewWrapEl.appendChild(empty);
            return;
        }
        const image = document.createElement("img");
        image.src = logoDataUrl;
        image.alt = "System logo preview";
        systemLogoPreviewWrapEl.appendChild(image);
    }

    function renderPreferenceSummary() {
        const pref = currentPreferenceSummary || {};
        setText(invoiceTemplateFileNameEl, String(pref.invoice_template_pdf_file_name || "").trim() || "No PDF uploaded");
        setText(systemLogoFileNameEl, String(pref.logo_file_name || "").trim() || "No logo uploaded");
        if (invoiceTemplatePathEl) {
            invoiceTemplatePathEl.textContent = pref.invoice_template_pdf_path
                ? `Saved file: ${pref.invoice_template_pdf_path}`
                : "No invoice PDF uploaded yet.";
        }
        if (systemLogoPathEl) {
            systemLogoPathEl.textContent = pref.logo_path
                ? `Saved file: ${pref.logo_path}`
                : "No system logo uploaded yet.";
        }
        renderSystemLogoPreview();
    }

    function applyEditPermissionState() {
        const disabled = !canEdit;
        if (addressProfileEl) addressProfileEl.disabled = disabled;
        if (defaultImportantTextEl) defaultImportantTextEl.disabled = disabled;
        if (logoBrowseBtnEl) logoBrowseBtnEl.disabled = disabled;
        if (logoClearBtnEl) logoClearBtnEl.disabled = disabled;
        if (saveBtnEl) saveBtnEl.disabled = disabled;
    }

    function buildInvMapEndpoint() {
        const params = new URLSearchParams();
        if (currentDatabaseName) {
            params.set("database_name", currentDatabaseName);
        }
        if (isAdminRole && currentTargetUserRef) {
            params.set("user_ref", currentTargetUserRef);
        }
        const query = params.toString();
        return query ? `/users/inv-map/me?${query}` : "/users/inv-map/me";
    }

    function buildPreferencesEndpoint() {
        const params = new URLSearchParams();
        if (currentDatabaseName) {
            params.set("database_name", currentDatabaseName);
        }
        if (isAdminRole && currentTargetUserRef) {
            params.set("user_ref", currentTargetUserRef);
        }
        const query = params.toString();
        return query ? `/preferences?${query}` : "/preferences";
    }

    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Failed to read selected logo file."));
            reader.readAsDataURL(file);
        });
    }

    async function compressImageDataUrl(sourceDataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const maxW = 780;
                const maxH = 280;
                const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(img.width * ratio));
                canvas.height = Math.max(1, Math.round(img.height * ratio));
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(sourceDataUrl);
                    return;
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = () => resolve(sourceDataUrl);
            img.src = sourceDataUrl;
        });
    }

    async function loadInvoiceSectionSettings() {
        const res = await request(buildInvMapEndpoint(), "GET");
        const mapping = res?.mapping || null;
        const mappingDbName = normalizeDatabaseName(mapping?.database_name);
        currentVisibility = safeObject(res?.invoice_render_visibility);
        const invoiceOverrides = safeObject(res?.invoice_render_overrides);
        currentLayoutState = safeObject(invoiceOverrides.layout_state);

        const localAddress = isSelfTarget() ? localStorage.getItem(ADDRESS_STORAGE_KEY) : "";
        const selectedAddressKey = normalizeAddressKey(invoiceOverrides.selected_address_key || localAddress || "v");
        if (addressProfileEl) {
            addressProfileEl.value = selectedAddressKey;
        }

        const localLogoDataUrl = isSelfTarget()
            ? String(localStorage.getItem(LOGO_STORAGE_KEY) || "").trim()
            : "";
        const serverLogoDataUrl = String(invoiceOverrides.logo_with_name_data_url || "").trim();
        currentLogoDataUrl = serverLogoDataUrl || localLogoDataUrl;

        const localImportantText = isSelfTarget()
            ? String(localStorage.getItem(IMPORTANT_STORAGE_KEY) || "").trim()
            : "";
        currentDefaultImportantText = normalizeImportantText(invoiceOverrides.default_important_text || localImportantText);
        if (defaultImportantTextEl) {
            defaultImportantTextEl.value = currentDefaultImportantText;
        }

        renderLogoPreview();

        const targetLabel = isAdminRole ? getSelectedTargetOptionLabel() : "your current login user";
        if (mapping && mappingDbName === currentDatabaseName) {
            setMappingStatusText(`Mapped for ${targetLabel} in ${currentDatabaseName}.`);
        } else {
            setMappingStatusText(`No Inv Map row for ${targetLabel} in ${currentDatabaseName}. You can still save invoice defaults here.`);
        }
    }

    async function loadPreferenceSummary() {
        currentPreferenceSummary = await request(buildPreferencesEndpoint(), "GET");
        renderPreferenceSummary();
    }

    async function loadMappedTargetEntries() {
        if (!isAdminRole) {
            mappedTargetEntries = [];
            return;
        }
        try {
            const res = await request("/users/inv-map/entries", "GET");
            mappedTargetEntries = (Array.isArray(res?.entries) ? res.entries : [])
                .map((entry) => ({
                    user_id: Number(entry?.user_id || 0),
                    username: String(entry?.username || "").trim(),
                    email: String(entry?.email || "").trim(),
                    database_name: normalizeDatabaseName(entry?.database_name),
                }))
                .filter((entry) => entry.user_id > 0 && entry.database_name);
        } catch (_err) {
            mappedTargetEntries = [];
        }
    }

    async function loadDatabaseOptions() {
        const localDb = normalizeDatabaseName(localStorage.getItem("selectedDatabaseName") || "");
        const preferredDb = normalizeDatabaseName(currentDatabaseName || localDb || "inventory") || "inventory";
        let options = [];

        if (isAdminRole) {
            try {
                const res = await request("/users/databases", "GET");
                options = (Array.isArray(res?.databases) ? res.databases : [])
                    .map((entry) => {
                        const value = normalizeDatabaseName(entry?.name || entry?.database_name);
                        if (!value) return null;
                        return {
                            value,
                            label: buildDatabaseLabel(value, entry?.label || entry?.company_name || "")
                        };
                    })
                    .filter(Boolean);
            } catch (_err) {
                options = [];
            }
        }

        if (!options.length && mappedTargetEntries.length) {
            const seen = new Set();
            options = mappedTargetEntries
                .map((entry) => {
                    if (!entry.database_name || seen.has(entry.database_name)) return null;
                    seen.add(entry.database_name);
                    return {
                        value: entry.database_name,
                        label: buildDatabaseLabel(entry.database_name, "")
                    };
                })
                .filter(Boolean);
        }

        if (!options.length) {
            options = [{
                value: preferredDb,
                label: buildDatabaseLabel(preferredDb, "")
            }];
        } else if (!options.some((entry) => entry.value === preferredDb)) {
            options.unshift({
                value: preferredDb,
                label: buildDatabaseLabel(preferredDb, "")
            });
        }

        if (mappedDbEl) {
            mappedDbEl.innerHTML = options
                .map((entry) => `<option value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)}</option>`)
                .join("");
            mappedDbEl.value = options.some((entry) => entry.value === preferredDb)
                ? preferredDb
                : String(options[0]?.value || preferredDb);
        }

        currentDatabaseName = normalizeDatabaseName(mappedDbEl?.value || preferredDb || "inventory") || "inventory";
    }

    function rebuildTargetUserOptions() {
        if (!targetUserFieldEl || !targetUserEl) return;
        if (!isAdminRole) {
            currentTargetUserRef = normalizeUserRef(getSelfUserRef());
            targetUserFieldEl.style.display = "none";
            updateSaveTargetText();
            return;
        }

        targetUserFieldEl.style.display = "";
        const previousValue = normalizeUserRef(currentTargetUserRef);
        const selfValue = normalizeUserRef(getSelfUserRef());
        const options = [];
        const seen = new Set();

        if (selfValue) {
            options.push({
                value: selfValue,
                label: `My login user (${currentDatabaseName || "inventory"})`
            });
            seen.add(selfValue);
        }

        mappedTargetEntries
            .filter((entry) => entry.database_name === currentDatabaseName)
            .forEach((entry) => {
                const value = normalizeUserRef(`inventory:${Number(entry.user_id || 0)}`);
                if (!value || seen.has(value)) return;
                seen.add(value);
                options.push({
                    value,
                    label: buildTargetUserLabel(entry)
                });
            });

        if (!options.length) {
            options.push({
                value: "",
                label: "No target user found"
            });
        }

        targetUserEl.innerHTML = options
            .map((entry) => `<option value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)}</option>`)
            .join("");

        const nextValue = options.some((entry) => entry.value === previousValue)
            ? previousValue
            : String(options[0]?.value || "");
        targetUserEl.value = nextValue;
        currentTargetUserRef = normalizeUserRef(nextValue || selfValue);
        targetUserEl.disabled = !options.length;
        updateSaveTargetText();
    }

    async function loadCurrentContext() {
        updateSaveTargetText();
        await Promise.all([loadInvoiceSectionSettings(), loadPreferenceSummary()]);
    }

    function buildSavePayload() {
        const payload = {
            database_name: currentDatabaseName,
            render_overrides: {
                layout_state: currentLayoutState,
                selected_address_key: normalizeAddressKey(addressProfileEl?.value || "v"),
                logo_with_name_data_url: String(currentLogoDataUrl || ""),
                default_important_text: normalizeImportantText(defaultImportantTextEl?.value || currentDefaultImportantText)
            }
        };
        if (isAdminRole && currentTargetUserRef) {
            payload.user_ref = currentTargetUserRef;
        }
        if (currentVisibility && Object.keys(currentVisibility).length) {
            payload.render_visibility = currentVisibility;
        }
        return payload;
    }

    async function saveInvoiceSectionSettings() {
        if (!canEdit) {
            notify("You do not have edit permission for Invoice Section.", "error");
            return;
        }
        const payload = buildSavePayload();
        setBusy(saveBtnEl, true);
        try {
            const res = await request("/users/inv-map/me/invoice-render-inputs", "PUT", payload);
            currentVisibility = safeObject(res?.render_visibility);
            const overrides = safeObject(res?.render_overrides);
            currentLayoutState = safeObject(overrides.layout_state);
            currentLogoDataUrl = String(overrides.logo_with_name_data_url || "").trim();
            currentDefaultImportantText = normalizeImportantText(overrides.default_important_text || "");
            if (addressProfileEl) {
                addressProfileEl.value = normalizeAddressKey(overrides.selected_address_key || addressProfileEl.value);
            }
            if (defaultImportantTextEl) {
                defaultImportantTextEl.value = currentDefaultImportantText;
            }
            if (isSelfTarget()) {
                localStorage.setItem(LOGO_STORAGE_KEY, currentLogoDataUrl);
                localStorage.setItem(ADDRESS_STORAGE_KEY, normalizeAddressKey(addressProfileEl?.value || "v"));
                localStorage.setItem(IMPORTANT_STORAGE_KEY, currentDefaultImportantText);
            }
            renderLogoPreview();
            notify(res?.message || "Invoice section settings saved.", "success");
        } catch (err) {
            notify(err?.message || "Failed to save invoice section settings.", "error");
        } finally {
            setBusy(saveBtnEl, false);
        }
    }

    async function handleLogoFileChange() {
        const file = logoFileInputEl?.files?.[0];
        if (!file) return;
        if (!String(file.type || "").startsWith("image/")) {
            notify("Please select an image file.", "error");
            logoFileInputEl.value = "";
            return;
        }
        try {
            const dataUrl = await fileToDataUrl(file);
            const compressed = await compressImageDataUrl(dataUrl);
            currentLogoDataUrl = String(compressed || "").trim();
            if (isSelfTarget()) {
                localStorage.setItem(LOGO_STORAGE_KEY, currentLogoDataUrl);
            }
            renderLogoPreview();
        } catch (err) {
            notify(err?.message || "Failed to load selected logo file.", "error");
        } finally {
            logoFileInputEl.value = "";
        }
    }

    function clearSelectedLogo() {
        if (!canEdit) return;
        currentLogoDataUrl = "";
        if (isSelfTarget()) {
            localStorage.removeItem(LOGO_STORAGE_KEY);
        }
        renderLogoPreview();
    }

    async function applyPermissionState() {
        if (typeof window.__waitForUserAccessPermissions === "function") {
            await window.__waitForUserAccessPermissions();
        }
        const hasAction = (action) =>
            typeof window.hasUserActionPermission === "function"
                ? !!window.hasUserActionPermission(PAGE_PATH, action)
                : true;
        const canView = hasAction("view");
        canEdit = hasAction("edit");
        if (!canView) {
            alert("You do not have permission to view Invoice Section.");
            window.location.href = "user-access.html";
            return false;
        }
        applyEditPermissionState();
        return true;
    }

    function bindEvents() {
        if (logoBrowseBtnEl && logoFileInputEl) {
            logoBrowseBtnEl.addEventListener("click", () => {
                if (!canEdit) return;
                logoFileInputEl.click();
            });
        }
        if (logoFileInputEl) {
            logoFileInputEl.addEventListener("change", handleLogoFileChange);
        }
        if (logoClearBtnEl) {
            logoClearBtnEl.addEventListener("click", clearSelectedLogo);
        }
        if (addressProfileEl) {
            addressProfileEl.addEventListener("change", () => {
                if (isSelfTarget()) {
                    localStorage.setItem(ADDRESS_STORAGE_KEY, normalizeAddressKey(addressProfileEl.value));
                }
            });
        }
        if (defaultImportantTextEl) {
            defaultImportantTextEl.addEventListener("input", () => {
                if (isSelfTarget()) {
                    localStorage.setItem(IMPORTANT_STORAGE_KEY, normalizeImportantText(defaultImportantTextEl.value));
                }
            });
        }
        if (mappedDbEl) {
            mappedDbEl.addEventListener("change", async () => {
                const nextDb = normalizeDatabaseName(mappedDbEl.value);
                if (!nextDb || nextDb === currentDatabaseName) return;
                currentDatabaseName = nextDb;
                rebuildTargetUserOptions();
                try {
                    await loadCurrentContext();
                } catch (err) {
                    notify(err?.message || "Failed to load invoice section settings.", "error");
                }
            });
        }
        if (targetUserEl) {
            targetUserEl.addEventListener("change", async () => {
                const nextUserRef = normalizeUserRef(targetUserEl.value || getSelfUserRef());
                if (!nextUserRef || nextUserRef === currentTargetUserRef) {
                    updateSaveTargetText();
                    return;
                }
                currentTargetUserRef = nextUserRef;
                updateSaveTargetText();
                try {
                    await loadCurrentContext();
                } catch (err) {
                    notify(err?.message || "Failed to load invoice section settings.", "error");
                }
            });
        }
        if (saveBtnEl) {
            saveBtnEl.addEventListener("click", saveInvoiceSectionSettings);
        }
    }

    (async function init() {
        bindEvents();
        renderLogoPreview();
        renderPreferenceSummary();
        const allowed = await applyPermissionState();
        if (!allowed) return;
        await loadMappedTargetEntries();
        await loadDatabaseOptions();
        rebuildTargetUserOptions();
        if (!currentTargetUserRef) {
            currentTargetUserRef = normalizeUserRef(getSelfUserRef());
        }
        try {
            await loadCurrentContext();
        } catch (err) {
            notify(err?.message || "Failed to load invoice section settings.", "error");
        }
        applyEditPermissionState();
    })();
})();
