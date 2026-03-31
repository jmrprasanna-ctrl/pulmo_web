const params = new URLSearchParams(window.location.search);
const customerId = params.get("id");
const uppercaseFields = ["name", "address", "quotation2Address"];

uppercaseFields.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if(!field) return;
    field.addEventListener("input", () => {
        field.value = field.value.toUpperCase();
    });
});

if(!customerId){
    alert("Missing customer id.");
    window.location.href = "customer-list.html";
}

async function loadCustomer(){
    try{
        const customer = await request(`/customers/${customerId}`,"GET");
        document.getElementById("name").value = (customer.name || "").toUpperCase();
        document.getElementById("address").value = (customer.address || "").toUpperCase();
        document.getElementById("quotation2Address").value = (customer.quotation2_address || "").toUpperCase();
        document.getElementById("tel").value = customer.tel || "";
        document.getElementById("contactPerson").value = customer.contact_person || "";
        document.getElementById("email").value = customer.email || "";
        document.getElementById("customerType").value = customer.customer_type || "Silver";
        document.getElementById("customerMode").value = customer.customer_mode || "General";
        document.getElementById("vatNumber").value = customer.vat_number || "";
    }catch(err){
        alert(err.message || "Failed to load customer");
        window.location.href = "customer-list.html";
    }
}

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
        await request(`/customers/${customerId}`,"PUT",data);
        showMessageBox("Customer updated successfully!");
    }catch(err){
        alert(err.message || "Failed to update customer");
    }
});

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadCustomer();
