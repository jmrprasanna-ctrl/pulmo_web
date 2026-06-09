                               

                           
const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
};

window.toggleSidebar = toggleSidebar;

                
const logout = () => {
    [
        'token',
        'role',
        'userId',
        'userEmail',
        'userName',
        'userDatabase',
        'userRef',
        'authScope',
        'selectedDatabaseName',
        'userAllowedPathsRuntime',
        'userAllowedActionsRuntime',
        'userAccessConfigEnabledRuntime',
        'mappedCompanyName',
        'mappedCompanyCode',
        'mappedCompanyEmail',
        'mappedCompanyLogoUrl',
        'lastActivityAt'
    ].forEach((key) => localStorage.removeItem(key));
    window.location.href = 'login.html';
};

window.logout = logout;
