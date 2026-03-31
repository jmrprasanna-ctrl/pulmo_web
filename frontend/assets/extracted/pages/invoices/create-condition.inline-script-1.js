let conditions = [];

async function loadConditions(){
    try{
        conditions = await request("/invoices/conditions","GET");
        const tbody = document.querySelector("#conditionsTable tbody");
        tbody.innerHTML = "";
        conditions.forEach((c,index)=>{
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${index+1}</td>
                <td>${c.condition}</td>
                <td>
                    <button onclick="editCondition(${c.id})">Edit</button>
                    <button onclick="deleteCondition(${c.id})">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }catch(err){
        alert("Failed to load conditions");
    }
}

document.getElementById("conditionForm").addEventListener("submit", async function(e){
    e.preventDefault();
    const conditionText = document.getElementById("conditionInput").value.trim();
    if(!conditionText) return alert("Enter a condition");

    try{
        await request("/invoices/conditions","POST",{condition: conditionText});
        showMessageBox("Condition saved successfully");
        document.getElementById("conditionInput").value = "";
        loadConditions();
    }catch(err){
        alert(err.message || "Failed to save condition");
    }
});

async function editCondition(id){
    const newCondition = prompt("Edit condition:");
    if(!newCondition) return;
    try{
        await request(`/invoices/conditions/${id}`,"PUT",{condition:newCondition});
        showMessageBox("Condition updated");
        loadConditions();
    }catch(err){
        alert("Failed to update condition");
    }
}

async function deleteCondition(id){
    if(!confirm("Are you sure you want to delete this condition?")) return;
    try{
        await request(`/invoices/conditions/${id}`,"DELETE");
        showMessageBox("Condition deleted");
        loadConditions();
    }catch(err){
        alert("Failed to delete condition");
    }
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadConditions();
