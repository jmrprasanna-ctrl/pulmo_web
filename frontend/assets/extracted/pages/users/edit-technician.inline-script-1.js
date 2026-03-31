const TECHNICIAN_ACCESS_PATH = "/users/technician-list.html";

        function canEditTechnician(){
            const role = (localStorage.getItem("role") || "").toLowerCase();
            if(role !== "admin" && role !== "manager" && role !== "user") return false;
            if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
                return typeof hasUserActionPermission === "function"
                    ? hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "edit")
                    : false;
            }
            if(role === "user"){
                return typeof hasUserActionPermission === "function"
                    ? hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "edit")
                    : false;
            }
            return true;
        }

        function getTechnicianId(){
            const params = new URLSearchParams(window.location.search);
            return params.get("id");
        }

        async function loadTechnician(){
            const id = getTechnicianId();
            if(!id){
                alert("Missing technician id");
                window.location.href = "technician-list.html";
                return;
            }

            try{
                const row = await request(`/technicians/${id}`,"GET");
                document.getElementById("technicianName").value = row.technician_name || "";
                document.getElementById("company").value = row.company || "";
                document.getElementById("department").value = row.department || "";
                document.getElementById("tel").value = row.telephone || "";
                document.getElementById("email").value = row.email || "";
            }catch(err){
                alert(err.message || "Failed to load technician");
                window.location.href = "technician-list.html";
            }
        }

        window.addEventListener("load", async () => {
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            if(!canEditTechnician()){
                alert("You don't have permission to edit technicians.");
                window.location.href = "technician-list.html";
                return;
            }
            const form = document.getElementById("editTechnicianForm");
            const companyInput = document.getElementById("company");

            companyInput.style.textTransform = "uppercase";
            companyInput.addEventListener("input", () => {
                const pos = companyInput.selectionStart;
                companyInput.value = companyInput.value.toUpperCase();
                companyInput.setSelectionRange(pos, pos);
            });

            form.addEventListener("submit", async (e) => {
                e.preventDefault();
                const id = getTechnicianId();
                const payload = {
                    technician_name: document.getElementById("technicianName").value.trim(),
                    company: document.getElementById("company").value.trim(),
                    department: document.getElementById("department").value.trim(),
                    telephone: document.getElementById("tel").value.trim(),
                    email: document.getElementById("email").value.trim()
                };

                try{
                    await request(`/technicians/${id}`,"PUT",payload);
                    showMessageBox("Technician updated successfully!");
                    window.location.href = "technician-list.html";
                }catch(err){
                    alert(err.message || "Failed to update technician");
                }
            });

            loadTechnician();
        });
