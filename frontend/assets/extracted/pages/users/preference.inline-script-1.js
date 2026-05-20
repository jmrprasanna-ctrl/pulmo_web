function byId(id){
            return document.getElementById(id);
        }

        const SYSTEM_PREFERENCE_PATH = "/users/preference.html";

        function setText(id, value){
            const el = byId(id);
            if(!el) return;
            el.textContent = value;
        }

        function getTargetContextPayload(){
            const select = byId("preferenceUserSelect");
            if(!select || !select.value){
                return {};
            }
            const selected = select.options && select.selectedIndex >= 0
                ? select.options[select.selectedIndex]
                : null;
            const userRef = String(select.value || "").trim();
            const databaseName = String(selected?.dataset?.databaseName || "").trim().toLowerCase();
            const payload = {};
            if(userRef){
                payload.user_ref = userRef;
            }
            if(databaseName){
                payload.database_name = databaseName;
            }
            return payload;
        }

        function buildPreferencesGetEndpoint(){
            const payload = getTargetContextPayload();
            const params = new URLSearchParams();
            if(payload.user_ref){
                params.set("user_ref", payload.user_ref);
            }
            if(payload.database_name){
                params.set("database_name", payload.database_name);
            }
            const query = params.toString();
            return query ? `/preferences?${query}` : "/preferences";
        }

        function updateTargetStatus(){
            const select = byId("preferenceUserSelect");
            const statusEl = byId("preferenceTargetStatus");
            if(!statusEl || !select) return;
            const selected = select.options && select.selectedIndex >= 0
                ? select.options[select.selectedIndex]
                : null;
            const databaseName = String(selected?.dataset?.databaseName || "").trim().toLowerCase();
            const userRef = String(select.value || "").trim();
            const label = String(selected?.textContent || "").trim();
            if(!userRef){
                statusEl.textContent = "Uploads will save to your login database and user folder.";
                return;
            }
            const rawUserId = userRef.includes(":")
                ? String(userRef.split(":")[1] || "").trim()
                : userRef;
            const userId = Number(rawUserId || 0);
            const safeUserId = Number.isFinite(userId) && userId > 0 ? userId : 0;
            const targetDb = databaseName || getActiveDatabaseName() || "inventory";
            statusEl.textContent = `Selected: ${label || userRef} | Save Folder: preferences/${targetDb}/user_${safeUserId}`;
        }

        function fileToDataUrl(file){
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ""));
                reader.onerror = () => reject(new Error("Failed to read file."));
                reader.readAsDataURL(file);
            });
        }

        function setStatuses(pref){
            setText("logoStatus", `Current: ${pref.logo_file_name || "-"}`);
            setText("invoiceStatus", `Current: ${pref.invoice_template_pdf_file_name || "-"}`);
            setText("quotationStatus", `Current: ${pref.quotation_template_pdf_file_name || "-"}`);
            setText("quotation2Status", `Current: ${pref.quotation2_template_pdf_file_name || "-"}`);
            setText("quotation3Status", `Current: ${pref.quotation3_template_pdf_file_name || "-"}`);
            setText("signCStatus", `Current: ${pref.sign_c_file_name || "-"} | Path: ${pref.sign_c_path || "-"}`);
            setText("signVStatus", `Current: ${pref.sign_v_file_name || "-"} | Path: ${pref.sign_v_path || "-"}`);
            setText("sealCStatus", `Current: ${pref.seal_c_file_name || "-"} | Path: ${pref.seal_c_path || "-"}`);
            setText("sealVStatus", `Current: ${pref.seal_v_file_name || "-"} | Path: ${pref.seal_v_path || "-"}`);
            setText("signQ2Status", `Current: ${pref.sign_q2_file_name || "-"} | Path: ${pref.sign_q2_path || "-"}`);
            setText("sealQ2Status", `Current: ${pref.seal_q2_file_name || "-"} | Path: ${pref.seal_q2_path || "-"}`);
            setText("signQ3Status", `Current: ${pref.sign_q3_file_name || "-"} | Path: ${pref.sign_q3_path || "-"}`);
            setText("sealQ3Status", `Current: ${pref.seal_q3_file_name || "-"} | Path: ${pref.seal_q3_path || "-"}`);
        }

        function setMappedStatusText(elementId, labels){
            const el = document.getElementById(elementId);
            if(!el) return;
            const list = Array.isArray(labels) ? labels.filter(Boolean) : [];
            el.textContent = `Mapped Users: ${list.length ? list.join(", ") : "-"}`;
        }

        function buildUserDbLabel(entry){
            const username = String(entry?.username || "").trim();
            const email = String(entry?.email || "").trim();
            const databaseName = String(entry?.database_name || "").trim().toLowerCase();
            const userLabel = username || email || `User ${Number(entry?.user_id || 0) || ""}`.trim();
            if(databaseName){
                return `${userLabel} (${databaseName})`;
            }
            return userLabel;
        }

        function setMappedStatuses(entries){
            const rows = Array.isArray(entries) ? entries : [];
            const labelsByFeature = {
                logo: [],
                invoice: [],
                quotation: [],
                quotation2: [],
                quotation3: [],
                sign_c: [],
                sign_v: [],
                seal_c: [],
                seal_v: [],
                sign_q2: [],
                seal_q2: [],
                sign_q3: [],
                seal_q3: []
            };

            rows.forEach((entry) => {
                const flags = entry && entry.feature_flags && typeof entry.feature_flags === "object"
                    ? entry.feature_flags
                    : {};
                const label = buildUserDbLabel(entry);
                Object.keys(labelsByFeature).forEach((featureKey) => {
                    if(flags[featureKey]){
                        labelsByFeature[featureKey].push(label);
                    }
                });
            });

            Object.keys(labelsByFeature).forEach((featureKey) => {
                labelsByFeature[featureKey] = Array.from(new Set(labelsByFeature[featureKey]));
            });

            setMappedStatusText("logoMappedStatus", labelsByFeature.logo);
            setMappedStatusText("invoiceMappedStatus", labelsByFeature.invoice);
            setMappedStatusText("quotationMappedStatus", labelsByFeature.quotation);
            setMappedStatusText("quotation2MappedStatus", labelsByFeature.quotation2);
            setMappedStatusText("quotation3MappedStatus", labelsByFeature.quotation3);
            setMappedStatusText("signCMappedStatus", labelsByFeature.sign_c);
            setMappedStatusText("signVMappedStatus", labelsByFeature.sign_v);
            setMappedStatusText("sealCMappedStatus", labelsByFeature.seal_c);
            setMappedStatusText("sealVMappedStatus", labelsByFeature.seal_v);
            setMappedStatusText("signQ2MappedStatus", labelsByFeature.sign_q2);
            setMappedStatusText("sealQ2MappedStatus", labelsByFeature.seal_q2);
            setMappedStatusText("signQ3MappedStatus", labelsByFeature.sign_q3);
            setMappedStatusText("sealQ3MappedStatus", labelsByFeature.seal_q3);
        }

        function getActiveDatabaseName(){
            return String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
        }

        function buildTargetOptionLabel(userLike, dbName){
            const username = String(userLike?.username || "").trim();
            const email = String(userLike?.email || "").trim();
            const userId = Number(userLike?.user_id || userLike?.id || 0);
            const role = String(userLike?.role || "").trim().toLowerCase();
            const namePart = username || email || (userId > 0 ? `User ${userId}` : "User");
            const rolePart = role ? ` [${role}]` : "";
            const dbPart = dbName ? ` (${dbName})` : "";
            return `${namePart}${rolePart}${dbPart}`;
        }

        function addTargetOption(select, optionData, seenKeys){
            if(!select || !optionData) return;
            const userId = Number(optionData.user_id || optionData.id || 0);
            const userDb = String(optionData.user_database || "inventory").trim().toLowerCase() || "inventory";
            const dbName = String(optionData.database_name || "").trim().toLowerCase();
            if(!Number.isFinite(userId) || userId <= 0 || !dbName){
                return;
            }
            const dedupeKey = `${userDb}:${userId}|${dbName}`;
            if(seenKeys.has(dedupeKey)){
                return;
            }
            seenKeys.add(dedupeKey);

            const option = document.createElement("option");
            option.value = `${userDb}:${userId}`;
            option.dataset.databaseName = dbName;
            option.textContent = String(optionData.label || buildTargetOptionLabel(optionData, dbName));
            select.appendChild(option);
        }

        async function loadPreferenceTargetUsers(canEdit){
            const card = byId("preferenceTargetCard");
            const select = byId("preferenceUserSelect");
            const role = String(localStorage.getItem("role") || "").trim().toLowerCase();
            if(!card || !select){
                return;
            }
            if(role !== "admin"){
                card.style.display = "none";
                return;
            }
            try{
                const currentUserId = Number(localStorage.getItem("userId") || 0);
                const currentUserDb = String(getActiveDatabaseName() || "inventory").trim().toLowerCase();
                const fallbackSelection = `${currentUserDb}:${currentUserId}`;
                const fallbackInventorySelection = `inventory:${currentUserId}`;

                select.innerHTML = "";
                const seenKeys = new Set();
                try{
                    const invMapRes = await request("/users/inv-map/entries", "GET");
                    const invMapEntries = Array.isArray(invMapRes?.entries) ? invMapRes.entries : [];
                    invMapEntries.forEach((entry) => {
                        addTargetOption(select, {
                            user_id: Number(entry?.user_id || 0),
                            username: String(entry?.username || "").trim(),
                            email: String(entry?.email || "").trim(),
                            user_database: "inventory",
                            database_name: String(entry?.database_name || "").trim().toLowerCase(),
                        }, seenKeys);
                    });
                }catch(_invMapErr){
                }

                if(!select.options.length){
                    const accessRes = await request("/users/access-users", "GET");
                    const users = Array.isArray(accessRes?.users) ? accessRes.users : [];
                    users.forEach((user) => {
                        const selectionKey = String(user?.selection_key || "").trim();
                        const userDb = String(user?.user_database || "").trim().toLowerCase() || "inventory";
                        const parsedUserId = Number(String(selectionKey.split(":")[1] || "").trim() || 0);
                        addTargetOption(select, {
                            user_id: parsedUserId,
                            username: String(user?.username || "").trim(),
                            email: String(user?.email || "").trim(),
                            role: String(user?.role || "").trim().toLowerCase(),
                            user_database: userDb,
                            database_name: String(user?.database_name || "").trim().toLowerCase(),
                            label: String(user?.label || "").trim(),
                        }, seenKeys);
                    });
                }

                const hasSelfOption = Array.from(select.options).some((opt) => {
                    const value = String(opt?.value || "").trim();
                    const dbName = String(opt?.dataset?.databaseName || "").trim().toLowerCase();
                    return value === fallbackSelection && dbName === currentUserDb;
                });
                if(!hasSelfOption && currentUserId > 0){
                    addTargetOption(select, {
                        user_id: currentUserId,
                        username: String(localStorage.getItem("userName") || "").trim(),
                        email: String(localStorage.getItem("userEmail") || "").trim(),
                        user_database: currentUserDb,
                        database_name: currentUserDb,
                        label: `My account (${currentUserDb})`,
                    }, seenKeys);
                }

                if(!select.options.length){
                    const option = document.createElement("option");
                    option.value = "";
                    option.textContent = "No users found";
                    select.appendChild(option);
                    select.disabled = true;
                }else{
                    let matched = false;
                    for(let i = 0; i < select.options.length; i += 1){
                        const value = String(select.options[i].value || "").trim();
                        if(value === fallbackSelection || value === fallbackInventorySelection){
                            select.selectedIndex = i;
                            matched = true;
                            break;
                        }
                    }
                    if(!matched){
                        select.selectedIndex = 0;
                    }
                    select.disabled = !canEdit;
                }
            }catch(_err){
                select.innerHTML = `<option value="">Failed to load users</option>`;
                select.disabled = true;
            }

            select.addEventListener("change", async () => {
                updateTargetStatus();
                try{
                    await loadPreferences();
                }catch(err){
                    alert(err.message || "Failed to load preferences");
                }
            });
            updateTargetStatus();
        }

        async function loadPreferences(){
            const pref = await request(buildPreferencesGetEndpoint(), "GET");
            setStatuses(pref);
            try{
                const invMapRes = await request("/users/inv-map/entries", "GET");
                setMappedStatuses(invMapRes.entries);
            }catch(_listErr){
                try{
                    const meRes = await request("/users/inv-map/me", "GET");
                    const meFlags = meRes && meRes.feature_flags && typeof meRes.feature_flags === "object"
                        ? meRes.feature_flags
                        : null;
                    const meDb = String(meRes?.mapping?.database_name || getActiveDatabaseName() || "").trim().toLowerCase();
                    if(meFlags){
                        setMappedStatuses([{
                            user_id: Number(localStorage.getItem("userId") || 0) || null,
                            username: String(localStorage.getItem("userName") || "").trim(),
                            email: String(localStorage.getItem("userEmail") || "").trim(),
                            database_name: meDb,
                            feature_flags: meFlags
                        }]);
                    }else{
                        setMappedStatuses([]);
                    }
                }catch(_meErr){
                    setMappedStatuses([]);
                }
            }
        }

        async function uploadLogo(){
            const input = byId("logoFile");
            if(!input){
                alert("Logo input is missing on this page.");
                return;
            }
            const file = input.files && input.files[0];
            if(!file){
                alert("Please choose a logo file.");
                return;
            }
            const ext = "." + String(file.name.split(".").pop() || "").toLowerCase();
            const allowed = [".jpg", ".jpeg", ".bmp", ".gif"];
            if(!allowed.includes(ext)){
                alert("Allowed logo formats: .jpg, .jpeg, .bmp, .gif");
                return;
            }
            const fileDataBase64 = await fileToDataUrl(file);
            const targetPayload = getTargetContextPayload();
            await request("/preferences/logo", "POST", {
                fileName: file.name,
                fileDataBase64,
                ...targetPayload
            });
            showMessageBox("System logo updated");
            if(input) input.value = "";
            await loadPreferences();
        }

        function getTemplateInput(templateType){
            if(templateType === "invoice") return byId("invoiceTemplateFile");
            if(templateType === "quotation") return byId("quotationTemplateFile");
            if(templateType === "quotation2") return byId("quotation2TemplateFile");
            return byId("quotation3TemplateFile");
        }

        async function uploadTemplate(templateType){
            const input = getTemplateInput(templateType);
            if(!input){
                alert(`Template input is missing for type: ${templateType}`);
                return;
            }
            const file = input.files && input.files[0];
            if(!file){
                alert("Please choose a PDF file.");
                return;
            }
            if(!String(file.name || "").toLowerCase().endsWith(".pdf")){
                alert("Only PDF files are allowed.");
                return;
            }
            const fileDataBase64 = await fileToDataUrl(file);
            const targetPayload = getTargetContextPayload();
            await request("/preferences/template", "POST", {
                templateType,
                fileName: file.name,
                fileDataBase64,
                ...targetPayload
            });
            showMessageBox(`${templateType} template updated`);
            if(input) input.value = "";
            await loadPreferences();
        }

        function getBrandImageInput(imageType){
            if(imageType === "sign_c") return byId("signCFile");
            if(imageType === "sign_v") return byId("signVFile");
            if(imageType === "seal_c") return byId("sealCFile");
            if(imageType === "sign_q2") return byId("signQ2File");
            if(imageType === "seal_q2") return byId("sealQ2File");
            if(imageType === "sign_q3") return byId("signQ3File");
            if(imageType === "seal_q3") return byId("sealQ3File");
            return byId("sealVFile");
        }

        async function uploadBrandImage(imageType){
            const input = getBrandImageInput(imageType);
            if(!input){
                alert(`Image input is missing for type: ${imageType}`);
                return;
            }
            const file = input.files && input.files[0];
            if(!file){
                alert("Please choose an image file.");
                return;
            }
            const lower = String(file.name || "").toLowerCase();
            if(!(/\.(jpg|jpeg|bmp|gif|png)$/i.test(lower))){
                alert("Only .jpg, .jpeg, .bmp, .gif, .png files are allowed.");
                return;
            }
            const fileDataBase64 = await fileToDataUrl(file);
            const targetPayload = getTargetContextPayload();
            await request("/preferences/brand-image", "POST", {
                imageType,
                fileName: file.name,
                fileDataBase64,
                ...targetPayload
            });
            showMessageBox(`${imageType} image updated`);
            if(input) input.value = "";
            await loadPreferences();
        }

        function applyEditPermissionState(canEdit){
            document.querySelectorAll(".preference-card input[type='file']").forEach((el) => {
                el.disabled = !canEdit;
            });
            document.querySelectorAll(".preference-card .btn.btn-primary").forEach((el) => {
                el.disabled = !canEdit;
            });
            const targetSelect = byId("preferenceUserSelect");
            if(targetSelect){
                targetSelect.disabled = !canEdit;
            }
        }

        window.addEventListener("DOMContentLoaded", async () => {
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            const canView = !!window.hasUserActionPermission && window.hasUserActionPermission(SYSTEM_PREFERENCE_PATH, "view");
            const canEdit = !!window.hasUserActionPermission && window.hasUserActionPermission(SYSTEM_PREFERENCE_PATH, "edit");
            if(!canView){
                window.location.href = "../dashboard.html";
                return;
            }
            applyEditPermissionState(canEdit);
            try{
                await loadPreferenceTargetUsers(canEdit);
                await loadPreferences();
            }catch(err){
                alert(err.message || "Failed to load preferences");
            }
        });
