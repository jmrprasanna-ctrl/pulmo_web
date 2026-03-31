function getAllowedPathSet(){
    try{
        const rows = JSON.parse(localStorage.getItem("userAllowedPathsRuntime") || "[]");
        return new Set((Array.isArray(rows) ? rows : []).map((x) => String(x || "").trim().toLowerCase()));
    }catch(_err){
        return new Set();
    }
}

function getRole(){
    return (localStorage.getItem("role") || "").toLowerCase();
}

function isTrainingUser(){
    const role = getRole();
    const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
    return role === "user" && selectedDb === "demo";
}

function canManage(){
    const role = getRole();
    return role === "admin" || role === "manager" || isTrainingUser();
}

function canAddTechnician(){
    const role = getRole();
    const hasAnyTechnicianPermission = () => {
        if(typeof hasUserGrantedPath === "function" && hasUserGrantedPath("/users/technician-list.html")){
            return true;
        }
        if(typeof hasUserActionPermission === "function"){
            return hasUserActionPermission("/users/technician-list.html", "view")
                || hasUserActionPermission("/users/technician-list.html", "add")
                || hasUserActionPermission("/users/technician-list.html", "edit")
                || hasUserActionPermission("/users/technician-list.html", "delete");
        }
        return false;
    };
    if(role === "admin" || role === "manager"){
        return hasAnyTechnicianPermission();
    }
    return hasAnyTechnicianPermission();
}

function canViewWarrenty(){
    const role = getRole();
    const hasWarrentyPermission = () => {
        if(typeof hasUserGrantedPath === "function" && hasUserGrantedPath("/support/warrenty.html")){
            return true;
        }
        if(typeof hasUserActionPermission === "function"){
            return hasUserActionPermission("/support/warrenty.html", "view");
        }
        return false;
    };
    if(role === "admin" || role === "manager"){
        if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
            return hasWarrentyPermission();
        }
        return true;
    }
    return hasWarrentyPermission();
}

async function loadSupportImportants(){
    try{
        const rows = await request("/support-importants","GET");
        const tbody = document.getElementById("support-important-body");
        tbody.innerHTML = "";

        rows.forEach((row) => {
            const encText = encodeURIComponent(String(row.important_text || ""));
            const encWarranty = encodeURIComponent(String(row.warranty_period || "3 month"));
            const actions = canManage()
                ? `<div class="support-action-row">
                     <button class="btn btn-inline support-action-btn" type="button" onclick="editImportant(${row.id}, '${encText}', '${encWarranty}')">Edit</button>
                     <button class="btn btn-danger btn-inline support-action-btn" type="button" onclick="deleteImportant(${row.id})">Delete</button>
                   </div>`
                : `<span>-</span>`;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.id}</td>
                <td>${row.important_text || ""}</td>
                <td>${row.warranty_period || "3 month"}</td>
                <td>${actions}</td>
            `;
            tbody.appendChild(tr);
        });
    }catch(err){
        alert(err.message || "Failed to load support importants");
    }
}

async function deleteImportant(id){
    if(!canManage()) return;
    if(!confirm("Delete this important note?")) return;
    try{
        await request(`/support-importants/${id}`,"DELETE");
        showMessageBox("Important deleted");
        loadSupportImportants();
    }catch(err){
        alert(err.message || "Failed to delete important");
    }
}

async function editImportant(id, encodedText, encodedWarranty){
    if(!canManage()) return;
    const currentText = decodeURIComponent(encodedText || "");
    const existingWarranty = decodeURIComponent(encodedWarranty || "3 month");
    const text = prompt("Edit important", currentText);
    if(text === null) return;
    const payload = {
        important_text: String(text || "").trim()
    };
    const currentWarranty = String(prompt("Warranty period (3 month, 6 month, 1 year, 2 year)", existingWarranty) || "").trim().toLowerCase();
    const allowed = new Set(["3 month", "6 month", "1 year", "2 year"]);
    payload.warranty_period = allowed.has(currentWarranty) ? currentWarranty : "3 month";
    if(!payload.important_text){
        alert("Important text is required.");
        return;
    }
    // Backward compatibility for older backend validation.
    payload.title = payload.important_text;
    try{
        await request(`/support-importants/${id}`,"PUT",payload);
        showMessageBox("Important updated");
        loadSupportImportants();
    }catch(err){
        alert(err.message || "Failed to update important");
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }
    const form = document.getElementById("supportImportantForm");
    const addTechnicianBtn = document.getElementById("addTechnicianBtn");
    const warrentyBtn = document.getElementById("warrentyBtn");
    if(addTechnicianBtn && !canAddTechnician()){
        addTechnicianBtn.style.display = "none";
    }
    if(warrentyBtn){
        warrentyBtn.style.display = canViewWarrenty() ? "" : "none";
    }
    if(!canManage()){
        form.style.display = "none";
    }
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if(!canManage()) return;
        const payload = {
            important_text: document.getElementById("importantText").value.trim(),
            warranty_period: document.getElementById("warrantyPeriod").value
        };
        // Backward compatibility for older backend validation.
        payload.title = payload.important_text;
        try{
            await request("/support-importants","POST",payload);
            showMessageBox("Important saved");
            form.reset();
            loadSupportImportants();
        }catch(err){
            alert(err.message || "Failed to save important");
        }
    });
    loadSupportImportants();
});
