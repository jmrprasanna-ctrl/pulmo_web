function byId(id){
            return document.getElementById(id);
        }

        function setText(id, value){
            const el = byId(id);
            if(!el) return;
            el.textContent = value;
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
            await request("/preferences/logo", "POST", {
                fileName: file.name,
                fileDataBase64
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
            await request("/preferences/template", "POST", {
                templateType,
                fileName: file.name,
                fileDataBase64
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
            await request("/preferences/brand-image", "POST", {
                imageType,
                fileName: file.name,
                fileDataBase64
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
