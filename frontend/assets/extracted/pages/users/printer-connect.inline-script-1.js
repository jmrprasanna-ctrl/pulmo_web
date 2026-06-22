(function () {
    const PAGE_PATH = "/users/printer-connect.html";
    const byId = (id) => document.getElementById(id);
    const currentUserId = Number(localStorage.getItem("userId") || 0);
    const storedUserRef = String(localStorage.getItem("userRef") || "").trim().toLowerCase();

    const mappedDbEl = byId("mappedDatabaseName");
    const targetUserFieldEl = byId("targetUserField");
    const targetUserEl = byId("targetUserSelect");
    const saveTargetTextEl = byId("saveTargetText");
    const stationNameEl = byId("stationNameInput");
    const printerNameEl = byId("printerNameInput");
    const printerAliasEl = byId("printerAliasInput");
    const printerNotesEl = byId("printerNotesInput");
    const statusEl = byId("currentMappingStatus");
    const saveBtnEl = byId("savePrinterConnectBtn");
    const deleteBtnEl = byId("deletePrinterConnectBtn");
    const refreshBtnEl = byId("refreshPrinterConnectBtn");
    const tableBodyEl = byId("printerConnectTableBody");

    let canEdit = true;
    let canTargetMappedUsers = false;
    let currentDatabaseName = "inventory";
    let currentTargetUserRef = "";
    let currentMappingId = 0;
    let mappedTargetEntries = [];
    let savedEntries = [];

    function normalizeDatabaseName(value) {
        return String(value || "").trim().toLowerCase();
    }

    function normalizeUserRef(value) {
        return String(value || "").trim().toLowerCase();
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

    function updateSaveTargetText() {
        if (!saveTargetTextEl) return;
        const selected = targetUserEl && targetUserEl.selectedIndex >= 0
            ? String(targetUserEl.options[targetUserEl.selectedIndex]?.textContent || "").trim()
            : "your current login user";
        saveTargetTextEl.textContent = `Saving printer connection for ${selected || "your current login user"} in ${currentDatabaseName || "inventory"}.`;
    }

    function setStatusText(message) {
        if (!statusEl) return;
        statusEl.textContent = message || "No printer mapping loaded for the selected target.";
    }

    function setFormDisabled(disabled) {
        [stationNameEl, printerNameEl, printerAliasEl, printerNotesEl, saveBtnEl, deleteBtnEl].forEach((el) => {
            if (el) el.disabled = !!disabled;
        });
    }

    function applyPermissionStateToForm() {
        setFormDisabled(!canEdit);
        if (deleteBtnEl) {
            deleteBtnEl.style.display = canEdit ? "inline-flex" : "none";
        }
    }

    function ensureTargetUserOption(value, label) {
        if (!targetUserEl || !value) return;
        const normalizedValue = normalizeUserRef(value);
        const existing = Array.from(targetUserEl.options || []).find((option) => normalizeUserRef(option.value) === normalizedValue);
        if (existing) return;
        const option = document.createElement("option");
        option.value = normalizedValue;
        option.textContent = label || normalizedValue;
        targetUserEl.appendChild(option);
    }

    function formatDateTime(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "-";
        return date.toLocaleString();
    }

    function buildPrinterConnectEndpoint() {
        const params = new URLSearchParams();
        if (currentDatabaseName) {
            params.set("database_name", currentDatabaseName);
        }
        if (canTargetMappedUsers && currentTargetUserRef) {
            params.set("user_ref", currentTargetUserRef);
        }
        const query = params.toString();
        return query ? `/users/printer-connect/me?${query}` : "/users/printer-connect/me";
    }

    async function loadMappedTargetEntries() {
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
            canTargetMappedUsers = true;
        } catch (_err) {
            mappedTargetEntries = [];
            canTargetMappedUsers = false;
        }
    }

    async function loadDatabaseOptions() {
        const localDb = normalizeDatabaseName(localStorage.getItem("selectedDatabaseName") || "");
        const preferredDb = normalizeDatabaseName(currentDatabaseName || localDb || "inventory") || "inventory";
        let options = [];

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
            options = [{ value: preferredDb, label: buildDatabaseLabel(preferredDb, "") }];
        } else if (!options.some((entry) => entry.value === preferredDb)) {
            options.unshift({ value: preferredDb, label: buildDatabaseLabel(preferredDb, "") });
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
        if (!canTargetMappedUsers) {
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
            options.push({ value: "", label: "No target user found" });
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

    function applyMappingToForm(mapping) {
        currentMappingId = Number(mapping?.id || 0) || 0;
        if (stationNameEl) stationNameEl.value = String(mapping?.station_name || "").trim();
        if (printerNameEl) printerNameEl.value = String(mapping?.printer_name || "").trim();
        if (printerAliasEl) printerAliasEl.value = String(mapping?.printer_alias || "").trim();
        if (printerNotesEl) printerNotesEl.value = String(mapping?.notes || "").trim();

        if (!mapping) {
            setStatusText(`No printer mapping saved for ${currentDatabaseName || "inventory"} yet.`);
        } else {
            const printerLabel = String(mapping.printer_alias || mapping.printer_name || "Saved printer").trim();
            const stationLabel = String(mapping.station_name || "").trim();
            const stationText = stationLabel ? ` via ${stationLabel}` : "";
            setStatusText(`Current mapping: ${printerLabel}${stationText}. Last updated ${formatDateTime(mapping.updated_at)}.`);
        }

        if (deleteBtnEl) {
            deleteBtnEl.disabled = !canEdit || currentMappingId <= 0;
        }
    }

    async function loadCurrentPrinterConnection() {
        const res = await request(buildPrinterConnectEndpoint(), "GET");
        applyMappingToForm(res?.mapping || null);
    }

    function renderEntriesTable() {
        if (!tableBodyEl) return;
        if (!savedEntries.length) {
            tableBodyEl.innerHTML = `<tr><td colspan="7">No saved printer connections for ${escapeHtml(currentDatabaseName || "inventory")}.</td></tr>`;
            return;
        }

        tableBodyEl.innerHTML = savedEntries.map((entry) => {
            const printerLabel = String(entry.printer_alias || entry.printer_name || "-").trim() || "-";
            const loginLabel = buildTargetUserLabel(entry);
            return `
                <tr>
                    <td>${escapeHtml(entry.database_name || "-")}</td>
                    <td>${escapeHtml(loginLabel)}</td>
                    <td>${escapeHtml(entry.station_name || "-")}</td>
                    <td>${escapeHtml(printerLabel)}</td>
                    <td>${escapeHtml(entry.print_mode === "local_bridge" ? "Local Bridge" : "Browser Dialog")}</td>
                    <td>${escapeHtml(formatDateTime(entry.updated_at))}</td>
                    <td>
                        <div class="printer-connect-row-actions">
                            <button class="btn btn-secondary" type="button" data-load-id="${entry.id}" data-load-db="${escapeHtml(entry.database_name)}" data-load-user="${escapeHtml(`inventory:${entry.user_id}`)}" data-load-label="${escapeHtml(loginLabel)}">Load</button>
                            <button class="btn btn-secondary" type="button" data-delete-id="${entry.id}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadPrinterEntries() {
        if (!tableBodyEl) return;
        tableBodyEl.innerHTML = `<tr><td colspan="7">Loading printer connections...</td></tr>`;
        try {
            const query = currentDatabaseName ? `?database_name=${encodeURIComponent(currentDatabaseName)}` : "";
            const res = await request(`/users/printer-connect/entries${query}`, "GET");
            savedEntries = Array.isArray(res?.entries) ? res.entries : [];
            renderEntriesTable();
        } catch (err) {
            savedEntries = [];
            tableBodyEl.innerHTML = `<tr><td colspan="7">${escapeHtml(err?.message || "Failed to load printer connections.")}</td></tr>`;
        }
    }

    function buildSavePayload() {
        const payload = {
            database_name: currentDatabaseName,
            station_name: String(stationNameEl?.value || "").trim(),
            printer_name: String(printerNameEl?.value || "").trim(),
            printer_alias: String(printerAliasEl?.value || "").trim(),
            notes: String(printerNotesEl?.value || "").trim(),
            print_mode: "browser_dialog"
        };
        if (canTargetMappedUsers && currentTargetUserRef) {
            payload.user_ref = currentTargetUserRef;
        }
        return payload;
    }

    async function savePrinterConnection() {
        if (!canEdit) {
            notify("You do not have edit permission for Printer Connect.", "error");
            return;
        }

        setBusy(saveBtnEl, true);
        try {
            const res = await request("/users/printer-connect/me", "PUT", buildSavePayload());
            applyMappingToForm(res?.mapping || null);
            await loadPrinterEntries();
            notify(res?.message || "Printer connection saved.", "success");
        } catch (err) {
            notify(err?.message || "Failed to save printer connection.", "error");
        } finally {
            setBusy(saveBtnEl, false);
        }
    }

    async function deletePrinterConnectionById(entryId) {
        const numericId = Number(entryId || 0);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            notify("No saved printer connection selected.", "error");
            return;
        }
        if (!canEdit) {
            notify("You do not have edit permission for Printer Connect.", "error");
            return;
        }

        setBusy(deleteBtnEl, true);
        try {
            const res = await request(`/users/printer-connect/entries/${numericId}`, "DELETE");
            if (numericId === currentMappingId) {
                applyMappingToForm(null);
            }
            await loadPrinterEntries();
            notify(res?.message || "Printer connection removed.", "success");
        } catch (err) {
            notify(err?.message || "Failed to remove printer connection.", "error");
        } finally {
            setBusy(deleteBtnEl, false);
        }
    }

    async function loadCurrentContext() {
        updateSaveTargetText();
        await Promise.all([loadCurrentPrinterConnection(), loadPrinterEntries()]);
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
            alert("You do not have permission to view Printer Connect.");
            window.location.href = "user-access.html";
            return false;
        }
        applyPermissionStateToForm();
        return true;
    }

    function bindEvents() {
        if (mappedDbEl) {
            mappedDbEl.addEventListener("change", async () => {
                const nextDb = normalizeDatabaseName(mappedDbEl.value);
                if (!nextDb || nextDb === currentDatabaseName) return;
                currentDatabaseName = nextDb;
                rebuildTargetUserOptions();
                try {
                    await loadCurrentContext();
                } catch (err) {
                    notify(err?.message || "Failed to load printer connection.", "error");
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
                    notify(err?.message || "Failed to load printer connection.", "error");
                }
            });
        }

        if (saveBtnEl) {
            saveBtnEl.addEventListener("click", savePrinterConnection);
        }

        if (deleteBtnEl) {
            deleteBtnEl.addEventListener("click", () => deletePrinterConnectionById(currentMappingId));
        }

        if (refreshBtnEl) {
            refreshBtnEl.addEventListener("click", async () => {
                try {
                    await loadCurrentContext();
                    notify("Printer connections refreshed.", "success");
                } catch (err) {
                    notify(err?.message || "Failed to refresh printer connections.", "error");
                }
            });
        }

        if (tableBodyEl) {
            tableBodyEl.addEventListener("click", async (event) => {
                const target = event.target instanceof HTMLElement ? event.target.closest("button") : null;
                if (!target) return;

                const deleteId = Number(target.getAttribute("data-delete-id") || 0);
                if (deleteId > 0) {
                    await deletePrinterConnectionById(deleteId);
                    return;
                }

                const loadId = Number(target.getAttribute("data-load-id") || 0);
                if (loadId <= 0) return;

                const nextDb = normalizeDatabaseName(target.getAttribute("data-load-db") || currentDatabaseName);
                const nextUserRef = normalizeUserRef(target.getAttribute("data-load-user") || "");
                const nextUserLabel = String(target.getAttribute("data-load-label") || "Mapped User").trim();

                if (mappedDbEl && nextDb) {
                    mappedDbEl.value = nextDb;
                }
                currentDatabaseName = nextDb || currentDatabaseName;
                rebuildTargetUserOptions();
                ensureTargetUserOption(nextUserRef, nextUserLabel);
                if (targetUserEl && nextUserRef) {
                    targetUserEl.value = nextUserRef;
                }
                currentTargetUserRef = nextUserRef || currentTargetUserRef;
                currentMappingId = loadId;
                updateSaveTargetText();

                try {
                    await loadCurrentPrinterConnection();
                } catch (err) {
                    notify(err?.message || "Failed to load selected printer connection.", "error");
                }
            });
        }
    }

    (async function init() {
        bindEvents();
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
            notify(err?.message || "Failed to load printer connections.", "error");
        }
        applyPermissionStateToForm();
    })();
})();
