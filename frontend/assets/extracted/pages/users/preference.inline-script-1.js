function fileToDataUrl(file){
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ""));
                reader.onerror = () => reject(new Error("Failed to read file."));
                reader.readAsDataURL(file);
            });
        }

        function setStatuses(pref){
            document.getElementById("logoStatus").textContent = `Current: ${pref.logo_file_name || "-"}`;
            document.getElementById("invoiceStatus").textContent = `Current: ${pref.invoice_template_pdf_file_name || "-"}`;
            document.getElementById("quotationStatus").textContent = `Current: ${pref.quotation_template_pdf_file_name || "-"}`;
            document.getElementById("quotation2Status").textContent = `Current: ${pref.quotation2_template_pdf_file_name || "-"}`;
            document.getElementById("quotation3Status").textContent = `Current: ${pref.quotation3_template_pdf_file_name || "-"}`;
            document.getElementById("signCStatus").textContent = `Current: ${pref.sign_c_file_name || "-"} | Path: ${pref.sign_c_path || "-"}`;
            document.getElementById("signVStatus").textContent = `Current: ${pref.sign_v_file_name || "-"} | Path: ${pref.sign_v_path || "-"}`;
            document.getElementById("sealCStatus").textContent = `Current: ${pref.seal_c_file_name || "-"} | Path: ${pref.seal_c_path || "-"}`;
            document.getElementById("sealVStatus").textContent = `Current: ${pref.seal_v_file_name || "-"} | Path: ${pref.seal_v_path || "-"}`;
            document.getElementById("signQ2Status").textContent = `Current: ${pref.sign_q2_file_name || "-"} | Path: ${pref.sign_q2_path || "-"}`;
            document.getElementById("sealQ2Status").textContent = `Current: ${pref.seal_q2_file_name || "-"} | Path: ${pref.seal_q2_path || "-"}`;
            document.getElementById("signQ3Status").textContent = `Current: ${pref.sign_q3_file_name || "-"} | Path: ${pref.sign_q3_path || "-"}`;
            document.getElementById("sealQ3Status").textContent = `Current: ${pref.seal_q3_file_name || "-"} | Path: ${pref.seal_q3_path || "-"}`;
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

        function normalizeHex(value, fallback){
            const raw = String(value || "").trim();
            if(/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
            return fallback;
        }

        function applyThemeForm(settings){
            const dashboard = normalizeHex(settings.primary_color, "#0f6abf");
            const bg = normalizeHex(settings.background_color, "#edf3fb");
            const button = normalizeHex(settings.button_color, dashboard);
            const mode = String(settings.mode_theme || "light").toLowerCase() === "dark" ? "dark" : "light";

            document.getElementById("dashboardColorPreset").value = dashboard;
            document.getElementById("backgroundColorInput").value = bg;
            document.getElementById("buttonColorInput").value = button;
            document.getElementById("modeThemeSelect").value = mode;
            document.getElementById("themeStatus").textContent = `Current: Dashboard ${dashboard}, Background ${bg}, Buttons ${button}, Mode ${mode}`;
        }

        async function loadPreferences(){
            const pref = await request("/preferences", "GET");
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
            const ui = await request("/preferences/my-ui-settings", "GET");
            if(ui){
                applyThemeForm(ui);
                if(typeof window.applyUiSettingsToPage === "function"){
                    window.applyUiSettingsToPage(ui);
                }
                if(typeof window.cacheUserUiSettings === "function"){
                    window.cacheUserUiSettings(ui);
                }
            }
        }

        async function uploadLogo(){
            const input = document.getElementById("logoFile");
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
            await request("/preferences/logo", "POST", {
                fileName: file.name,
                fileDataBase64
            });
            showMessageBox("System logo updated");
            input.value = "";
            await loadPreferences();
        }

        function getTemplateInput(templateType){
            if(templateType === "invoice") return document.getElementById("invoiceTemplateFile");
            if(templateType === "quotation") return document.getElementById("quotationTemplateFile");
            if(templateType === "quotation2") return document.getElementById("quotation2TemplateFile");
            return document.getElementById("quotation3TemplateFile");
        }

        async function uploadTemplate(templateType){
            const input = getTemplateInput(templateType);
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
            await request("/preferences/template", "POST", {
                templateType,
                fileName: file.name,
                fileDataBase64
            });
            showMessageBox(`${templateType} template updated`);
            input.value = "";
            await loadPreferences();
        }

        function getBrandImageInput(imageType){
            if(imageType === "sign_c") return document.getElementById("signCFile");
            if(imageType === "sign_v") return document.getElementById("signVFile");
            if(imageType === "seal_c") return document.getElementById("sealCFile");
            if(imageType === "sign_q2") return document.getElementById("signQ2File");
            if(imageType === "seal_q2") return document.getElementById("sealQ2File");
            if(imageType === "sign_q3") return document.getElementById("signQ3File");
            if(imageType === "seal_q3") return document.getElementById("sealQ3File");
            return document.getElementById("sealVFile");
        }

        async function uploadBrandImage(imageType){
            const input = getBrandImageInput(imageType);
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
            await request("/preferences/brand-image", "POST", {
                imageType,
                fileName: file.name,
                fileDataBase64
            });
            showMessageBox(`${imageType} image updated`);
            input.value = "";
            await loadPreferences();
        }

        async function saveThemeSettings(){
            const dashboardColor = document.getElementById("dashboardColorPreset").value;
            const backgroundColor = document.getElementById("backgroundColorInput").value;
            const buttonColor = document.getElementById("buttonColorInput").value;
            const modeTheme = document.getElementById("modeThemeSelect").value;

            await request("/preferences/theme", "PUT", {
                primary_color: dashboardColor,
                background_color: backgroundColor,
                button_color: buttonColor,
                mode_theme: modeTheme
            });

            if(typeof window.applyUiSettingsToPage === "function"){
                window.applyUiSettingsToPage({
                    primary_color: dashboardColor,
                    background_color: backgroundColor,
                    button_color: buttonColor,
                    mode_theme: modeTheme
                });
            }
            if(typeof window.cacheUserUiSettings === "function"){
                window.cacheUserUiSettings({
                    primary_color: dashboardColor,
                    background_color: backgroundColor,
                    button_color: buttonColor,
                    mode_theme: modeTheme
                });
            }
            showMessageBox("Theme settings updated");
            await loadPreferences();
        }

        function applyEditPermissionState(canEdit){
            document.querySelectorAll(".preference-card input[type='file']").forEach((el) => {
                el.disabled = !canEdit;
            });
            document.querySelectorAll(".preference-card .btn.btn-primary").forEach((el) => {
                el.disabled = !canEdit;
            });
        }

        window.addEventListener("DOMContentLoaded", async () => {
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            const canView = !!window.hasUserActionPermission && window.hasUserActionPermission("/users/preference.html", "view");
            const canEdit = !!window.hasUserActionPermission && window.hasUserActionPermission("/users/preference.html", "edit");
            if(!canView){
                window.location.href = "../dashboard.html";
                return;
            }
            applyEditPermissionState(canEdit);
            try{
                await loadPreferences();
            }catch(err){
                alert(err.message || "Failed to load preferences");
            }
        });
