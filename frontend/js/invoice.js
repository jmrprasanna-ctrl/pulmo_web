                            
import { getData, postData, deleteData } from './api.js';

const loadInvoices = async () => {
    const tbody = document.getElementById('invoice-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    try{
        const invoices = await getData('invoices');
        if(!invoices || invoices.length === 0){
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="5">No invoices found.</td>`;
            tbody.appendChild(row);
            return;
        }
        invoices.forEach(inv => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${inv.invoice_no}</td>
                <td>${inv.customer_name}</td>
                <td>${inv.total}</td>
                <td>${new Date(inv.invoice_date).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-success" onclick="viewInvoice(${inv.id})">View</button>
                    <button class="btn btn-danger" onclick="deleteInvoice(${inv.id})">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }catch(err){
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5">${err.message || "Failed to load invoices"}</td>`;
        tbody.appendChild(row);
    }
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

window.addEventListener("pageshow", ()=>{
    if(document.getElementById('invoice-table-body')){
        loadInvoices();
    }
});

if(document.getElementById('invoice-table-body')){
    loadInvoices();
}
