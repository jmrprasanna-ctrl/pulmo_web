function canViewProfileList(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    const hasConfiguredAccess = typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions();
    const hasPageAccess = (
        (typeof hasUserGrantedPath === "function" && hasUserGrantedPath("/users/profile-list.html"))
        || (typeof hasUserActionPermission === "function" && hasUserActionPermission("/users/profile-list.html", "view"))
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

async function loadProfiles(){
    try{
        const profiles = await request("/users/profiles", "GET");
        const tbody = document.getElementById("profile-table-body");
        tbody.innerHTML = "";
        (Array.isArray(profiles) ? profiles : []).forEach((row) => {
            const tr = document.createElement("tr");
            tr.classList.add("profile-row-clickable");
            tr.innerHTML = `
                <td>${row.profile_name || ""}</td>
                <td>${row.email || ""}</td>
                <td>${row.login_user || ""}</td>
                <td>${row.department || ""}</td>
                <td>${row.mobile || ""}</td>
            `;
            tr.addEventListener("click", () => {
                window.location.href = `edit-profile.html?userId=${row.user_id}`;
            });
            tbody.appendChild(tr);
        });
    }catch(err){
        alert(err.message || "Failed to load profiles");
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }
    if(!canViewProfileList()){
        showMessageBox("You do not have access to Profile List.", "error");
        window.location.href = "../dashboard.html";
        return;
    }
    await loadProfiles();
});
