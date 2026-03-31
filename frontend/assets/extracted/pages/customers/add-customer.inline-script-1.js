const uppercaseFields = ["name", "address", "quotation2Address"];

uppercaseFields.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if(!field) return;
    field.addEventListener("input", () => {
        field.value = field.value.toUpperCase();
    });
});

document.getElementById("customerForm").addEventListener("submit", async function(e){
    e.preventDefault();
    const data = {
        name: document.getElementById("name").value.trim().toUpperCase(),
        address: document.getElementById("address").value.trim().toUpperCase(),
        quotation2_address: document.getElementById("quotation2Address").value.trim().toUpperCase(),
        tel: document.getElementById("tel").value.trim(),
        contact_person: document.getElementById("contactPerson").value.trim(),
        email: document.getElementById("email").value.trim(),
        customer_type: document.getElementById("customerType").value,
        customer_mode: document.getElementById("customerMode").value,
        vat_number: document.getElementById("vatNumber").value.trim()
    };

    try{
        await request("/customers","POST",data);
        showMessageBox("Customer added successfully!");
        document.getElementById("customerForm").reset();
    }catch(err){
        alert(err.message || "Failed to add customer");
    }
});

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}
