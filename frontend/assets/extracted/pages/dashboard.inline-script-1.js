function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    localStorage.removeItem("selectedDatabaseName");
    localStorage.removeItem("mappedCompanyName");
    localStorage.removeItem("mappedCompanyLogoUrl");
    window.location.href = "login.html";
}
