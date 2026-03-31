const now = new Date();
const tzOffset = now.getTimezoneOffset() * 60000;
const localISOTime = new Date(now - tzOffset).toISOString().slice(0,16);
document.getElementById("date").value = localISOTime;
const customerSelect = document.getElementById("customer");

async function loadGeneralCustomers(){
    try{
        const customers = await request("/customers","GET");
        const generalCustomers = (Array.isArray(customers) ? customers : [])
            .filter(c => String(c.customer_mode || "").toLowerCase() === "general")
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        customerSelect.innerHTML = `<option value="">Select Customer</option>`;
        generalCustomers.forEach((customer) => {
            const option = document.createElement("option");
            option.value = customer.name || "";
            option.textContent = customer.name || "";
            customerSelect.appendChild(option);
        });
    }catch(err){
        customerSelect.innerHTML = `<option value="">Failed to load customers</option>`;
    }
}

document.getElementById("expenseForm").addEventListener("submit", async function(e){
    e.preventDefault();
    const data = {
        title: document.getElementById("title").value.trim(),
        customer: customerSelect.value.trim(),
        amount: parseFloat(document.getElementById("amount").value),
        date: document.getElementById("date").value,
        category: document.getElementById("category").value.trim()
    };

    try{
        await request("/expenses","POST",data);
        showMessageBox("Expense added successfully!");
        document.getElementById("expenseForm").reset();
    }catch(err){
        alert(err.message || "Failed to add expense");
    }
});

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadGeneralCustomers();
