const notificationList = document.getElementById("notificationList");
const createCard = document.getElementById("createNotificationCard");
const toggleCreateNotificationBtn = document.getElementById("toggleCreateNotificationBtn");
const NOTIFICATION_ACCESS_PATH = "/notifications/notifications.html";

function getRole(){
    return (localStorage.getItem("role") || "").toLowerCase();
}

function hasAnyNotificationPermission(){
    if(typeof hasUserGrantedPath === "function" && hasUserGrantedPath(NOTIFICATION_ACCESS_PATH)){
        return true;
    }
    if(typeof hasUserActionPermission === "function"){
        return hasUserActionPermission(NOTIFICATION_ACCESS_PATH, "view")
            || hasUserActionPermission(NOTIFICATION_ACCESS_PATH, "add")
            || hasUserActionPermission(NOTIFICATION_ACCESS_PATH, "delete");
    }
    return false;
}

function isAdminOrManager(){
    const role = getRole();
    return role === "admin" || role === "manager";
}

function canViewNotificationsPage(){
    const role = getRole();
    if(role === "admin" || role === "manager"){
        if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
            return hasAnyNotificationPermission();
        }
        return true;
    }
    if(role === "user"){
        return hasAnyNotificationPermission();
    }
    return false;
}

function canCreateNotification(){
    const role = getRole();
    if(role !== "admin" && role !== "manager") return false;
    if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
        return typeof hasUserActionPermission === "function"
            ? hasUserActionPermission(NOTIFICATION_ACCESS_PATH, "add")
            : false;
    }
    return true;
}

function canDeleteNotifications(){
    const role = getRole();
    if(role !== "admin" && role !== "manager") return false;
    if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
        return typeof hasUserActionPermission === "function"
            ? hasUserActionPermission(NOTIFICATION_ACCESS_PATH, "delete")
            : false;
    }
    return true;
}

function setCreateNotificationVisibility(visible){
    if(!createCard) return;
    createCard.classList.toggle("is-hidden", !visible);
    if(toggleCreateNotificationBtn){
        toggleCreateNotificationBtn.setAttribute("aria-expanded", visible ? "true" : "false");
        toggleCreateNotificationBtn.setAttribute("aria-label", visible ? "Hide create notification" : "Show create notification");
        toggleCreateNotificationBtn.setAttribute("title", visible ? "Hide create notification" : "Show create notification");
    }
}

function toggleCreateNotificationCard(){
    if(!canCreateNotification()) return;
    const isHidden = createCard?.classList.contains("is-hidden");
    setCreateNotificationVisibility(!!isHidden);
}

async function loadNotifications(){
    try{
        const notifications = await request("/notifications","GET");
        notificationList.innerHTML = "";
        notifications.forEach(n=>{
            const div = document.createElement("div");
            div.className = "notification-item";
            const canDelete = canDeleteNotifications();
            div.innerHTML = `
                <div class="notification-row">
                    <div class="notification-title">${n.title || "(No title)"}</div>
                    <div class="notification-meta">${new Date(n.createdAt).toLocaleString()}</div>
                    <div class="notification-actions">
                        <button class="btn" type="button" onclick="toggleNotificationBody(${n.id})">View</button>
                        ${canDelete ? `<button class="btn btn-danger" type="button" onclick="deleteNotification(${n.id})">Delete</button>` : ""}
                    </div>
                </div>
                <div id="noti-body-${n.id}" class="notification-body">${n.body || ""}</div>
            `;
            notificationList.appendChild(div);
        });
        const userId = localStorage.getItem("userId");
        if(userId){
            localStorage.setItem(`notificationsLastSeen:${userId}`, new Date().toISOString());
        }
    }catch(err){
        alert(err.message || "Failed to load notifications");
    }
}

document.getElementById("notificationForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!canCreateNotification()){
        alert("You don't have permission to create notifications.");
        return;
    }
    const data = {
        title: document.getElementById("title").value.trim(),
        body: document.getElementById("body").value.trim()
    };
    try{
        await request("/notifications","POST",data);
        showMessageBox("Notification created");
        e.target.reset();
        setCreateNotificationVisibility(false);
        loadNotifications();
    }catch(err){
        alert(err.message || "Failed to create notification");
    }
});

async function deleteNotification(id){
    if(!canDeleteNotifications()){
        alert("You don't have permission to delete notifications.");
        return;
    }
    if(!confirm("Delete this notification?")) return;
    try{
        await request(`/notifications/${id}`,"DELETE");
        showMessageBox("Notification deleted");
        loadNotifications();
    }catch(err){
        alert(err.message || "Failed to delete notification");
    }
}

function toggleNotificationBody(id){
    const bodyEl = document.getElementById(`noti-body-${id}`);
    if(!bodyEl) return;
    bodyEl.classList.toggle("show");
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

async function init(){
    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }
    if(!canViewNotificationsPage()){
        alert("You don't have access to Notifications.");
        window.location.href = "../dashboard.html";
        return;
    }
    const canCreate = canCreateNotification();
    if(toggleCreateNotificationBtn){
        toggleCreateNotificationBtn.style.display = canCreate ? "" : "none";
        toggleCreateNotificationBtn.addEventListener("click", toggleCreateNotificationCard);
    }
    setCreateNotificationVisibility(false);
    if(!canCreate && createCard){
        createCard.style.display = "none";
    }
    await loadNotifications();
}

init();
