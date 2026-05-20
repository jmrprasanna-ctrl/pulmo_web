const axisLoadingOverlay = document.getElementById("axisLoadingOverlay");
const axisLoadingTitle = document.getElementById("axisLoadingTitle");
const SAVED_LOGIN_USERS_KEY = "savedLoginUsers";
const MAX_SAVED_LOGIN_USERS = 20;
let hasLoginInputInteraction = false;

function getLoginInputElement(){
    return document.getElementById("email")
        || document.getElementById("User")
        || document.getElementById("user");
}

function getPasswordInputElement(){
    return document.getElementById("password");
}

function normalizeUserIdentity(value){
    return String(value || "").trim();
}

function readSavedLoginUsers(){
    try{
        const raw = localStorage.getItem(SAVED_LOGIN_USERS_KEY);
        if(!raw) return [];
        const parsed = JSON.parse(raw);
        if(!Array.isArray(parsed)) return [];
        const out = [];
        const seen = new Set();
        parsed.forEach((item) => {
            const text = normalizeUserIdentity(item);
            if(!text) return;
            const key = text.toLowerCase();
            if(seen.has(key)) return;
            seen.add(key);
            out.push(text);
        });
        return out.slice(0, MAX_SAVED_LOGIN_USERS);
    }catch(_err){
        return [];
    }
}

function writeSavedLoginUsers(users){
    const safeUsers = Array.isArray(users) ? users.map((x) => normalizeUserIdentity(x)).filter(Boolean) : [];
    localStorage.setItem(SAVED_LOGIN_USERS_KEY, JSON.stringify(safeUsers.slice(0, MAX_SAVED_LOGIN_USERS)));
}

function recordSavedLoginUser(userIdentity){
    const incoming = normalizeUserIdentity(userIdentity);
    if(!incoming) return;
    const current = readSavedLoginUsers();
    const next = [incoming, ...current.filter((name) => String(name || "").toLowerCase() !== incoming.toLowerCase())];
    writeSavedLoginUsers(next);
}

function populateSavedUsersSelect(){
    const select = document.getElementById("savedUsersSelect");
    if(!select) return;
    const users = readSavedLoginUsers();
    select.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = users.length ? "Select saved user" : "No saved users";
    select.appendChild(defaultOpt);
    users.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    select.value = "";
}

function clearLoginFields(){
    const loginInput = getLoginInputElement();
    const passwordInput = getPasswordInputElement();
    if(loginInput){
        loginInput.value = "";
    }
    if(passwordInput){
        passwordInput.value = "";
    }
    const savedSelect = document.getElementById("savedUsersSelect");
    if(savedSelect){
        savedSelect.value = "";
    }
}

function setupSavedUserSelector(){
    const select = document.getElementById("savedUsersSelect");
    if(!select) return;
    populateSavedUsersSelect();
    select.addEventListener("change", () => {
        const chosen = normalizeUserIdentity(select.value);
        if(!chosen) return;
        const loginInput = getLoginInputElement();
        const passwordInput = getPasswordInputElement();
        hasLoginInputInteraction = true;
        if(loginInput){
            loginInput.value = chosen;
            loginInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if(passwordInput){
            passwordInput.value = "";
            passwordInput.focus();
        }
    });
}

function setupLoginInputClearOnOpen(){
    const loginInput = getLoginInputElement();
    const passwordInput = getPasswordInputElement();
    const markInteracted = () => {
        hasLoginInputInteraction = true;
    };

    [loginInput, passwordInput].forEach((el) => {
        if(!el) return;
        el.setAttribute("autocomplete", el === passwordInput ? "new-password" : "off");
        ["focus", "input", "keydown", "change"].forEach((evt) => {
            el.addEventListener(evt, markInteracted);
        });
    });

    const clearIfUntouched = () => {
        if(hasLoginInputInteraction) return;
        clearLoginFields();
    };

    clearIfUntouched();
    window.setTimeout(clearIfUntouched, 80);
    window.setTimeout(clearIfUntouched, 320);
    window.setTimeout(clearIfUntouched, 900);
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
    const email = loginInput ? String(loginInput.value || "").trim() : "";
    const password = String((document.getElementById("password") || {}).value || "");
    const loginBtn = document.getElementById("loginBtn");

    if(!email || !password){ alert("Please fill all fields"); return; }

    try{
        if(loginBtn) loginBtn.disabled = true;
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
        recordSavedLoginUser(res.user.username || res.user.email || email);
        window.location.href = "dashboard.html";
    }catch(err){
        setLoadingOverlay(false);
        if(loginBtn) loginBtn.disabled = false;
        alert(err.message || "Login failed");
    }
}

async function forgotPassword(){
    const emailInput = getLoginInputElement();
    const email = String(emailInput && emailInput.value ? emailInput.value : "").trim();
    if(!email){
        alert("Enter your email address first.");
        if(emailInput) emailInput.focus();
        return;
    }
    try{
        await request("/auth/forgot-password","POST",{email});
        alert("Email matched. Password details sent to your email.");
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

const loginBtn = document.getElementById("loginBtn");
if(loginBtn){
    loginBtn.addEventListener("click", login);
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
        forgotPassword();
    });
}
const passwordToggle = document.getElementById("passwordToggle");
if(passwordToggle){
    passwordToggle.addEventListener("click", togglePassword);
}
["email", "User", "user", "password"].forEach((id) => {
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
    setupSavedUserSelector();
    setupLoginInputClearOnOpen();
    setLoadingOverlay(true, "Starting AXIS CMS SYSTEM...");
    window.setTimeout(() => setLoadingOverlay(false), 950);
});

window.addEventListener("pageshow", () => {
    hasLoginInputInteraction = false;
    setupLoginInputClearOnOpen();
});
