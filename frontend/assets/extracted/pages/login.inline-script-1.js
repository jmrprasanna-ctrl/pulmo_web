const axisLoadingOverlay = document.getElementById("axisLoadingOverlay");
const axisLoadingTitle = document.getElementById("axisLoadingTitle");
const companyCodeInput = document.getElementById("companyCode");
const companyCodeStatus = document.getElementById("companyCodeStatus");
const companyLogoWrap = document.getElementById("companyLogoWrap");
const companyLogo = document.getElementById("companyLogo");
const loginCompanyName = document.getElementById("loginCompanyName");
let verifiedCompany = null;
let verifiedCompanyCode = "";
let companyCodeTimer = null;

function getLoginInputElement(){
    return document.getElementById("email")
        || document.getElementById("User")
        || document.getElementById("user");
}

function clearCredentialFields(){
    const userEl = getLoginInputElement();
    const passEl = document.getElementById("password");
    [userEl, passEl].forEach((el) => {
        if(!el) return;
        if(String(el.value || "").length === 0) return;
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

function normalizeCompanyCode(value){
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]+/g, "")
        .slice(0, 40);
}

function resolveAssetUrl(value){
    const raw = String(value || "").trim();
    if(!raw) return "";
    if(/^https?:\/\//i.test(raw)) return raw;
    const apiOrigin = String(window.BASE_URL || "").replace(/\/api\/?$/i, "").replace(/\/+$/, "");
    const origin = apiOrigin || window.location.origin.replace(/\/+$/, "");
    return raw.startsWith("/") ? `${origin}${raw}` : `${origin}/${raw}`;
}

function setCompanyCodeStatus(message, type){
    if(!companyCodeStatus) return;
    companyCodeStatus.textContent = String(message || "");
    companyCodeStatus.classList.toggle("is-ok", type === "ok");
    companyCodeStatus.classList.toggle("is-error", type === "error");
}

function resetCompanyPreview(){
    verifiedCompany = null;
    verifiedCompanyCode = "";
    if(companyLogo){
        companyLogo.removeAttribute("src");
    }
    if(companyLogoWrap){
        companyLogoWrap.classList.add("is-hidden");
        companyLogoWrap.setAttribute("aria-hidden", "true");
    }
    if(loginCompanyName){
        loginCompanyName.textContent = "AXIS CMS SYSTEM";
    }
}

function showCompanyPreview(company){
    const name = String(company?.company_name || "AXIS CMS SYSTEM").trim() || "AXIS CMS SYSTEM";
    const logoUrl = resolveAssetUrl(company?.logo_url);
    if(loginCompanyName){
        loginCompanyName.textContent = name;
    }
    if(companyLogo && companyLogoWrap && logoUrl){
        companyLogo.src = logoUrl;
        companyLogo.alt = `${name} Logo`;
        companyLogoWrap.classList.remove("is-hidden");
        companyLogoWrap.setAttribute("aria-hidden", "false");
    }else if(companyLogoWrap){
        companyLogoWrap.classList.add("is-hidden");
        companyLogoWrap.setAttribute("aria-hidden", "true");
    }
}

async function verifyCompanyCode(){
    const code = normalizeCompanyCode(companyCodeInput ? companyCodeInput.value : "");
    if(companyCodeInput && companyCodeInput.value !== code){
        companyCodeInput.value = code;
    }
    if(!code){
        resetCompanyPreview();
        setCompanyCodeStatus("", "");
        return null;
    }
    if(verifiedCompany && verifiedCompanyCode === code){
        return verifiedCompany;
    }

    setCompanyCodeStatus("Checking company code...", "");
    const company = await request(`/auth/company-code/${encodeURIComponent(code)}`, "GET");
    const currentCode = normalizeCompanyCode(companyCodeInput ? companyCodeInput.value : "");
    if(currentCode !== code){
        return null;
    }
    verifiedCompany = company || null;
    verifiedCompanyCode = code;
    showCompanyPreview(company);
    setCompanyCodeStatus(company?.company_name ? `Company verified: ${company.company_name}` : "Company verified.", "ok");
    return company;
}

function scheduleCompanyCodeVerification(){
    window.clearTimeout(companyCodeTimer);
    resetCompanyPreview();
    const code = normalizeCompanyCode(companyCodeInput ? companyCodeInput.value : "");
    if(!code){
        setCompanyCodeStatus("", "");
        return;
    }
    if(companyCodeInput && companyCodeInput.value !== code){
        companyCodeInput.value = code;
    }
    setCompanyCodeStatus("Checking company code...", "");
    companyCodeTimer = window.setTimeout(() => {
        verifyCompanyCode().catch((err) => {
            resetCompanyPreview();
            setCompanyCodeStatus(err.message || "Invalid company code.", "error");
        });
    }, 420);
}

function setLoadingOverlay(visible, message){
    if(!axisLoadingOverlay) return;
    if(axisLoadingTitle && message){
        axisLoadingTitle.textContent = String(message);
    }
    axisLoadingOverlay.classList.toggle("is-active", !!visible);
    axisLoadingOverlay.setAttribute("aria-hidden", visible ? "false" : "true");
}

async function login(){
    const loginInput = getLoginInputElement();
    const companyCode = normalizeCompanyCode(companyCodeInput ? companyCodeInput.value : "");
    const email = loginInput ? String(loginInput.value || "").trim() : "";
    const password = String((document.getElementById("password") || {}).value || "");
    const loginBtn = document.getElementById("loginBtn");

    if(!companyCode || !email || !password){ alert("Please fill all fields"); return; }

    try{
        if(loginBtn) loginBtn.disabled = true;
        const company = await verifyCompanyCode();
        if(!company){
            throw new Error("Please verify company code.");
        }
        const res = await request("/auth/login","POST",{company_code: companyCode, email, password});
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
        setLoadingOverlay(false);
        if(loginBtn) loginBtn.disabled = false;
        alert(err.message || "Login failed");
    }
}

function goToForgotPasswordPage(){
    const emailInput = getLoginInputElement();
    const email = String(emailInput && emailInput.value ? emailInput.value : "").trim();
    const query = new URLSearchParams();
    if(email){
        query.set("email", email);
    }
    const suffix = query.toString();
    window.location.href = suffix ? `forgot-password.html?${suffix}` : "forgot-password.html";
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

const loginBtn = document.getElementById("loginBtn");
if(loginBtn){
    loginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        login();
    });
}
const loginForm = document.getElementById("loginForm");
if(loginForm){
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        login();
    });
}
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
if(forgotPasswordLink){
    forgotPasswordLink.addEventListener("click", (e) => {
        e.preventDefault();
        goToForgotPasswordPage();
    });
}
const passwordToggle = document.getElementById("passwordToggle");
if(passwordToggle){
    passwordToggle.addEventListener("click", togglePassword);
}
if(companyCodeInput){
    companyCodeInput.addEventListener("input", scheduleCompanyCodeVerification);
    companyCodeInput.addEventListener("blur", () => {
        verifyCompanyCode().catch((err) => {
            resetCompanyPreview();
            setCompanyCodeStatus(err.message || "Invalid company code.", "error");
        });
    });
}
if(companyLogo){
    companyLogo.addEventListener("error", () => {
        if(companyLogoWrap){
            companyLogoWrap.classList.add("is-hidden");
            companyLogoWrap.setAttribute("aria-hidden", "true");
        }
    });
}
["companyCode", "email", "User", "user", "password"].forEach((id) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("keydown", (e) => {
        if(e.key === "Enter"){
            e.preventDefault();
            login();
        }
    });
});

window.addEventListener("DOMContentLoaded", () => {
    setLoadingOverlay(true, "Starting AXIS CMS SYSTEM...");
    const loginForm = document.getElementById("loginForm");
    const userEl = getLoginInputElement();
    const passEl = document.getElementById("password");
    if(loginForm){
        loginForm.setAttribute("autocomplete", "off");
    }
    if(userEl){
        userEl.setAttribute("autocomplete", "off");
    }
    if(passEl){
        passEl.setAttribute("autocomplete", "off");
    }
    if(companyCodeInput){
        companyCodeInput.setAttribute("autocomplete", "off");
        companyCodeInput.value = "";
    }
    resetCompanyPreview();
    clearCredentialFields();
    window.setTimeout(clearCredentialFields, 120);
    window.setTimeout(clearCredentialFields, 320);
    window.setTimeout(() => setLoadingOverlay(false), 950);
});
