function setForgotPasswordStatus(message, type){
    const statusEl = document.getElementById("forgotPasswordStatus");
    if(!statusEl) return;
    statusEl.classList.remove("error", "success");
    if(type === "error"){
        statusEl.classList.add("error");
    }
    if(type === "success"){
        statusEl.classList.add("success");
    }
    statusEl.textContent = String(message || "");
}

function getPrefilledEmail(){
    try{
        const params = new URLSearchParams(window.location.search || "");
        return String(params.get("email") || "").trim();
    }catch(_err){
        return "";
    }
}

async function submitForgotPassword(){
    const emailEl = document.getElementById("resetEmail");
    const resetBtn = document.getElementById("resetBtn");
    const email = String(emailEl && emailEl.value ? emailEl.value : "").trim();
    if(!email){
        setForgotPasswordStatus("Please enter your email address.", "error");
        if(emailEl) emailEl.focus();
        return;
    }

    try{
        if(resetBtn) resetBtn.disabled = true;
        setForgotPasswordStatus("Sending password email...", "");
        const response = await request("/auth/forgot-password", "POST", { email });
        const message = String(response?.message || "Email matched. Your password has been sent to your email.");
        setForgotPasswordStatus(message, "success");
        alert(message);
    }catch(err){
        const message = String(err?.message || "Failed to send password email.");
        setForgotPasswordStatus(message, "error");
        alert(message);
    }finally{
        if(resetBtn) resetBtn.disabled = false;
    }
}

const forgotPasswordForm = document.getElementById("forgotPasswordForm");
if(forgotPasswordForm){
    forgotPasswordForm.addEventListener("submit", (event) => {
        event.preventDefault();
        submitForgotPassword();
    });
}

const emailEl = document.getElementById("resetEmail");
if(emailEl){
    const prefilled = getPrefilledEmail();
    if(prefilled){
        emailEl.value = prefilled;
    }
    emailEl.addEventListener("keydown", (event) => {
        if(event.key === "Enter"){
            event.preventDefault();
            submitForgotPassword();
        }
    });
}
