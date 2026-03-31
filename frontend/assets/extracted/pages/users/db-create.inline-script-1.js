const databaseNameEl = document.getElementById("databaseName");
        const companyNameEl = document.getElementById("companyName");
        const createdDbTableBodyEl = document.getElementById("createdDbTableBody");
        const saveDbBtnEl = document.getElementById("saveDbBtn");
        const DB_CREATE_PATH = "/users/db-create.html";
        let canAddDb = false;
        let canDeleteDb = false;

        function sanitizeDbNameForInput(value){
            return String(value || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_")
                .replace(/[^a-z0-9_]/g, "")
                .replace(/_+/g, "_")
                .replace(/^_+|_+$/g, "");
        }

        function toDbIdentifier(value){
            return String(value || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_")
                .replace(/[^a-z0-9_]/g, "")
                .replace(/_+/g, "_")
                .replace(/^_+|_+$/g, "");
        }

        async function saveDatabase(){
            if(!canAddDb){
                alert("You do not have add permission for DB Create page.");
                return;
            }
            const databaseName = toDbIdentifier(databaseNameEl.value);
            const companyName = String(companyNameEl.value || "").trim().toUpperCase();

            if(!databaseName){
                alert("Please enter valid database name.");
                return;
            }
            if(!companyName){
                alert("Please enter company name.");
                return;
            }

            try{
                const res = await request("/users/databases/create", "POST", {
                    database_name: databaseName,
                    company_name: companyName
                });
                showMessageBox(res.message || "Database created");
                await loadCreatedDatabases();
                setTimeout(() => {
                    window.location.href = "user-access.html";
                }, 500);
            }catch(err){
                alert(err.message || "Failed to create database");
            }
        }

        function formatDate(value){
            if(!value) return "-";
            const dt = new Date(value);
            if(Number.isNaN(dt.getTime())) return "-";
            return dt.toLocaleDateString();
        }

        async function loadCreatedDatabases(){
            createdDbTableBodyEl.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
            try{
                const res = await request("/users/databases/created", "GET");
                const rows = Array.isArray(res.databases) ? res.databases : [];
                if(!rows.length){
                    createdDbTableBodyEl.innerHTML = `<tr><td colspan="4">No created databases found.</td></tr>`;
                    return;
                }
                createdDbTableBodyEl.innerHTML = "";
                rows.forEach((row) => {
                    const tr = document.createElement("tr");
                    const deleteAction = canDeleteDb
                        ? `<button class="btn btn-secondary" type="button" data-delete-db="${String(row.name || "")}" style="min-width:90px;">Delete</button>`
                        : `<span>-</span>`;
                    tr.innerHTML = `
                        <td>${String(row.name || "")}</td>
                        <td>${String(row.company_name || "")}</td>
                        <td>${formatDate(row.created_at)}</td>
                        <td class="actions">
                            ${deleteAction}
                        </td>
                    `;
                    createdDbTableBodyEl.appendChild(tr);
                });
            }catch(err){
                createdDbTableBodyEl.innerHTML = `<tr><td colspan="4">${String(err.message || "Failed to load databases")}</td></tr>`;
            }
        }

        async function deleteDatabase(databaseName){
            if(!canDeleteDb){
                alert("You do not have delete permission for DB Create page.");
                return;
            }
            const name = String(databaseName || "").trim().toLowerCase();
            if(!name) return;
            const ok = window.confirm(`Delete database '${name}'?`);
            if(!ok) return;
            try{
                await request(`/users/databases/${encodeURIComponent(name)}`, "DELETE");
                showMessageBox("Database deleted");
                await loadCreatedDatabases();
            }catch(err){
                alert(err.message || "Failed to delete database");
            }
        }

        databaseNameEl.addEventListener("input", () => {
            const cleaned = sanitizeDbNameForInput(databaseNameEl.value);
            if(databaseNameEl.value !== cleaned){
                databaseNameEl.value = cleaned;
            }
        });
        databaseNameEl.style.textTransform = "lowercase";
        companyNameEl.style.textTransform = "uppercase";
        companyNameEl.addEventListener("input", () => {
            const pos = companyNameEl.selectionStart;
            const upper = String(companyNameEl.value || "").toUpperCase();
            if(companyNameEl.value !== upper){
                companyNameEl.value = upper;
                if(typeof pos === "number"){
                    companyNameEl.setSelectionRange(pos, pos);
                }
            }
        });
        createdDbTableBodyEl.addEventListener("click", async (ev) => {
            const btn = ev.target.closest("button[data-delete-db]");
            if(!btn) return;
            await deleteDatabase(btn.getAttribute("data-delete-db"));
        });

        window.saveDatabase = saveDatabase;

        async function applyPermissionState(){
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            canAddDb = !!window.hasUserActionPermission && window.hasUserActionPermission(DB_CREATE_PATH, "add");
            canDeleteDb = !!window.hasUserActionPermission && window.hasUserActionPermission(DB_CREATE_PATH, "delete");
            if(saveDbBtnEl){
                saveDbBtnEl.style.display = canAddDb ? "" : "none";
            }
        }

        (async function init(){
            const role = (localStorage.getItem("role") || "").toLowerCase();
            if(role !== "admin"){
                alert("Only admin can access this page.");
                window.location.href = "../dashboard.html";
                return;
            }
            await applyPermissionState();
            await loadCreatedDatabases();
        })();
