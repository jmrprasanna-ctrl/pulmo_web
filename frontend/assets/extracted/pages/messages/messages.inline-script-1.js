const MESSAGE_ACCESS_PATH = "/messages/messages.html";
const messageList = document.getElementById("messageList");
const toUserSelect = document.getElementById("toUser");
const createMessageCard = document.getElementById("create-message-card");
let userMap = {};

function getRole(){
    return (localStorage.getItem("role") || "").toLowerCase();
}

function isAdminOrManager(){
    const role = getRole();
    return role === "admin" || role === "manager";
}

function hasAnyMessagePermission(){
    if(typeof hasUserGrantedPath === "function" && hasUserGrantedPath(MESSAGE_ACCESS_PATH)){
        return true;
    }
    if(typeof hasUserActionPermission === "function"){
        return hasUserActionPermission(MESSAGE_ACCESS_PATH, "view")
            || hasUserActionPermission(MESSAGE_ACCESS_PATH, "add")
            || hasUserActionPermission(MESSAGE_ACCESS_PATH, "delete");
    }
    return false;
}

function canViewMessagesPage(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role === "admin" || role === "manager"){
        if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
            return hasAnyMessagePermission();
        }
        return true;
    }
    if(role === "user"){
        return hasAnyMessagePermission();
    }
    return false;
}

function canCreateMessage(){
    const role = getRole();
    if(role !== "admin" && role !== "manager" && role !== "user") return false;
    if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
        return typeof hasUserActionPermission === "function"
            ? hasUserActionPermission(MESSAGE_ACCESS_PATH, "add")
            : false;
    }
    if(role === "user"){
        return typeof hasUserActionPermission === "function"
            ? hasUserActionPermission(MESSAGE_ACCESS_PATH, "add")
            : false;
    }
    return true;
}

function canDeleteMessages(){
    const role = getRole();
    if(role !== "admin" && role !== "manager" && role !== "user") return false;
    if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
        return typeof hasUserActionPermission === "function"
            ? hasUserActionPermission(MESSAGE_ACCESS_PATH, "delete")
            : false;
    }
    if(role === "user"){
        return typeof hasUserActionPermission === "function"
            ? hasUserActionPermission(MESSAGE_ACCESS_PATH, "delete")
            : false;
    }
    return true;
}

async function loadUsers(){
    try{
        if(!canCreateMessage()){
            const userId = localStorage.getItem("userId");
            const userEmail = localStorage.getItem("userEmail");
            const userName = localStorage.getItem("userName");
            userMap = {};
            if(userId){
                userMap[userId] = userName || userEmail || `User ${userId}`;
            }
            return;
        }
        const users = await request("/users/assignable","GET");
        userMap = {};
        toUserSelect.innerHTML = "";
        users.forEach(u=>{
            userMap[u.id] = u.username || u.email || `User ${u.id}`;
            const opt = document.createElement("option");
            opt.value = u.id;
            opt.innerText = userMap[u.id];
            toUserSelect.appendChild(opt);
        });
    }catch(err){
        alert(err.message || "Failed to load users");
    }
}

async function loadMessages(){
    try{
        const userId = localStorage.getItem("userId");
        const allMessages = await request("/messages","GET");
        const messages = (Array.isArray(allMessages) ? allMessages : [])
            .filter((m) => {
                if(!userId) return true;
                const toId = m && m.to_user_id != null ? String(m.to_user_id) : "";
                const fromId = m && m.from_user_id != null ? String(m.from_user_id) : "";
                const isBroadcast = m && m.to_user_id == null;
                return toId === String(userId) || fromId === String(userId) || isBroadcast;
            })
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        messageList.innerHTML = "";
        messages.forEach(m=>{
            const div = document.createElement("div");
            const toName = m.to_name || userMap[m.to_user_id] || (m.to_user_id ? `User ${m.to_user_id}` : "All");
            const fromName = m.from_name || (m.from_user_id ? `User ${m.from_user_id}` : "System");
            div.className = "message-item";
            const eligibleForDelete = isAdminOrManager() || (userId && (String(m.to_user_id) === String(userId) || m.to_user_id === null));
            const canDelete = canDeleteMessages() && eligibleForDelete;
            div.innerHTML = `
                <div class="message-row">
                    <div class="message-title">${m.title || "(No title)"}</div>
                    <div class="message-meta">From: ${fromName} | To: ${toName} | ${new Date(m.createdAt).toLocaleString()}</div>
                    <div class="message-actions">
                        <button class="btn" type="button" onclick="toggleMessageBody(${m.id})">View</button>
                        ${canDelete ? `<button class="btn btn-danger" type="button" onclick="deleteMessage(${m.id})">Delete</button>` : ""}
                    </div>
                </div>
                <div id="msg-body-${m.id}" class="message-body">${m.body || ""}</div>
            `;
            messageList.appendChild(div);
        });
        if(userId){
            localStorage.setItem(`messagesLastSeen:${userId}`, new Date().toISOString());
        }
    }catch(err){
        alert(err.message || "Failed to load messages");
    }
}

document.getElementById("messageForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!canCreateMessage()){
        alert("You don't have permission to create messages.");
        return;
    }
    const data = {
        to_user_id: toUserSelect.value,
        title: document.getElementById("title").value.trim(),
        body: document.getElementById("body").value.trim()
    };
    try{
        await request("/messages","POST",data);
        showMessageBox("Message sent");
        e.target.reset();
        loadMessages();
    }catch(err){
        alert(err.message || "Failed to create message");
    }
});

async function deleteMessage(id){
    if(!canDeleteMessages()){
        alert("You don't have permission to delete messages.");
        return;
    }
    if(!confirm("Delete this message?")) return;
    try{
        await request(`/messages/${id}`,"DELETE");
        showMessageBox("Message deleted");
        loadMessages();
    }catch(err){
        alert(err.message || "Failed to delete message");
    }
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
    if(!canViewMessagesPage()){
        alert("You don't have access to Messages.");
        window.location.href = "../dashboard.html";
        return;
    }
    if(!canCreateMessage() && createMessageCard){
        createMessageCard.style.display = "none";
    }
    await loadUsers();
    await loadMessages();
}

function toggleMessageBody(id){
    const bodyEl = document.getElementById(`msg-body-${id}`);
    if(!bodyEl) return;
    bodyEl.classList.toggle("show");
}

init();
