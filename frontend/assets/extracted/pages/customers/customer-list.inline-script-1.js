const role = (localStorage.getItem("role") || "").toLowerCase();
const selectedDb = (localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const canManage = role === "admin" || role === "manager" || isTrainingUser;
const allowedPaths = (() => {
    try{
        const rows = JSON.parse(localStorage.getItem("userAllowedPathsRuntime") || "[]");
        return new Set((Array.isArray(rows) ? rows : []).map((x) => String(x || "").trim().toLowerCase()));
    }catch(_err){
        return new Set();
    }
})();
const canAccessPath = (path) => canManage
    ? true
    : (role === "user" && allowedPaths.has(String(path || "").trim().toLowerCase()));
const canAddCustomer = canAccessPath("/customers/add-customer.html");
const canEditCustomer = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/customers/customer-list.html", "edit"));
const canDeleteCustomer = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/customers/customer-list.html", "delete"));
const customerSearchEl = document.getElementById("customerSearch");
const customerModeFilterEl = document.getElementById("customerModeFilter");
let allCustomers = [];

const addCustomerBtn = document.getElementById("addCustomerBtn");
if(addCustomerBtn && !canAddCustomer){
    addCustomerBtn.style.display = "none";
}

if(!canEditCustomer && !canDeleteCustomer){
    const actionHeader = document.querySelector("#customerTable thead th:last-child");
    if(actionHeader && actionHeader.innerText.toLowerCase().includes("action")){
        actionHeader.remove();
    }
}

function renderCustomers(customers){
    const tbody = document.querySelector("#customerTable tbody");
    tbody.innerHTML = "";
    customers.forEach(c=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.customer_id || ""}</td>
            <td>${c.name}</td>
            <td>${c.address}</td>
            <td>${c.tel}</td>
            <td>${c.email}</td>
            <td>${String(c.vat_number || "").trim() ? "Yes" : "No"}</td>
        `;
        if(canEditCustomer || canDeleteCustomer){
            tr.innerHTML += `
                <td>
                    <div class="customer-action-row">
                        ${canEditCustomer ? `<a class="btn customer-action-btn" href="edit-customer.html?id=${c.id}">Edit</a>` : ""}
                        ${canDeleteCustomer ? `<button class="btn btn-danger btn-inline customer-action-btn" type="button" onclick="deleteCustomer(${c.id})">Delete</button>` : ""}
                    </div>
                </td>
            `;
        }
        tbody.appendChild(tr);
    });
}

function applyCustomerFilter(){
    const query = (customerSearchEl?.value || "").trim().toLowerCase();
    const mode = (customerModeFilterEl?.value || "").trim().toLowerCase();
    if(!query && !mode){
        renderCustomers(allCustomers);
        return;
    }
    const filtered = allCustomers.filter(c => {
        const modeMatch = !mode || String(c.customer_mode || "").toLowerCase() === mode;
        if(!modeMatch) return false;
        return [c.customer_id, c.name, c.tel, c.email].some(v => String(v || "").toLowerCase().includes(query));
    });
    renderCustomers(filtered);
}

async function loadCustomers(){
    try{
        allCustomers = await request("/customers","GET");
        applyCustomerFilter();
    }catch(err){
        alert("Failed to load customers");
    }
}

if(customerSearchEl){
    customerSearchEl.addEventListener("input", applyCustomerFilter);
}
if(customerModeFilterEl){
    customerModeFilterEl.addEventListener("change", applyCustomerFilter);
}

function exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("Customers List",14,20);
    let y = 30;
    const rows = document.querySelectorAll("#customerTable tbody tr");
    rows.forEach(r=>{
        const cells = Array.from(r.children).slice(0, 5).map(td=>td.innerText);
        doc.text(cells.join(" | "),14,y);
        y+=8;
    });
    doc.save("Customers_List.pdf");
}

async function deleteCustomer(id){
    if(!confirm("Delete this customer?")) return;
    try{
        await request(`/customers/${id}`,"DELETE");
        showMessageBox("Customer deleted");
        loadCustomers();
    }catch(err){
        alert(err.message || "Failed to delete customer");
    }
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadCustomers();
