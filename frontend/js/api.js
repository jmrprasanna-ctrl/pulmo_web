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
const UI_SETTINGS_CACHE_KEY = "publicUiSettingsCache";
const ENABLE_PUBLIC_UI_SETTINGS_RUNTIME = typeof window !== "undefined" && window.__ENABLE_PUBLIC_UI_SETTINGS__ === true;
const LAST_ACTIVITY_KEY = "lastActivityAt";
const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart"];
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;

const USER_DEFAULT_ALLOWED_PATHS = [
    "/login.html",
    "/dashboard.html"
];
let USER_ALLOWED_PATHS_RUNTIME = [...USER_DEFAULT_ALLOWED_PATHS];
const USER_ALLOWED_CACHE_KEY = "userAllowedPathsRuntime";
let USER_ALLOWED_ACTIONS_RUNTIME = [];
const USER_ALLOWED_ACTIONS_CACHE_KEY = "userAllowedActionsRuntime";
let USER_ACCESS_CONFIG_APPLIES_RUNTIME = false;
const USER_ACCESS_CONFIG_ENABLED_CACHE_KEY = "userAccessConfigEnabledRuntime";
window.__userAccessPermissionsLoaded = false;
window.__waitForUserAccessPermissions = function __waitForUserAccessPermissions(){
    if(window.__userAccessPermissionsLoaded){
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const done = () => resolve();
        document.addEventListener("app:user-access-ready", done, { once: true });
        window.setTimeout(done, 1500);
    });
};

const MANAGER_BLOCKED_PATHS = [
    "/users/add-user.html",
    "/users/user-list.html",
    "/users/preference.html",
    "/add-user.html",
    "/user-list.html",
    "/preference.html"
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

function markUserActivity(){
    try{
        localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }catch(_err){
    }
}

function setupActivityTracking(){
    if(window.__activityTrackingBound) return;
    window.__activityTrackingBound = true;
    ACTIVITY_EVENTS.forEach((eventName) => {
        window.addEventListener(eventName, markUserActivity, { passive: true });
    });
    markUserActivity();
}

function isLoginPagePath(){
    const path = window.location.pathname.replace(/\\/g, "/").toLowerCase();
    return path.endsWith("/login.html") || path.endsWith("login.html");
}

function logoutForInactivity(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    localStorage.removeItem("selectedDatabaseName");
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem(USER_ALLOWED_CACHE_KEY);
    localStorage.removeItem(USER_ALLOWED_ACTIONS_CACHE_KEY);
    localStorage.removeItem(USER_ACCESS_CONFIG_ENABLED_CACHE_KEY);
    window.location.replace(buildPagesPath("login.html"));
}

function enforceIdleTimeout(){
    const token = localStorage.getItem("token");
    if(!token || isLoginPagePath()) return true;
    const lastActivityAt = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
    if(!Number.isFinite(lastActivityAt) || lastActivityAt <= 0){
        markUserActivity();
        return true;
    }
    if(Date.now() - lastActivityAt > IDLE_TIMEOUT_MS){
        logoutForInactivity();
        return false;
    }
    return true;
}

function startIdleTimeoutWatcher(){
    if(window.__idleTimeoutWatcherStarted) return;
    window.__idleTimeoutWatcherStarted = true;
    window.setInterval(() => {
        enforceIdleTimeout();
    }, IDLE_CHECK_INTERVAL_MS);
}

function hasAccessConfigRestrictions(){
    if(USER_ACCESS_CONFIG_APPLIES_RUNTIME === true){
        return true;
    }
    if(USER_ACCESS_CONFIG_APPLIES_RUNTIME === false){
        return false;
    }
    return String(localStorage.getItem(USER_ACCESS_CONFIG_ENABLED_CACHE_KEY) || "") === "1";
}
window.hasAccessConfigRestrictions = hasAccessConfigRestrictions;

function getAccessConfigState(){
    if(USER_ACCESS_CONFIG_APPLIES_RUNTIME === true || USER_ACCESS_CONFIG_APPLIES_RUNTIME === false){
        return USER_ACCESS_CONFIG_APPLIES_RUNTIME;
    }
    const cached = String(localStorage.getItem(USER_ACCESS_CONFIG_ENABLED_CACHE_KEY) || "");
    if(cached === "1") return true;
    if(cached === "0") return false;
    return null;
}

function enforceUserAccess(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "user" && role !== "admin" && role !== "manager") return;
    const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
    if(role === "user" && selectedDb === "demo"){
        return;
    }
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
    const enforceByConfiguredRole = (role === "admin" || role === "manager") && getAccessConfigState() === true;
    if(role !== "user" && !enforceByConfiguredRole) return;
    const allowed = USER_ALLOWED_PATHS_RUNTIME;
    document.querySelectorAll(".sidebar a").forEach(a=>{
        const href = (a.getAttribute("href") || "").trim();
        if(!href || href.startsWith("#") || href.toLowerCase().includes("logout")) return;
        let normalized = href.replace(/\\/g,"/");
        if(!normalized.startsWith("/")) normalized = "/" + normalized;
        const isAllowed = allowed.some(suffix => normalized.endsWith(suffix));
        const financeAliasAllowed = normalized.endsWith("/finance.html") && hasUserGrantedPath("/finance/finance.html");
        const supportAliasAllowed = normalized.endsWith("/support.html") && hasUserGrantedPath("/support/support.html");
        const stockAliasAllowed = normalized.endsWith("/stock.html") && hasUserGrantedPath("/stock/stock.html");
        const allowThisLink = isAllowed || financeAliasAllowed || supportAliasAllowed || stockAliasAllowed;
        if(!allowThisLink){
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

function toMenuHref(canonicalPath){
    const clean = String(canonicalPath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if(!clean) return "#";
    const path = window.location.pathname.replace(/\\/g, "/");
    const idx = path.lastIndexOf("/pages/");
    if(idx === -1){
        return `/${clean}`;
    }
    const rest = path.slice(idx + 7);
    const depth = Math.max(0, rest.split("/").length - 1);
    const prefix = depth === 0 ? "" : "../".repeat(depth);
    return `${prefix}${clean}`;
}

function renderSidebarMenuByAccess(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager" && role !== "user") return;
    const menuEntries = [
        { path: "/dashboard.html", label: "Dashboard" },
        { path: "/products/product-list.html", label: "Products" },
        { path: "/products/general-machine.html", label: "Machines" },
        { path: "/customers/customer-list.html", label: "Customers" },
        { path: "/invoices/invoice-list.html", label: "Invoices" },
        { path: "/vendors/list-vendor.html", label: "Vendors" },
        { path: "/expenses/expense-list.html", label: "Expenses" },
        { path: "/reports/sales-report.html", label: "Reports" },
        { path: "/analytics/sales-chart.html", label: "Analytics" },
        { path: "/finance/finance.html", label: "Finance" },
        { path: "/support/support.html", label: "Support" },
        { path: "/stock/stock.html", label: "Stock" },
        { path: "/users/user-list.html", label: "Users" }
    ];
    const granted = menuEntries.filter((entry) => hasUserGrantedPath(entry.path));
    const finalMenu = granted.length ? granted : [{ path: "/dashboard.html", label: "Dashboard" }];

    window.__accessMenuRenderLock = true;
    document.querySelectorAll(".sidebar .nav-links, .sidebar ul").forEach((nav) => {
        nav.innerHTML = finalMenu
            .map((entry) => `<li><a href="${toMenuHref(entry.path)}">${entry.label}</a></li>`)
            .join("");
    });
    window.__accessMenuRenderLock = false;
}

function setupSidebarAccessObserver(){
    // Disabled: Mutation observer can cause render loops on some browsers.
    // We enforce menu restrictions through explicit guard passes instead.
}

function applyFinanceNav(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager" && role !== "user") return;
    const isAllowed = hasUserGrantedPath("/finance/finance.html");
    if(!isAllowed) return;

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
    if(role !== "admin" && role !== "manager" && role !== "user") return;
    const isAllowed = hasUserGrantedPath("/support/support.html");
    if(!isAllowed) return;

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
    if(!hasUserGrantedPath("/users/user-list.html")) return;

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
    if(role !== "admin" && role !== "manager" && role !== "user") return;
    const isAllowed = hasUserGrantedPath("/stock/stock.html");
    if(!isAllowed) return;

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

function applyAccessGuards(){
    renderSidebarMenuByAccess();
    enforceUserAccess();
    enforceManagerAccess();
    applyUserNavRestrictions();
    applyManagerNavRestrictions();
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

function normalizeHexColor(value, fallback){
    const raw = String(value || "").trim();
    const six = /^#([0-9a-fA-F]{6})$/;
    const three = /^#([0-9a-fA-F]{3})$/;
    if(six.test(raw)) return raw.toLowerCase();
    if(three.test(raw)){
        const m = raw.slice(1).toLowerCase();
        return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`;
    }
    return fallback;
}

function darkenHex(hex, amount){
    const normalized = normalizeHexColor(hex, "#0f6abf");
    const r = Math.max(0, Math.min(255, parseInt(normalized.slice(1,3), 16) - amount));
    const g = Math.max(0, Math.min(255, parseInt(normalized.slice(3,5), 16) - amount));
    const b = Math.max(0, Math.min(255, parseInt(normalized.slice(5,7), 16) - amount));
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function applyUiSettingsToPage(settings){
    if(!settings) return;
    if(settings.primary_color){
        const primary = normalizeHexColor(settings.primary_color, "#0f6abf");
        document.documentElement.style.setProperty("--primary", primary);
        document.documentElement.style.setProperty("--primary-2", darkenHex(primary, 25));
        document.documentElement.style.setProperty("--sidebar-deep", darkenHex(primary, 45));
    }
    if(settings.accent_color){
        document.documentElement.style.setProperty("--accent", String(settings.accent_color));
    }
    if(settings.background_color){
        const bg = normalizeHexColor(settings.background_color, "#edf3fb");
        document.documentElement.style.setProperty("--page-bg", bg);
        document.documentElement.style.setProperty("--page-bg-soft", darkenHex(bg, -12));
    }
    if(settings.button_color){
        const btn = normalizeHexColor(settings.button_color, "#0f6abf");
        document.documentElement.style.setProperty("--button-color", btn);
        document.documentElement.style.setProperty("--button-color-2", darkenHex(btn, 22));
    }
    if(settings.mode_theme){
        const mode = String(settings.mode_theme || "").trim().toLowerCase();
        document.body.classList.remove("theme-dark", "theme-light");
        document.body.classList.add(mode === "dark" ? "theme-dark" : "theme-light");
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
    if(settings.logo_url){
        const apiOrigin = BASE_URL.replace(/\/api$/,"");
        const logoPath = String(settings.logo_url || "").trim();
        const absoluteLogoUrl = /^https?:\/\//i.test(logoPath)
            ? logoPath
            : `${apiOrigin}${logoPath.startsWith("/") ? "" : "/"}${logoPath}`;
        const logoVersion = settings.logo_updated_at ? `?v=${encodeURIComponent(String(settings.logo_updated_at))}` : "";
        document.querySelectorAll(".sidebar .logo img").forEach((img) => {
            img.src = `${absoluteLogoUrl}${logoVersion}`;
        });
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
    if(!ENABLE_PUBLIC_UI_SETTINGS_RUNTIME){
        return;
    }

    const disableUiSettingsRefresh = typeof window !== "undefined" && window.__DISABLE_PUBLIC_UI_REFRESH__ === true;
    if(disableUiSettingsRefresh){
        return;
    }

    try{
        const cached = localStorage.getItem(UI_SETTINGS_CACHE_KEY);
        if(cached){
            const parsed = JSON.parse(cached);
            if(parsed && typeof parsed === "object"){
                applyUiSettingsToPage(parsed);
            }
        }
    }catch(_cacheErr){
    }

    try{
        const res = await fetch(`${BASE_URL}/ui-settings/public`);
        if(!res.ok) return;
        const data = await res.json();
        try{
            localStorage.setItem(UI_SETTINGS_CACHE_KEY, JSON.stringify(data || {}));
        }catch(_cacheWriteErr){
        }
        applyUiSettingsToPage(data);
    }catch(_err){
    }
}

async function loadUserAccessPermissions(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "user" && role !== "admin" && role !== "manager"){
        USER_ALLOWED_PATHS_RUNTIME = [...USER_DEFAULT_ALLOWED_PATHS];
        USER_ALLOWED_ACTIONS_RUNTIME = [];
        USER_ACCESS_CONFIG_APPLIES_RUNTIME = false;
        localStorage.removeItem(USER_ALLOWED_CACHE_KEY);
        localStorage.removeItem(USER_ALLOWED_ACTIONS_CACHE_KEY);
        localStorage.removeItem(USER_ACCESS_CONFIG_ENABLED_CACHE_KEY);
        return;
    }
    if(role === "user"){
        const cachedRaw = localStorage.getItem(USER_ALLOWED_CACHE_KEY);
        if(cachedRaw){
            try{
                const cached = JSON.parse(cachedRaw);
                if(Array.isArray(cached) && cached.length){
                    USER_ALLOWED_PATHS_RUNTIME = Array.from(new Set(cached.map((x)=>String(x || "").trim()).filter(Boolean)));
                }
            }catch(_e){}
        }
        const cachedActionsRaw = localStorage.getItem(USER_ALLOWED_ACTIONS_CACHE_KEY);
        if(cachedActionsRaw){
            try{
                const cached = JSON.parse(cachedActionsRaw);
                if(Array.isArray(cached) && cached.length){
                    USER_ALLOWED_ACTIONS_RUNTIME = Array.from(new Set(cached.map((x)=>String(x || "").trim().toLowerCase()).filter(Boolean)));
                }
            }catch(_e){}
        }
    }else{
        USER_ALLOWED_PATHS_RUNTIME = [...USER_DEFAULT_ALLOWED_PATHS];
        USER_ALLOWED_ACTIONS_RUNTIME = [];
    }
    const cachedConfigState = String(localStorage.getItem(USER_ACCESS_CONFIG_ENABLED_CACHE_KEY) || "");
    const previousConfigState = cachedConfigState === "1"
        ? true
        : (cachedConfigState === "0" ? false : null);
    if(cachedConfigState === "1"){
        USER_ACCESS_CONFIG_APPLIES_RUNTIME = true;
    }else if(cachedConfigState === "0"){
        USER_ACCESS_CONFIG_APPLIES_RUNTIME = false;
    }else{
        USER_ACCESS_CONFIG_APPLIES_RUNTIME = null;
    }
    const token = localStorage.getItem("token");
    if(!token){
        return;
    }
    try{
        const res = await fetch(`${BASE_URL}/users/access/me`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if(!res.ok){
            return;
        }
        const data = await res.json();
        const dynamicPages = Array.isArray(data.allowed_pages)
            ? data.allowed_pages.map((x) => String(x || "").trim()).filter(Boolean)
            : [];
        const dynamicActions = Array.isArray(data.allowed_actions) ? data.allowed_actions : [];
        if(typeof data?.has_access_config === "boolean"){
            let nextConfigState = data.has_access_config;
            // For admin/manager, once a restricted config is known, keep it sticky across refreshes.
            // This prevents accidental broad access when backend lookup is temporarily inconsistent.
            if((role === "admin" || role === "manager") && previousConfigState === true && nextConfigState === false){
                nextConfigState = true;
            }
            USER_ACCESS_CONFIG_APPLIES_RUNTIME = nextConfigState;
            localStorage.setItem(USER_ACCESS_CONFIG_ENABLED_CACHE_KEY, nextConfigState ? "1" : "0");
        }else if(role === "admin" || role === "manager"){
            if(dynamicPages.length > 0 || dynamicActions.length > 0){
                USER_ACCESS_CONFIG_APPLIES_RUNTIME = true;
                localStorage.setItem(USER_ACCESS_CONFIG_ENABLED_CACHE_KEY, "1");
            }
        }
        const merged = new Set([
            "/login.html",
            "/dashboard.html",
            ...dynamicPages
        ]);
        USER_ALLOWED_PATHS_RUNTIME = Array.from(merged);
        USER_ALLOWED_ACTIONS_RUNTIME = Array.from(new Set(dynamicActions.map((x)=>String(x || "").trim().toLowerCase()).filter(Boolean)));
        localStorage.setItem(USER_ALLOWED_CACHE_KEY, JSON.stringify(USER_ALLOWED_PATHS_RUNTIME));
        localStorage.setItem(USER_ALLOWED_ACTIONS_CACHE_KEY, JSON.stringify(USER_ALLOWED_ACTIONS_RUNTIME));
        if(data.database_name){
            localStorage.setItem("selectedDatabaseName", String(data.database_name));
        }else{
            // keep previous selected DB to avoid accidental runtime DB drift on transient API failures
        }
    }catch(_err){
        // keep cached or current runtime permissions
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    setupActivityTracking();
    startIdleTimeoutWatcher();
    if(!enforceIdleTimeout()) return;
    if(!enforceAuthentication()) return;
    await loadUserAccessPermissions();
    window.__userAccessPermissionsLoaded = true;
    document.dispatchEvent(new CustomEvent("app:user-access-ready"));
    applyAccessGuards();
    // Some pages inject sidebar/nav slightly later; re-apply once after render settles.
    window.setTimeout(applyAccessGuards, 250);
    window.setTimeout(applyAccessGuards, 1000);
    ensureMobileSidebar();
    ensureGlobalFooter();
    loadPublicUiSettings();
});

window.addEventListener("pageshow", () => {
    if(!enforceIdleTimeout()) return;
    enforceAuthentication();
    if(window.__userAccessPermissionsLoaded){
        applyAccessGuards();
    }else{
        document.addEventListener("app:user-access-ready", applyAccessGuards, { once: true });
    }
});

window.addEventListener("popstate", () => {
    if(!enforceIdleTimeout()) return;
    enforceAuthentication();
});

document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible"){
        if(!enforceIdleTimeout()) return;
        enforceAuthentication();
    }
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
    if(!enforceIdleTimeout()){
        throw new Error("Session expired due to inactivity.");
    }
    const token = localStorage.getItem("token");
    const isAuthEndpoint = endpoint.startsWith("/auth/");
    if(!token && !isAuthEndpoint){
        enforceAuthentication();
        throw new Error("Please login first.");
    }
    const headers = {"Content-Type":"application/json"};
    if(token) headers["Authorization"] = "Bearer "+token;
    const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
    if(selectedDb){
        headers["X-Database-Name"] = selectedDb;
    }

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
        // Prevent permission cache from a previous session/user leaking into current session.
        localStorage.removeItem(USER_ALLOWED_CACHE_KEY);
        localStorage.removeItem(USER_ALLOWED_ACTIONS_CACHE_KEY);
        localStorage.removeItem(USER_ACCESS_CONFIG_ENABLED_CACHE_KEY);
        const res = await request("/auth/login","POST",{email,password});
        if(res.user.role !== role){
            alert("Selected role does not match your account role!");
            return;
        }
        localStorage.setItem("token",res.token);
        localStorage.setItem("role",res.user.role);
        localStorage.setItem("userId", res.user.id);
        if(res.user && res.user.database_name){
            localStorage.setItem("selectedDatabaseName", String(res.user.database_name).trim().toLowerCase());
        }else{
            localStorage.removeItem("selectedDatabaseName");
        }
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
function hasUserGrantedPath(path){
    const target = String(path || "").trim().toLowerCase();
    if(!target) return false;
    return USER_ALLOWED_PATHS_RUNTIME.some((x) => String(x || "").trim().toLowerCase() === target);
}
window.hasUserGrantedPath = hasUserGrantedPath;

function hasUserActionPermission(path, action){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager" && role !== "user"){
        return false;
    }
    const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").trim().toLowerCase();
    if(role === "user" && selectedDb === "demo"){
        return true;
    }

    const actionKey = `${String(path || "").trim().toLowerCase()}::${String(action || "").trim().toLowerCase()}`;
    return USER_ALLOWED_ACTIONS_RUNTIME.includes(actionKey);
}
window.hasUserActionPermission = hasUserActionPermission;
