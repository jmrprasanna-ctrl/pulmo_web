let salesChartRef = null;

function todayDateText(){
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

async function renderSalesChart(){
    try{
        const period = (document.getElementById("salesPeriod")?.value || "month").toLowerCase();
        const date = document.getElementById("salesDate")?.value || todayDateText();
        const query = `period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
        const payload = await request(`/analytics/sales?${query}`,"GET");
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        const labels = rows.map((d) => d.label || "");
        const values = rows.map((d) => Number(d.total_sales || 0));

        const meta = document.getElementById("salesChartMeta");
        if(meta){
            const start = payload?.start_date || "";
            const end = payload?.end_date || "";
            const periodName = period.charAt(0).toUpperCase() + period.slice(1);
            meta.textContent = start && end ? `${periodName} Range: ${start} to ${end}` : "";
        }

        const ctx = document.getElementById("salesChart").getContext("2d");
        if(salesChartRef){
            salesChartRef.destroy();
        }
        salesChartRef = new Chart(ctx,{
            type:"bar",
            data:{
                labels,
                datasets:[{
                    label:"Sales Amount",
                    data:values,
                    backgroundColor:"rgba(54, 162, 235, 0.7)"
                }]
            },
            options:{
                responsive:true,
                scales:{
                    y:{ beginAtZero:true }
                },
                plugins:{
                    legend:{display:true}
                }
            }
        });
    }catch(err){
        alert("Failed to render sales chart");
    }
}

document.getElementById("salesSearchBtn")?.addEventListener("click", renderSalesChart);
document.getElementById("salesPeriod")?.addEventListener("change", renderSalesChart);
document.getElementById("salesDate")?.addEventListener("change", renderSalesChart);

const salesDateInput = document.getElementById("salesDate");
if(salesDateInput && !salesDateInput.value){
    salesDateInput.value = todayDateText();
}
renderSalesChart();

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}
