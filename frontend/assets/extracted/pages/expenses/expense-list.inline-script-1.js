const filterDateEl = document.getElementById("filterDate");
const filterPeriodEl = document.getElementById("filterPeriod");
const expenseSearchEl = document.getElementById("expenseSearch");
filterDateEl.value = new Date().toISOString().slice(0,10);
const role = (localStorage.getItem("role") || "").toLowerCase();
const selectedDb = (localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const allowedPaths = (() => {
    try{
        const rows = JSON.parse(localStorage.getItem("userAllowedPathsRuntime") || "[]");
        return new Set((Array.isArray(rows) ? rows : []).map((x) => String(x || "").trim().toLowerCase()));
    }catch(_err){
        return new Set();
    }
})();
const canManage = role === "admin" || role === "manager" || isTrainingUser;
const canAccessPath = (path) => (canManage)
    ? true
    : (role === "user" && allowedPaths.has(String(path || "").trim().toLowerCase()));
const canAddExpense = canAccessPath("/expenses/add-expense.html");
const canEditExpense = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/expenses/expense-list.html", "edit"));
const canDeleteExpense = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/expenses/expense-list.html", "delete"));
const isReadOnlyUser = !canEditExpense && !canDeleteExpense;
let allExpenses = [];

const addExpenseBtn = document.getElementById("addExpenseBtn");
if(addExpenseBtn && !canAddExpense){
    addExpenseBtn.style.display = "none";
}

if(isReadOnlyUser){
    const actionHeader = document.querySelector("#expenseTable thead th:last-child");
    if(actionHeader && actionHeader.innerText.toLowerCase().includes("action")){
        actionHeader.remove();
    }
}

function toDateOnly(value){
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0,10);
}

function expenseDateValue(exp){
    return exp.date || exp.createdAt || exp.updatedAt || "";
}

function getWeekRange(dateStr){
    const d = new Date(dateStr);
    const day = d.getDay();         
    const diffToMonday = (day + 6) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return [start, end];
}

function inRange(dateStr, start, end){
    const d = new Date(dateStr);
    return d >= start && d <= end;
}

function filterExpensesByPeriod(expenses){
    const selectedDate = filterDateEl.value;
    const period = filterPeriodEl.value;
    if(!selectedDate) return expenses;
    if(period === "date"){
        return expenses.filter(exp => toDateOnly(expenseDateValue(exp)) === selectedDate);
    }
    if(period === "week"){
        const [start, end] = getWeekRange(selectedDate);
        return expenses.filter(exp => inRange(expenseDateValue(exp), start, end));
    }
    if(period === "month"){
        const [y, m] = selectedDate.split("-");
        return expenses.filter(exp => {
            const d = new Date(expenseDateValue(exp));
            return d.getFullYear() === Number(y) && (d.getMonth() + 1) === Number(m);
        });
    }
    if(period === "year"){
        const [y] = selectedDate.split("-");
        return expenses.filter(exp => {
            const d = new Date(expenseDateValue(exp));
            return d.getFullYear() === Number(y);
        });
    }
    return expenses;
}

async function loadExpenses(){
    try{
        allExpenses = await request("/expenses","GET");
        applyExpenseFilters();
    }catch(err){
        alert("Failed to load expenses");
    }
}

function renderExpenses(expenses){
    const tbody = document.querySelector("#expenseTable tbody");
    tbody.innerHTML = "";
    if(!expenses.length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="${isReadOnlyUser ? 5 : 6}">No data found.</td>`;
        tbody.appendChild(tr);
        return;
    }
    expenses.forEach(exp=>{
        const tr = document.createElement("tr");
        const dateText = expenseDateValue(exp) ? new Date(expenseDateValue(exp)).toLocaleDateString() : "";
        tr.innerHTML = `
            <td>${exp.title}</td>
            <td>${exp.customer || ""}</td>
            <td>${Number(exp.amount || 0).toFixed(2)}</td>
            <td>${dateText}</td>
            <td>${exp.category}</td>
        `;
        if(!isReadOnlyUser){
            tr.innerHTML += `
                <td>
                    ${canEditExpense ? `<a class="btn" href="edit-expense.html?id=${exp.id}">Edit</a>` : ""}
                    ${canDeleteExpense ? `<button class="btn btn-danger btn-inline" type="button" onclick="deleteExpense(${exp.id})">Delete</button>` : ""}
                </td>
            `;
        }
        tbody.appendChild(tr);
    });
}

function updateSummary(expenses){
    const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    document.getElementById("filteredTotal").innerText = Number(total).toFixed(2);
    document.getElementById("filteredCount").innerText = String(expenses.length);
    const dateText = filterDateEl.value || "";
    const period = filterPeriodEl.value;
    const label = period === "date" ? "Date" : period === "week" ? "Week" : period === "month" ? "Month" : "Annual";
    document.getElementById("filterInfo").innerText = `${label} ${dateText}`.trim();
}

function applyExpenseFilters(){
    const query = (expenseSearchEl?.value || "").trim().toLowerCase();
    let filtered = filterExpensesByPeriod(allExpenses);
    if(query){
        filtered = filtered.filter(exp =>
            [exp.title, exp.customer, exp.category, expenseDateValue(exp)].some(v => String(v || "").toLowerCase().includes(query))
        );
    }
    renderExpenses(filtered);
    updateSummary(filtered);
}

function exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("Expenses List",14,20);
    const period = filterPeriodEl.value;
    const selectedDate = filterDateEl.value;
    doc.setFontSize(9);
    doc.text(`Filter: ${period} ${selectedDate || ""}`.trim(),14,26);
    let y = 34;
    const rows = document.querySelectorAll("#expenseTable tbody tr");
    rows.forEach(r=>{
        const cells = Array.from(r.children).slice(0, 5).map(td=>td.innerText);
        doc.text(cells.join(" | "),14,y);
        y+=8;
    });
    doc.save("Expenses_List.pdf");
}

async function deleteExpense(id){
    if(!confirm("Delete this expense?")) return;
    try{
        await request(`/expenses/${id}`,"DELETE");
        showMessageBox("Expense deleted");
        loadExpenses();
    }catch(err){
        alert(err.message || "Failed to delete expense");
    }
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

filterDateEl.addEventListener("change", applyExpenseFilters);
filterPeriodEl.addEventListener("change", applyExpenseFilters);
if(expenseSearchEl){
    expenseSearchEl.addEventListener("input", applyExpenseFilters);
}

loadExpenses();
