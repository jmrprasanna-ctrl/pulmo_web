                            
import { getData, postData, deleteData } from './api.js';

const loadInvoices = async () => {
    const invoices = await getData('invoices');
    const tbody = document.getElementById('invoice-table-body');
    tbody.innerHTML = '';
    invoices.forEach(inv => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${inv.invoice_no}</td>
            <td>${inv.customer_name}</td>
            <td>${inv.total}</td>
            <td>${new Date(inv.invoice_date).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-success" onclick="viewInvoice(${inv.id})">INV 1</button>
                <button class="btn btn-primary btn-inline" onclick="viewQuatation(${inv.id})">QUT 1</button>
                <button class="btn btn-primary btn-inline" onclick="viewQuatation2(${inv.id})">QUT 2</button>
                <button class="btn btn-primary btn-inline" onclick="viewQuatation3(${inv.id})">QUT 3</button>
                <button class="btn btn-danger" onclick="deleteInvoice(${inv.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
};

window.loadInvoices = loadInvoices;

const deleteInvoice = async (id) => {
    if (confirm('Are you sure?')) {
        await deleteData(`invoices/${id}`);
        loadInvoices();
    }
};

window.deleteInvoice = deleteInvoice;

const viewInvoice = (id) => {
    window.location.href = `view-invoice.html?id=${id}`;
};

window.viewInvoice = viewInvoice;

const viewQuatation = (id) => {
    window.location.href = `view-quotation.html?id=${id}`;
};

window.viewQuatation = viewQuatation;

const viewQuatation2 = (id) => {
    window.location.href = `view-quotation-2.html?id=${id}`;
};

window.viewQuatation2 = viewQuatation2;

const viewQuatation3 = (id) => {
    window.location.href = `view-quotation-3.html?id=${id}`;
};

window.viewQuatation3 = viewQuatation3;
