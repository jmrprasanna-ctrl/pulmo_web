const axisLoadingOverlay = document.getElementById("axisLoadingOverlay");
const axisLoadingTitle = document.getElementById("axisLoadingTitle");
const companyCodeInput = document.getElementById("companyCode");
const companyCodeStatus = document.getElementById("companyCodeStatus");
const companyLogoWrap = document.getElementById("companyLogoWrap");
const companyLogo = document.getElementById("companyLogo");
const loginCompanyName = document.getElementById("loginCompanyName");
const companyCodeWrap = document.getElementById("companyCodeWrap");
const companyCodeToggle = document.getElementById("companyCodeToggle");
const savedCompanyCodeMenu = document.getElementById("savedCompanyCodeMenu");
const SAVED_COMPANY_CODES_KEY = "axisSavedCompanyCodesV1";
const LAST_COMPANY_CODE_KEY = "axisLastSelectedCompanyCodeV1";
const MAX_SAVED_COMPANY_CODES = 10;
let verifiedCompany = null;
let verifiedCompanyCode = "";
let companyCodeTimer = null;
let companyLogoCandidates = [];
let companyLogoCandidateIndex = 0;
let companyLogoDisplayName = "Company";
let savedCompanyCodes = [];
let companyCodeDropdownOpen = false;

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

function normalizeCompanyCodeList(values){
    const seen = new Set();
    const next = [];
    (Array.isArray(values) ? values : []).forEach((value) => {
        const code = normalizeCompanyCode(value);
        if(!code || seen.has(code)) return;
        seen.add(code);
        next.push(code);
    });
    return next;
}

function readSavedCompanyCodes(){
    let codes = [];
    try{
        const raw = localStorage.getItem(SAVED_COMPANY_CODES_KEY);
        if(raw){
            const parsed = JSON.parse(raw);
            if(Array.isArray(parsed)){
                codes = parsed;
            }
        }
    }catch(_){}
    const mappedCode = normalizeCompanyCode(localStorage.getItem("mappedCompanyCode") || "");
    if(mappedCode){
        codes.unshift(mappedCode);
    }
    return normalizeCompanyCodeList(codes).slice(0, MAX_SAVED_COMPANY_CODES);
}

function getStoredLastCompanyCode(){
    const lastCode = normalizeCompanyCode(localStorage.getItem(LAST_COMPANY_CODE_KEY) || "");
    if(lastCode){
        return lastCode;
    }
    return normalizeCompanyCode(localStorage.getItem("mappedCompanyCode") || "");
}

function getVisibleSavedCompanyCodes(){
    const currentValue = normalizeCompanyCode(companyCodeInput ? companyCodeInput.value : "");
    if(!currentValue){
        return savedCompanyCodes.slice();
    }
    const startsWithMatches = savedCompanyCodes.filter((code) => code.startsWith(currentValue));
    const containsMatches = savedCompanyCodes.filter((code) => !code.startsWith(currentValue) && code.includes(currentValue));
    return startsWithMatches.concat(containsMatches);
}

function setCompanyCodeDropdownOpen(open){
    companyCodeDropdownOpen = !!open && !!savedCompanyCodeMenu && getVisibleSavedCompanyCodes().length > 0;
    if(savedCompanyCodeMenu){
        savedCompanyCodeMenu.classList.toggle("is-hidden", !companyCodeDropdownOpen);
        savedCompanyCodeMenu.setAttribute("aria-hidden", companyCodeDropdownOpen ? "false" : "true");
    }
    if(companyCodeInput){
        companyCodeInput.setAttribute("aria-expanded", companyCodeDropdownOpen ? "true" : "false");
    }
    if(companyCodeToggle){
        companyCodeToggle.setAttribute("aria-expanded", companyCodeDropdownOpen ? "true" : "false");
    }
}

function renderSavedCompanyCodeOptions(selectedCode){
    if(!savedCompanyCodeMenu) return;
    const normalizedSelectedCode = normalizeCompanyCode(selectedCode);
    const visibleCodes = getVisibleSavedCompanyCodes();
    savedCompanyCodeMenu.innerHTML = "";
    visibleCodes.forEach((code) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "company-code-option" + (code === normalizedSelectedCode ? " is-active" : "");
        button.textContent = code;
        button.setAttribute("role", "option");
        button.setAttribute("data-company-code-option", code);
        button.setAttribute("aria-selected", code === normalizedSelectedCode ? "true" : "false");
        button.addEventListener("mousedown", (event) => {
            event.preventDefault();
        });
        button.addEventListener("click", () => {
            setCompanyCodeValue(code, true);
            setCompanyCodeDropdownOpen(false);
            scheduleCompanyCodeVerification();
            if(companyCodeInput){
                companyCodeInput.focus();
            }
        });
        savedCompanyCodeMenu.appendChild(button);
    });
    if(companyCodeToggle){
        companyCodeToggle.classList.toggle("is-hidden", savedCompanyCodes.length < 2);
    }
    if(!visibleCodes.length){
        setCompanyCodeDropdownOpen(false);
    }else if(companyCodeDropdownOpen){
        setCompanyCodeDropdownOpen(true);
    }
}

function showCompanyCodeDropdown(){
    renderSavedCompanyCodeOptions(companyCodeInput ? companyCodeInput.value : "");
    setCompanyCodeDropdownOpen(true);
}

function hideCompanyCodeDropdown(){
    setCompanyCodeDropdownOpen(false);
}

function persistSavedCompanyCodes(nextCodes, lastCode){
    const normalizedCodes = normalizeCompanyCodeList(nextCodes).slice(0, MAX_SAVED_COMPANY_CODES);
    const normalizedLastCode = normalizeCompanyCode(lastCode);
    savedCompanyCodes = normalizedCodes;
    try{
        if(savedCompanyCodes.length){
            localStorage.setItem(SAVED_COMPANY_CODES_KEY, JSON.stringify(savedCompanyCodes));
        }else{
            localStorage.removeItem(SAVED_COMPANY_CODES_KEY);
        }
        if(normalizedLastCode){
            localStorage.setItem(LAST_COMPANY_CODE_KEY, normalizedLastCode);
        }else{
            localStorage.removeItem(LAST_COMPANY_CODE_KEY);
        }
    }catch(_){}
    renderSavedCompanyCodeOptions(normalizedLastCode);
}

function rememberSavedCompanyCode(code){
    const normalizedCode = normalizeCompanyCode(code);
    if(!normalizedCode) return;
    const nextCodes = [normalizedCode].concat(savedCompanyCodes.filter((item) => item !== normalizedCode));
    persistSavedCompanyCodes(nextCodes, normalizedCode);
}

function setCompanyCodeValue(code, rememberSelection){
    const normalizedCode = normalizeCompanyCode(code);
    if(!companyCodeInput) return;
    companyCodeInput.value = normalizedCode;
    if(rememberSelection && savedCompanyCodes.includes(normalizedCode)){
        persistSavedCompanyCodes(savedCompanyCodes, normalizedCode);
    }else{
        renderSavedCompanyCodeOptions(normalizedCode);
    }
}

function initializeSavedCompanyCodes(){
    savedCompanyCodes = readSavedCompanyCodes();
    const lastCode = getStoredLastCompanyCode();
    renderSavedCompanyCodeOptions(lastCode);
    const initialCode = lastCode || (savedCompanyCodes.length === 1 ? savedCompanyCodes[0] : "");
    if(initialCode){
        setCompanyCodeValue(initialCode, false);
        scheduleCompanyCodeVerification();
    }
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

function setCompanyLogoWrapState(hidden, loading){
    if(!companyLogoWrap) return;
    companyLogoWrap.classList.toggle("is-hidden", !!hidden);
    companyLogoWrap.classList.toggle("is-loading", !!loading);
    companyLogoWrap.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function resetCompanyLogoImage(){
    if(!companyLogo) return;
    companyLogo.removeAttribute("src");
    companyLogo.alt = "Company Logo";
}

function getCompanyLogoCandidates(company){
    const rawList = Array.isArray(company?.logo_urls) ? company.logo_urls : [company?.logo_url];
    const seen = new Set();
    const resolved = [];
    rawList.forEach((value) => {
        const resolvedUrl = resolveAssetUrl(value);
        if(!resolvedUrl || seen.has(resolvedUrl)) return;
        seen.add(resolvedUrl);
        resolved.push(resolvedUrl);
    });
    return resolved;
}

function loadCurrentCompanyLogoCandidate(){
    if(!companyLogo){
        return;
    }
    const nextUrl = companyLogoCandidates[companyLogoCandidateIndex];
    if(!nextUrl){
        resetCompanyLogoImage();
        setCompanyLogoWrapState(true, false);
        return;
    }
    companyLogo.alt = `${companyLogoDisplayName} Logo`;
    setCompanyLogoWrapState(false, true);
    companyLogo.src = nextUrl;
}

function resetCompanyPreview(){
    verifiedCompany = null;
    verifiedCompanyCode = "";
    companyLogoCandidates = [];
    companyLogoCandidateIndex = 0;
    companyLogoDisplayName = "Company";
    resetCompanyLogoImage();
    setCompanyLogoWrapState(true, false);
    if(loginCompanyName){
        loginCompanyName.textContent = "AXIS CMS SYSTEM";
    }
}

function showCompanyPreview(company){
    const name = String(company?.company_name || "AXIS CMS SYSTEM").trim() || "AXIS CMS SYSTEM";
    companyLogoDisplayName = name;
    if(loginCompanyName){
        loginCompanyName.textContent = name;
    }
    companyLogoCandidates = getCompanyLogoCandidates(company);
    companyLogoCandidateIndex = 0;
    if(companyLogo && companyLogoCandidates.length){
        loadCurrentCompanyLogoCandidate();
    }else{
        resetCompanyLogoImage();
        setCompanyLogoWrapState(true, false);
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
    setCompanyCodeStatus("", "");
    return company;
}

function scheduleCompanyCodeVerification(){
    window.clearTimeout(companyCodeTimer);
    resetCompanyPreview();
    const code = normalizeCompanyCode(companyCodeInput ? companyCodeInput.value : "");
    renderSavedCompanyCodeOptions(code);
    if(!code){
        setCompanyCodeStatus("", "");
        if(document.activeElement === companyCodeInput && savedCompanyCodes.length > 1){
            showCompanyCodeDropdown();
        }else{
            hideCompanyCodeDropdown();
        }
        return;
    }
    if(companyCodeInput && companyCodeInput.value !== code){
        companyCodeInput.value = code;
    }
    if(document.activeElement === companyCodeInput && savedCompanyCodes.length > 1){
        showCompanyCodeDropdown();
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
        rememberSavedCompanyCode(companyCode);
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
    companyCodeInput.addEventListener("change", () => {
        const normalizedCode = normalizeCompanyCode(companyCodeInput.value);
        if(companyCodeInput.value !== normalizedCode){
            companyCodeInput.value = normalizedCode;
        }
        if(savedCompanyCodes.includes(normalizedCode)){
            persistSavedCompanyCodes(savedCompanyCodes, normalizedCode);
        }
        scheduleCompanyCodeVerification();
    });
    companyCodeInput.addEventListener("focus", () => {
        if(savedCompanyCodes.length > 1){
            showCompanyCodeDropdown();
        }
    });
    companyCodeInput.addEventListener("blur", () => {
        window.setTimeout(() => {
            hideCompanyCodeDropdown();
            verifyCompanyCode().catch((err) => {
                resetCompanyPreview();
                setCompanyCodeStatus(err.message || "Invalid company code.", "error");
            });
        }, 120);
    });
}
if(companyCodeToggle){
    companyCodeToggle.addEventListener("click", () => {
        if(!savedCompanyCodes.length){
            return;
        }
        if(companyCodeInput){
            companyCodeInput.focus();
        }
        if(companyCodeDropdownOpen){
            hideCompanyCodeDropdown();
        }else{
            showCompanyCodeDropdown();
        }
    });
}
document.addEventListener("click", (event) => {
    if(companyCodeWrap && !companyCodeWrap.contains(event.target)){
        hideCompanyCodeDropdown();
    }
});
if(companyLogo){
    companyLogo.addEventListener("load", () => {
        setCompanyLogoWrapState(false, false);
    });
    companyLogo.addEventListener("error", () => {
        companyLogoCandidateIndex += 1;
        if(companyLogoCandidateIndex < companyLogoCandidates.length){
            loadCurrentCompanyLogoCandidate();
            return;
        }
        resetCompanyLogoImage();
        setCompanyLogoWrapState(true, false);
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
    initializeSavedCompanyCodes();
    clearCredentialFields();
    window.setTimeout(clearCredentialFields, 120);
    window.setTimeout(clearCredentialFields, 320);
    window.setTimeout(() => setLoadingOverlay(false), 950);
});
