function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    localStorage.removeItem("profileName");
    localStorage.removeItem("selectedDatabaseName");
    localStorage.removeItem("mappedCompanyName");
    localStorage.removeItem("mappedCompanyLogoUrl");
    localStorage.removeItem("mappedCompanyCode");
    localStorage.removeItem("mappedCompanyEmail");
    window.location.href = "login.html";
}
