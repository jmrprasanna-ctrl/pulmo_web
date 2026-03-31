const notificationList = document.getElementById("notificationList");
const createCard = document.getElementById("createNotificationCard");
const userRole = localStorage.getItem("role") || "";
if(userRole.toLowerCase() === "user"){
    createCard.style.display = "none";
}
function isAdminOrManager(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    return role === "admin" || role === "manager";
}

async function loadNotifications(){
    try{
        const notifications = await request("/notifications","GET");
        notificationList.innerHTML = "";
        notifications.forEach(n=>{
            const div = document.createElement("div");
            div.className = "notification-item";
            const canDelete = isAdminOrManager();
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
    const data = {
        title: document.getElementById("title").value.trim(),
        body: document.getElementById("body").value.trim()
    };
    try{
        await request("/notifications","POST",data);
        showMessageBox("Notification created");
        e.target.reset();
        loadNotifications();
    }catch(err){
        alert(err.message || "Failed to create notification");
    }
});

async function deleteNotification(id){
    if(!confirm("Delete this notification?")) return;
    try{
        if(!isAdminOrManager()){
            alert("Only admins and managers can delete notifications.");
            return;
        }
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

loadNotifications();
