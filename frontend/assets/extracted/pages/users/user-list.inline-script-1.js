function canShowAdminTool(path){
            const role = (localStorage.getItem("role") || "").toLowerCase();
            const hasConfiguredAccess = typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions();
            const hasPageAccess = (
                (typeof hasUserGrantedPath === "function" && hasUserGrantedPath(path))
                || (typeof hasUserActionPermission === "function" && hasUserActionPermission(path, "view"))
            );
            if(role === "admin"){
                if(!hasConfiguredAccess) return true;
                return hasPageAccess;
            }
            if(role === "manager"){
                if(!hasConfiguredAccess) return false;
                return hasPageAccess;
            }
            return hasPageAccess;
        }

        function applyTopButtonVisibility(){
            const map = [
                { id: "btnAddUser", path: "/users/add-user.html" }
            ];
            map.forEach((item) => {
                const el = document.getElementById(item.id);
                if(!el) return;
                el.classList.toggle("is-hidden", !canShowAdminTool(item.path));
            });
        }

        function bindTopButtons(){
            const bindClick = (id, handler) => {
                const el = document.getElementById(id);
                if(el){
                    el.addEventListener("click", handler);
                }
            };
            bindClick("btnAddUser", () => { window.location.href = "add-user.html"; });
        }

        async function loadUsers(){
            try{
                const users = await request("/users","GET");
                const tbody = document.getElementById('user-table-body');
                tbody.innerHTML = '';
                users.forEach(u => {
                    const row = document.createElement('tr');
                    row.classList.add("user-row-clickable");
                    row.innerHTML = `
                        <td>${u.id}</td>
                        <td>${u.username}</td>
                        <td>${u.company || ""}</td>
                        <td>${u.department || ""}</td>
                        <td>${u.telephone || ""}</td>
                        <td>${u.email}</td>
                        <td>${u.role}</td>
                    `;
                    row.addEventListener("click", (event) => {
                        const target = event.target;
                        if(target && target.closest("a, button, input, select, textarea")) return;
                        window.location.href = `edit-user.html?id=${u.id}`;
                    });
                    tbody.appendChild(row);
                });
            }catch(err){
                alert(err.message || "Failed to load users");
            }
        }

        function setHealthBadge(id, ok){
            const el = document.getElementById(id);
            if(!el) return;
            el.classList.remove("ok", "fail", "unknown");
            if(ok === true){
                el.classList.add("ok");
                el.innerText = "OK";
                return;
            }
            if(ok === false){
                el.classList.add("fail");
                el.innerText = "Fail";
                return;
            }
            el.classList.add("unknown");
            el.innerText = "Unknown";
        }

        async function loadSystemHealthPreview(){
            try{
                const health = await request("/health","GET");
                setHealthBadge("healthOverall", !!health.ok);
                setHealthBadge("healthDb", !!health.dbConnected);
                setHealthBadge("healthPgDump", !!health?.checks?.tools?.pg_dump?.available);
                setHealthBadge("healthPsql", !!health?.checks?.tools?.psql?.available);
                setHealthBadge("healthTplInvoice", !!health?.checks?.templateFiles?.invoice?.exists);
                setHealthBadge("healthTplQuotation", !!health?.checks?.templateFiles?.quotation?.exists);
                setHealthBadge("healthTplQuotation2", !!health?.checks?.templateFiles?.quotation2?.exists);
            }catch(_err){
                setHealthBadge("healthOverall", false);
                setHealthBadge("healthDb", null);
                setHealthBadge("healthPgDump", null);
                setHealthBadge("healthPsql", null);
                setHealthBadge("healthTplInvoice", null);
                setHealthBadge("healthTplQuotation", null);
                setHealthBadge("healthTplQuotation2", null);
            }

            const updated = document.getElementById("healthUpdatedAt");
            if(updated){
                updated.innerText = `Last updated: ${new Date().toLocaleString()}`;
            }
        }

        window.addEventListener('DOMContentLoaded', async () => {
            if(typeof window.__waitForUserAccessPermissions === "function"){
                await window.__waitForUserAccessPermissions();
            }
            bindTopButtons();
            applyTopButtonVisibility();
            const healthRefreshBtn = document.getElementById("healthRefreshBtn");
            if(healthRefreshBtn){
                healthRefreshBtn.addEventListener("click", loadSystemHealthPreview);
            }
            await loadSystemHealthPreview();
            await loadUsers();
        });
