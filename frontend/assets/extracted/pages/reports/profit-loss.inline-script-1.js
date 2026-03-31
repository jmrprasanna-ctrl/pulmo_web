async function loadProfitLoss(){
    try{
        const data = await request("/reports/profit-loss","GET");
        const tbody = document.querySelector("#profitLossTable tbody");
        tbody.innerHTML = "";
        data.forEach(d=>{
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${d.month}</td>
                <td>${d.total_sales}</td>
                <td>${d.total_expense}</td>
                <td>${d.net_profit}</td>
            `;
            tbody.appendChild(tr);
        });
    }catch(err){
        alert("Failed to load profit-loss data");
    }
}

function exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("Profit-Loss Report",14,20);
    let y = 30;
    const rows = document.querySelectorAll("#profitLossTable tbody tr");
    rows.forEach(r=>{
        const cells = Array.from(r.children).map(td=>td.innerText);
        doc.text(cells.join(" | "),14,y);
        y+=8;
    });
    doc.save("Profit_Loss_Report.pdf");
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadProfitLoss();
