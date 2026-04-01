                               

const ensureMessageBoxStyles = () => {
    if (document.getElementById('message-box-styles')) return;
    const style = document.createElement('style');
    style.id = 'message-box-styles';
    style.textContent = `
        .app-message-box {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 240px;
            max-width: 420px;
            padding: 12px 14px;
            border-radius: 8px;
            color: #fff;
            font-weight: 600;
            box-shadow: 0 10px 24px rgba(0,0,0,0.2);
            opacity: 0;
            transform: translateY(-8px);
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .app-message-box.show {
            opacity: 1;
            transform: translateY(0);
        }
        .app-message-box.success { background: #198754; }
        .app-message-box.error { background: #dc3545; }
    `;
    document.head.appendChild(style);
};

const showMessageBox = (message, type = 'success', duration = 2200) => {
    ensureMessageBoxStyles();
    let box = document.getElementById('app-message-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'app-message-box';
        box.className = 'app-message-box';
        document.body.appendChild(box);
    }
    box.textContent = message;
    box.className = `app-message-box ${type}`;
    requestAnimationFrame(() => box.classList.add('show'));
    setTimeout(() => box.classList.remove('show'), duration);
};

window.showMessageBox = showMessageBox;

                           
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
