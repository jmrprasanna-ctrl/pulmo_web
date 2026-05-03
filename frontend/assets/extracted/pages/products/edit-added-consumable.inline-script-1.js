if(!localStorage.getItem("token")){
    window.location.href = "../login.html";
}

const entryId = String(new URLSearchParams(window.location.search).get("entry") || "").trim();
if(!entryId){
    alert("Entry id is missing.");
    window.location.href = "add-rental-consumable.html";
}

function money(value){
    return Number(value || 0).toFixed(2);
}

async function loadEntry(){
    try{
        const rows = await request("/rental-machine-consumables", "GET");
        const allRows = Array.isArray(rows) ? rows : [];
        let matched = [];
        if(entryId.startsWith("ROW-")){
            const rowId = Number(entryId.slice(4));
            matched = allRows.filter((r) => Number(r.id) === rowId);
        }else{
            matched = allRows.filter((r) => String(r.save_batch_id || "") === entryId);
        }

        if(!matched.length){
            alert("Entry not found.");
            window.location.href = "add-rental-consumable.html";
            return;
        }

        const first = matched[0];
        const machineId = first.RentalMachine ? (first.RentalMachine.machine_id || "") : "";
        const customer = first.Customer ? (first.Customer.name || "") : "";

        document.getElementById("entryValue").innerText = entryId;
        document.getElementById("machineValue").innerText = machineId || "-";
        document.getElementById("customerValue").innerText = customer || "-";

        const tbody = document.querySelector("#entryItemsTable tbody");
        tbody.innerHTML = "";
        matched.forEach((r) => {
            const unitPrice = Number(r.Product ? (r.Product.dealer_price || 0) : 0);
            const qty = Number(r.quantity || 0);
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.consumable_name || ""}</td>
                <td>${qty}</td>
                <td>${money(unitPrice * qty)}</td>
                <td>${Number(r.count || 0) || "-"}</td>
            `;
            tbody.appendChild(tr);
        });
    }catch(err){
        alert(err.message || "Failed to load entry.");
        window.location.href = "add-rental-consumable.html";
    }
}

loadEntry();
