async function loadExpensesReport(){
    try{
        const expenses = await request("/reports/expenses","GET");
        const tbody = document.querySelector("#expenseReportTable tbody");
        tbody.innerHTML = "";
        expenses.forEach(e=>{
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${e.title}</td>
                <td>${e.amount}</td>
                <td>${e.date}</td>
                <td>${e.category}</td>
            `;
            tbody.appendChild(tr);
        });
    }catch(err){
        alert("Failed to load expense report");
    }
}

function exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(10);
    doc.text("Expense Report",14,20);
    let y = 30;
    const rows = document.querySelectorAll("#expenseReportTable tbody tr");
    rows.forEach(r=>{
        const cells = Array.from(r.children).map(td=>td.innerText);
        doc.text(cells.join(" | "),14,y);
        y+=8;
    });
    doc.save("Expense_Report.pdf");
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadExpensesReport();
