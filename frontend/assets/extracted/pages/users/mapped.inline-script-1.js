const userSelectEl = document.getElementById("userSelect");
        const databaseSelectEl = document.getElementById("databaseSelect");
        const companySelectEl = document.getElementById("companySelect");
        const mappingEmailEl = document.getElementById("mappingEmail");
        const userCompanyNameEl = document.getElementById("userCompanyName");
        const databaseCompanyNameEl = document.getElementById("databaseCompanyName");
        const selectedCompanyNameEl = document.getElementById("selectedCompanyName");
        const selectedCompanyCodeEl = document.getElementById("selectedCompanyCode");
        const selectedCompanyEmailEl = document.getElementById("selectedCompanyEmail");
        const verifyStatusEl = document.getElementById("verifyStatus");
        const verifyBtnEl = document.getElementById("verifyBtn");
        const mappedBtnEl = document.getElementById("mappedBtn");

        const MAPPED_PATH = "/users/mapped.html";
        let canAddMapped = false;
        let isVerified = false;
        let users = [];
        let databases = [];
        let companies = [];

        function findUser(userId){
            return users.find((u) => Number(u.id) === Number(userId)) || null;
        }

        function findDb(name){
            const target = String(name || "").trim().toLowerCase();
            return databases.find((d) => String(d.name || "").trim().toLowerCase() === target) || null;
        }

        function findCompany(companyId){
            return companies.find((c) => Number(c.id) === Number(companyId)) || null;
        }

        function updateNameViews(){
            const user = findUser(userSelectEl.value);
            const db = findDb(databaseSelectEl.value);
            const company = findCompany(companySelectEl.value);
            userCompanyNameEl.textContent = user ? String(user.company_name || "-") : "-";
            databaseCompanyNameEl.textContent = db ? String(db.company_name || "-") : "-";
            selectedCompanyNameEl.textContent = company ? String(company.company_name || "-") : "-";
            selectedCompanyCodeEl.textContent = company ? String(company.company_code || "-") : "-";
            selectedCompanyEmailEl.textContent = company ? String(company.email || "-") : "-";
            if(company){
                mappingEmailEl.value = String(company.email || "").trim().toLowerCase();
            }
        }

        function resetVerifyState(){
            isVerified = false;
            verifyStatusEl.textContent = "Not verified";
        }

        function selectedPayload(){
            return {
                user_id: Number(userSelectEl.value || 0),
                database_name: String(databaseSelectEl.value || "").trim().toLowerCase(),
                company_profile_id: Number(companySelectEl.value || 0),
                email: String(mappingEmailEl.value || "").trim().toLowerCase()
            };
        }

        async function loadMeta(){
            const res = await request("/users/mapped/meta", "GET");
            users = Array.isArray(res.users) ? res.users : [];
            databases = Array.isArray(res.databases) ? res.databases : [];
            companies = Array.isArray(res.companies) ? res.companies : [];

            userSelectEl.innerHTML = `<option value="">Select user</option>`;
            users.forEach((u) => {
                const opt = document.createElement("option");
                opt.value = String(u.id);
                opt.textContent = `${u.username || "User"} (${u.email || ""})`;
                userSelectEl.appendChild(opt);
            });

            databaseSelectEl.innerHTML = `<option value="">Select database</option>`;
            databases.forEach((d) => {
                const opt = document.createElement("option");
                opt.value = String(d.name || "");
                opt.textContent = String(d.label || d.name || "");
                databaseSelectEl.appendChild(opt);
            });

            companySelectEl.innerHTML = `<option value="">Select company</option>`;
            companies.forEach((c) => {
                const opt = document.createElement("option");
                opt.value = String(c.id);
                const code = String(c.company_code || "").trim();
                const email = String(c.email || "").trim();
                opt.textContent = `${String(c.company_name || "")}${code ? ` [${code}]` : ""}${email ? ` (${email})` : ""}`;
                companySelectEl.appendChild(opt);
            });
        }

        async function loadUserMapping(){
            const userId = Number(userSelectEl.value || 0);
            if(!userId){
                return;
            }
            try{
                const res = await request(`/users/mapped/${userId}`, "GET");
                const m = res && res.mapping ? res.mapping : null;
                if(!m) return;
                if(m.database_name){
                    databaseSelectEl.value = String(m.database_name).toLowerCase();
                }
                if(m.company_profile_id){
                    companySelectEl.value = String(m.company_profile_id);
                }
                if(m.company_name){
                    selectedCompanyNameEl.textContent = String(m.company_name || "-");
                }
                if(m.company_code){
                    selectedCompanyCodeEl.textContent = String(m.company_code || "-");
                }
                if(m.email){
                    selectedCompanyEmailEl.textContent = String(m.email || "-");
                }
                if(m.mapped_email){
                    mappingEmailEl.value = String(m.mapped_email || "").trim().toLowerCase();
                }else if(m.email){
                    mappingEmailEl.value = String(m.email || "").trim().toLowerCase();
                }
            }catch(_err){
            }
        }

        async function verifyMapping(){
            if(!canAddMapped){
                alert("You do not have add permission for Mapped page.");
                return;
            }
            const payload = selectedPayload();
            if(!payload.user_id || !payload.database_name || !payload.company_profile_id || !payload.email){
                alert("Please select user, database, company and email.");
                return;
            }
            try{
                const res = await request("/users/mapped/verify", "POST", payload);
                isVerified = !!res.verified;
                if(res.names){
                    userCompanyNameEl.textContent = String(res.names.user_company_name || "-");
                    databaseCompanyNameEl.textContent = String(res.names.database_company_name || "-");
                    selectedCompanyNameEl.textContent = String(res.names.selected_company_name || "-");
                }
                verifyStatusEl.textContent = isVerified ? "Verified" : "Not Verified (company names mismatch)";
                showMessageBox(res.message || (isVerified ? "Verified" : "Not verified"), isVerified ? "success" : "error");
            }catch(err){
                isVerified = false;
                verifyStatusEl.textContent = "Not verified";
                alert(err.message || "Failed to verify mapping");
            }
        }

        async function saveMapping(){
            if(!canAddMapped){
                alert("You do not have add permission for Mapped page.");
                return;
            }
            if(!isVerified){
                alert("Please verify before mapped.");
                return;
            }
            const payload = selectedPayload();
            if(!payload.user_id || !payload.database_name || !payload.company_profile_id || !payload.email){
                alert("Please select user, database, company and email.");
                return;
            }
            try{
                const res = await request("/users/mapped/save", "POST", payload);
                showMessageBox(res.message || "Mapped successfully");
            }catch(err){
                alert(err.message || "Failed to save mapping");
            }
        }

        async function applyPermissionState(){
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            canAddMapped = !!window.hasUserActionPermission && window.hasUserActionPermission(MAPPED_PATH, "add");
            verifyBtnEl.style.display = canAddMapped ? "" : "none";
            mappedBtnEl.style.display = canAddMapped ? "" : "none";
        }

        userSelectEl.addEventListener("change", async () => {
            resetVerifyState();
            updateNameViews();
            await loadUserMapping();
            updateNameViews();
        });
        databaseSelectEl.addEventListener("change", () => {
            resetVerifyState();
            updateNameViews();
        });
        companySelectEl.addEventListener("change", () => {
            resetVerifyState();
            updateNameViews();
        });
        mappingEmailEl.addEventListener("input", () => {
            resetVerifyState();
        });

        window.verifyMapping = verifyMapping;
        window.saveMapping = saveMapping;

        (async function init(){
            const role = (localStorage.getItem("role") || "").toLowerCase();
            if(role !== "admin"){
                alert("Only admin can access this page.");
                window.location.href = "../dashboard.html";
                return;
            }
            await applyPermissionState();
            await loadMeta();
            updateNameViews();
        })();
