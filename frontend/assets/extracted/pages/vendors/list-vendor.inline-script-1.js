if(!localStorage.getItem("token")){
    window.location.href = "../login.html";
}

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
const canAddVendor = canAccessPath("/vendors/add-vendor.html");
const canEditVendor = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/vendors/list-vendor.html", "edit"));
const canDeleteVendor = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/vendors/list-vendor.html", "delete"));
const vendorSearchEl = document.getElementById("vendorSearch");
let allVendors = [];

const addVendorBtn = document.getElementById("addVendorBtn");
if(addVendorBtn && !canAddVendor){
    addVendorBtn.style.display = "none";
}

if(!canEditVendor && !canDeleteVendor){
    const actionHeader = document.querySelector("#vendorTable thead th:last-child");
    if(actionHeader && actionHeader.innerText.toLowerCase().includes("action")){
        actionHeader.remove();
    }
}

function renderVendors(vendors){
    const tbody = document.querySelector("#vendorTable tbody");
    tbody.innerHTML = "";
    vendors.forEach(v=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${v.name}</td>
            <td>${v.address}</td>
            <td>${v.category || ""}</td>
        `;
        if(canEditVendor || canDeleteVendor){
            tr.innerHTML += `
                <td>
                    <div class="vendor-action-row">
                        ${canEditVendor ? `<a class="btn vendor-action-btn" href="edit-vendor.html?id=${v.id}">Edit</a>` : ""}
                        ${canDeleteVendor ? `<button class="btn btn-danger btn-inline vendor-action-btn" type="button" onclick="deleteVendor(${v.id})">Delete</button>` : ""}
                    </div>
                </td>
            `;
        }
        tbody.appendChild(tr);
    });
}

function applyVendorFilter(){
    const query = (vendorSearchEl?.value || "").trim().toLowerCase();
    if(!query){
        renderVendors(allVendors);
        return;
    }
    const filtered = allVendors.filter(v =>
        [v.name, v.category].some(val => String(val || "").toLowerCase().includes(query))
    );
    renderVendors(filtered);
}

async function loadVendors(){
    try{
        allVendors = await request("/vendors","GET");
        applyVendorFilter();
    }catch(err){
        alert(err.message || "Failed to load vendors");
        if((err.message || "").toLowerCase().includes("login") || (err.message || "").toLowerCase().includes("token")){
            window.location.href = "../login.html";
        }
    }
}

if(vendorSearchEl){
    vendorSearchEl.addEventListener("input", applyVendorFilter);
}

function exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("Vendors List",14,20);
    let y = 30;
    const rows = document.querySelectorAll("#vendorTable tbody tr");
    rows.forEach(r=>{
        const cells = Array.from(r.children).slice(0, 3).map(td=>td.innerText);
        doc.text(cells.join(" | "),14,y);
        y+=8;
    });
    doc.save("Vendors_List.pdf");
}

async function deleteVendor(id){
    if(!confirm("Delete this vendor?")) return;
    try{
        await request(`/vendors/${id}`,"DELETE");
        showMessageBox("Vendor deleted");
        loadVendors();
    }catch(err){
        const msg = err.message || "Failed to delete vendor";
        if(msg.toLowerCase().includes("products are linked")){
            try{
                const products = await request(`/vendors/${id}/products`,"GET");
                if(products.length){
                    const lines = products.slice(0, 10).map(p => `${p.product_id} - ${p.description || p.model || ""}`.trim());
                    alert(`Cannot delete vendor. Linked products:\n${lines.join("\n")}`);
                }else{
                    alert(msg);
                }
            }catch(_err){
                alert(msg);
            }
        }else{
            alert(msg);
        }
    }
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadVendors();
