const vendorNameInput = document.getElementById("name");
vendorNameInput.style.textTransform = "uppercase";
vendorNameInput.addEventListener("input", () => {
    const pos = vendorNameInput.selectionStart;
    vendorNameInput.value = vendorNameInput.value.toUpperCase();
    vendorNameInput.setSelectionRange(pos, pos);
});

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
        await request("/vendors","POST",data);
        showMessageBox("Vendor added successfully!");
        document.getElementById("vendorForm").reset();
    }catch(err){
        alert(err.message || "Failed to add vendor");
    }
});

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}
