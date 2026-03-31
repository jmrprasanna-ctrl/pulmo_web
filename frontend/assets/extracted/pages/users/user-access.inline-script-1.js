const userSelectEl = document.getElementById("userSelect");
        const databaseSelectEl = document.getElementById("databaseSelect");
        const superUserCheckboxEl = document.getElementById("superUserCheckbox");
        const accessMatrixEl = document.getElementById("accessMatrix");
        let moduleOptions = [];
        let defaultDatabaseName = "inventory";

        function toActionKey(path, action){
            return `${String(path || "").trim().toLowerCase()}::${String(action || "").trim().toLowerCase()}`;
        }

        function normalizeActionLabel(action){
            const val = String(action || "").trim().toLowerCase();
            if(val === "view") return "View";
            if(val === "add") return "Add";
            if(val === "edit") return "Edit";
            if(val === "delete") return "Delete";
            return val;
        }

        function getSelectedActionValues(){
            return Array.from(accessMatrixEl.querySelectorAll("input[type='checkbox'][data-action-key]:checked"))
                .map((cb) => cb.dataset.actionKey)
                .filter(Boolean);
        }

        function renderAccessMatrix(){
            accessMatrixEl.innerHTML = "";
            moduleOptions.forEach((group) => {
                const card = document.createElement("div");
                card.className = "module-card";

                const header = document.createElement("div");
                header.className = "module-head";
                header.textContent = group.module || "Module";
                card.appendChild(header);

                const table = document.createElement("table");
                table.className = "matrix-table";
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>Page</th>
                            <th class="check-col">View</th>
                            <th class="check-col">Add</th>
                            <th class="check-col">Edit</th>
                            <th class="check-col">Delete</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;

                const tbody = table.querySelector("tbody");
                (Array.isArray(group.items) ? group.items : []).forEach((item) => {
                    const actions = new Set((Array.isArray(item.actions) ? item.actions : []).map((a) => String(a || "").toLowerCase()));
                    const row = document.createElement("tr");

                    const pageCell = document.createElement("td");
                    pageCell.innerHTML = `
                        <div>${item.label || item.path || ""}</div>
                        <div class="path-hint">${item.path || ""}</div>
                    `;
                    row.appendChild(pageCell);

                    ["view", "add", "edit", "delete"].forEach((action) => {
                        const cell = document.createElement("td");
                        cell.className = "check-col";
                        if(actions.has(action)){
                            const cb = document.createElement("input");
                            cb.type = "checkbox";
                            cb.dataset.path = item.path || "";
                            cb.dataset.action = action;
                            cb.dataset.actionKey = toActionKey(item.path, action);
                            cb.title = `${item.label || item.path} - ${normalizeActionLabel(action)}`;
                            cell.appendChild(cb);
                        }else{
                            cell.textContent = "-";
                        }
                        row.appendChild(cell);
                    });

                    tbody.appendChild(row);
                });

                card.appendChild(table);
                accessMatrixEl.appendChild(card);
            });
        }

        function setCheckedActions(actionKeys){
            const set = new Set((Array.isArray(actionKeys) ? actionKeys : []).map((x) => String(x || "").trim().toLowerCase()));
            accessMatrixEl.querySelectorAll("input[type='checkbox'][data-action-key]").forEach((cb) => {
                cb.checked = set.has(String(cb.dataset.actionKey || "").toLowerCase());
            });
        }

        async function loadUsers(){
            try{
                const res = await request("/users/access-users", "GET");
                const users = Array.isArray(res.users) ? res.users : [];
                userSelectEl.innerHTML = `<option value="">Select user</option>`;
                users.forEach((u) => {
                    const opt = document.createElement("option");
                    opt.value = u.selection_key;
                    opt.textContent = u.label || `${u.username} (${u.email})`;
                    userSelectEl.appendChild(opt);
                });
            }catch(err){
                alert(err.message || "Failed to load users");
            }
        }

        async function loadAccessPages(){
            try{
                const res = await request("/users/access-pages", "GET");
                moduleOptions = Array.isArray(res.modules) ? res.modules : [];
                renderAccessMatrix();
            }catch(err){
                alert(err.message || "Failed to load access pages");
            }
        }

        async function loadDatabases(){
            try{
                const res = await request("/users/databases", "GET");
                const rows = Array.isArray(res.databases) ? res.databases : [];
                const normalizedRows = [];
                const seen = new Set();
                rows.forEach((entry) => {
                    const dbName = String(entry?.name || entry || "").trim().toLowerCase();
                    if(!dbName || seen.has(dbName)) return;
                    seen.add(dbName);
                    normalizedRows.push({
                        name: dbName,
                        label: String(entry?.label || dbName).trim() || dbName
                    });
                });
                const currentDb = String(res.current || "").trim().toLowerCase();
                databaseSelectEl.innerHTML = `<option value="">Select database</option>`;
                normalizedRows.forEach((entry) => {
                    const opt = document.createElement("option");
                    opt.value = entry.name;
                    opt.textContent = entry.label;
                    databaseSelectEl.appendChild(opt);
                });
                if(normalizedRows.some((x) => x.name === "inventory")){
                    defaultDatabaseName = "inventory";
                }else if(currentDb){
                    defaultDatabaseName = currentDb;
                }else if(normalizedRows.length){
                    defaultDatabaseName = normalizedRows[0].name;
                }
                if(defaultDatabaseName){
                    databaseSelectEl.value = defaultDatabaseName;
                }
            }catch(err){
                alert(err.message || "Failed to load databases");
            }
        }

        async function editAccess(){
            const selectedRef = String(userSelectEl.value || "").trim();
            if(!selectedRef){
                alert("Please select a user.");
                return;
            }
            try{
                const res = await request(`/users/access/${encodeURIComponent(selectedRef)}`, "GET");
                const actions = Array.isArray(res.allowed_actions) ? res.allowed_actions : [];
                setCheckedActions(actions);
                superUserCheckboxEl.checked = !!res.super_user;
                superUserCheckboxEl.disabled = res.can_edit_super_user === false;
                if(res.database_name){
                    databaseSelectEl.value = res.database_name;
                }else if(defaultDatabaseName){
                    databaseSelectEl.value = defaultDatabaseName;
                }
                showMessageBox("Access loaded");
            }catch(err){
                alert(err.message || "Failed to load access settings");
            }
        }

        async function saveAccess(){
            const selectedRef = String(userSelectEl.value || "").trim();
            if(!selectedRef){
                alert("Please select a user.");
                return;
            }

            const allowedActions = getSelectedActionValues();
            const allowedPages = Array.from(new Set(
                allowedActions
                    .filter((k) => String(k).toLowerCase().endsWith("::view"))
                    .map((k) => k.slice(0, k.lastIndexOf("::")))
            ));

            const payload = {
                allowed_actions: allowedActions,
                allowed_pages: allowedPages,
                database_name: databaseSelectEl.value || null,
                super_user: !!superUserCheckboxEl.checked
            };

            try{
                await request(`/users/access/${encodeURIComponent(selectedRef)}`, "PUT", payload);
                showMessageBox("Access saved");
            }catch(err){
                alert(err.message || "Failed to save access settings");
            }
        }

        function selectAllAccess(){
            accessMatrixEl.querySelectorAll("input[type='checkbox'][data-action-key]").forEach((cb) => {
                cb.checked = true;
            });
        }

        function clearAccess(){
            accessMatrixEl.querySelectorAll("input[type='checkbox'][data-action-key]").forEach((cb) => {
                cb.checked = false;
            });
        }

        userSelectEl.addEventListener("change", async () => {
            if(userSelectEl.value){
                await editAccess();
            }else{
                clearAccess();
                superUserCheckboxEl.checked = false;
                superUserCheckboxEl.disabled = true;
                if(defaultDatabaseName){
                    databaseSelectEl.value = defaultDatabaseName;
                }
            }
        });

        window.saveAccess = saveAccess;
        window.editAccess = editAccess;
        window.selectAllAccess = selectAllAccess;
        window.clearAccess = clearAccess;

        (async function init(){
            const role = (localStorage.getItem("role") || "").toLowerCase();
            if(role !== "admin"){
                alert("Only admin can access this page.");
                window.location.href = "../dashboard.html";
                return;
            }
            await Promise.all([loadUsers(), loadAccessPages(), loadDatabases()]);
            superUserCheckboxEl.checked = false;
            superUserCheckboxEl.disabled = true;
            const queryUserId = new URLSearchParams(window.location.search).get("userId");
            if(queryUserId){
                const inventoryRef = `inventory:${queryUserId}`;
                userSelectEl.value = inventoryRef;
                if(userSelectEl.value){
                    await editAccess();
                }
            }
        })();
