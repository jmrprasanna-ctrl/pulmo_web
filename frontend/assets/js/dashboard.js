// Display user role + logged user
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

// Logout
function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "login.html";
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

// Fetch summary data
async function fetchSummary(){
    try{
        const periodEl = document.getElementById("summaryPeriod");
        const dateEl = document.getElementById("summaryDate");
        const period = periodEl ? periodEl.value : "day";
        const date = dateEl ? dateEl.value : "";
        const query = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
        const summary = await request(`/dashboard/summary${query}`,"GET");

        document.getElementById("totalUsers").querySelector("p").innerText = summary.totalUsers || 0;
        const rentalMachinesEl = document.getElementById("totalRentalMachines");
        if(rentalMachinesEl){
            rentalMachinesEl.querySelector("p").innerText = summary.totalRentalMachines || 0;
        }
        document.getElementById("totalProducts").querySelector("p").innerText = summary.totalProducts || 0;
        document.getElementById("totalCustomers").querySelector("p").innerText = summary.totalCustomers || 0;
        document.getElementById("totalVendors").querySelector("p").innerText = summary.totalVendors || 0;
        const salesVal = summary.totalSalesPeriod ?? summary.totalSales ?? 0;
        const receivedPaymentVal = summary.receivedPaymentPeriod ?? summary.receivedPayment ?? 0;
        const expenseVal = summary.totalExpensesPeriod ?? summary.totalExpenses ?? 0;
        const technicianPaidVal = summary.technicianPaidPeriod ?? summary.technicianPaid ?? 0;
        const vendorPaidVal = summary.vendorPaidPeriod ?? summary.vendorPaid ?? 0;
        const profitVal = summary.netProfitPeriod ?? summary.netProfit ?? (Number(receivedPaymentVal) - Number(expenseVal) - Number(technicianPaidVal) - Number(vendorPaidVal));
        document.getElementById("totalSales").querySelector("p").innerText = Number(salesVal || 0).toFixed(2);
        const receivedPaymentEl = document.getElementById("receivedPayment");
        if(receivedPaymentEl){
            receivedPaymentEl.querySelector("p").innerText = Number(receivedPaymentVal || 0).toFixed(2);
        }
        document.getElementById("totalExpenses").querySelector("p").innerText = Number(expenseVal || 0).toFixed(2);
        const technicianPaidEl = document.getElementById("technicianPaid");
        if(technicianPaidEl){
            technicianPaidEl.querySelector("p").innerText = Number(technicianPaidVal || 0).toFixed(2);
        }
        const vendorPaidEl = document.getElementById("vendorPaid");
        if(vendorPaidEl){
            vendorPaidEl.querySelector("p").innerText = Number(vendorPaidVal || 0).toFixed(2);
        }
        document.getElementById("netProfit").querySelector("p").innerText = Number(profitVal || 0).toFixed(2);
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

// Initialize
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
