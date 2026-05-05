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

function safeText(value){
    return String(value || "").trim();
}

function getInitials(name){
    const parts = safeText(name).split(/\s+/).filter(Boolean);
    if(parts.length === 0) return "U";
    if(parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function createTextCell(value){
    const td = document.createElement("td");
    td.textContent = safeText(value);
    return td;
}

async function loadProtectedAvatar(avatarEl, fallbackEl, pictureUrl){
    const targetUrl = safeText(pictureUrl);
    const token = localStorage.getItem("token");
    if(!avatarEl || !fallbackEl || !targetUrl || !token){
        if(avatarEl) avatarEl.style.display = "none";
        if(fallbackEl) fallbackEl.style.display = "inline-flex";
        return;
    }
    try{
        const apiBase = (window.BASE_URL || `${window.location.origin.replace(/\/+$/, "")}/api`).replace(/\/+$/, "");
        const endpoint = targetUrl.startsWith("http")
            ? targetUrl
            : `${apiBase}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
        const res = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}t=${Date.now()}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` }
        });
        if(!res.ok){
            avatarEl.style.display = "none";
            fallbackEl.style.display = "inline-flex";
            return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        avatarEl.src = objectUrl;
        avatarEl.style.display = "inline-block";
        fallbackEl.style.display = "none";
    }catch(_err){
        avatarEl.style.display = "none";
        fallbackEl.style.display = "inline-flex";
    }
}

function createProfileNameCell(row){
    const td = document.createElement("td");
    td.className = "profile-name-cell";

    const wrap = document.createElement("div");
    wrap.className = "profile-identity";

    const avatar = document.createElement("img");
    avatar.className = "profile-avatar";
    avatar.alt = "Profile picture";
    avatar.loading = "lazy";
    avatar.decoding = "async";
    const pictureUrl = safeText(row.picture_url);

    const fallback = document.createElement("span");
    fallback.className = "profile-avatar-fallback";
    fallback.textContent = getInitials(safeText(row.profile_name) || safeText(row.login_user) || "User");

    avatar.style.display = "none";
    fallback.style.display = "inline-flex";
    loadProtectedAvatar(avatar, fallback, pictureUrl);

    const name = document.createElement("span");
    name.className = "profile-name-text";
    name.textContent = safeText(row.profile_name) || safeText(row.login_user) || "User";

    wrap.appendChild(fallback);
    wrap.appendChild(avatar);
    wrap.appendChild(name);
    td.appendChild(wrap);
    return td;
}

async function loadProfiles(){
    try{
        const profiles = await request("/users/profiles", "GET");
        const tbody = document.getElementById("profile-table-body");
        tbody.innerHTML = "";
        (Array.isArray(profiles) ? profiles : []).forEach((row) => {
            const tr = document.createElement("tr");
            tr.classList.add("profile-row-clickable");
            tr.appendChild(createProfileNameCell(row));
            tr.appendChild(createTextCell(row.email));
            tr.appendChild(createTextCell(row.login_user));
            tr.appendChild(createTextCell(row.department));
            tr.appendChild(createTextCell(row.mobile));
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
