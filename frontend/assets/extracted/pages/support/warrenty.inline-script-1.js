function getRole(){
    return (localStorage.getItem("role") || "").toLowerCase();
}

function canViewWarrentyPage(){
    const role = getRole();
    const hasPermission = () => {
        if(typeof hasUserGrantedPath === "function"){
            if(
                hasUserGrantedPath("/support/warrenty.html")
                || hasUserGrantedPath("/support/warranty.html")
            ){
                return true;
            }
        }
        if(typeof hasUserActionPermission === "function"){
            return hasUserActionPermission("/support/warrenty.html", "view")
                || hasUserActionPermission("/support/warranty.html", "view");
        }
        return false;
    };

    if(role === "admin" || role === "manager"){
        if(typeof hasAccessConfigRestrictions === "function" && hasAccessConfigRestrictions()){
            return hasPermission();
        }
        return true;
    }
    return hasPermission();
}

function fmtDate(value){
    if(!value) return "";
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-GB");
}

function fmtMoney(value){
    const n = Number(value || 0);
    return n.toFixed(2);
}

function openInvoiceRenderViewOnly(invoiceId){
    const id = Number(invoiceId || 0);
    if(!id) return;
    window.location.href = `../invoices/view-invoice.html?id=${encodeURIComponent(id)}&viewOnly=1`;
}

async function loadWarrentyInvoices(){
    try{
        const rows = await request("/invoices/warranty-invoices","GET");
        const list = Array.isArray(rows) ? rows : [];

        const tbody = document.getElementById("warrentyInvoiceBody");
        tbody.innerHTML = "";

        list.forEach((inv) => {
            const tr = document.createElement("tr");
            const invoiceId = Number(inv.id || inv.invoice_id || 0);
            tr.innerHTML = `
                <td>${inv.warranty_period || ""}</td>
                <td>${fmtDate(inv.invoice_date)}</td>
                <td>${fmtDate(inv.warranty_expiry_date)}</td>
                <td>${inv.invoice_no || ""}</td>
                <td>${inv.customer_name || ""}</td>
                <td>${fmtMoney(inv.total)}</td>
                <td>${inv.payment_status || ""}</td>
            `;
            if(invoiceId){
                tr.style.cursor = "pointer";
                tr.title = "View invoice render";
                tr.addEventListener("click", () => openInvoiceRenderViewOnly(invoiceId));
            }
            tbody.appendChild(tr);
        });

        if(!list.length){
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="7" style="text-align:center;">No active warranty invoices found.</td>`;
            tbody.appendChild(tr);
        }
    }catch(err){
        alert(err.message || "Failed to load invoices.");
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }
    if(!canViewWarrentyPage()){
        alert("You don't have access to Warrenty.");
        window.location.href = "../dashboard.html";
        return;
    }
    loadWarrentyInvoices();
});
