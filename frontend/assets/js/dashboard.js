                                  
const storedRole = localStorage.getItem("role") || "";
const storedEmail = localStorage.getItem("userEmail") || "";
const storedName = localStorage.getItem("userName") || "";
const displayName = storedName || storedEmail || storedRole || "User";

const roleEl = document.getElementById("userRole");
if (roleEl) roleEl.innerText = storedRole;

const nameEl = document.getElementById("userName");
if (nameEl) nameEl.innerText = displayName;

const initialEl = document.getElementById("userInitial");
if (initialEl) {
    const initialSource = displayName.trim();
    initialEl.innerText = initialSource ? initialSource[0].toUpperCase() : "U";
}

const userRole = (storedRole || "").toLowerCase();

if(userRole === "manager"){
    document.querySelectorAll(".sidebar a").forEach(a=>{
        const href = (a.getAttribute("href") || "").trim();
        if(!href) return;
        const normalized = (href.startsWith("/") ? href : `/${href}`).replace(/\\/g,"/");
        if(normalized.endsWith("/users/user-list.html") || normalized.endsWith("/user-list.html") || normalized.endsWith("/users/add-user.html") || normalized.endsWith("/add-user.html")){
            const li = a.closest("li");
            if(li){
                li.style.display = "none";
            }else{
                a.style.display = "none";
            }
        }
    });
}

function hasDashboardAccessFor(path, actions = ["view"]){
    const target = String(path || "").trim();
    if(!target) return false;
    if(typeof hasUserGrantedPath === "function" && hasUserGrantedPath(target)){
        return true;
    }
    if(typeof hasUserActionPermission === "function"){
        return actions.some((action) => hasUserActionPermission(target, action));
    }
    return true;
}

function syncDashboardCommunicationButtons(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager" && role !== "user") return;

    const messagesBtn = document.getElementById("messagesBtn");
    const noticeBtn = document.getElementById("noticeBtn");

    if(messagesBtn){
        const allowMessages = hasDashboardAccessFor("/messages/messages.html", ["view", "add", "delete"]);
        messagesBtn.style.display = allowMessages ? "" : "none";
    }

    if(noticeBtn){
        const allowNotifications = hasDashboardAccessFor("/notifications/notifications.html", ["view", "add", "delete"]);
        noticeBtn.style.display = allowNotifications ? "" : "none";
    }
}

if(window.__userAccessPermissionsLoaded){
    syncDashboardCommunicationButtons();
}else{
    document.addEventListener("app:user-access-ready", syncDashboardCommunicationButtons, { once: true });
}

function normalizeAccessPath(path){
    return `/${String(path || "").trim().toLowerCase().replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function toDashboardMenuHref(canonicalPath){
    const clean = String(canonicalPath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if(!clean) return "#";
    return clean;
}

const DASHBOARD_MENU_ENTRIES = [
    { path: "/dashboard.html", label: "Dashboard" },
    {
        path: "/products/product-list.html",
        label: "Administration",
        children: [
            { path: "/products/product-list.html", label: "Products" },
            { path: "/customers/customer-list.html", label: "Customers" },
            { path: "/vendors/list-vendor.html", label: "Vendors" },
            { path: "/users/technician-list.html", label: "Support Technician" }
        ]
    },
    {
        path: "/products/general-machine.html",
        label: "Machines",
        children: [
            { path: "/products/general-machine.html", label: "General" },
            {
                path: "/products/machine.html",
                label: "Rental",
                children: [
                    { path: "/products/machine.html", label: "Rental Mchine" }
                ]
            }
        ]
    },
    {
        path: "/invoices/invoice-list.html",
        label: "Payment",
        children: [
            { path: "/invoices/invoice-list.html", label: "Invoices" },
            { path: "/products/add-rental-count.html", label: "Rental Count" },
            { path: "/products/add-rental-consumable.html", label: "Consumables" }
        ]
    },
    { path: "/expenses/expense-list.html", label: "Expenses" },
    { path: "/reports/sales-report.html", label: "Reports" },
    { path: "/analytics/sales-chart.html", label: "Analytics" },
    {
        path: "/finance/finance.html",
        label: "Finance",
        children: [
            { path: "/finance/finance.html", label: "Finance" },
            { path: "/finance/payments.html", label: "Payments" },
            { path: "/finance/pendings.html", label: "Pendings" },
            { path: "/support/warrenty.html", label: "Warrenty" }
        ]
    },
    { path: "/support/support.html", label: "Support" },
    { path: "/stock/stock.html", label: "Stock" },
    {
        path: "/users/user-list.html",
        label: "System",
        children: [
            { path: "/users/user-list.html", label: "User List" },
            { path: "/users/profile-list.html", label: "Profile" },
            { path: "/users/preference.html", label: "Preference" },
            { path: "/users/user-access.html", label: "Access" },
            {
                path: "/users/mapped.html",
                label: "Mapped",
                children: [
                    { path: "/users/db-create.html", label: "DB Create" },
                    { path: "/users/company-create.html", label: "Company Create" },
                    { path: "/users/mapped.html", label: "Mapped" },
                    { path: "/users/inv-map.html", label: "Inv Map" }
                ]
            },
            { path: "/users/user-logged.html", label: "Logged" },
            { path: "/support/email-setup.html", label: "Email" }
        ]
    }
];
let dashboardAllowedMenuEntries = null;
let lastDashboardMenuSignature = "";

function renderDashboardSidebarMenu(entries){
    const nav = document.querySelector(".sidebar .nav-links, .sidebar ul");
    if(!nav) return;
    const safeEntries = Array.isArray(entries) && entries.length
        ? entries
        : [{ path: "/dashboard.html", label: "Dashboard" }];
    const buildMenuSignature = (entry) => {
        const base = normalizeAccessPath(entry.path);
        const children = Array.isArray(entry.children) ? entry.children : [];
        if(!children.length) return base;
        const childSig = children.map(buildMenuSignature).join(",");
        return `${base}[${childSig}]`;
    };
    const renderMenuEntry = (entry, groupClass = "") => {
        const children = Array.isArray(entry.children) ? entry.children : [];
        if(!children.length){
            return `<li><a href="${toDashboardMenuHref(entry.path)}">${entry.label}</a></li>`;
        }
        const nextGroupClass = groupClass || (String(entry.label || "").trim().toLowerCase() === "machines" ? "nav-group-machines" : "");
        const classAttr = nextGroupClass ? `nav-group ${nextGroupClass}` : "nav-group";
        const childHtml = children.map((child) => renderMenuEntry(child, nextGroupClass)).join("");
        return `
            <li class="${classAttr}">
                <a href="#" class="nav-group-toggle" data-sidebar-group-toggle="1" aria-expanded="false">${entry.label}</a>
                <ul class="nav-submenu" data-sidebar-group-menu="1">
                    ${childHtml}
                </ul>
            </li>
        `;
    };

    const signature = safeEntries.map(buildMenuSignature).join("|");
    if(signature === lastDashboardMenuSignature) return;
    lastDashboardMenuSignature = signature;
    nav.innerHTML = safeEntries.map((e) => renderMenuEntry(e)).join("");
    bindDashboardMachinesSubmenu();
}

function bindDashboardMachinesSubmenu(){
    const pagePath = normalizeAccessPath(window.location.pathname);
    const linkTargetsCurrentPage = (link) => {
        const href = String(link.getAttribute("href") || "").trim();
        if(!href || href.startsWith("#")) return false;
        try{
            const targetPath = normalizeAccessPath(new URL(href, window.location.href).pathname);
            return pagePath.endsWith(targetPath);
        }catch(_err){
            return false;
        }
    };

    const allGroups = Array.from(document.querySelectorAll(".sidebar .nav-group"));
    allGroups.forEach((group) => {
        const hasActiveLink = Array.from(group.querySelectorAll("a[href]")).some((link) => {
            if(link.classList.contains("nav-group-toggle")) return false;
            return linkTargetsCurrentPage(link);
        });
        group.classList.toggle("is-open", hasActiveLink);
        if(hasActiveLink){
            let parentGroup = group.parentElement ? group.parentElement.closest(".nav-group") : null;
            while(parentGroup){
                parentGroup.classList.add("is-open");
                parentGroup = parentGroup.parentElement ? parentGroup.parentElement.closest(".nav-group") : null;
            }
        }
    });

    document.querySelectorAll(".sidebar [data-sidebar-group-toggle='1'], .sidebar [data-sidebar-machines-toggle='1']").forEach((toggle) => {
        const parent = toggle.closest(".nav-group");
        const submenu = parent ? parent.querySelector(":scope > .nav-submenu") : null;
        if(!parent || !submenu) return;
        toggle.setAttribute("aria-expanded", parent.classList.contains("is-open") ? "true" : "false");
        toggle.addEventListener("click", (event) => {
            event.preventDefault();
            const willOpen = !parent.classList.contains("is-open");
            parent.classList.toggle("is-open", willOpen);
            toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
        });
    });
}

function enforceDashboardSidebarAccess(){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager" && role !== "user") return;
    const filterGrantedMenu = (entry) => {
        const children = Array.isArray(entry.children)
            ? entry.children.map(filterGrantedMenu).filter(Boolean)
            : [];
        if(children.length){
            return { ...entry, children };
        }
        if(typeof hasUserGrantedPath !== "function") return { ...entry, children: [] };
        return hasUserGrantedPath(entry.path) ? { ...entry, children: [] } : null;
    };
    const granted = DASHBOARD_MENU_ENTRIES.map(filterGrantedMenu).filter(Boolean);
    dashboardAllowedMenuEntries = granted.length
        ? granted
        : [{ path: "/dashboard.html", label: "Dashboard" }];
    renderDashboardSidebarMenu(dashboardAllowedMenuEntries);
}

function startDashboardSidebarGuard(){
    if(window.__dashboardSidebarGuardStarted) return;
    window.__dashboardSidebarGuardStarted = true;
    const sync = () => enforceDashboardSidebarAccess();
    if(window.__userAccessPermissionsLoaded){
        sync();
    }else{
        document.addEventListener("app:user-access-ready", sync, { once: true });
    }
}

         
function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    localStorage.removeItem("selectedDatabaseName");
    localStorage.removeItem("mappedCompanyName");
    localStorage.removeItem("mappedCompanyLogoUrl");
    window.location.href = "login.html";
}

function buildMenuAvatarDataUri(label){
    const safeLabel = String(label || "U").trim().slice(0, 2).toUpperCase() || "U";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="92"><rect width="100%" height="100%" rx="46" ry="46" fill="#e8f2ff"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#0d4f90">${safeLabel}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function loadUserMenuAvatar(userId, fallbackLabel){
    const avatarEl = document.getElementById("userMenuAvatar");
    const token = localStorage.getItem("token");
    if(!avatarEl){
        return;
    }
    avatarEl.src = buildMenuAvatarDataUri(fallbackLabel);
    if(!token || !userId){
        return;
    }
    try{
        const apiBase = (window.BASE_URL || `${window.location.origin.replace(/\/+$/, "")}/api`).replace(/\/+$/, "");
        const res = await fetch(`${apiBase}/users/profiles/${encodeURIComponent(String(userId))}/picture?t=${Date.now()}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` }
        });
        if(!res.ok){
            return;
        }
        const blob = await res.blob();
        avatarEl.src = URL.createObjectURL(blob);
    }catch(_err){
    }
}

function initDashboardUserMenu(){
    const menuBtn = document.getElementById("userMenuBtn");
    const menuPanel = document.getElementById("userMenuPanel");
    const logoutBtn = document.getElementById("userMenuLogout");
    const profileLink = document.getElementById("userMenuProfile");
    const preferenceLink = document.getElementById("userMenuPreference");
    const menuName = document.getElementById("userMenuName");
    const menuRole = document.getElementById("userMenuRole");

    if(!menuBtn || !menuPanel){
        return;
    }

    if(menuName){
        menuName.innerText = displayName || "User";
    }
    if(menuRole){
        menuRole.innerText = (storedRole || "User").toUpperCase();
    }

    const currentUserId = String(localStorage.getItem("userId") || "").trim();
    if(profileLink){
        profileLink.href = currentUserId
            ? `users/edit-profile.html?userId=${encodeURIComponent(currentUserId)}&mode=view`
            : "users/profile-list.html";
    }
    if(preferenceLink){
        preferenceLink.href = "users/preference.html";
    }

    loadUserMenuAvatar(currentUserId, (displayName || "U").slice(0, 2));

    const openMenu = () => {
        menuPanel.classList.remove("hidden");
        menuBtn.setAttribute("aria-expanded", "true");
    };
    const closeMenu = () => {
        menuPanel.classList.add("hidden");
        menuBtn.setAttribute("aria-expanded", "false");
    };
    const toggleMenu = () => {
        if(menuPanel.classList.contains("hidden")){
            openMenu();
        }else{
            closeMenu();
        }
    };

    menuBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu();
    });

    menuPanel.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", () => {
        closeMenu();
    });

    document.addEventListener("keydown", (event) => {
        if(event.key === "Escape"){
            closeMenu();
        }
    });

    if(logoutBtn){
        logoutBtn.addEventListener("click", () => {
            logout();
        });
    }
}

let salesChartInstance = null;
let profitChartInstance = null;
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatDateWithWeekday(dateText){
    const fallbackDate = new Date();
    const d = dateText ? new Date(`${dateText}T00:00:00`) : fallbackDate;
    if(Number.isNaN(d.getTime())){
        const safe = fallbackDate.toISOString().slice(0,10);
        const weekday = fallbackDate.toLocaleDateString("en-US", { weekday: "long" });
        return `${safe} ${weekday}`;
    }
    const safe = dateText || d.toISOString().slice(0,10);
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    return `${safe} ${weekday}`;
}

function formatAmountWithSeparators(value){
    return Number(value || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

                     
async function fetchSummary(){
    try{
        const periodEl = document.getElementById("summaryPeriod");
        const dateEl = document.getElementById("summaryDate");
        const period = periodEl ? periodEl.value : "day";
        const date = dateEl ? dateEl.value : "";
        const query = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
        const summary = await request(`/dashboard/summary${query}`,"GET");

        const totalUsersEl = document.getElementById("totalUsers");
        if(totalUsersEl){
            totalUsersEl.querySelector("p").innerText = summary.totalUsers || 0;
        }
        const totalMchineEl = document.getElementById("totalMchine");
        if(totalMchineEl){
            totalMchineEl.querySelector("p").innerText = summary.totalGeneralMachines || 0;
        }
        const rentalMachinesEl = document.getElementById("totalRentalMachines");
        if(rentalMachinesEl){
            rentalMachinesEl.querySelector("p").innerText = summary.totalRentalMachines || 0;
        }
        document.getElementById("totalProducts").querySelector("p").innerText = summary.totalProducts || 0;
        document.getElementById("totalCustomers").querySelector("p").innerText = summary.totalCustomers || 0;
        document.getElementById("totalVendors").querySelector("p").innerText = summary.totalVendors || 0;
                                            
        const salesVal = summary.totalSalesPeriod ?? summary.totalSales ?? 0;
        const receivedPaymentVal = summary.receivedPaymentPeriod ?? summary.receivedPayment ?? 0;
        const rentalMachinesCountsVal = summary.rentalMachinesCountsPricePeriod
            ?? summary.rentalMachinesCountsPrice
            ?? summary.rentalMachinesCountsPriceAllInputs
            ?? summary.rentalMachinesCountsPriceAllTime
            ?? 0;
        const rentalConsumablesVal = summary.rentalConsumablesPricePeriod
            ?? summary.rentalConsumablesPrice
            ?? summary.rentalConsumablesPriceAllInputs
            ?? summary.rentalConsumablesPriceAllTime
            ?? 0;
        const expenseVal = summary.totalExpensesPeriod ?? summary.totalExpenses ?? 0;
        const technicianPaidVal = summary.technicianPaidPeriod ?? summary.technicianPaid ?? 0;
        const vendorPaidVal = summary.vendorPaidPeriod ?? summary.vendorPaid ?? 0;
        const profitVal =
            Number(receivedPaymentVal || 0)
            + Number(rentalMachinesCountsVal || 0)
            - Number(rentalConsumablesVal || 0)
            - Number(expenseVal || 0)
            - Number(technicianPaidVal || 0)
            - Number(vendorPaidVal || 0);
        document.getElementById("totalSales").querySelector("p").innerText = formatAmountWithSeparators(salesVal);
        const receivedPaymentEl = document.getElementById("receivedPayment");
        if(receivedPaymentEl){
            receivedPaymentEl.querySelector("p").innerText = formatAmountWithSeparators(receivedPaymentVal);
        }
        const rentalMachinesCountsEl = document.getElementById("rentalMachinesCountsPrice");
        if(rentalMachinesCountsEl){
            rentalMachinesCountsEl.querySelector("p").innerText = formatAmountWithSeparators(rentalMachinesCountsVal);
        }
        const rentalConsumablesEl = document.getElementById("rentalConsumablesPrice");
        if(rentalConsumablesEl){
            rentalConsumablesEl.querySelector("p").innerText = formatAmountWithSeparators(rentalConsumablesVal);
        }
        document.getElementById("totalExpenses").querySelector("p").innerText = formatAmountWithSeparators(expenseVal);
        const technicianPaidEl = document.getElementById("technicianPaid");
        if(technicianPaidEl){
            technicianPaidEl.querySelector("p").innerText = formatAmountWithSeparators(technicianPaidVal);
        }
        const vendorPaidEl = document.getElementById("vendorPaid");
        if(vendorPaidEl){
            vendorPaidEl.querySelector("p").innerText = formatAmountWithSeparators(vendorPaidVal);
        }
        document.getElementById("netProfit").querySelector("p").innerText = formatAmountWithSeparators(profitVal);
        const labelEl = document.getElementById("summaryRangeLabel");
        if(labelEl){
            const periodName = (summary.period || period || "day").toString().toLowerCase();
            const dateText = date || "";
            if(periodName === "week"){
                labelEl.innerText = dateText ? `Week of ${dateText}` : "This Week";
            }else if(periodName === "month"){
                labelEl.innerText = dateText ? `Month of ${dateText.slice(0,7)}` : "This Month";
            }else if(periodName === "year"){
                labelEl.innerText = dateText ? `Year: ${dateText.slice(0,4)}` : "This Year";
            }else{
                labelEl.innerText = formatDateWithWeekday(dateText);
            }
        }

        const monthlySales = Array.isArray(summary.monthlySales) ? summary.monthlySales : Array(12).fill(0);
        const monthlyProfit = Array.isArray(summary.monthlyProfit) ? summary.monthlyProfit : Array(12).fill(0);
        const labels = Array.isArray(summary.months) && summary.months.length === 12
            ? summary.months
            : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

        const salesCtx = document.getElementById("salesChart").getContext("2d");
        if(salesChartInstance){
            salesChartInstance.destroy();
        }
        salesChartInstance = new Chart(salesCtx,{
            type:"bar",
            data:{
                labels,
                datasets:[{label:"Sales",data:monthlySales,backgroundColor:"#3498db"}]
            }
        });

        const profitCtx = document.getElementById("profitChart").getContext("2d");
        if(profitChartInstance){
            profitChartInstance.destroy();
        }
        profitChartInstance = new Chart(profitCtx,{
            type:"line",
            data:{
                labels,
                datasets:[{label:"Profit",data:monthlyProfit,borderColor:"#2980b9",fill:false}]
            }
        });

    }catch(err){
        console.error(err);
        alert(err.message || "Failed to load dashboard data");
        if ((err.message || "").toLowerCase().includes("login") || (err.message || "").toLowerCase().includes("token")) {
            window.location.href = "login.html";
        }
    }
}

function populateSummaryYearOptions(){
    const yearEl = document.getElementById("summaryYearSelect");
    if(!yearEl) return;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 15;
    const opts = [];
    for(let y = currentYear; y >= startYear; y--){
        opts.push(`<option value="${y}">${y}</option>`);
    }
    yearEl.innerHTML = opts.join("");
}

function populateSummaryMonthOptions(){
    const monthEl = document.getElementById("summaryMonthSelect");
    if(!monthEl) return;
    monthEl.innerHTML = MONTH_NAMES
        .map((name, i) => `<option value="${String(i + 1).padStart(2,"0")}">${name}</option>`)
        .join("");
}

function syncSummaryDateFromSelectors(){
    const periodEl = document.getElementById("summaryPeriod");
    const dateEl = document.getElementById("summaryDate");
    const yearEl = document.getElementById("summaryYearSelect");
    const monthEl = document.getElementById("summaryMonthSelect");
    if(!periodEl || !dateEl) return;

    const period = (periodEl.value || "day").toLowerCase();
    const year = (yearEl && yearEl.value) ? yearEl.value : String(new Date().getFullYear());
    const month = (monthEl && monthEl.value) ? monthEl.value : String(new Date().getMonth() + 1).padStart(2,"0");

    if(period === "year"){
        dateEl.value = `${year}-01-01`;
    }else if(period === "month"){
        dateEl.value = `${year}-${month}-01`;
    }else if(!dateEl.value){
        dateEl.value = new Date().toISOString().slice(0,10);
    }
}

function toggleSummaryExtraSelectors(){
    const periodEl = document.getElementById("summaryPeriod");
    const dateEl = document.getElementById("summaryDate");
    const yearEl = document.getElementById("summaryYearSelect");
    const monthEl = document.getElementById("summaryMonthSelect");
    if(!periodEl || !dateEl || !yearEl || !monthEl) return;

    const period = (periodEl.value || "day").toLowerCase();
    const showYear = period === "year" || period === "month";
    const showMonth = period === "month";

    yearEl.style.display = showYear ? "" : "none";
    monthEl.style.display = showMonth ? "" : "none";
    dateEl.style.display = period === "day" ? "" : "none";
}

             
const summaryDateEl = document.getElementById("summaryDate");
if(summaryDateEl){
    summaryDateEl.value = new Date().toISOString().slice(0,10);
}
const summaryPeriodEl = document.getElementById("summaryPeriod");
const summaryYearEl = document.getElementById("summaryYearSelect");
const summaryMonthEl = document.getElementById("summaryMonthSelect");

populateSummaryYearOptions();
populateSummaryMonthOptions();
if(summaryYearEl && !summaryYearEl.value){
    summaryYearEl.value = String(new Date().getFullYear());
}
if(summaryMonthEl && !summaryMonthEl.value){
    summaryMonthEl.value = String(new Date().getMonth() + 1).padStart(2,"0");
}
toggleSummaryExtraSelectors();
syncSummaryDateFromSelectors();

if(summaryPeriodEl){
    summaryPeriodEl.addEventListener("change", () => {
        toggleSummaryExtraSelectors();
        syncSummaryDateFromSelectors();
        fetchSummary();
    });
}
if(summaryYearEl){
    summaryYearEl.addEventListener("change", () => {
        syncSummaryDateFromSelectors();
        fetchSummary();
    });
}
if(summaryMonthEl){
    summaryMonthEl.addEventListener("change", () => {
        syncSummaryDateFromSelectors();
        fetchSummary();
    });
}
if(summaryDateEl){
    summaryDateEl.addEventListener("change", () => {
        const period = summaryPeriodEl ? (summaryPeriodEl.value || "day").toLowerCase() : "day";
        if(period !== "day") return;
        fetchSummary();
    });
}
fetchSummary();
startDashboardSidebarGuard();
initDashboardUserMenu();

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

function setTopbarHealthIndicator(ok){
    const el = document.getElementById("healthIconBtn");
    if(!el) return;
    el.classList.remove("ok", "fail", "unknown");
    if(ok === true){
        el.classList.add("ok");
        el.title = "System health: OK";
        return;
    }
    if(ok === false){
        el.classList.add("fail");
        el.title = "System health: Not OK";
        return;
    }
    el.classList.add("unknown");
    el.title = "System health: Unknown";
}

async function loadHealthStatus(){
    const hasHealthPanel = !!document.getElementById("healthPanel");
    try{
        const health = await request("/health","GET");
        setTopbarHealthIndicator(!!health.ok);
        if(hasHealthPanel && userRole === "admin"){
            setHealthBadge("healthOverall", !!health.ok);
            setHealthBadge("healthDb", !!health.dbConnected);
            setHealthBadge("healthPgDump", !!health?.checks?.tools?.pg_dump?.available);
            setHealthBadge("healthPsql", !!health?.checks?.tools?.psql?.available);
            setHealthBadge("healthTplInvoice", !!health?.checks?.templateFiles?.invoice?.exists);
            setHealthBadge("healthTplQuotation", !!health?.checks?.templateFiles?.quotation?.exists);
            setHealthBadge("healthTplQuotation2", !!health?.checks?.templateFiles?.quotation2?.exists);
        }

        const updated = document.getElementById("healthUpdatedAt");
        if(updated && hasHealthPanel){
            const now = new Date();
            updated.innerText = `Last updated: ${now.toLocaleString()}`;
        }
    }catch(_err){
        setTopbarHealthIndicator(false);
        if(hasHealthPanel && userRole === "admin"){
            setHealthBadge("healthOverall", false);
            setHealthBadge("healthDb", null);
            setHealthBadge("healthPgDump", null);
            setHealthBadge("healthPsql", null);
            setHealthBadge("healthTplInvoice", null);
            setHealthBadge("healthTplQuotation", null);
            setHealthBadge("healthTplQuotation2", null);
        }
    }
}

const healthRefreshBtn = document.getElementById("healthRefreshBtn");
if(healthRefreshBtn){
    healthRefreshBtn.addEventListener("click", loadHealthStatus);
}
loadHealthStatus();
setInterval(loadHealthStatus, 60000);

async function updateBadges(){
    const userId = localStorage.getItem("userId");
    const messageBadge = document.getElementById("messagesBadgeCount");
    const noticeBadge = document.getElementById("noticeBadgeCount");

    const setBadge = (el, count) => {
        if(!el) return;
        const n = Number(count) || 0;
        if(n > 0){
            el.innerText = n > 99 ? "99+" : String(n);
            el.classList.remove("hidden");
        }else{
            el.innerText = "0";
            el.classList.add("hidden");
        }
    };

    try{
        if(userId && messageBadge){
            const messages = await request(`/messages?to_user_id=${userId}`,"GET");
            const lastSeen = new Date(localStorage.getItem(`messagesLastSeen:${userId}`) || 0);
            const newCount = (Array.isArray(messages) ? messages : [])
                .filter((m) => new Date(m.createdAt) > lastSeen).length;
            setBadge(messageBadge, newCount);
        }
    }catch(_err){
        setBadge(messageBadge, 0);
    }

    try{
        if(noticeBadge){
            const notices = await request("/notifications","GET");
            const lastSeen = new Date(localStorage.getItem(`notificationsLastSeen:${userId}`) || 0);
            const newCount = (Array.isArray(notices) ? notices : [])
                .filter((n) => new Date(n.createdAt) > lastSeen).length;
            setBadge(noticeBadge, newCount);
        }
    }catch(_err){
        setBadge(noticeBadge, 0);
    }
}

updateBadges();

function updateTodoBadgeCount(todos){
    const badge = document.getElementById("todoBadgeCount");
    if(!badge) return;
    const rows = Array.isArray(todos) ? todos : [];
    const undone = rows.filter((t) => !Boolean(t.done)).length;
    if(undone > 0){
        badge.innerText = undone > 99 ? "99+" : String(undone);
        badge.classList.remove("hidden");
    }else{
        badge.innerText = "0";
        badge.classList.add("hidden");
    }
}

async function loadTodos(){
    const listEl = document.getElementById("todoList");
    if(!listEl) return;
    try{
        const todos = await request("/todos","GET");
        renderTodos(todos || []);
        updateTodoBadgeCount(todos || []);
    }catch(err){
        console.error(err);
        listEl.innerHTML = "<li class=\"todo-item\"><span class=\"todo-title\">Failed to load to-do list.</span></li>";
        updateTodoBadgeCount([]);
    }
}

async function loadTodoAssignees(){
    const select = document.getElementById("todoAssign");
    if(!select) return;
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if(role !== "admin" && role !== "manager") return;
    try{
        const users = await request("/users/assignable","GET");
        users.forEach(u=>{
            const opt = document.createElement("option");
            opt.value = u.id;
            opt.textContent = u.username || u.email || `User ${u.id}`;
            select.appendChild(opt);
        });
    }catch(err){
        console.error(err);
    }
}

function renderTodos(todos){
    const listEl = document.getElementById("todoList");
    if(!listEl) return;
    const role = (localStorage.getItem("role") || "").toLowerCase();
    listEl.innerHTML = "";
    todos.forEach(todo=>{
        const li = document.createElement("li");
        li.className = "todo-item";
        const titleClass = todo.done ? "todo-title done" : "todo-title";
        const doneMeta = todo.done && todo.done_by_name
            ? `<span class="todo-meta">Done by: ${todo.done_by_name}</span>`
            : "";
        const canEdit = role === "admin" || role === "manager";
        li.innerHTML = `
            <div class="todo-main">
                <input type="checkbox" ${todo.done ? "checked" : ""} data-id="${todo.id}">
                <div class="todo-text">
                    <span class="${titleClass}">${todo.title}</span>
                    ${doneMeta}
                </div>
            </div>
            <div class="todo-actions">
                ${canEdit ? `<button class="btn btn-secondary" data-action="edit" data-id="${todo.id}">Edit</button>
                <button class="btn btn-danger" data-action="delete" data-id="${todo.id}">Delete</button>` : ""}
            </div>
        `;
        listEl.appendChild(li);
    });

    listEl.querySelectorAll("input[type='checkbox']").forEach(cb=>{
        cb.addEventListener("change", async (e)=>{
            const id = e.target.getAttribute("data-id");
            try{
                await request(`/todos/${id}`,"PUT",{ done: e.target.checked });
                loadTodos();
            }catch(err){
                showMessageBox(err.message || "Failed to update to-do","error");
                e.target.checked = !e.target.checked;
            }
        });
    });

    listEl.querySelectorAll("button[data-action='edit']").forEach(btn=>{
        btn.addEventListener("click", async ()=>{
            const id = btn.getAttribute("data-id");
            const current = btn.closest(".todo-item").querySelector(".todo-title").innerText;
            const next = prompt("Edit to-do", current);
            if(next === null) return;
            const cleaned = String(next).trim();
            if(!cleaned) return;
            try{
                await request(`/todos/${id}`,"PUT",{ title: cleaned });
                loadTodos();
            }catch(err){
                showMessageBox(err.message || "Failed to update to-do","error");
            }
        });
    });

    listEl.querySelectorAll("button[data-action='delete']").forEach(btn=>{
        btn.addEventListener("click", async ()=>{
            const id = btn.getAttribute("data-id");
            if(!confirm("Delete this to-do?")) return;
            try{
                await request(`/todos/${id}`,"DELETE");
                loadTodos();
            }catch(err){
                showMessageBox(err.message || "Failed to delete to-do","error");
            }
        });
    });
}

const todoForm = document.getElementById("todoForm");
if(todoForm){
    const role = (localStorage.getItem("role") || "").toLowerCase();
    todoForm.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const input = document.getElementById("todoInput");
        const assignSelect = document.getElementById("todoAssign");
        const title = (input.value || "").trim();
        if(!title) return;
        try{
            const assigned_to = assignSelect && assignSelect.value ? Number(assignSelect.value) : null;
            await request("/todos","POST",{ title, assigned_to });
            input.value = "";
            loadTodos();
        }catch(err){
            showMessageBox(err.message || "Failed to add to-do","error");
        }
    });
}

loadTodoAssignees();
loadTodos();




