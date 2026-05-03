const params = new URLSearchParams(window.location.search);
const vendorId = params.get("id");
const role = (localStorage.getItem("role") || "").toLowerCase();
const selectedDb = (localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const canManage = role === "admin" || role === "manager" || isTrainingUser;
const canDeleteVendor = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/vendors/list-vendor.html", "delete"));
const deleteVendorBtn = document.getElementById("deleteVendorBtn");

if(!vendorId){
    alert("Missing vendor id.");
    window.location.href = "list-vendor.html";
}

if(deleteVendorBtn && !canDeleteVendor){
    deleteVendorBtn.style.display = "none";
}

function setCheckedCategory(categoryText){
    const selectedValues = String(categoryText || "")
        .split(",")
        .map(c => c.trim())
        .filter(Boolean);
    const selected = new Set(selectedValues);
    const checks = document.querySelectorAll("#category input[type='checkbox']");
    checks.forEach(ch => {
        ch.checked = selected.has(ch.value);
    });
}

async function loadVendor(){
    try{
        const vendor = await request(`/vendors/${vendorId}`,"GET");
        document.getElementById("name").value = vendor.name || "";
        document.getElementById("address").value = vendor.address || "";
        setCheckedCategory(vendor.category || "");
    }catch(err){
        alert(err.message || "Failed to load vendor");
        window.location.href = "list-vendor.html";
    }
}

document.getElementById("vendorForm").addEventListener("submit", async function(e){
    e.preventDefault();
    const selected = Array.from(document.querySelectorAll("#category input[type='checkbox']:checked"))
        .map((el) => el.value);
    if(!selected.length){
        alert("Please select at least one product category.");
        return;
    }
    const data = {
        name: document.getElementById("name").value.trim(),
        address: document.getElementById("address").value.trim(),
        category: selected
    };

    try{
        await request(`/vendors/${vendorId}`,"PUT",data);
        showMessageBox("Vendor updated successfully!");
    }catch(err){
        alert(err.message || "Failed to update vendor");
    }
});

if(deleteVendorBtn){
    deleteVendorBtn.addEventListener("click", async function(){
        if(!canDeleteVendor){
            alert("You don't have permission to delete vendors.");
            return;
        }
        if(!confirm("Delete this vendor?")) return;
        try{
            await request(`/vendors/${vendorId}`,"DELETE");
            showMessageBox("Vendor deleted");
            window.location.href = "list-vendor.html";
        }catch(err){
            const msg = err.message || "Failed to delete vendor";
            if(msg.toLowerCase().includes("products are linked")){
                try{
                    const products = await request(`/vendors/${vendorId}/products`,"GET");
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
    });
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadVendor();
