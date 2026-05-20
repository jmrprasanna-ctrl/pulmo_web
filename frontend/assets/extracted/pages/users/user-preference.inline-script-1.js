const USER_PREFERENCE_PAGE_PATH = "/users/user-preference.html";

function normalizeHex(value, fallback){
    const raw = String(value || "").trim();
    if(/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    return fallback;
}

function normalizeModeTheme(value){
    const mode = String(value || "").trim().toLowerCase();
    if(mode === "dark" || mode === "darker"){
        return mode;
    }
    return "light";
}

function applyThemeForm(settings){
    const dashboard = normalizeHex(settings?.primary_color, "#0f6abf");
    const bg = normalizeHex(settings?.background_color, "#edf3fb");
    const button = normalizeHex(settings?.button_color, dashboard);
    const mode = normalizeModeTheme(settings?.mode_theme);

    const dashboardPreset = document.getElementById("dashboardColorPreset");
    const backgroundInput = document.getElementById("backgroundColorInput");
    const buttonInput = document.getElementById("buttonColorInput");
    const modeSelect = document.getElementById("modeThemeSelect");
    const status = document.getElementById("themeStatus");

    if(dashboardPreset) dashboardPreset.value = dashboard;
    if(backgroundInput) backgroundInput.value = bg;
    if(buttonInput) buttonInput.value = button;
    if(modeSelect) modeSelect.value = mode;
    if(status){
        status.textContent = `Current: Dashboard ${dashboard}, Background ${bg}, Buttons ${button}, Mode ${mode}`;
    }
}

async function loadThemeSettings(){
    const ui = await request("/preferences/my-ui-settings", "GET");
    if(!ui) return;
    applyThemeForm(ui);
    if(typeof window.applyUiSettingsToPage === "function"){
        window.applyUiSettingsToPage(ui);
    }
    if(typeof window.cacheUserUiSettings === "function"){
        window.cacheUserUiSettings(ui);
    }
}

async function saveThemeSettings(){
    const dashboardColor = normalizeHex(document.getElementById("dashboardColorPreset")?.value, "#0f6abf");
    const backgroundColor = normalizeHex(document.getElementById("backgroundColorInput")?.value, "#edf3fb");
    const buttonColor = normalizeHex(document.getElementById("buttonColorInput")?.value, dashboardColor);
    const modeTheme = normalizeModeTheme(document.getElementById("modeThemeSelect")?.value);

    await request("/preferences/theme", "PUT", {
        primary_color: dashboardColor,
        background_color: backgroundColor,
        button_color: buttonColor,
        mode_theme: modeTheme
    });

    const nextSettings = {
        primary_color: dashboardColor,
        background_color: backgroundColor,
        button_color: buttonColor,
        mode_theme: modeTheme
    };
    if(typeof window.applyUiSettingsToPage === "function"){
        window.applyUiSettingsToPage(nextSettings);
    }
    if(typeof window.cacheUserUiSettings === "function"){
        window.cacheUserUiSettings(nextSettings);
    }
    showMessageBox("Theme settings updated");
    await loadThemeSettings();
}
window.saveThemeSettings = saveThemeSettings;

function applyEditPermissionState(canEdit){
    document.querySelectorAll(".preference-card input, .preference-card select, .preference-card button").forEach((el) => {
        el.disabled = !canEdit;
    });
}

window.addEventListener("DOMContentLoaded", async () => {
    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }
    const canView = !!window.hasUserActionPermission && window.hasUserActionPermission(USER_PREFERENCE_PAGE_PATH, "view");
    const canEdit = !!window.hasUserActionPermission && window.hasUserActionPermission(USER_PREFERENCE_PAGE_PATH, "edit");
    if(!canView){
        window.location.href = "../dashboard.html";
        return;
    }
    applyEditPermissionState(canEdit);
    try{
        await loadThemeSettings();
    }catch(err){
        alert(err.message || "Failed to load user preferences");
    }
});
