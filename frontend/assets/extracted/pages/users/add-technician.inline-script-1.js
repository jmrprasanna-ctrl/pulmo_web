const TECHNICIAN_ACCESS_PATH = "/users/technician-list.html";

        function canAddTechnician(){
            const role = (localStorage.getItem("role") || "").toLowerCase();
            if(role !== "admin" && role !== "manager" && role !== "user") return false;
            if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
                return typeof hasUserActionPermission === "function"
                    ? hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "add")
                    : false;
            }
            if(role === "user"){
                return typeof hasUserActionPermission === "function"
                    ? hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "add")
                    : false;
            }
            return true;
        }

        window.addEventListener("load", async () => {
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            if(!canAddTechnician()){
                alert("You don't have permission to add technicians.");
                window.location.href = "technician-list.html";
                return;
            }
            const form = document.getElementById("addTechnicianForm");
            const companyInput = document.getElementById("company");

            companyInput.style.textTransform = "uppercase";
            companyInput.addEventListener("input", () => {
                const pos = companyInput.selectionStart;
                companyInput.value = companyInput.value.toUpperCase();
                companyInput.setSelectionRange(pos, pos);
            });

            form.addEventListener("submit", async (e) => {
                e.preventDefault();
                const payload = {
                    technician_name: document.getElementById("technicianName").value.trim(),
                    company: document.getElementById("company").value.trim(),
                    department: document.getElementById("department").value.trim(),
                    telephone: document.getElementById("tel").value.trim(),
                    email: document.getElementById("email").value.trim()
                };

                try{
                    await request("/technicians","POST",payload);
                    showMessageBox("Technician saved successfully!");
                    form.reset();
                }catch(err){
                    alert(err.message || "Failed to add technician");
                }
            });
        });
