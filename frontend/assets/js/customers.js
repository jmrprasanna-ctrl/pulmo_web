                              
import { getData, postData, putData, deleteData } from './api.js';

const loadCustomers = async () => {
    const customers = await getData('customers');
    const tbody = document.getElementById('customer-table-body');
    tbody.innerHTML = '';
    customers.forEach(c => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${c.customer_id || ''}</td>
            <td>${c.id}</td>
            <td>${c.name}</td>
            <td>${c.address}</td>
            <td>${c.tel}</td>
            <td>${c.email}</td>
            <td>
                <button class="btn btn-success" onclick="editCustomer(${c.id})">Edit</button>
                <button class="btn btn-danger" onclick="deleteCustomer(${c.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
};

window.loadCustomers = loadCustomers;

const addCustomer = async () => {
    const customer = {
        name: document.getElementById('name').value,
        address: document.getElementById('address').value,
        tel: document.getElementById('tel').value,
        email: document.getElementById('email').value
    };
    await postData('customers', customer);
    loadCustomers();
};

window.addCustomer = addCustomer;

const deleteCustomer = async (id) => {
    if (confirm('Are you sure?')) {
        await deleteData(`customers/${id}`);
        loadCustomers();
    }
};

window.deleteCustomer = deleteCustomer;

const editCustomer = (id) => {
    window.location.href = `edit-customer.html?id=${id}`;
};

window.editCustomer = editCustomer;
