function getUserId(){
            const params = new URLSearchParams(window.location.search);
            return params.get("id");
        }

        function getComparableUserId(targetUserId){
            const raw = String(targetUserId || "").trim();
            const directorySelfMatch = /^directory-self:(\d+)$/i.exec(raw);
            if(directorySelfMatch){
                return String(directorySelfMatch[1] || "").trim();
            }
            return raw;
        }

        const USER_DEPARTMENTS = new Set(["Manager", "IT", "Finance", "Admin", "Cordinater", "Technician", "Customer"]);
        const CUSTOMER_USER_TYPES = new Set(["general", "rental"]);
        let rentalCustomers = [];

        function normalizeCustomerTypeValue(value){
            const raw = String(value || "").trim().toLowerCase();
            if(raw === "general" || raw === "genaral") return "general";
            if(raw === "rental") return "rental";
            return "";
        }

        function normalizeLinkedCustomerId(value){
            const parsed = Number.parseInt(String(value || "").trim(), 10);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        }

        function renderRentalCustomerOptions(selectedCustomerId = 0){
            const linkedCustomerEl = document.getElementById('linkedCustomerId');
            if(!linkedCustomerEl) return;
            const options = ['<option value="">Select Rental Customer</option>'];
            rentalCustomers.forEach((customer) => {
                const customerId = Number(customer.id || 0);
                if(!Number.isFinite(customerId) || customerId <= 0) return;
                const customerCode = String(customer.customer_id || "").trim();
                const customerName = String(customer.name || "").trim();
                const customerLabel = customerCode ? `${customerCode} - ${customerName}` : customerName;
                options.push(`<option value="${customerId}">${customerLabel}</option>`);
            });
            linkedCustomerEl.innerHTML = options.join("");
            linkedCustomerEl.value = selectedCustomerId > 0 ? String(selectedCustomerId) : "";
        }

        async function loadRentalCustomers(selectedCustomerId = 0){
            const rows = await request("/customers", "GET");
            rentalCustomers = (Array.isArray(rows) ? rows : [])
                .filter((customer) => String(customer?.customer_mode || "").trim().toLowerCase() === "rental")
                .sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || "")));
            renderRentalCustomerOptions(selectedCustomerId);
        }

        function updateCustomerTypeVisibility(){
            const departmentEl = document.getElementById('department');
            const customerTypeWrapEl = document.getElementById('customerTypeWrap');
            const customerTypeEl = document.getElementById('customerType');
            const linkedCustomerWrapEl = document.getElementById('linkedCustomerWrap');
            const linkedCustomerEl = document.getElementById('linkedCustomerId');
            const showCustomerType = String(departmentEl?.value || "").trim() === "Customer";
            const showLinkedCustomer = showCustomerType && normalizeCustomerTypeValue(customerTypeEl?.value) === "rental";
            if(customerTypeWrapEl){
                customerTypeWrapEl.style.display = showCustomerType ? "" : "none";
            }
            if(customerTypeEl){
                customerTypeEl.required = showCustomerType;
                if(!showCustomerType){
                    customerTypeEl.value = "";
                }
            }
            if(linkedCustomerWrapEl){
                linkedCustomerWrapEl.style.display = showLinkedCustomer ? "" : "none";
            }
            if(linkedCustomerEl){
                linkedCustomerEl.required = showLinkedCustomer;
                if(!showLinkedCustomer){
                    linkedCustomerEl.value = "";
                }
            }
        }

        function ensureDepartmentOption(value){
            const select = document.getElementById('department');
            if(!select) return "";
            const raw = String(value || "").trim();
            if(!raw) return "";
            if(USER_DEPARTMENTS.has(raw)) return raw;

            const option = document.createElement("option");
            option.value = raw;
            option.textContent = `${raw} (Legacy)`;
            select.appendChild(option);
            return raw;
        }

        function isCurrentLoggedInUser(targetUserId){
            const currentUserId = String(localStorage.getItem("userId") || "").trim();
            const targetId = getComparableUserId(targetUserId);
            return !!currentUserId && !!targetId && currentUserId === targetId;
        }

        async function loadUser(){
            const id = getUserId();
            if(!id){
                alert("Missing user id");
                window.location.href = "user-list.html";
                return;
            }
            try{
                const user = await request(`/users/${encodeURIComponent(id)}`,"GET");
                document.getElementById('username').value = user.username || "";
                document.getElementById('company').value = user.company || "";
                document.getElementById('department').value = ensureDepartmentOption(user.department) || "";
                document.getElementById('customerType').value = normalizeCustomerTypeValue(user.customer_type);
                try{
                    await loadRentalCustomers(normalizeLinkedCustomerId(user.customer_id));
                }catch(customerErr){
                    alert(customerErr.message || "Failed to load rental customers.");
                    renderRentalCustomerOptions();
                }
                document.getElementById('tel').value = user.telephone || "";
                document.getElementById('email').value = user.email || "";
                document.getElementById('role').value = user.role || "";
                updateCustomerTypeVisibility();
            }catch(err){
                alert(err.message || "Failed to load user");
                window.location.href = "user-list.html";
            }
        }

        window.addEventListener("load", () => {
            const form = document.getElementById('editUserForm');
            const companyInput = document.getElementById('company');
            const departmentEl = document.getElementById('department');
            const customerTypeEl = document.getElementById('customerType');
            const linkedCustomerEl = document.getElementById('linkedCustomerId');
            const togglePassword = document.getElementById('togglePassword');
            const passwordInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eyeIcon');
            const deleteUserBtn = document.getElementById('deleteUserBtn');
            const role = (localStorage.getItem("role") || "").toLowerCase();
            const selectedDb = (localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
            const isTrainingUser = role === "user" && selectedDb === "demo";
            const canManage = role === "admin" || role === "manager" || isTrainingUser;
            const canDeleteUser = canManage || (role === "user" && typeof hasUserActionPermission === "function" && hasUserActionPermission("/users/user-list.html", "delete"));

            companyInput.style.textTransform = "uppercase";
            companyInput.addEventListener("input", () => {
                const pos = companyInput.selectionStart;
                companyInput.value = companyInput.value.toUpperCase();
                companyInput.setSelectionRange(pos, pos);
            });

            departmentEl?.addEventListener("change", updateCustomerTypeVisibility);
            customerTypeEl?.addEventListener("change", updateCustomerTypeVisibility);

            form.addEventListener('submit', async e => {
                e.preventDefault();
                const id = getUserId();
                const selectedDepartment = String(departmentEl?.value || "").trim();
                const selectedCustomerType = normalizeCustomerTypeValue(customerTypeEl?.value);
                const selectedLinkedCustomerId = normalizeLinkedCustomerId(linkedCustomerEl?.value);
                if(!USER_DEPARTMENTS.has(selectedDepartment)){
                    alert("Please select a valid department.");
                    return;
                }
                if(selectedDepartment === "Customer" && !CUSTOMER_USER_TYPES.has(selectedCustomerType)){
                    alert("Please select a valid customer type.");
                    return;
                }
                if(selectedDepartment === "Customer" && selectedCustomerType === "rental" && selectedLinkedCustomerId <= 0){
                    alert("Please select a rental customer.");
                    return;
                }
                const payload = {
                    username: document.getElementById('username').value.trim(),
                    email: document.getElementById('email').value.trim(),
                    role: document.getElementById('role').value,
                    company: document.getElementById('company').value.trim(),
                    department: selectedDepartment,
                    customer_type: selectedDepartment === "Customer" ? selectedCustomerType : "",
                    customer_id: selectedDepartment === "Customer" && selectedCustomerType === "rental" ? selectedLinkedCustomerId : "",
                    telephone: document.getElementById('tel').value.trim()
                };
                const password = document.getElementById('password').value;
                if(password){
                    payload.password = password;
                }
                try{
                    await request(`/users/${encodeURIComponent(id)}`,"PUT",payload);
                    showMessageBox("User updated successfully!");
                    window.location.href = "user-list.html";
                }catch(err){
                    alert(err.message || "Failed to update user");
                }
            });

            togglePassword.addEventListener("click", () => {
                const isPassword = passwordInput.type === "password";
                passwordInput.type = isPassword ? "text" : "password";
                togglePassword.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
                togglePassword.setAttribute("aria-pressed", isPassword ? "true" : "false");
                eyeIcon.innerHTML = isPassword
                    ? '<path d="M3 3L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 12C3.9 8 7.4 5.5 12 5.5C13.8 5.5 15.4 5.9 16.8 6.7M20.2 9.4C20.9 10.2 21.5 11 22 12C20.1 16 16.6 18.5 12 18.5C8.2 18.5 5.2 16.8 3.2 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"/>'
                    : '<path d="M2 12C3.9 8 7.4 5.5 12 5.5C16.6 5.5 20.1 8 22 12C20.1 16 16.6 18.5 12 18.5C7.4 18.5 3.9 16 2 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"/>';
            });

            if(deleteUserBtn){
                if(!canDeleteUser){
                    deleteUserBtn.style.display = "none";
                }else{
                    deleteUserBtn.addEventListener("click", async () => {
                        const id = getUserId();
                        if(!id) return;
                        if(isCurrentLoggedInUser(id)){
                            showMessageBox("You cannot delete your own account.", "error");
                            return;
                        }
                        if(!confirm("Delete this user?")) return;
                        try{
                            await request(`/users/${encodeURIComponent(id)}`,"DELETE");
                            showMessageBox("User deleted");
                            window.location.href = "user-list.html";
                        }catch(err){
                            alert(err.message || "Failed to delete user");
                        }
                    });
                }
            }

            loadUser();
            updateCustomerTypeVisibility();
            const id = getUserId();
            if(deleteUserBtn && canDeleteUser && isCurrentLoggedInUser(id)){
                deleteUserBtn.style.display = "none";
            }
        });
