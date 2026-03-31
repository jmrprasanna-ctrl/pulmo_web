const TECHNICIAN_ACCESS_PATH = "/users/technician-list.html";

        function getRole(){
            return (localStorage.getItem("role") || "").toLowerCase();
        }

        function canViewTechnicianList(){
            const role = getRole();
            const hasAnyTechnicianPermission = () => {
                if(typeof hasUserGrantedPath === "function" && hasUserGrantedPath(TECHNICIAN_ACCESS_PATH)){
                    return true;
                }
                if(typeof hasUserActionPermission === "function"){
                    return hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "view")
                        || hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "add")
                        || hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "edit")
                        || hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "delete");
                }
                return false;
            };
            if(role === "admin" || role === "manager"){
                if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
                    return hasAnyTechnicianPermission();
                }
                return true;
            }
            return hasAnyTechnicianPermission();
        }

        function canAddTechnician(){
            const role = getRole();
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

        function canEditTechnician(){
            const role = getRole();
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

        function canDeleteTechnician(){
            const role = getRole();
            if(role !== "admin" && role !== "manager" && role !== "user") return false;
            if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
                return typeof hasUserActionPermission === "function"
                    ? hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "delete")
                    : false;
            }
            if(role === "user"){
                return typeof hasUserActionPermission === "function"
                    ? hasUserActionPermission(TECHNICIAN_ACCESS_PATH, "delete")
                    : false;
            }
            return true;
        }

        async function loadTechnicians(){
            try{
                const rows = await request("/technicians","GET");
                const tbody = document.getElementById("technician-table-body");
                tbody.innerHTML = "";

                rows.forEach((t) => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td>${t.id}</td>
                        <td>${t.technician_name || ""}</td>
                        <td>${t.company || ""}</td>
                        <td>${t.department || ""}</td>
                        <td>${t.telephone || ""}</td>
                        <td>${t.email || ""}</td>
                        <td>
                            ${canEditTechnician() ? `<a class="btn btn-inline" href="edit-technician.html?id=${t.id}">Edit</a>` : ""}
                            ${canDeleteTechnician() ? `<button class="btn btn-danger btn-inline" type="button" onclick="deleteTechnician(${t.id})">Delete</button>` : ""}
                            ${!canEditTechnician() && !canDeleteTechnician() ? "<span>-</span>" : ""}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }catch(err){
                alert(err.message || "Failed to load technicians");
            }
        }

        async function deleteTechnician(id){
            if(!canDeleteTechnician()){
                alert("You don't have permission to delete technicians.");
                return;
            }
            if(!confirm("Delete this technician?")) return;
            try{
                await request(`/technicians/${id}`,"DELETE");
                showMessageBox("Technician deleted");
                loadTechnicians();
            }catch(err){
                alert(err.message || "Failed to delete technician");
            }
        }

        window.addEventListener("DOMContentLoaded", async () => {
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            if(!canViewTechnicianList()){
                alert("You don't have access to Technician List.");
                window.location.href = "../dashboard.html";
                return;
            }
            const addBtn = document.getElementById("addTechnicianBtn");
            if(addBtn && !canAddTechnician()){
                addBtn.style.display = "none";
            }
            loadTechnicians();
        });
