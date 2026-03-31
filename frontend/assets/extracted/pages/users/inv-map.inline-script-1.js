const userSelectEl = document.getElementById("userSelect");
        const databaseSelectEl = document.getElementById("databaseSelect");
        const featureBodyEl = document.getElementById("featureBody");
        const verifyStatusEl = document.getElementById("verifyStatus");
        const missingStatusEl = document.getElementById("missingStatus");
        const verifyBtnEl = document.getElementById("verifyBtn");
        const mappedBtnEl = document.getElementById("mappedBtn");
        const entriesBodyEl = document.getElementById("entriesBody");

        const INV_MAP_PATH = "/users/inv-map.html";
        let canAddInvMap = false;
        let canDeleteInvMap = false;
        let isVerified = false;

        const FEATURE_OPTIONS = [
            { key: "logo", label: "Logo", source: "Preference > System Logo" },
            { key: "invoice", label: "Invoice", source: "Preference > Invoice PDF" },
            { key: "quotation", label: "Quotation", source: "Preference > Quotation PDF" },
            { key: "quotation2", label: "Quotation 2", source: "Preference > Quotation 2 PDF" },
            { key: "quotation3", label: "Quotation 3", source: "Preference > Quotation 3 PDF" },
            { key: "sign_q2", label: "Sign Q2", source: "Preference > SIGN Q2" },
            { key: "seal_q2", label: "Seal Q2", source: "Preference > SEAL Q2" },
            { key: "sign_q3", label: "Sign Q3", source: "Preference > SIGN Q3" },
            { key: "seal_q3", label: "Seal Q3", source: "Preference > SEAL Q3" },
            { key: "sign_c", label: "Sign C", source: "Preference > SIGN C" },
            { key: "sign_v", label: "Sign V", source: "Preference > SIGN V" },
            { key: "seal_c", label: "Seal C", source: "Preference > SEAL C" },
            { key: "seal_v", label: "Seal V", source: "Preference > SEAL V" },
            { key: "theme", label: "Theme", source: "Preference > Theme Settings" }
        ];

        function renderFeatureRows(){
            featureBodyEl.innerHTML = "";
            FEATURE_OPTIONS.forEach((feature) => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${feature.label}</td>
                    <td>${feature.source}</td>
                    <td><input type="checkbox" data-feature-key="${feature.key}" style="width:18px;height:18px;"></td>
                `;
                featureBodyEl.appendChild(row);
            });
        }

        function getFeatureFlags(){
            const flags = {};
            FEATURE_OPTIONS.forEach((feature) => {
                const cb = featureBodyEl.querySelector(`input[type='checkbox'][data-feature-key='${feature.key}']`);
                flags[feature.key] = !!(cb && cb.checked);
            });
            return flags;
        }

        function setFeatureFlags(flags){
            const normalized = flags && typeof flags === "object" ? flags : {};
            FEATURE_OPTIONS.forEach((feature) => {
                const cb = featureBodyEl.querySelector(`input[type='checkbox'][data-feature-key='${feature.key}']`);
                if(cb){
                    cb.checked = !!normalized[feature.key];
                }
            });
        }

        function resetVerifyState(){
            isVerified = false;
            verifyStatusEl.textContent = "Not verified";
            missingStatusEl.textContent = "-";
        }

        function mappedFeatureNames(flags){
            const normalized = flags && typeof flags === "object" ? flags : {};
            const names = FEATURE_OPTIONS
                .filter((feature) => !!normalized[feature.key])
                .map((feature) => feature.label);
            return names.length ? names.join(", ") : "-";
        }

        async function loadInvMapEntries(){
            try{
                const res = await request("/users/inv-map/entries", "GET");
                const entries = Array.isArray(res.entries) ? res.entries : [];
                if(!entries.length){
                    entriesBodyEl.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#5d6f85;">No mapped entries</td></tr>`;
                    return;
                }
                entriesBodyEl.innerHTML = "";
                entries.forEach((entry) => {
                    const row = document.createElement("tr");
                    const userLabel = `${entry.username || "User"}${entry.email ? ` (${entry.email})` : ""}`;
                    const actionHtml = (canDeleteInvMap || canAddInvMap)
                        ? `<button class="btn btn-secondary" type="button" onclick="deleteInvMapEntry(${Number(entry.id)})">Delete</button>`
                        : "-";
                    row.innerHTML = `
                        <td>${userLabel}</td>
                        <td>${mappedFeatureNames(entry.feature_flags)}</td>
                        <td>${entry.database_name || "-"}</td>
                        <td>${entry.is_verified ? "Verified" : "Not verified"}</td>
                        <td>${actionHtml}</td>
                    `;
                    entriesBodyEl.appendChild(row);
                });
            }catch(err){
                entriesBodyEl.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#a33a3a;">${err.message || "Failed to load mapped entries"}</td></tr>`;
            }
        }

        async function loadUsers(){
            const res = await request("/users/access-users", "GET");
            const users = Array.isArray(res.users) ? res.users : [];
            userSelectEl.innerHTML = `<option value="">Select user</option>`;
            users.forEach((u) => {
                const opt = document.createElement("option");
                opt.value = String(u.selection_key || "");
                opt.textContent = u.label || `${u.username || "User"} (${u.email || ""})`;
                opt.dataset.databaseName = String(u.database_name || "").trim().toLowerCase();
                userSelectEl.appendChild(opt);
            });
        }

        async function loadDatabases(){
            const res = await request("/users/databases", "GET");
            const dbs = Array.isArray(res.databases) ? res.databases : [];
            databaseSelectEl.innerHTML = `<option value="">Select database</option>`;
            dbs.forEach((d) => {
                const opt = document.createElement("option");
                opt.value = String(d.name || "").toLowerCase();
                opt.textContent = d.label || d.name || "";
                databaseSelectEl.appendChild(opt);
            });
            const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
            if(selectedDb){
                databaseSelectEl.value = selectedDb;
            }
        }

        async function loadExistingMapping(){
            const userRef = String(userSelectEl.value || "").trim();
            const databaseName = String(databaseSelectEl.value || "").trim().toLowerCase();
            if(!userRef || !databaseName){
                setFeatureFlags({});
                return;
            }
            try{
                const res = await request(`/users/inv-map/${encodeURIComponent(userRef)}?database_name=${encodeURIComponent(databaseName)}`, "GET");
                const mapping = res && res.mapping ? res.mapping : null;
                if(mapping && mapping.feature_flags){
                    setFeatureFlags(mapping.feature_flags);
                    verifyStatusEl.textContent = mapping.is_verified ? "Verified" : "Not verified";
                    isVerified = !!mapping.is_verified;
                }else{
                    setFeatureFlags({});
                    resetVerifyState();
                }
            }catch(_err){
                setFeatureFlags({});
                resetVerifyState();
            }
        }

        async function verifyInvMap(){
            if(!canAddInvMap){
                alert("You do not have add permission for Inv Map page.");
                return;
            }
            const userRef = String(userSelectEl.value || "").trim();
            const databaseName = String(databaseSelectEl.value || "").trim().toLowerCase();
            if(!userRef || !databaseName){
                alert("Please select user and database.");
                return;
            }
            try{
                const res = await request("/users/inv-map/verify", "POST", {
                    user_ref: userRef,
                    database_name: databaseName,
                    feature_flags: getFeatureFlags()
                });
                isVerified = !!res.verified;
                verifyStatusEl.textContent = isVerified ? "Verified" : "Not verified";
                missingStatusEl.textContent = Array.isArray(res.missing) && res.missing.length ? res.missing.join(", ") : "-";
                showMessageBox(res.message || (isVerified ? "Verified" : "Not verified"), isVerified ? "success" : "error");
            }catch(err){
                isVerified = false;
                verifyStatusEl.textContent = "Not verified";
                missingStatusEl.textContent = "-";
                alert(err.message || "Failed to verify Inv Map");
            }
        }

        async function saveInvMap(){
            if(!canAddInvMap){
                alert("You do not have add permission for Inv Map page.");
                return;
            }
            if(!isVerified){
                alert("Please verify before mapped.");
                return;
            }
            const userRef = String(userSelectEl.value || "").trim();
            const databaseName = String(databaseSelectEl.value || "").trim().toLowerCase();
            if(!userRef || !databaseName){
                alert("Please select user and database.");
                return;
            }
            try{
                const res = await request("/users/inv-map/save", "POST", {
                    user_ref: userRef,
                    database_name: databaseName,
                    feature_flags: getFeatureFlags()
                });
                showMessageBox(res.message || "Inv Map saved successfully");
                await loadInvMapEntries();
            }catch(err){
                alert(err.message || "Failed to save Inv Map");
            }
        }

        async function deleteInvMapEntry(entryId){
            if(!canDeleteInvMap){
                alert("You do not have delete permission for Inv Map page.");
                return;
            }
            const id = Number(entryId || 0);
            if(!id) return;
            if(!confirm("Delete this mapped entry?")){
                return;
            }
            try{
                const res = await request(`/users/inv-map/entries/${id}`, "DELETE");
                showMessageBox(res.message || "Inv Map entry deleted");
                await loadInvMapEntries();
            }catch(err){
                alert(err.message || "Failed to delete Inv Map entry");
            }
        }

        async function applyPermissionState(){
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            const hasActionPermission = (action) => !!window.hasUserActionPermission && window.hasUserActionPermission(INV_MAP_PATH, action);
            canAddInvMap = hasActionPermission("add");
            canDeleteInvMap = hasActionPermission("delete") || canAddInvMap;
            const canViewInvMap = !!window.hasUserActionPermission && window.hasUserActionPermission(INV_MAP_PATH, "view");
            if(!canViewInvMap){
                alert("You do not have permission to view Inv Map.");
                window.location.href = "user-access.html";
                return false;
            }
            verifyBtnEl.style.display = canAddInvMap ? "" : "none";
            mappedBtnEl.style.display = canAddInvMap ? "" : "none";
            return true;
        }

        userSelectEl.addEventListener("change", async () => {
            resetVerifyState();
            const selectedOption = userSelectEl.options[userSelectEl.selectedIndex];
            const mappedDb = String(selectedOption?.dataset?.databaseName || "").trim().toLowerCase();
            if(mappedDb){
                const exists = Array.from(databaseSelectEl.options).some((opt) => String(opt.value || "").trim().toLowerCase() === mappedDb);
                if(exists){
                    databaseSelectEl.value = mappedDb;
                }
            }
            await loadExistingMapping();
        });
        databaseSelectEl.addEventListener("change", async () => {
            resetVerifyState();
            await loadExistingMapping();
        });
        featureBodyEl.addEventListener("change", () => {
            resetVerifyState();
        });

        window.verifyInvMap = verifyInvMap;
        window.saveInvMap = saveInvMap;
        window.deleteInvMapEntry = deleteInvMapEntry;

        (async function init(){
            const role = (localStorage.getItem("role") || "").toLowerCase();
            if(role !== "admin"){
                alert("Only admin can access this page.");
                window.location.href = "../dashboard.html";
                return;
            }
            renderFeatureRows();
            const allowed = await applyPermissionState();
            if(!allowed) return;
            await Promise.all([loadUsers(), loadDatabases()]);
            await loadExistingMapping();
            await loadInvMapEntries();
        })();
