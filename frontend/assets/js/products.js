                             
import { getData, postData, putData, deleteData } from './api.js';

const loadProducts = async () => {
    const products = await getData('products');
    const tbody = document.getElementById('product-table-body');
    tbody.innerHTML = '';
    products.forEach(p => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${p.id}</td>
            <td>${p.description}</td>
            <td>${p.category}</td>
            <td>${p.model}</td>
            <td>${p.serial_no}</td>
            <td>${p.year}</td>
            <td>${p.count}</td>
            <td>${p.price}</td>
            <td>
                <button class="btn btn-success" onclick="editProduct(${p.id})">Edit</button>
                <button class="btn btn-danger" onclick="deleteProduct(${p.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
};

window.loadProducts = loadProducts;

const addProduct = async () => {
    const product = {
        description: document.getElementById('description').value,
        category: document.getElementById('category').value,
        model: document.getElementById('model').value,
        serial_no: document.getElementById('serial_no').value,
        year: document.getElementById('year').value,
        count: document.getElementById('count').value,
        price: document.getElementById('price').value
    };
    await postData('products', product);
    loadProducts();
};

window.addProduct = addProduct;

const deleteProduct = async (id) => {
    if (confirm('Are you sure?')) {
        await deleteData(`products/${id}`);
        loadProducts();
    }
};

window.deleteProduct = deleteProduct;

const editProduct = (id) => {
    window.location.href = `edit-product.html?id=${id}`;
};

window.editProduct = editProduct;