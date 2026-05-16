function getRole(){
    return (localStorage.getItem("role") || "").toLowerCase();
}

function canManageEmailSetup(){
    const role = getRole();
    if(role === "admin" || role === "manager") return true;
    if(role === "user"){
        if(typeof window.hasUserGrantedPath === "function"){
            return window.hasUserGrantedPath("/support/email-setup.html");
        }
        return true;
    }
    return false;
}

function setForm(setup){
    const mappedName = String(setup.mapped_company_name || "").trim();
    const mappedEmail = String(setup.mapped_company_email || "").trim();
    const hintEl = document.getElementById("mappedDefaultsHint");
    if(hintEl){
        if(mappedName || mappedEmail){
            hintEl.textContent = `Mapped Company: ${mappedName || "-"} | Mapped Email: ${mappedEmail || "-"}`;
        }else{
            hintEl.textContent = "Mapped Company: -";
        }
    }
    document.getElementById("smtp_host").value = setup.smtp_host || "";
    document.getElementById("smtp_port").value = setup.smtp_port || 587;
    document.getElementById("smtp_user").value = setup.smtp_user || "";
    document.getElementById("smtp_pass").value = "";
    const hasPass = !!setup.has_smtp_pass;
    document.getElementById("smtpPassState").textContent = `Saved Password: ${hasPass ? "Yes" : "No"}`;
    document.getElementById("smtp_secure").checked = !!setup.smtp_secure;
    document.getElementById("from_name").value = setup.from_name || "PULMO TECHNOLOGIES";
    document.getElementById("from_email").value = setup.from_email || "";
    document.getElementById("subject_template").value = setup.subject_template || "Invoice {{invoice_no}} - PULMO TECHNOLOGIES";
    document.getElementById("body_template").value = setup.body_template || "Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\nPULMO TECHNOLOGIES";
}

async function loadSetup(){
    try{
        const setup = await request("/email-setup", "GET");
        setForm(setup || {});
    }catch(err){
        alert(err.message || "Failed to load email setup");
    }
}

window.addEventListener("DOMContentLoaded", () => {
    if(!canManageEmailSetup()){
        alert("Access denied.");
        window.location.href = "support.html";
        return;
    }

    const form = document.getElementById("emailSetupForm");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            smtp_host: document.getElementById("smtp_host").value.trim(),
            smtp_port: Number(document.getElementById("smtp_port").value || 587),
            smtp_user: document.getElementById("smtp_user").value.trim(),
            smtp_pass: document.getElementById("smtp_pass").value.trim(),
            smtp_secure: !!document.getElementById("smtp_secure").checked,
            from_name: document.getElementById("from_name").value.trim(),
            from_email: document.getElementById("from_email").value.trim(),
            subject_template: document.getElementById("subject_template").value.trim(),
            body_template: document.getElementById("body_template").value
        };

        if(!payload.smtp_host || !payload.smtp_user){
            alert("SMTP Host and SMTP User are required.");
            return;
        }
        const hasSavedPassword = /yes$/i.test(String(document.getElementById("smtpPassState").textContent || "").trim());
        if(!payload.smtp_pass && !hasSavedPassword){
            alert("Please enter SMTP Password (no saved password found).");
            return;
        }
        if(!payload.smtp_pass && hasSavedPassword){
            const proceed = confirm("SMTP Password is empty. App will keep the existing saved password. Continue?");
            if(!proceed) return;
        }

        try{
            const res = await request("/email-setup", "POST", payload);
            showMessageBox("Email setup saved");
            document.getElementById("smtp_pass").value = "";
            if(res && res.setup){
                setForm(res.setup);
            }
        }catch(err){
            alert(err.message || "Failed to save email setup");
        }
    });

    loadSetup();
});
