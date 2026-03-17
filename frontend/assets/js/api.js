/* ======================
   CENTRAL API REQUEST
   ====================== */
function resolveBaseUrl(){
    const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());
    const globalBaseUrl = typeof window !== "undefined" ? window.__API_BASE_URL__ : "";
    const storedBaseUrl = typeof window !== "undefined" ? localStorage.getItem("apiBaseUrl") : "";
    const globalOrigin = typeof window !== "undefined" ? window.__API_ORIGIN__ : "";
    const storedOrigin = typeof window !== "undefined" ? localStorage.getItem("apiOrigin") : "";
    const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";

    const candidateBase = String(globalBaseUrl || storedBaseUrl || "").trim();
    if(isHttpUrl(candidateBase)){
        return candidateBase.replace(/\/+$/, "");
    }

    const candidateOrigin = String(globalOrigin || storedOrigin || "").trim();
    if(isHttpUrl(candidateOrigin)){
        return `${candidateOrigin.replace(/\/+$/, "")}/api`;
    }

    if(isHttpUrl(browserOrigin)){
        return `${browserOrigin.replace(/\/+$/, "")}/api`;
    }

    return "http://localhost:5000/api";
}

const BASE_URL = resolveBaseUrl();
window.BASE_URL = BASE_URL;
const GLOBAL_FOOTER_TEXT = "\u00A9 All Right Recieved with CRONIT SOLLUTIONS - JMR Prasanna.";

const USER_DEFAULT_ALLOWED_PATHS = [
    "/login.html",
    "/dashboard.html",
    "/products/product-list.html",
    "/products/machine.html",
    "/products/general-machine.html",
    "/product-list.html",
    "/machine.html",
    "/general-machine.html",
    "/customers/customer-list.html",
    "/customer-list.html",
    "/vendors/list-vendor.html",
    "/list-vendor.html",
    "/expenses/expense-list.html",
    "/expense-list.html",
    "/messages/messages.html",
    "/messages.html",
    "/notifications/notifications.html",
    "/notifications.html",
    "/invoices/invoice-list.html",
    "/invoices/create-invoice.html",
    "/invoices/view-invoice.html",
    "/invoices/view-quotation.html",
    "/invoices/view-quotation-2.html",
    "/invoices/view-quotation-3.html",
    "/invoice-list.html",
    "/create-invoice.html",
    "/view-invoice.html",
    "/view-quotation.html",
    "/view-quotation-2.html",
    "/view-quotation-3.html",
    "/reports/sales-report.html",
    "/sales-report.html"
];
let USER_ALLOWED_PATHS_RUNTIME = [...USER_DEFAULT_ALLOWED_PATHS];

const MANAGER_BLOCKED_PATHS = [
    "/users/add-user.html",
    "/users/user-list.html",
    "/add-user.html",
    "/user-list.html"
];

function buildPagesPath(fileName){
    const path = window.location.pathname.replace(/\\/g, "/");
    const idx = path.lastIndexOf("/pages/");
    if(idx !== -1){
        return path.slice(0, idx + 7) + fileName;
    }
    return `/${fileName}`;
}

function enforceAuthentication(){
    const path = window.location.pathname.replace(/\\/g, "/").toLowerCase();
    const isLoginPage = path.endsWith("/login.html") || path.endsWith("login.html");
    const token = localStorage.getItem("token");

    if(!token && !isLoginPage){
        window.location.replace(buildPagesPath("login.html"));
        return false;
    }

    if(token && isLoginPage){
        window.location.replace(buildPagesPath("dashboard.html"));
        return false;
    }

    return true;
}

function enforceUserAccess(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "user") return;
    const path = window.location.pathname.replace(/\\/g,"/");
    const allowed = USER_ALLOWED_PATHS_RUNTIME.some(suffix => path.endsWith(suffix));
    if(allowed) return;
    const idx = path.lastIndexOf("/pages/");
    if(idx !== -1){
        window.location.href = path.slice(0, idx + 7) + "dashboard.html";
        return;
    }
    window.location.href = "/dashboard.html";
}

function enforceManagerAccess(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "manager") return;
    const path = window.location.pathname.replace(/\\/g,"/");
    const blocked = MANAGER_BLOCKED_PATHS.some(suffix => path.endsWith(suffix));
    if(!blocked) return;
    const idx = path.lastIndexOf("/pages/");
    if(idx !== -1){
        window.location.href = path.slice(0, idx + 7) + "dashboard.html";
        return;
    }
    window.location.href = "/dashboard.html";
}

function applyUserNavRestrictions(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "user") return;
    const allowed = USER_ALLOWED_PATHS_RUNTIME;
    document.querySelectorAll(".sidebar a").forEach(a=>{
        const href = (a.getAttribute("href") || "").trim();
        if(!href || href.startsWith("#") || href.toLowerCase().includes("logout")) return;
        let normalized = href.replace(/\\/g,"/");
        if(!normalized.startsWith("/")) normalized = "/" + normalized;
        const isAllowed = allowed.some(suffix => normalized.endsWith(suffix));
        if(!isAllowed){
            const li = a.closest("li");
            if(li){
                li.style.display = "none";
            }else{
                a.style.display = "none";
            }
        }
    });
}

function applyManagerNavRestrictions(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "manager") return;
    document.querySelectorAll(".sidebar a").forEach(a=>{
        const href = (a.getAttribute("href") || "").trim();
        if(!href || href.startsWith("#") || href.toLowerCase().includes("logout")) return;
        let normalized = href.replace(/\\/g,"/");
        if(!normalized.startsWith("/")) normalized = "/" + normalized;
        const isBlocked = MANAGER_BLOCKED_PATHS.some(suffix => normalized.endsWith(suffix));
        if(isBlocked){
            const li = a.closest("li");
            if(li){
                li.style.display = "none";
            }else{
                a.style.display = "none";
            }
        }
    });
}

function getUsersLink(fileName){
    const path = window.location.pathname.replace(/\\/g, "/");
    const idx = path.lastIndexOf("/pages/");
    if(idx === -1) return `/users/${fileName}`;
    const rest = path.slice(idx + 7);
    const depth = Math.max(0, rest.split("/").length - 1);
    const prefix = depth === 0 ? "" : "../".repeat(depth);
    return `${prefix}users/${fileName}`;
}

function getFinanceLink(fileName){
    const path = window.location.pathname.replace(/\\/g, "/");
    const idx = path.lastIndexOf("/pages/");
    if(idx === -1) return `/finance/${fileName}`;
    const rest = path.slice(idx + 7);
    const depth = Math.max(0, rest.split("/").length - 1);
    const prefix = depth === 0 ? "" : "../".repeat(depth);
    return `${prefix}finance/${fileName}`;
}

function getSupportLink(fileName){
    const path = window.location.pathname.replace(/\\/g, "/");
    const idx = path.lastIndexOf("/pages/");
    if(idx === -1) return `/support/${fileName}`;
    const rest = path.slice(idx + 7);
    const depth = Math.max(0, rest.split("/").length - 1);
    const prefix = depth === 0 ? "" : "../".repeat(depth);
    return `${prefix}support/${fileName}`;
}

function getStockLink(fileName){
    const path = window.location.pathname.replace(/\\/g, "/");
    const idx = path.lastIndexOf("/pages/");
    if(idx === -1) return `/stock/${fileName}`;
    const rest = path.slice(idx + 7);
    const depth = Math.max(0, rest.split("/").length - 1);
    const prefix = depth === 0 ? "" : "../".repeat(depth);
    return `${prefix}stock/${fileName}`;
}

function applyFinanceNav(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager") return;

    document.querySelectorAll(".sidebar .nav-links, .sidebar ul").forEach(nav => {
        const hasFinance = Array.from(nav.querySelectorAll("a")).some(a => {
            const href = (a.getAttribute("href") || "").replace(/\\/g, "/");
            return href.endsWith("/finance/finance.html") || href.endsWith("finance/finance.html") || href.endsWith("/finance.html") || href.endsWith("finance.html") || a.textContent.trim().toLowerCase() === "finance";
        });

        if(!hasFinance){
            const financeLi = document.createElement("li");
            financeLi.innerHTML = `<a href="${getFinanceLink("finance.html")}">Finance</a>`;
            nav.appendChild(financeLi);
        }
    });
}

function applySupportNav(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager") return;

    document.querySelectorAll(".sidebar .nav-links, .sidebar ul").forEach(nav => {
        const hasSupport = Array.from(nav.querySelectorAll("a")).some(a => {
            const href = (a.getAttribute("href") || "").replace(/\\/g, "/");
            return href.endsWith("/support/support.html") || href.endsWith("support/support.html") || href.endsWith("/support.html") || href.endsWith("support.html") || a.textContent.trim().toLowerCase() === "support";
        });

        if(hasSupport) return;

        const supportLi = document.createElement("li");
        supportLi.innerHTML = `<a href="${getSupportLink("support.html")}">Support</a>`;

        const financeLink = Array.from(nav.querySelectorAll("a")).find(a => {
            const href = (a.getAttribute("href") || "").replace(/\\/g, "/");
            return href.endsWith("/finance/finance.html") || href.endsWith("finance/finance.html") || href.endsWith("/finance.html") || href.endsWith("finance.html") || a.textContent.trim().toLowerCase() === "finance";
        });

        if(financeLink && financeLink.closest("li")){
            financeLink.closest("li").insertAdjacentElement("afterend", supportLi);
        }else{
            nav.appendChild(supportLi);
        }
    });
}

function applyAdminUsersNav(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin") return;

    document.querySelectorAll(".sidebar .nav-links, .sidebar ul").forEach(nav => {
        const hasUsers = Array.from(nav.querySelectorAll("a")).some(a => {
            const href = (a.getAttribute("href") || "").replace(/\\/g, "/");
            return href.endsWith("/users/user-list.html") || href.endsWith("users/user-list.html") || href.endsWith("/user-list.html") || href.endsWith("user-list.html") || a.textContent.trim().toLowerCase() === "users";
        });

        if(!hasUsers){
            const usersLi = document.createElement("li");
            usersLi.innerHTML = `<a href="${getUsersLink("user-list.html")}">Users</a>`;
            nav.appendChild(usersLi);
        }
    });
}

function applyStockNav(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager") return;

    document.querySelectorAll(".sidebar .nav-links, .sidebar ul").forEach(nav => {
        const hasStock = Array.from(nav.querySelectorAll("a")).some(a => {
            const href = (a.getAttribute("href") || "").replace(/\\/g, "/");
            return href.endsWith("/stock/stock.html") || href.endsWith("stock/stock.html") || href.endsWith("/stock.html") || href.endsWith("stock.html") || a.textContent.trim().toLowerCase() === "stock";
        });
        if(hasStock) return;

        const stockLi = document.createElement("li");
        stockLi.innerHTML = `<a href="${getStockLink("stock.html")}">Stock</a>`;

        const supportLink = Array.from(nav.querySelectorAll("a")).find(a => {
            const href = (a.getAttribute("href") || "").replace(/\\/g, "/");
            return href.endsWith("/support/support.html") || href.endsWith("support/support.html") || href.endsWith("/support.html") || href.endsWith("support.html") || a.textContent.trim().toLowerCase() === "support";
        });

        if(supportLink && supportLink.closest("li")){
            supportLink.closest("li").insertAdjacentElement("afterend", stockLi);
        }else{
            nav.appendChild(stockLi);
        }
    });
}

function ensureGlobalFooter(){
    if(document.getElementById("app-global-footer")) return;
    if(document.querySelector(".sidebar")){
        document.body.classList.add("app-has-sidebar-footer");
    }
    const footer = document.createElement("footer");
    footer.id = "app-global-footer";
    footer.className = "app-global-footer";
    footer.textContent = GLOBAL_FOOTER_TEXT;
    document.body.appendChild(footer);
}

function ensureMobileSidebar(){
    const sidebar = document.querySelector(".sidebar");
    if(!sidebar) return;
    if(document.getElementById("mobileNavToggle")) return;

    const toggle = document.createElement("button");
    toggle.id = "mobileNavToggle";
    toggle.className = "mobile-nav-toggle";
    toggle.setAttribute("type", "button");
    toggle.setAttribute("aria-label", "Toggle navigation");
    toggle.innerHTML = "&#9776;";

    const backdrop = document.createElement("div");
    backdrop.id = "mobileNavBackdrop";
    backdrop.className = "mobile-nav-backdrop";

    const closeNav = () => {
        document.body.classList.remove("mobile-nav-open");
        backdrop.classList.remove("show");
    };

    const openNav = () => {
        document.body.classList.add("mobile-nav-open");
        backdrop.classList.add("show");
    };

    toggle.addEventListener("click", () => {
        if(document.body.classList.contains("mobile-nav-open")){
            closeNav();
        }else{
            openNav();
        }
    });

    backdrop.addEventListener("click", closeNav);

    window.addEventListener("resize", () => {
        if(window.innerWidth > 980){
            closeNav();
        }
    });

    document.body.appendChild(toggle);
    document.body.appendChild(backdrop);
}

function applyUiSettingsToPage(settings){
    if(!settings) return;
    if(settings.primary_color){
        document.documentElement.style.setProperty("--primary", String(settings.primary_color));
    }
    if(settings.accent_color){
        document.documentElement.style.setProperty("--accent", String(settings.accent_color));
    }
    if(settings.app_name){
        const appName = String(settings.app_name);
        const normalizedAppName = normalizeAppName(appName);
        document.querySelectorAll(".sidebar .logo span").forEach((el) => {
            el.textContent = normalizedAppName;
        });
        if(document.title && !document.title.toLowerCase().includes(normalizedAppName.toLowerCase())){
            document.title = `${document.title} | ${normalizedAppName}`;
        }
    }
    if(settings.footer_text){
        const footer = document.getElementById("app-global-footer");
        if(footer){
            // Enforce one global footer text on all pages.
            footer.textContent = GLOBAL_FOOTER_TEXT;
        }
    }
}

function normalizeAppName(appName){
    const compact = String(appName || "").trim().toLowerCase().replace(/[_\s]+/g, " ");
    if(compact.includes("ulmotech") || compact.includes("pulmotech") || compact.includes("inhouse")){
        return "PULMO TECHNOLOGIES";
    }
    return String(appName).replace(/_/g, " ").toUpperCase();
}

async function loadPublicUiSettings(){
    try{
        const res = await fetch(`${BASE_URL}/ui-settings/public`);
        if(!res.ok) return;
        const data = await res.json();
        applyUiSettingsToPage(data);
    }catch(_err){
    }
}

async function loadUserAccessPermissions(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "user"){
        USER_ALLOWED_PATHS_RUNTIME = [...USER_DEFAULT_ALLOWED_PATHS];
        return;
    }
    const token = localStorage.getItem("token");
    if(!token){
        USER_ALLOWED_PATHS_RUNTIME = [...USER_DEFAULT_ALLOWED_PATHS];
        return;
    }
    try{
        const res = await fetch(`${BASE_URL}/users/access/me`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if(!res.ok){
            USER_ALLOWED_PATHS_RUNTIME = [...USER_DEFAULT_ALLOWED_PATHS];
            return;
        }
        const data = await res.json();
        const dynamicPages = Array.isArray(data.allowed_pages) ? data.allowed_pages : [];
        const merged = new Set([
            "/login.html",
            "/dashboard.html",
            ...USER_DEFAULT_ALLOWED_PATHS,
            ...dynamicPages
        ]);
        USER_ALLOWED_PATHS_RUNTIME = Array.from(merged);
        if(data.database_name){
            localStorage.setItem("selectedDatabaseName", String(data.database_name));
        }else{
            localStorage.removeItem("selectedDatabaseName");
        }
    }catch(_err){
        USER_ALLOWED_PATHS_RUNTIME = [...USER_DEFAULT_ALLOWED_PATHS];
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    if(!enforceAuthentication()) return;
    await loadUserAccessPermissions();
    enforceUserAccess();
    enforceManagerAccess();
    applyUserNavRestrictions();
    applyManagerNavRestrictions();
    applyFinanceNav();
    applySupportNav();
    applyStockNav();
    applyAdminUsersNav();
    ensureMobileSidebar();
    ensureGlobalFooter();
    loadPublicUiSettings();
});

function ensureMessageBoxStyles(){
    if(document.getElementById("message-box-styles")) return;
    const style = document.createElement("style");
    style.id = "message-box-styles";
    style.textContent = `
        .app-message-box {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 240px;
            max-width: 420px;
            padding: 12px 14px;
            border-radius: 8px;
            color: #fff;
            font-weight: 600;
            box-shadow: 0 10px 24px rgba(0,0,0,0.2);
            opacity: 0;
            transform: translateY(-8px);
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .app-message-box.show { opacity: 1; transform: translateY(0); }
        .app-message-box.success { background: #198754; }
        .app-message-box.error { background: #dc3545; }
    `;
    document.head.appendChild(style);
}

function showMessageBox(message, type="success", duration=2200){
    ensureMessageBoxStyles();
    let box = document.getElementById("app-message-box");
    if(!box){
        box = document.createElement("div");
        box.id = "app-message-box";
        box.className = "app-message-box";
        document.body.appendChild(box);
    }
    box.textContent = message;
    box.className = `app-message-box ${type}`;
    requestAnimationFrame(()=>box.classList.add("show"));
    setTimeout(()=>box.classList.remove("show"), duration);
}
window.showMessageBox = showMessageBox;

async function request(endpoint, method="GET", data=null){
    const token = localStorage.getItem("token");
    const isAuthEndpoint = endpoint.startsWith("/auth/");
    if(!token && !isAuthEndpoint){
        throw new Error("Please login first.");
    }
    const headers = {"Content-Type":"application/json"};
    if(token) headers["Authorization"] = "Bearer "+token;

    const options = {
        method,
        headers,
    };
    if(data) options.body = JSON.stringify(data);

    let res;
    try{
        const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        res = await fetch(BASE_URL + path, options);
    }catch(_err){
        throw new Error(`Failed to fetch. Make sure backend server is running at ${BASE_URL.replace(/\/api$/,"")}`);
    }

    const raw = await res.text();
    let result = {};
    if(raw){
        try{
            result = JSON.parse(raw);
        }catch(_err){
            result = { message: raw };
        }
    }

    if(!res.ok){
        const isHtml = typeof result.message === "string" && /<\s*html|<!doctype/i.test(result.message);
        if(res.status === 404){
            throw new Error(`Endpoint not found: ${method} ${endpoint}`);
        }
        if(isHtml){
            throw new Error(`Server returned HTML error (${res.status}) for ${method} ${endpoint}`);
        }
        throw new Error(result.message || `Request failed (${res.status})`);
    }
    return result;
}

/* ======================
   LOGIN PAGE FUNCTIONS
   ====================== */
async function login(){
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const role = document.getElementById("role").value;

    if(!email || !password || !role){
        alert("Please fill all fields!");
        return;
    }

    try{
        const res = await request("/auth/login","POST",{email,password});
        if(res.user.role !== role){
            alert("Selected role does not match your account role!");
            return;
        }
        localStorage.setItem("token",res.token);
        localStorage.setItem("role",res.user.role);
        localStorage.setItem("userId", res.user.id);
        window.location.href = "dashboard.html";
    }catch(err){
        alert(err.message);
    }
}

async function forgotPassword(){
    const email = prompt("Enter your registered email for password reset");
    if(!email) return;

    try{
        await request("/auth/forgot-password","POST",{email});
        alert("Password reset email sent. Check your inbox.");
    }catch(err){
        alert(err.message);
    }
}
