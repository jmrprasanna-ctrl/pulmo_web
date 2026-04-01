                               

                           
const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
};

window.toggleSidebar = toggleSidebar;

                
const logout = () => {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
};

window.logout = logout;