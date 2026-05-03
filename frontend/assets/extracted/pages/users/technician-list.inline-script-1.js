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

        async function loadTechnicians(){
            try{
                const rows = await request("/technicians","GET");
                const tbody = document.getElementById("technician-table-body");
                tbody.innerHTML = "";
                const canEdit = canEditTechnician();

                rows.forEach((t) => {
                    const tr = document.createElement("tr");
                    if(canEdit){
                        tr.classList.add("technician-row-clickable");
                    }
                    tr.innerHTML = `
                        <td>${t.id}</td>
                        <td>${t.technician_name || ""}</td>
                        <td>${t.company || ""}</td>
                        <td>${t.department || ""}</td>
                        <td>${t.telephone || ""}</td>
                        <td>${t.email || ""}</td>
                    `;
                    if(canEdit){
                        tr.addEventListener("click", (event) => {
                            const target = event.target;
                            if(target && target.closest("a, button, input, select, textarea")) return;
                            window.location.href = `edit-technician.html?id=${t.id}`;
                        });
                    }
                    tbody.appendChild(tr);
                });
            }catch(err){
                alert(err.message || "Failed to load technicians");
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
