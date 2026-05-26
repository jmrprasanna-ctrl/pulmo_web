(function () {
    const PAGE_PATH = "/users/invoice-section.html";
    const LOGO_STORAGE_KEY = "invoice_logo_with_name_data_url";
    const ADDRESS_STORAGE_KEY = "invoice_selected_address_key";
    const byId = (id) => document.getElementById(id);

    const mappedDbEl = byId("mappedDatabaseName");
    const mappingStatusEl = byId("mappingStatusText");
    const addressProfileEl = byId("addressProfileSelect");
    const logoFileInputEl = byId("invoiceLogoFileInput");
    const logoBrowseBtnEl = byId("invoiceLogoBrowseBtn");
    const logoClearBtnEl = byId("invoiceLogoClearBtn");
    const logoPreviewWrapEl = byId("invoiceLogoPreviewWrap");
    const saveBtnEl = byId("saveInvoiceSectionBtn");

    let canEdit = true;
    let currentDatabaseName = "inventory";
    let currentVisibility = {};
    let currentLayoutState = {};
    let currentLogoDataUrl = "";

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

    function normalizeAddressKey(value) {
        return String(value || "").trim().toLowerCase() === "colombo" ? "colombo" : "v";
    }

    function setBusy(buttonEl, busy) {
        if (!buttonEl) return;
        buttonEl.disabled = !!busy;
        buttonEl.style.opacity = busy ? "0.65" : "";
    }

    function renderLogoPreview() {
        if (!logoPreviewWrapEl) return;
        logoPreviewWrapEl.innerHTML = "";
        if (!currentLogoDataUrl) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent = "No invoice logo selected yet.";
            logoPreviewWrapEl.appendChild(empty);
            return;
        }
        const image = document.createElement("img");
        image.src = currentLogoDataUrl;
        image.alt = "Invoice logo preview";
        logoPreviewWrapEl.appendChild(image);
    }

    function applyEditPermissionState() {
        const disabled = !canEdit;
        if (addressProfileEl) addressProfileEl.disabled = disabled;
        if (logoBrowseBtnEl) logoBrowseBtnEl.disabled = disabled;
        if (logoClearBtnEl) logoClearBtnEl.disabled = disabled;
        if (saveBtnEl) saveBtnEl.disabled = disabled;
    }

    function setMappingStatusText(text) {
        if (!mappingStatusEl) return;
        mappingStatusEl.textContent = text || "-";
    }

    function safeObject(value) {
        return value && typeof value === "object" ? value : {};
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
        const res = await request("/users/inv-map/me", "GET");
        const mapping = res?.mapping || null;
        const mappingDbName = String(mapping?.database_name || "").trim().toLowerCase();
        const localDb = String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
        currentDatabaseName = mappingDbName || localDb || "inventory";
        if (mappedDbEl) {
            mappedDbEl.value = currentDatabaseName;
        }

        currentVisibility = safeObject(res?.invoice_render_visibility);
        const invoiceOverrides = safeObject(res?.invoice_render_overrides);
        currentLayoutState = safeObject(invoiceOverrides.layout_state);
        const selectedAddressKey = normalizeAddressKey(invoiceOverrides.selected_address_key || localStorage.getItem(ADDRESS_STORAGE_KEY));
        if (addressProfileEl) {
            addressProfileEl.value = selectedAddressKey;
        }

        const serverLogoDataUrl = String(invoiceOverrides.logo_with_name_data_url || "").trim();
        const localLogoDataUrl = String(localStorage.getItem(LOGO_STORAGE_KEY) || "").trim();
        currentLogoDataUrl = serverLogoDataUrl || localLogoDataUrl;
        renderLogoPreview();

        if (mapping) {
            setMappingStatusText(`Mapped (${currentDatabaseName})`);
        } else {
            setMappingStatusText("No Inv Map row yet. You can still save invoice section settings.");
        }
    }

    function buildSavePayload() {
        const payload = {
            database_name: currentDatabaseName,
            render_overrides: {
                layout_state: currentLayoutState,
                selected_address_key: normalizeAddressKey(addressProfileEl?.value || "v"),
                logo_with_name_data_url: String(currentLogoDataUrl || "")
            }
        };
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
            if (addressProfileEl) {
                addressProfileEl.value = normalizeAddressKey(overrides.selected_address_key || addressProfileEl.value);
            }
            localStorage.setItem(LOGO_STORAGE_KEY, currentLogoDataUrl);
            localStorage.setItem(ADDRESS_STORAGE_KEY, normalizeAddressKey(addressProfileEl?.value || "v"));
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
            localStorage.setItem(LOGO_STORAGE_KEY, currentLogoDataUrl);
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
        localStorage.removeItem(LOGO_STORAGE_KEY);
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
                localStorage.setItem(ADDRESS_STORAGE_KEY, normalizeAddressKey(addressProfileEl.value));
            });
        }
        if (saveBtnEl) {
            saveBtnEl.addEventListener("click", saveInvoiceSectionSettings);
        }
    }

    (async function init() {
        bindEvents();
        const allowed = await applyPermissionState();
        if (!allowed) return;
        await loadInvoiceSectionSettings();
    })();
})();
