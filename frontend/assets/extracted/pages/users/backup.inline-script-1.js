(function () {
    const byId = (id) => document.getElementById(id);
    const dbSelectEl = byId("backupDatabaseSelect");
    const driveRootFolderEl = byId("driveRootFolderName");
    const driveCredentialsEl = byId("driveCredentialsJson");
    const driveEnabledEl = byId("driveEnabled");
    const autoBackupInvoiceEl = byId("autoBackupInvoice");
    const autoBackupQuotationEl = byId("autoBackupQuotation");
    const autoBackupDatabaseEl = byId("autoBackupDatabase");
    const driveStatusTextEl = byId("driveStatusText");
    const driveCredentialsHintEl = byId("driveCredentialsHint");
    const restoreDbFileInputEl = byId("restoreDbFileInput");
    const historyBodyEl = byId("dbBackupHistoryBody");

    let currentDatabaseName = "inventory";
    let hasSavedDriveCredentials = false;

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

    function notifyError(message, duration = 3200) {
        notify(message, "error", duration);
    }

    function selectedDatabase() {
        const val = String(dbSelectEl?.value || "").trim().toLowerCase();
        return val || currentDatabaseName || "inventory";
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
        driveCredentialsEl.value = "";
        hasSavedDriveCredentials = !!settings.credentials_saved;
        if (driveCredentialsHintEl) {
            driveCredentialsHintEl.textContent = settings.credentials_saved
                ? "Credentials are saved. For security, JSON is hidden after refresh. Paste new JSON only when replacing key."
                : "No saved credentials yet. Paste full Service Account JSON and click Save Backup Settings.";
        }

        const savedText = settings.credentials_saved ? "Credentials saved" : "Credentials not saved";
        const emailText = settings.service_account_email ? ` (${settings.service_account_email})` : "";
        setDriveStatus(`${savedText}${emailText}`, false);
    }

    async function saveBackupConfig() {
        const dbName = selectedDatabase();
        const payload = {
            database_name: dbName,
            drive_enabled: !!driveEnabledEl.checked,
            auto_backup_invoice: !!autoBackupInvoiceEl.checked,
            auto_backup_quotation: !!autoBackupQuotationEl.checked,
            auto_backup_database: !!autoBackupDatabaseEl.checked,
            drive_root_folder_name: String(driveRootFolderEl.value || "").trim() || "AXIS CMS PULMO",
        };
        const rawCredentials = String(driveCredentialsEl.value || "").trim();
        if (payload.drive_enabled && !rawCredentials && !hasSavedDriveCredentials) {
            setDriveStatus("Google Drive credentials JSON is required.", true);
            notifyError("Paste Google Drive Service Account JSON first, then Save Backup Settings.");
            return;
        }
        if (rawCredentials) {
            payload.drive_credentials_json = rawCredentials;
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

            notifySuccess(parts.join(" | "), 3600);
            driveCredentialsEl.value = "";
            await loadBackupConfig();
            await loadBackupHistory();
        } finally {
            setBusy("saveBackupConfigBtn", false);
        }
    }

    async function testDrive() {
        const dbName = selectedDatabase();
        const payload = {
            database_name: dbName,
            drive_root_folder_name: String(driveRootFolderEl.value || "").trim() || "AXIS CMS PULMO",
        };
        const rawCredentials = String(driveCredentialsEl.value || "").trim();
        if (!rawCredentials && !hasSavedDriveCredentials) {
            setDriveStatus("Google Drive credentials JSON is required.", true);
            notifyError("No saved credentials found for selected database. Paste JSON and Save Backup Settings first.");
            return;
        }
        if (rawCredentials) {
            payload.drive_credentials_json = rawCredentials;
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
            notifyError(message, 4200);
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
                `${res?.message || "Sync completed."}\n` +
                `Invoices: ${Number(result.synced_invoices || 0)}\n` +
                `Quatations: ${Number(result.synced_quotations || 0)}`,
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
            `Tools not ready.\n\n` +
            `pg_dump: ${pgDump?.available ? "OK" : "Missing"}\n` +
            `Command: ${pgDump?.command || "N/A"}\n\n` +
            `psql: ${psql?.available ? "OK" : "Missing"} | ` +
            `Command: ${psql?.command || "N/A"}`,
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
        byId("saveBackupConfigBtn").addEventListener("click", () => saveBackupConfig().catch((err) => notifyError(err.message || "Failed to save backup settings.")));
        byId("testDriveBtn").addEventListener("click", () => testDrive());
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
