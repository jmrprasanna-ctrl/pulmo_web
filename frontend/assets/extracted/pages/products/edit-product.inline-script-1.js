const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');
        const role = (localStorage.getItem("role") || "").toLowerCase();
        const selectedDb = (localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
        const isTrainingUser = role === "user" && selectedDb === "demo";
        const canManage = role === "admin" || role === "manager" || isTrainingUser;
        const canDeleteProduct = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/products/product-list.html", "delete"));

        if(!productId){
            alert("Missing product id.");
            window.location.href = "product-list.html";
        }

        async function loadCategories(){
            try{
                const categories = await request("/categories","GET");
                const select = document.getElementById("category");
                select.innerHTML = "<option value=\"\">Select Category</option>";
                categories.forEach(c=>{
                    const opt = document.createElement("option");
                    opt.value = String(c.id);
                    opt.dataset.name = c.name;
                    opt.innerText = c.name;
                    select.appendChild(opt);
                });
            }catch(_err){
                                                        
            }
        }

        async function loadVendors(){
            try{
                const vendors = await request("/vendors","GET");
                const select = document.getElementById("vendor");
                select.innerHTML = "";
                vendors.forEach(v=>{
                    const opt = document.createElement("option");
                    opt.value = v.id;
                    opt.innerText = v.name;
                    select.appendChild(opt);
                });
            }catch(_err){
                         
            }
        }

        const loadProduct = async () => {
            const product = await request(`/products/${productId}`,"GET");
            document.getElementById('productId').value = product.product_id || "";
            document.getElementById('description').value = product.description || "";
            document.getElementById('model').value = product.model || "";
            document.getElementById('serial_no').value = product.serial_no || "";
            document.getElementById('count').value = product.count || 0;
            document.getElementById('sellingPrice').value = product.selling_price || 0;
            document.getElementById('dealerPrice').value = product.dealer_price || 0;
            if(product.Vendor){
                document.getElementById('vendor').value = product.Vendor.id;
            }
            if(product.Category){
                document.getElementById('category').value = String(product.Category.id);
            }
        };

        window.addEventListener('DOMContentLoaded', async () => {
            await loadCategories();
            await loadVendors();
            await loadProduct();
            const deleteBtn = document.getElementById("deleteProductBtn");
            if(deleteBtn && !canDeleteProduct){
                deleteBtn.style.display = "none";
            }
        });

        const form = document.getElementById('editProductForm');
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const categorySelect = document.getElementById('category');
            const updatedProduct = {
                product_id: document.getElementById('productId').value,
                description: document.getElementById('description').value,
                category: categorySelect.value || (categorySelect.selectedOptions[0]?.dataset?.name || ""),
                model: document.getElementById('model').value,
                serial_no: document.getElementById('serial_no').value,
                count: document.getElementById('count').value,
                selling_price: document.getElementById('sellingPrice').value,
                dealer_price: document.getElementById('dealerPrice').value,
                vendor_id: document.getElementById('vendor').value
            };
            await request(`/products/${productId}`,"PUT",updatedProduct);
            showMessageBox('Product updated successfully!');
        });

        const deleteBtn = document.getElementById("deleteProductBtn");
        if(deleteBtn){
            deleteBtn.addEventListener("click", async () => {
                if(!canDeleteProduct){
                    alert("You don't have permission to delete products.");
                    return;
                }
                const count = Number(document.getElementById("count").value || 0);
                if(count !== 0){
                    alert("Only products with quantity 0 can be deleted.");
                    return;
                }
                if(!confirm("Delete this product?")) return;
                try{
                    await request(`/products/${productId}`,"DELETE");
                    showMessageBox("Product deleted");
                    window.location.href = "product-list.html";
                }catch(err){
                    alert(err.message || "Failed to delete product");
                }
            });
        }

        function logout(){
            localStorage.removeItem("token");
            localStorage.removeItem("role");
            window.location.href="../login.html";
        }
