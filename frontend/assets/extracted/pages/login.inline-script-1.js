async function login(){
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if(!email || !password){ alert("Please fill all fields"); return; }

    try{
        const res = await request("/auth/login","POST",{email,password});
        localStorage.setItem("token",res.token);
        localStorage.setItem("role",res.user.role);
        if (res.user && res.user.database_name) {
            localStorage.setItem("selectedDatabaseName", String(res.user.database_name).trim().toLowerCase());
        } else {
            localStorage.removeItem("selectedDatabaseName");
        }
        localStorage.setItem("userId", res.user.id);
        localStorage.setItem("userEmail", res.user.email || email);
        if (res.user.username) {
            localStorage.setItem("userName", res.user.username);
        } else {
            localStorage.removeItem("userName");
        }
        if (res.user && res.user.mapped_company_name) {
            localStorage.setItem("mappedCompanyName", String(res.user.mapped_company_name).trim());
        } else {
            localStorage.removeItem("mappedCompanyName");
        }
        if (res.user && res.user.mapped_company_code) {
            localStorage.setItem("mappedCompanyCode", String(res.user.mapped_company_code).trim().toUpperCase());
        } else {
            localStorage.removeItem("mappedCompanyCode");
        }
        if (res.user && res.user.mapped_company_email) {
            localStorage.setItem("mappedCompanyEmail", String(res.user.mapped_company_email).trim().toLowerCase());
        } else {
            localStorage.removeItem("mappedCompanyEmail");
        }
        if (res.user && res.user.mapped_company_logo_url) {
            localStorage.setItem("mappedCompanyLogoUrl", String(res.user.mapped_company_logo_url).trim());
        } else {
            localStorage.removeItem("mappedCompanyLogoUrl");
        }
        window.location.href = "dashboard.html";
    }catch(err){
        alert(err.message || "Login failed");
    }
}

async function forgotPassword(){
    const email = prompt("Enter your email to reset password");
    if(!email) return;
    try{
        await request("/auth/forgot-password","POST",{email});
        alert("Password reset email sent. Check your inbox.");
    }catch(err){
        alert(err.message || "Failed to send email");
    }
}

function togglePassword(){
    const input = document.getElementById("password");
    const toggleBtn = document.getElementById("passwordToggle");
    const eyeIcon = document.getElementById("eyeIcon");
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    toggleBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    toggleBtn.setAttribute("aria-pressed", isHidden ? "true" : "false");
    eyeIcon.innerHTML = isHidden
        ? '<path d="M3 3L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 12C3.9 8 7.4 5.5 12 5.5C13.8 5.5 15.4 5.9 16.8 6.7M20.2 9.4C20.9 10.2 21.5 11 22 12C20.1 16 16.6 18.5 12 18.5C8.2 18.5 5.2 16.8 3.2 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"/>'
        : '<path d="M2 12C3.9 8 7.4 5.5 12 5.5C16.6 5.5 20.1 8 22 12C20.1 16 16.6 18.5 12 18.5C7.4 18.5 3.9 16 2 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"/>';
}
