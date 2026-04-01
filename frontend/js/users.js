                          
import { getData, postData, deleteData } from './api.js';

const loadUsers = async () => {
    const users = await getData('users');
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '';
    users.forEach(u => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${u.id}</td>
            <td>${u.username}</td>
            <td>${u.email}</td>
            <td>${u.role}</td>
            <td>${u.company}</td>
            <td>${u.department}</td>
            <td>${u.telephone || ""}</td>
        `;
        tbody.appendChild(row);
    });
};

window.loadUsers = loadUsers;

const addUser = async () => {
    const form = document.getElementById('addUserForm');
    const user = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        role: document.getElementById('role').value,
        company: document.getElementById('company').value,
        department: document.getElementById('department').value,
        telephone: document.getElementById('tel').value
    };
    try{
        await postData('users', user);
        if (typeof window.showMessageBox === 'function') {
            window.showMessageBox('User saved successfully!');
        }
        if (form) form.reset();
        loadUsers();
    }catch(err){
        alert(err.message || "Failed to add user");
    }
};

window.addUser = addUser;
