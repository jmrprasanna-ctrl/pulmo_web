const role = (localStorage.getItem("role") || "").toLowerCase();
        if(role !== "admin"){
            alert("Only admin can access logged history.");
            window.location.href = "../dashboard.html";
        }

        const periodEl = document.getElementById("periodSelect");
        const dateEl = document.getElementById("dateInput");
        const userEl = document.getElementById("userSelect");

        async function loadUsers(){
            try{
                const users = await request("/users", "GET");
                userEl.innerHTML = `<option value="">All Users</option>`;
                (Array.isArray(users) ? users : []).forEach((u) => {
                    const opt = document.createElement("option");
                    opt.value = String(u.id);
                    opt.textContent = `${u.username} (${u.role})`;
                    userEl.appendChild(opt);
                });
            }catch(err){
                alert(err.message || "Failed to load users");
            }
        }

        async function loadLogs(){
            const period = periodEl.value || "week";
            const date = dateEl.value || "";
            const userId = userEl.value || "";
            const query = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}&user_id=${encodeURIComponent(userId)}`;
            try{
                const data = await request(`/users/logs${query}`, "GET");
                const rows = Array.isArray(data.rows) ? data.rows : [];
                const tbody = document.getElementById("loggedBody");
                tbody.innerHTML = "";
                if(!rows.length){
                    const tr = document.createElement("tr");
                    tr.innerHTML = `<td colspan="5">No login logs found.</td>`;
                    tbody.appendChild(tr);
                    return;
                }
                rows.forEach((r) => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td>${r.username || ""}</td>
                        <td>${r.role || ""}</td>
                        <td>${r.login_time ? new Date(r.login_time).toLocaleString() : ""}</td>
                        <td>${r.ip_address || ""}</td>
                        <td>${r.city || ""}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }catch(err){
                alert(err.message || "Failed to load login logs");
            }
        }

        async function clearLogs(){
            const ok = confirm("Are you sure you want to clear all logged time records?");
            if(!ok) return;
            try{
                await request("/users/logs", "DELETE");
                showMessageBox("Logged time records cleared.");
                await loadLogs();
            }catch(err){
                alert(err.message || "Failed to clear login logs");
            }
        }

        function savePDF(){
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ format: "a4" });
            doc.setFontSize(10);
            doc.text("User Logged Times", 14, 20);
            doc.text(`Period: ${periodEl.value || ""}`, 14, 26);
            doc.text(`Date: ${dateEl.value || ""}`, 80, 26);
            const userText = userEl.options[userEl.selectedIndex] ? userEl.options[userEl.selectedIndex].text : "All Users";
            doc.text(`User: ${userText}`, 130, 26);
            let y = 34;
            const rows = document.querySelectorAll("#loggedTable tbody tr");
            rows.forEach((r) => {
                const cells = Array.from(r.children).slice(0, 5).map((td) => td.innerText);
                doc.text(cells.join(" | "), 14, y);
                y += 8;
                if(y > 285){
                    doc.addPage();
                    y = 20;
                }
            });
            doc.save("User_Logged_Times.pdf");
        }

        dateEl.value = new Date().toISOString().slice(0, 10);
        periodEl.addEventListener("change", loadLogs);
        dateEl.addEventListener("change", loadLogs);
        userEl.addEventListener("change", loadLogs);

        (async function init(){
            await loadUsers();
            await loadLogs();
        })();
