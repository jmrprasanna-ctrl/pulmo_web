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
const canAddProduct = canAccessPath("/products/add-product.html");
const canEditProduct = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/products/product-list.html", "edit"));
const productSearchEl = document.getElementById("productSearch");
let allProducts = [];

const addProductBtn = document.getElementById("addProductBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
if(addProductBtn && !canAddProduct){
    addProductBtn.style.display = "none";
}
if(exportPdfBtn){
    exportPdfBtn.addEventListener("click", exportPDF);
}

function renderProducts(products){
    const tbody = document.querySelector("#productTable tbody");
    tbody.innerHTML = "";
    products.forEach(p=>{
        const tr = document.createElement("tr");
        const vendorName = p.Vendor ? p.Vendor.name : (p.vendor_name || "");
        const categoryName = p.Category ? p.Category.name : (p.category || "");
        tr.innerHTML = `
            <td>${p.product_id}</td>
            <td>${p.description}</td>
            <td>${categoryName}</td>
            <td>${p.model}</td>
            <td>${p.selling_price}</td>
            <td>${vendorName}</td>
        `;

        if(canEditProduct){
            tr.classList.add("product-row-clickable");
            tr.addEventListener("click", (event) => {
                const target = event.target;
                if(target && target.closest("a, button, input, select, textarea, .product-action-row")) return;
                window.location.href = `edit-product.html?id=${p.id}`;
            });
        }
        tbody.appendChild(tr);
    });
}

function applyProductFilter(){
    const query = (productSearchEl?.value || "").trim().toLowerCase();
    if(!query){
        renderProducts(allProducts);
        return;
    }

    const filtered = allProducts.filter(p => {
        const categoryName = p.Category ? p.Category.name : (p.category || "");
        return [p.product_id, p.description, categoryName, p.model, p.serial_no]
            .some(v => String(v || "").toLowerCase().includes(query));
    });
    renderProducts(filtered);
}

async function loadProducts(){
    try{
        allProducts = await request("/products","GET");
        applyProductFilter();
    }catch(err){
        alert(err.message || "Failed to load products");
        if((err.message || "").toLowerCase().includes("login")){
            window.location.href = "../login.html";
        }
    }
}

if(productSearchEl){
    productSearchEl.addEventListener("input", applyProductFilter);
}

                      
function exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("Products List",14,20);
    let y = 30;
    const rows = document.querySelectorAll("#productTable tbody tr");
    rows.forEach(r=>{
        const cells = Array.from(r.children).slice(0, 6).map(td=>td.innerText);
        doc.text(cells.join(" | "),14,y);
        y+=8;
    });
    doc.save("Products_List.pdf");
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadProducts();
