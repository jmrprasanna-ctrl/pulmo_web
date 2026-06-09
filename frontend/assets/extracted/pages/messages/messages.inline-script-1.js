const MESSAGE_ACCESS_PATH = "/messages/messages.html";
const messageList = document.getElementById("messageList");
const toUserSelect = document.getElementById("toUser");
const createMessageCard = document.getElementById("create-message-card");
const toggleCreateMessageBtn = document.getElementById("toggleCreateMessageBtn");
let userMap = {};

function normalizeMessageDb(value){
    return String(value || "").trim().toLowerCase();
}

function buildMessageUserRef(userDatabase, userId){
    const dbName = normalizeMessageDb(userDatabase);
    const id = String(userId || "").trim();
    if(!dbName || !id) return "";
    return `${dbName}:${id}`;
}

function getCurrentMessageUserRef(){
    const storedRef = String(localStorage.getItem("userRef") || "").trim().toLowerCase();
    if(storedRef) return storedRef;
    const storedDb = normalizeMessageDb(localStorage.getItem("userDatabase") || localStorage.getItem("selectedDatabaseName") || "inventory");
    const storedId = String(localStorage.getItem("userId") || "").trim();
    return buildMessageUserRef(storedDb || "inventory", storedId);
}

function getMessageLastSeenKey(){
    const currentRef = getCurrentMessageUserRef();
    if(currentRef) return `messagesLastSeen:${currentRef}`;
    const userId = String(localStorage.getItem("userId") || "").trim();
    return `messagesLastSeen:${userId || "guest"}`;
}

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

function setCreateMessageVisibility(visible){
    if(!createMessageCard) return;
    createMessageCard.classList.toggle("is-hidden", !visible);
    if(toggleCreateMessageBtn){
        toggleCreateMessageBtn.setAttribute("aria-expanded", visible ? "true" : "false");
        toggleCreateMessageBtn.setAttribute("aria-label", visible ? "Hide create message" : "Show create message");
        toggleCreateMessageBtn.setAttribute("title", visible ? "Hide create message" : "Show create message");
    }
}

function toggleCreateMessageCard(){
    if(!canCreateMessage()) return;
    const isHidden = createMessageCard?.classList.contains("is-hidden");
    setCreateMessageVisibility(!!isHidden);
}

async function loadUsers(){
    try{
        if(!canCreateMessage()){
            const userId = localStorage.getItem("userId");
            const userEmail = localStorage.getItem("userEmail");
            const userName = localStorage.getItem("userName");
            const currentRef = getCurrentMessageUserRef();
            userMap = {};
            if(currentRef || userId){
                userMap[currentRef || userId] = userName || userEmail || `User ${userId}`;
            }
            return;
        }
        const users = await request("/users/assignable","GET");
        userMap = {};
        toUserSelect.innerHTML = "";
        users.forEach(u=>{
            const rawUserRef = String(u.user_ref || "").trim();
            const optionRef = String(
                ((rawUserRef.includes(":") || /^directory-self:/i.test(rawUserRef)) ? rawUserRef : "")
                || buildMessageUserRef(u.user_database || u.database_name || localStorage.getItem("selectedDatabaseName") || "inventory", u.id)
                || rawUserRef
                || u.id
            ).trim();
            const optionName = u.username || u.email || `User ${u.id}`;
            userMap[optionRef] = optionName;
            userMap[String(u.id)] = optionName;
            const opt = document.createElement("option");
            opt.value = optionRef;
            opt.innerText = optionName;
            toUserSelect.appendChild(opt);
        });
    }catch(err){
        alert(err.message || "Failed to load users");
    }
}

async function loadMessages(){
    try{
        const userId = String(localStorage.getItem("userId") || "").trim();
        const currentRef = getCurrentMessageUserRef();
        const allMessages = await request("/messages","GET");
        const messages = (Array.isArray(allMessages) ? allMessages : [])
            .filter((m) => {
                const toRef = String(m?.to_user_ref || "").trim().toLowerCase();
                const fromRef = String(m?.from_user_ref || "").trim().toLowerCase();
                const toId = m && m.to_user_id != null ? String(m.to_user_id) : "";
                const fromId = m && m.from_user_id != null ? String(m.from_user_id) : "";
                const isBroadcast = !toRef && m && m.to_user_id == null;
                if(!currentRef && !userId) return true;
                return toRef === currentRef || fromRef === currentRef || toId === userId || fromId === userId || isBroadcast;
            })
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        messageList.innerHTML = "";
        messages.forEach(m=>{
            const div = document.createElement("div");
            const toRef = String(m?.to_user_ref || "").trim().toLowerCase();
            const fromRef = String(m?.from_user_ref || "").trim().toLowerCase();
            const toName = m.to_name || userMap[toRef] || userMap[String(m.to_user_id || "")] || (m.to_user_id ? `User ${m.to_user_id}` : "All");
            const fromName = m.from_name || userMap[fromRef] || userMap[String(m.from_user_id || "")] || (m.from_user_id ? `User ${m.from_user_id}` : "System");
            div.className = "message-item";
            const eligibleForDelete = isAdminOrManager() || ((currentRef || userId) && (toRef === currentRef || String(m.to_user_id) === userId || m.to_user_id === null));
            const canDelete = canDeleteMessages() && eligibleForDelete;
            const storageDb = String(m.storage_database_name || "").trim();
            div.innerHTML = `
                <div class="message-row">
                    <div class="message-title">${m.title || "(No title)"}</div>
                    <div class="message-meta">From: ${fromName} | To: ${toName} | ${new Date(m.createdAt).toLocaleString()}</div>
                    <div class="message-actions">
                        <button class="btn" type="button" onclick="toggleMessageBody(${m.id})">View</button>
                        ${canDelete ? `<button class="btn btn-danger" type="button" onclick="deleteMessage(${m.id}, '${storageDb.replace(/'/g, "\\'")}')">Delete</button>` : ""}
                    </div>
                </div>
                <div id="msg-body-${m.id}" class="message-body">${m.body || ""}</div>
            `;
            messageList.appendChild(div);
        });
        if(currentRef || userId){
            localStorage.setItem(getMessageLastSeenKey(), new Date().toISOString());
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
        to_user_ref: toUserSelect.value,
        title: document.getElementById("title").value.trim(),
        body: document.getElementById("body").value.trim()
    };
    try{
        await request("/messages","POST",data);
        showMessageBox("Message sent");
        e.target.reset();
        setCreateMessageVisibility(false);
        loadMessages();
    }catch(err){
        alert(err.message || "Failed to create message");
    }
});

async function deleteMessage(id, storageDb){
    if(!canDeleteMessages()){
        alert("You don't have permission to delete messages.");
        return;
    }
    if(!confirm("Delete this message?")) return;
    try{
        const query = storageDb ? `?storage_db=${encodeURIComponent(storageDb)}` : "";
        await request(`/messages/${id}${query}`,"DELETE");
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
    const canCreate = canCreateMessage();
    if(toggleCreateMessageBtn){
        toggleCreateMessageBtn.style.display = canCreate ? "" : "none";
        toggleCreateMessageBtn.addEventListener("click", toggleCreateMessageCard);
    }
    setCreateMessageVisibility(false);
    if(!canCreate && createMessageCard){
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
