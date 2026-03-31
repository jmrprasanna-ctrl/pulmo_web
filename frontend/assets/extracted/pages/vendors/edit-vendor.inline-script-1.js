const params = new URLSearchParams(window.location.search);
const vendorId = params.get("id");

if(!vendorId){
    alert("Missing vendor id.");
    window.location.href = "list-vendor.html";
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

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadVendor();
