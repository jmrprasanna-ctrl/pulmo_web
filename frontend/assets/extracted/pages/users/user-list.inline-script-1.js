function canShowAdminTool(path){
            const role = (localStorage.getItem("role") || "").toLowerCase();
            const hasConfiguredAccess = typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions();
            const hasPageAccess = (
                (typeof hasUserGrantedPath === "function" && hasUserGrantedPath(path))
                || (typeof hasUserActionPermission === "function" && hasUserActionPermission(path, "view"))
            );
            if(role === "admin"){
                if(!hasConfiguredAccess) return true;
                return hasPageAccess;
            }
            if(role === "manager"){
                if(!hasConfiguredAccess) return false;
                return hasPageAccess;
            }
            return hasPageAccess;
        }

        function applyTopButtonVisibility(){
            const map = [
                { id: "btnAddUser", path: "/users/add-user.html" },
                { id: "btnPreference", path: "/users/preference.html" },
                { id: "btnAccess", path: "/users/user-access.html" },
                { id: "btnLogged", path: "/users/user-logged.html" },
                { id: "btnEmailSetup", path: "/support/email-setup.html" },
                { id: "btnCheckTools", path: "/tools/check-backup.html" },
                { id: "btnBackup", path: "/tools/backup-download.html" },
                { id: "btnUploadDb", path: "/tools/upload-db.html" }
            ];
            map.forEach((item) => {
                const el = document.getElementById(item.id);
                if(!el) return;
                el.classList.toggle("is-hidden", !canShowAdminTool(item.path));
            });
        }

        function bindTopButtons(){
            const bindClick = (id, handler) => {
                const el = document.getElementById(id);
                if(el){
                    el.addEventListener("click", handler);
                }
            };
            bindClick("btnAddUser", () => { window.location.href = "add-user.html"; });
            bindClick("btnPreference", () => { window.location.href = "preference.html"; });
            bindClick("btnAccess", () => { window.location.href = "user-access.html"; });
            bindClick("btnLogged", () => { window.location.href = "user-logged.html"; });
            bindClick("btnEmailSetup", () => { window.location.href = "../support/email-setup.html"; });
            bindClick("btnCheckTools", checkBackupTools);
            bindClick("btnBackup", downloadSystemBackup);
            bindClick("btnUploadDb", openRestorePicker);
            const restoreInput = document.getElementById("restore-db-file");
            if(restoreInput){
                restoreInput.addEventListener("change", restoreSystemBackup);
            }
        }

        async function loadUsers(){
            try{
                const users = await request("/users","GET");
                const tbody = document.getElementById('user-table-body');
                tbody.innerHTML = '';
                const canEditUser = typeof hasUserActionPermission === "function"
                    && hasUserActionPermission("/users/user-list.html", "edit");
                const canDeleteUser = typeof hasUserActionPermission === "function"
                    && hasUserActionPermission("/users/user-list.html", "delete");
                users.forEach(u => {
                    const rowActions = [];
                    if(canEditUser){
                        rowActions.push(`<a class="btn btn-inline action-btn" href="edit-user.html?id=${u.id}">Edit</a>`);
                    }
                    if(canDeleteUser){
                        rowActions.push(`<button class="btn btn-danger btn-inline action-btn" type="button" onclick="deleteUser(${u.id})">Delete</button>`);
                    }
                    const actionHtml = rowActions.length
                        ? rowActions.join("")
                        : `<span class="muted">No actions</span>`;
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${u.id}</td>
                        <td>${u.username}</td>
                        <td>${u.company || ""}</td>
                        <td>${u.department || ""}</td>
                        <td>${u.telephone || ""}</td>
                        <td>${u.email}</td>
                        <td>${u.role}</td>
                        <td>
                            <div class="user-action-row">
                                ${actionHtml}
                            </div>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }catch(err){
                alert(err.message || "Failed to load users");
            }
        }

        async function deleteUser(id){
            if(!confirm("Delete this user?")) return;
            try{
                await request(`/users/${id}`,"DELETE");
                showMessageBox("User deleted");
                loadUsers();
            }catch(err){
                alert(err.message || "Failed to delete user");
            }
        }

        function setHealthBadge(id, ok){
            const el = document.getElementById(id);
            if(!el) return;
            el.classList.remove("ok", "fail", "unknown");
            if(ok === true){
                el.classList.add("ok");
                el.innerText = "OK";
                return;
            }
            if(ok === false){
                el.classList.add("fail");
                el.innerText = "Fail";
                return;
            }
            el.classList.add("unknown");
            el.innerText = "Unknown";
        }

        async function loadSystemHealthPreview(){
            try{
                const health = await request("/health","GET");
                setHealthBadge("healthOverall", !!health.ok);
                setHealthBadge("healthDb", !!health.dbConnected);
                setHealthBadge("healthPgDump", !!health?.checks?.tools?.pg_dump?.available);
                setHealthBadge("healthPsql", !!health?.checks?.tools?.psql?.available);
                setHealthBadge("healthTplInvoice", !!health?.checks?.templateFiles?.invoice?.exists);
                setHealthBadge("healthTplQuotation", !!health?.checks?.templateFiles?.quotation?.exists);
                setHealthBadge("healthTplQuotation2", !!health?.checks?.templateFiles?.quotation2?.exists);
            }catch(_err){
                setHealthBadge("healthOverall", false);
                setHealthBadge("healthDb", null);
                setHealthBadge("healthPgDump", null);
                setHealthBadge("healthPsql", null);
                setHealthBadge("healthTplInvoice", null);
                setHealthBadge("healthTplQuotation", null);
                setHealthBadge("healthTplQuotation2", null);
            }

            const updated = document.getElementById("healthUpdatedAt");
            if(updated){
                updated.innerText = `Last updated: ${new Date().toLocaleString()}`;
            }
        }

        async function downloadSystemBackup(){
            const token = localStorage.getItem("token");
            if(!token){
                alert("Please login first.");
                return;
            }

            try{
                const apiBase = (
                    window.BASE_URL ||
                    `${window.location.origin.replace(/\/+$/, "")}/api`
                ).replace(/\/+$/, "");
                const res = await fetch(`${apiBase}/system-backup/download`, {
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + token
                    }
                });

                if(!res.ok){
                    const raw = await res.text();
                    let message = "Failed to create backup";
                    try{
                        message = JSON.parse(raw).message || message;
                    }catch(_err){
                        if(raw) message = raw;
                    }
                    throw new Error(message);
                }

                const blob = await res.blob();
                const disposition = res.headers.get("Content-Disposition") || "";
                const fileNameMatch = disposition.match(/filename="([^"]+)"/i);
                const fileName = (fileNameMatch && fileNameMatch[1]) ? fileNameMatch[1] : `inventory_backup_${Date.now()}.sql`;

                                                                                                        
                if(window.showSaveFilePicker){
                    const handle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{
                            description: "SQL Backup File",
                            accept: {
                                "application/sql": [".sql"],
                                "text/sql": [".sql"],
                                "text/plain": [".sql"]
                            }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                }else{
                                                                              
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                }
                showMessageBox("Backup downloaded");
            }catch(err){
                if(err && err.name === "AbortError"){
                    return;                                
                }
                alert(err.message || "Failed to create backup");
            }
        }

        async function checkBackupTools(){
            try{
                const status = await request("/system-backup/status", "GET");
                const pgDump = status?.tools?.pg_dump;
                const psql = status?.tools?.psql;
                if(status.ok){
                    showMessageBox("Backup tools are ready");
                    return;
                }
                alert(
                    `Tools not ready.\n\n` +
                    `pg_dump: ${pgDump?.available ? "OK" : "Missing"}\n` +
                    `Command: ${pgDump?.command || "N/A"}\n\n` +
                    `psql: ${psql?.available ? "OK" : "Missing"}\n` +
                    `Command: ${psql?.command || "N/A"}`
                );
            }catch(err){
                alert(err.message || "Failed to check backup tools");
            }
        }

        function openRestorePicker(){
            const input = document.getElementById("restore-db-file");
            input.value = "";
            input.click();
        }

        async function restoreSystemBackup(event){
            const file = event.target.files && event.target.files[0];
            if(!file) return;

            if(!file.name.toLowerCase().endsWith(".sql")){
                alert("Please select a .sql backup file");
                return;
            }

            if(!confirm("This will restore the uploaded SQL to the current database. Continue?")) return;

            try{
                const sqlText = await file.text();
                await request("/system-backup/restore", "POST", {
                    fileName: file.name,
                    sqlText
                });
                showMessageBox("Database restored");
            }catch(err){
                alert(err.message || "Failed to restore database");
            }
        }

        window.addEventListener('DOMContentLoaded', async () => {
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            bindTopButtons();
            applyTopButtonVisibility();
            const healthRefreshBtn = document.getElementById("healthRefreshBtn");
            if(healthRefreshBtn){
                healthRefreshBtn.addEventListener("click", loadSystemHealthPreview);
            }
            await loadSystemHealthPreview();
            await loadUsers();
        });
