(function () {
    const byId = (id) => document.getElementById(id);
    const dbSelectEl = byId("backupDatabaseSelect");
    const driveAuthTypeEl = byId("driveAuthType");
    const driveRootFolderEl = byId("driveRootFolderName");
    const driveCredentialsEl = byId("driveCredentialsJson");
    const driveOauthClientEl = byId("driveOauthClientJson");
    const driveEnabledEl = byId("driveEnabled");
    const autoBackupInvoiceEl = byId("autoBackupInvoice");
    const autoBackupQuotationEl = byId("autoBackupQuotation");
    const autoBackupDatabaseEl = byId("autoBackupDatabase");
    const driveStatusTextEl = byId("driveStatusText");
    const driveCredentialsHintEl = byId("driveCredentialsHint");
    const driveOauthHintEl = byId("driveOauthHint");
    const oauthConfigBlockEl = byId("oauthConfigBlock");
    const serviceAccountConfigBlockEl = byId("serviceAccountConfigBlock");
    const restoreDbFileInputEl = byId("restoreDbFileInput");
    const historyBodyEl = byId("dbBackupHistoryBody");

    let currentDatabaseName = "inventory";
    let hasSavedDriveCredentials = false;
    let hasSavedOauthClient = false;
    let hasConnectedOauth = false;
    let connectedOauthEmail = "";

    function notify(message, type = "success", duration = 2600) {
        const text = String(message || "").trim();
        if (!text) return;
        if (typeof window.showMessageBox === "function") {
            window.showMessageBox(text, type, duration);
            return;
        }
        if (type === "error") {
            console.error(text);
        } else {
            console.log(text);
        }
    }

    function notifySuccess(message, duration = 2600) {
        notify(message, "success", duration);
    }

    function notifyError(message, duration = 3400) {
        notify(message, "error", duration);
    }

    function selectedDatabase() {
        const val = String(dbSelectEl?.value || "").trim().toLowerCase();
        return val || currentDatabaseName || "inventory";
    }

    function selectedAuthType() {
        const raw = String(driveAuthTypeEl?.value || "").trim().toLowerCase();
        return raw === "oauth" ? "oauth" : "service_account";
    }

    function fmtBytes(value) {
        const num = Number(value || 0);
        if (!Number.isFinite(num) || num <= 0) return "0 B";
        if (num < 1024) return `${num} B`;
        if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
        if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`;
        return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function setDriveStatus(text, isError) {
        if (!driveStatusTextEl) return;
        driveStatusTextEl.textContent = text || "-";
        driveStatusTextEl.style.color = isError ? "#b42318" : "#1d2939";
    }

    function setBusy(buttonId, busy) {
        const btn = byId(buttonId);
        if (!btn) return;
        btn.disabled = !!busy;
        btn.style.opacity = busy ? "0.6" : "";
    }

    function applyAuthModeUI() {
        const authType = selectedAuthType();
        if (oauthConfigBlockEl) oauthConfigBlockEl.classList.toggle("is-hidden", authType !== "oauth");
        if (serviceAccountConfigBlockEl) serviceAccountConfigBlockEl.classList.toggle("is-hidden", authType !== "service_account");
    }

    function refreshStatusFromSettings() {
        const authType = selectedAuthType();
        if (authType === "oauth") {
            if (hasConnectedOauth) {
                const mail = connectedOauthEmail ? ` (${connectedOauthEmail})` : "";
                setDriveStatus(`OAuth connected${mail}`, false);
            } else if (hasSavedOauthClient) {
                setDriveStatus("OAuth client saved. Click Connect Google Account.", true);
            } else {
                setDriveStatus("OAuth client not saved.", true);
            }
            return;
        }
        const savedText = hasSavedDriveCredentials ? "Credentials saved" : "Credentials not saved";
        setDriveStatus(savedText, hasSavedDriveCredentials ? false : true);
    }

    async function loadDatabases() {
        const res = await request("/users/databases", "GET");
        const rows = Array.isArray(res?.databases) ? res.databases : [];
        const options = [];
        const seen = new Set();
        rows.forEach((row) => {
            const name = String(row?.name || "").trim().toLowerCase();
            if (!name || seen.has(name)) return;
            seen.add(name);
            options.push({
                name,
                label: String(row?.label || name).trim() || name,
            });
        });

        dbSelectEl.innerHTML = "";
        options.forEach((opt) => {
            const optionEl = document.createElement("option");
            optionEl.value = opt.name;
            optionEl.textContent = opt.label;
            dbSelectEl.appendChild(optionEl);
        });

        const defaultDb = String(res?.current || "").trim().toLowerCase() || "inventory";
        currentDatabaseName = defaultDb;
        if (options.some((x) => x.name === defaultDb)) {
            dbSelectEl.value = defaultDb;
        } else if (options.length) {
            dbSelectEl.value = options[0].name;
            currentDatabaseName = options[0].name;
        }
    }

    async function loadBackupConfig() {
        const dbName = selectedDatabase();
        const res = await request(`/system-backup/config?database_name=${encodeURIComponent(dbName)}`, "GET");
        const settings = res?.settings || {};
        currentDatabaseName = String(res?.database_name || dbName).trim().toLowerCase() || dbName;

        driveEnabledEl.checked = !!settings.drive_enabled;
        autoBackupInvoiceEl.checked = !!settings.auto_backup_invoice;
        autoBackupQuotationEl.checked = !!settings.auto_backup_quotation;
        autoBackupDatabaseEl.checked = !!settings.auto_backup_database;
        driveRootFolderEl.value = String(settings.drive_root_folder_name || "AXIS CMS PULMO");
        driveAuthTypeEl.value = String(settings.drive_auth_type || "service_account").toLowerCase() === "oauth" ? "oauth" : "service_account";

        driveCredentialsEl.value = "";
        driveOauthClientEl.value = "";

        hasSavedDriveCredentials = !!settings.service_credentials_saved;
        hasSavedOauthClient = !!settings.oauth_client_saved;
        hasConnectedOauth = !!settings.oauth_connected;
        connectedOauthEmail = String(settings.oauth_email || "").trim().toLowerCase();

        if (driveCredentialsHintEl) {
            driveCredentialsHintEl.textContent = hasSavedDriveCredentials
                ? "Service Account credentials are saved. JSON is hidden after refresh."
                : "No Service Account credentials yet. Paste JSON only if using Service Account mode.";
        }
        if (driveOauthHintEl) {
            if (hasConnectedOauth) {
                driveOauthHintEl.textContent = connectedOauthEmail
                    ? `Connected Google account: ${connectedOauthEmail}`
                    : "Google account connected.";
            } else if (hasSavedOauthClient) {
                driveOauthHintEl.textContent = "OAuth client is saved. Click Connect Google Account to authorize My Drive.";
            } else {
                driveOauthHintEl.textContent = "Paste OAuth client JSON from Google Cloud, save settings, then connect Google account.";
            }
        }

        applyAuthModeUI();
        refreshStatusFromSettings();
    }

    async function saveBackupConfig() {
        const dbName = selectedDatabase();
        const authType = selectedAuthType();
        const payload = {
            database_name: dbName,
            drive_auth_type: authType,
            drive_enabled: !!driveEnabledEl.checked,
            auto_backup_invoice: !!autoBackupInvoiceEl.checked,
            auto_backup_quotation: !!autoBackupQuotationEl.checked,
            auto_backup_database: !!autoBackupDatabaseEl.checked,
            drive_root_folder_name: String(driveRootFolderEl.value || "").trim() || "AXIS CMS PULMO",
        };

        const rawServiceCredentials = String(driveCredentialsEl.value || "").trim();
        const rawOauthClient = String(driveOauthClientEl.value || "").trim();

        if (authType === "oauth") {
            if (!rawOauthClient && !hasSavedOauthClient) {
                setDriveStatus("Google OAuth client JSON is required.", true);
                notifyError("Paste Google OAuth client JSON first.");
                return;
            }
            if (rawOauthClient) {
                payload.drive_oauth_client_json = rawOauthClient;
            }
        } else {
            if (!rawServiceCredentials && !hasSavedDriveCredentials) {
                setDriveStatus("Google Drive credentials JSON is required.", true);
                notifyError("Paste Google Drive Service Account JSON first.");
                return;
            }
            if (rawServiceCredentials) {
                payload.drive_credentials_json = rawServiceCredentials;
            }
        }

        setBusy("saveBackupConfigBtn", true);
        try {
            const res = await request("/system-backup/config", "PUT", payload);
            const auto = res?.auto_actions || {};
            const sync = auto.invoice_quotation_sync || {};
            const daily = auto.daily_db_backup || {};
            const parts = [res?.message || "Backup settings saved."];

            if (sync.attempted) {
                if (sync.error) {
                    parts.push(`Invoice/Quatation sync: ${sync.error}`);
                } else {
                    const rr = sync.result || {};
                    parts.push(
                        `Invoice/Quatation sync: Invoices ${Number(rr.synced_invoices || 0)}, Quatations ${Number(rr.synced_quotations || 0)}`
                    );
                }
            }

            if (daily.attempted) {
                if (daily.error) {
                    parts.push(`Daily DB backup: ${daily.error}`);
                } else if (daily.result?.skipped) {
                    parts.push(`Daily DB backup: ${daily.result?.reason || "Skipped"}`);
                } else {
                    parts.push("Daily DB backup: Completed");
                }
            }

            notifySuccess(parts.join(" | "), 3800);
            driveCredentialsEl.value = "";
            driveOauthClientEl.value = "";
            await loadBackupConfig();
            await loadBackupHistory();
        } finally {
            setBusy("saveBackupConfigBtn", false);
        }
    }

    async function startOauthConnectFlow() {
        const dbName = selectedDatabase();
        const payload = {
            database_name: dbName,
            drive_auth_type: "oauth",
        };
        const rawOauthClient = String(driveOauthClientEl.value || "").trim();
        if (rawOauthClient) {
            payload.drive_oauth_client_json = rawOauthClient;
        } else if (!hasSavedOauthClient) {
            notifyError("Paste OAuth client JSON first.");
            return;
        }

        setBusy("connectDriveBtn", true);
        try {
            const res = await request("/system-backup/drive/oauth/start", "POST", payload);
            const authUrl = String(res?.auth_url || "").trim();
            if (!authUrl) {
                throw new Error("OAuth URL was not returned by server.");
            }

            const popup = window.open(authUrl, "drive_oauth_popup", "width=560,height=720");
            if (!popup) {
                throw new Error("Popup was blocked. Allow popups, then click Connect Google Account again.");
            }

            const oauthResult = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    window.removeEventListener("message", onMessage);
                    reject(new Error("Google connection timed out. Please retry."));
                }, 5 * 60 * 1000);

                function onMessage(event) {
                    if (event.origin !== window.location.origin) return;
                    const data = event.data || {};
                    if (!data || data.type !== "backup_drive_oauth_result") return;
                    clearTimeout(timeout);
                    window.removeEventListener("message", onMessage);
                    resolve(data);
                }

                window.addEventListener("message", onMessage);
            });

            if (!oauthResult?.ok) {
                throw new Error(oauthResult?.message || "Google OAuth failed.");
            }

            notifySuccess(oauthResult.message || "Google account connected.", 3400);
            driveOauthClientEl.value = "";
            await loadBackupConfig();
            await loadBackupHistory();
        } finally {
            setBusy("connectDriveBtn", false);
        }
    }

    async function disconnectOauth() {
        const dbName = selectedDatabase();
        setBusy("disconnectDriveBtn", true);
        try {
            const res = await request("/system-backup/drive/oauth/disconnect", "POST", { database_name: dbName });
            notifySuccess(res?.message || "Google account disconnected.");
            await loadBackupConfig();
        } finally {
            setBusy("disconnectDriveBtn", false);
        }
    }

    async function testDrive() {
        const dbName = selectedDatabase();
        const authType = selectedAuthType();
        const payload = {
            database_name: dbName,
            drive_auth_type: authType,
            drive_root_folder_name: String(driveRootFolderEl.value || "").trim() || "AXIS CMS PULMO",
        };
        const rawServiceCredentials = String(driveCredentialsEl.value || "").trim();
        const rawOauthClient = String(driveOauthClientEl.value || "").trim();

        if (authType === "oauth") {
            if (rawOauthClient) {
                payload.drive_oauth_client_json = rawOauthClient;
            }
            if (!hasConnectedOauth) {
                setDriveStatus("Google account is not connected.", true);
                notifyError("Click Connect Google Account first.");
                return;
            }
        } else {
            if (!rawServiceCredentials && !hasSavedDriveCredentials) {
                setDriveStatus("Google Drive credentials JSON is required.", true);
                notifyError("No saved Service Account credentials found.");
                return;
            }
            if (rawServiceCredentials) {
                payload.drive_credentials_json = rawServiceCredentials;
            }
        }

        setBusy("testDriveBtn", true);
        setDriveStatus("Testing Google Drive...", false);
        try {
            const res = await request("/system-backup/drive/test", "POST", payload);
            const root = res?.result?.folder_path || res?.result?.root_folder_name || "AXIS CMS PULMO";
            notifySuccess(`${res?.message || "Google Drive connection successful."} | ${root}`, 3400);
            setDriveStatus(`Connected: ${root}`, false);
        } catch (err) {
            const message = err?.message || "Google Drive test failed.";
            setDriveStatus(message, true);
            notifyError(message, 4500);
        } finally {
            setBusy("testDriveBtn", false);
        }
    }

    async function syncInvoicesAndQuotations() {
        const dbName = selectedDatabase();
        setBusy("syncInvoicesBtn", true);
        try {
            const res = await request("/system-backup/sync/invoices", "POST", { database_name: dbName });
            const result = res?.result || {};
            notifySuccess(
                `${res?.message || "Sync completed."}\n`
                + `Invoices: ${Number(result.synced_invoices || 0)}\n`
                + `Quatations: ${Number(result.synced_quotations || 0)}`,
                3600
            );
        } finally {
            setBusy("syncInvoicesBtn", false);
        }
    }

    async function runDatabaseBackupNow() {
        const dbName = selectedDatabase();
        setBusy("runDbBackupBtn", true);
        try {
            const res = await request("/system-backup/sync/db-now", "POST", { database_name: dbName });
            notifySuccess(res?.message || "Database backup uploaded.");
            await loadBackupHistory();
        } finally {
            setBusy("runDbBackupBtn", false);
        }
    }

    async function loadBackupHistory() {
        const dbName = selectedDatabase();
        const res = await request(`/system-backup/db-history?database_name=${encodeURIComponent(dbName)}&auto_run_daily=true`, "GET");
        const autoDaily = res?.auto_daily || {};
        if (autoDaily.error && autoDaily.reason) {
            setDriveStatus(String(autoDaily.reason), true);
            notifyError(String(autoDaily.reason), 4500);
        } else if (autoDaily.sync_error) {
            setDriveStatus(String(autoDaily.sync_error), true);
            notifyError(String(autoDaily.sync_error), 4500);
        }
        const rows = Array.isArray(res?.backups) ? res.backups : [];
        historyBodyEl.innerHTML = "";
        if (!rows.length) {
            historyBodyEl.innerHTML = `<tr><td colspan="5" style="text-align:center;">No Google Drive DB backups found.</td></tr>`;
        } else {
            rows.forEach((row) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${row.database_name || dbName}</td>
                    <td>${row.backup_date ? new Date(row.backup_date).toLocaleString() : "-"}</td>
                    <td>${row.drive_file_name || "-"}</td>
                    <td>${fmtBytes(row.file_size_bytes)}</td>
                    <td>${row.drive_folder_path || "-"}</td>
                `;
                historyBodyEl.appendChild(tr);
            });
        }
    }

    async function checkTools() {
        const status = await request("/system-backup/status", "GET");
        const pgDump = status?.tools?.pg_dump;
        const psql = status?.tools?.psql;
        if (status?.ok) {
            notifySuccess("Backup tools are ready.");
            return;
        }
        notifyError(
            `Tools not ready.\n\n`
            + `pg_dump: ${pgDump?.available ? "OK" : "Missing"}\n`
            + `Command: ${pgDump?.command || "N/A"}\n\n`
            + `psql: ${psql?.available ? "OK" : "Missing"} | `
            + `Command: ${psql?.command || "N/A"}`,
            5000
        );
    }

    async function downloadBackup() {
        const token = localStorage.getItem("token");
        if (!token) {
            notifyError("Please login first.");
            return;
        }
        const dbName = selectedDatabase();
        const apiBase = (window.BASE_URL || `${window.location.origin.replace(/\/+$/, "")}/api`).replace(/\/+$/, "");
        const url = `${apiBase}/system-backup/download?database_name=${encodeURIComponent(dbName)}&mode=full`;
        const res = await fetch(url, {
            method: "GET",
            headers: { Authorization: "Bearer " + token },
        });
        if (!res.ok) {
            const raw = await res.text();
            let message = "Failed to create backup";
            try {
                message = JSON.parse(raw).message || message;
            } catch (_err) {
                if (raw) message = raw;
            }
            throw new Error(message);
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") || "";
        const fileNameMatch = disposition.match(/filename="([^"]+)"/i);
        const fileName = (fileNameMatch && fileNameMatch[1]) ? fileNameMatch[1] : `${dbName}_backup_${Date.now()}.sql`;
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(link.href);
        notifySuccess("Backup download started.");
    }

    function openRestorePicker() {
        restoreDbFileInputEl.value = "";
        restoreDbFileInputEl.click();
    }

    async function restoreBackupFromFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (!String(file.name || "").toLowerCase().endsWith(".sql")) {
            notifyError("Please select a .sql backup file.");
            return;
        }
        if (!confirm("This will restore the selected SQL into the selected database. Continue?")) return;

        const dbName = selectedDatabase();
        const sqlText = await file.text();
        await request("/system-backup/restore", "POST", {
            database_name: dbName,
            fileName: file.name,
            sqlText,
        });
        notifySuccess("Database restore completed.");
    }

    async function handleDatabaseChange() {
        await loadBackupConfig();
        await loadBackupHistory();
    }

    function onAuthTypeChange() {
        applyAuthModeUI();
        refreshStatusFromSettings();
    }

    async function init() {
        const role = String(localStorage.getItem("role") || "").trim().toLowerCase();
        if (role !== "admin") {
            notifyError("Only admin can access Backup page.");
            window.location.href = "../dashboard.html";
            return;
        }

        if (typeof window.__waitForUserAccessPermissions === "function") {
            await window.__waitForUserAccessPermissions();
        }

        await loadDatabases();
        await handleDatabaseChange();

        dbSelectEl.addEventListener("change", handleDatabaseChange);
        driveAuthTypeEl.addEventListener("change", onAuthTypeChange);
        byId("saveBackupConfigBtn").addEventListener("click", () => saveBackupConfig().catch((err) => notifyError(err.message || "Failed to save backup settings.")));
        byId("testDriveBtn").addEventListener("click", () => testDrive().catch((err) => notifyError(err.message || "Google Drive test failed.")));
        byId("connectDriveBtn").addEventListener("click", () => startOauthConnectFlow().catch((err) => notifyError(err.message || "Failed to start Google OAuth.")));
        byId("disconnectDriveBtn").addEventListener("click", () => disconnectOauth().catch((err) => notifyError(err.message || "Failed to disconnect Google account.")));
        byId("syncInvoicesBtn").addEventListener("click", () => syncInvoicesAndQuotations().catch((err) => notifyError(err.message || "Failed to sync invoice/quotation backups.")));
        byId("runDbBackupBtn").addEventListener("click", () => runDatabaseBackupNow().catch((err) => notifyError(err.message || "Failed to run DB backup.")));
        byId("refreshHistoryBtn").addEventListener("click", () => loadBackupHistory().catch((err) => notifyError(err.message || "Failed to refresh backup history.")));
        byId("checkToolsBtn").addEventListener("click", () => checkTools().catch((err) => notifyError(err.message || "Failed to check tools.")));
        byId("downloadBackupBtn").addEventListener("click", () => downloadBackup().catch((err) => notifyError(err.message || "Failed to download backup.")));
        byId("restoreBackupBtn").addEventListener("click", openRestorePicker);
        restoreDbFileInputEl.addEventListener("change", (event) => restoreBackupFromFile(event).catch((err) => notifyError(err.message || "Failed to restore backup.")));
    }

    window.addEventListener("DOMContentLoaded", () => {
        init().catch((err) => notifyError(err.message || "Failed to load Backup page."));
    });
})();
