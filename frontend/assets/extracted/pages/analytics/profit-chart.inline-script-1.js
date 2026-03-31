async function renderProfitChart(){
    try{
        const data = await request("/analytics/profit","GET");
        const ctx = document.getElementById("profitChart").getContext("2d");
        new Chart(ctx,{
            type:"line",
            data:{
                labels:data.map(d=>d.month),
                datasets:[{
                    label:"Net Profit",
                    data:data.map(d=>d.net_profit),
                    backgroundColor:"rgba(75, 192, 192, 0.5)",
                    borderColor:"rgba(75, 192, 192, 1)",
                    fill:true,
                    tension:0.3
                }]
            },
            options:{responsive:true}
        });
    }catch(err){
        alert("Failed to render profit chart");
    }
}
renderProfitChart();

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}
