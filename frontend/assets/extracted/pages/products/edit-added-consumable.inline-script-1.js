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
        const machineTitle = first.RentalMachine
            ? (first.RentalMachine.machine_title || first.RentalMachine.machine_name || first.RentalMachine.title || "")
            : "";
        const customer = first.Customer ? (first.Customer.name || "") : "";

        document.getElementById("entryValue").innerText = entryId;
        document.getElementById("machineValue").innerText = machineId || "-";
        document.getElementById("machineTitleValue").innerText = machineTitle || "-";
        document.getElementById("customerValue").innerText = customer || "-";

        const tbody = document.querySelector("#entryItemsTable tbody");
        tbody.innerHTML = "";
        matched.forEach((r) => {
            const qty = Number(r.quantity || 0);
            const hasExplicitTotal = r.total_price !== undefined && r.total_price !== null;
            const explicitTotal = Number(r.total_price);
            const hasExplicitUnit = r.unit_price !== undefined && r.unit_price !== null;
            const explicitUnit = Number(r.unit_price);
            const productUnit = Number(r.Product ? (r.Product.dealer_price || 0) : 0);
            const lineTotal = hasExplicitTotal
                ? explicitTotal
                : (hasExplicitUnit ? explicitUnit * qty : productUnit * qty);
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.consumable_name || ""}</td>
                <td>${qty}</td>
                <td>${money(lineTotal)}</td>
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
