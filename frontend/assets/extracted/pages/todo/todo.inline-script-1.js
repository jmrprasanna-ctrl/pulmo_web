const TODO_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TODO_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let todoState = {
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: new Date(),
    rows: []
};

function getRole(){
    return String(localStorage.getItem("role") || "").toLowerCase();
}

function canManageTodos(){
    const role = getRole();
    return role === "admin" || role === "manager";
}

function toDateKey(dateObj){
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function toReadableDate(dateObj){
    return dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

function asDate(value){
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function getTodoCreatedKey(todo){
    const d = asDate(todo?.createdAt);
    if(!d) return "";
    return toDateKey(d);
}

function getRowsForDateKey(dateKey){
    return (Array.isArray(todoState.rows) ? todoState.rows : []).filter((row) => getTodoCreatedKey(row) === dateKey);
}

function paintWeekdays(){
    const wrap = document.getElementById("todoCalendarWeekdays");
    if(!wrap) return;
    wrap.innerHTML = TODO_WEEKDAYS.map((label) => `<span>${label}</span>`).join("");
}

function buildMonthGrid(baseMonth){
    const firstDay = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(start.getDate() - offset);
    const cells = [];
    for(let i = 0; i < 42; i += 1){
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        cells.push(d);
    }
    return cells;
}

function renderCalendar(){
    const monthTitleEl = document.getElementById("todoMonthTitle");
    const gridEl = document.getElementById("todoCalendarGrid");
    if(!monthTitleEl || !gridEl) return;

    monthTitleEl.textContent = `${TODO_MONTH_NAMES[todoState.month.getMonth()]} ${todoState.month.getFullYear()}`;
    const selectedKey = toDateKey(todoState.selectedDate);
    const currentMonth = todoState.month.getMonth();
    const currentYear = todoState.month.getFullYear();

    const cells = buildMonthGrid(todoState.month);
    gridEl.innerHTML = "";

    cells.forEach((day) => {
        const key = toDateKey(day);
        const count = getRowsForDateKey(key).length;
        const isSelected = key === selectedKey;
        const isOutside = day.getMonth() !== currentMonth || day.getFullYear() !== currentYear;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `calendar-day${isSelected ? " is-selected" : ""}${isOutside ? " is-outside" : ""}`;
        button.setAttribute("data-date", key);
        button.innerHTML = `
            <span>${day.getDate()}</span>
            ${count > 0 ? `<span class="calendar-day-badge">${count > 99 ? "99+" : count}</span>` : `<span class="calendar-day-badge" style="visibility:hidden;">0</span>`}
        `;
        button.addEventListener("click", () => {
            todoState.selectedDate = day;
            renderCalendar();
            renderSelectedDay();
        });
        gridEl.appendChild(button);
    });
}

function iconEdit(){
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m12.5 6.5 4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
}

function iconDelete(){
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.5 7V5.5h5V7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7.5 7.5l.8 11a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9l.8-11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 10.5v6M14 10.5v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
}

function renderSelectedDay(){
    const labelEl = document.getElementById("todoSelectedDayLabel");
    const summaryEl = document.getElementById("todoDaySummary");
    const listEl = document.getElementById("todoDayList");
    if(!labelEl || !summaryEl || !listEl) return;

    const selectedKey = toDateKey(todoState.selectedDate);
    const rows = getRowsForDateKey(selectedKey);
    labelEl.textContent = toReadableDate(todoState.selectedDate);
    summaryEl.textContent = `${rows.length} item${rows.length === 1 ? "" : "s"}`;

    if(!rows.length){
        listEl.innerHTML = `<li class="todo-empty">No to-do items on this day.</li>`;
        return;
    }

    const canManage = canManageTodos();
    listEl.innerHTML = "";
    rows.forEach((row) => {
        const doneClass = row.done ? "todo-item-title done" : "todo-item-title";
        const doneMeta = row.done && row.done_by_name ? `<span class="todo-item-meta">Done by: ${row.done_by_name}</span>` : "";
        const created = asDate(row.createdAt);
        const timeText = created ? created.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
        const li = document.createElement("li");
        li.className = "todo-item-row";
        li.innerHTML = `
            <div class="todo-item-main">
                <input type="checkbox" data-id="${Number(row.id)}" ${row.done ? "checked" : ""}>
                <div>
                    <span class="${doneClass}">${String(row.title || "")}</span>
                    <span class="todo-item-meta">${timeText}</span>
                    ${doneMeta}
                </div>
            </div>
            <div class="todo-item-actions">
                ${canManage ? `<button class="icon-btn" type="button" data-action="edit" data-id="${Number(row.id)}" aria-label="Edit to-do" title="Edit to-do">${iconEdit()}</button>` : ""}
                ${canManage ? `<button class="icon-btn btn-danger" type="button" data-action="delete" data-id="${Number(row.id)}" aria-label="Delete to-do" title="Delete to-do">${iconDelete()}</button>` : ""}
            </div>
        `;
        listEl.appendChild(li);
    });

    listEl.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
        checkbox.addEventListener("change", async (event) => {
            const id = Number(event.target.getAttribute("data-id") || 0);
            if(!id) return;
            try{
                await request(`/todos/${id}`, "PUT", { done: Boolean(event.target.checked) });
                await loadTodos();
            }catch(err){
                showMessageBox(err.message || "Failed to update to-do", "error");
                event.target.checked = !event.target.checked;
            }
        });
    });

    if(canManage){
        listEl.querySelectorAll("button[data-action='edit']").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = Number(btn.getAttribute("data-id") || 0);
                if(!id) return;
                const current = rows.find((x) => Number(x.id) === id);
                const next = prompt("Edit to-do", String(current?.title || ""));
                if(next === null) return;
                const title = String(next || "").trim();
                if(!title){
                    showMessageBox("To-do title is required", "warning");
                    return;
                }
                try{
                    await request(`/todos/${id}`, "PUT", { title });
                    await loadTodos();
                }catch(err){
                    showMessageBox(err.message || "Failed to update to-do", "error");
                }
            });
        });

        listEl.querySelectorAll("button[data-action='delete']").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = Number(btn.getAttribute("data-id") || 0);
                if(!id) return;
                if(!confirm("Delete this to-do?")) return;
                try{
                    await request(`/todos/${id}`, "DELETE");
                    await loadTodos();
                }catch(err){
                    showMessageBox(err.message || "Failed to delete to-do", "error");
                }
            });
        });
    }
}

async function loadTodos(){
    try{
        const rows = await request("/todos", "GET");
        todoState.rows = Array.isArray(rows) ? rows : [];
    }catch(err){
        todoState.rows = [];
        showMessageBox(err.message || "Failed to load to-do list", "error");
    }
    renderCalendar();
    renderSelectedDay();
}

async function loadAssignableUsers(){
    const select = document.getElementById("todoAssignSelect");
    const controls = document.getElementById("todoControlsWrap");
    if(!select || !controls) return;
    if(!canManageTodos()){
        controls.style.display = "none";
        return;
    }
    try{
        const users = await request("/users/assignable", "GET");
        (Array.isArray(users) ? users : []).forEach((user) => {
            const opt = document.createElement("option");
            opt.value = String(user.id);
            opt.textContent = String(user.username || user.email || `User ${user.id}`);
            select.appendChild(opt);
        });
    }catch(_err){
    }
}

function bindCalendarButtons(){
    const prevBtn = document.getElementById("todoPrevMonthBtn");
    const nextBtn = document.getElementById("todoNextMonthBtn");
    if(prevBtn){
        prevBtn.addEventListener("click", () => {
            todoState.month = new Date(todoState.month.getFullYear(), todoState.month.getMonth() - 1, 1);
            renderCalendar();
        });
    }
    if(nextBtn){
        nextBtn.addEventListener("click", () => {
            todoState.month = new Date(todoState.month.getFullYear(), todoState.month.getMonth() + 1, 1);
            renderCalendar();
        });
    }
}

function bindAddButton(){
    const addBtn = document.getElementById("todoAddBtn");
    if(!addBtn) return;
    if(!canManageTodos()){
        addBtn.style.display = "none";
        return;
    }
    addBtn.addEventListener("click", async () => {
        const titleRaw = prompt("Add to-do");
        if(titleRaw === null) return;
        const title = String(titleRaw || "").trim();
        if(!title){
            showMessageBox("To-do title is required", "warning");
            return;
        }
        const assignSelect = document.getElementById("todoAssignSelect");
        const assigned_to = assignSelect && assignSelect.value ? Number(assignSelect.value) : null;
        try{
            await request("/todos", "POST", { title, assigned_to });
            await loadTodos();
        }catch(err){
            showMessageBox(err.message || "Failed to create to-do", "error");
        }
    });
}

window.addEventListener("DOMContentLoaded", async () => {
    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }
    paintWeekdays();
    bindCalendarButtons();
    bindAddButton();
    await loadAssignableUsers();
    await loadTodos();
});
