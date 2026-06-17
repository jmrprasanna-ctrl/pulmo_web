const USER_DEPARTMENTS = new Set(["Manager", "IT", "Finance", "Admin", "Cordinater", "Technician", "Customer"]);
const CUSTOMER_USER_TYPES = new Set(["general", "rental"]);

function normalizeCustomerTypeValue(value){
    const raw = String(value || "").trim().toLowerCase();
    if(raw === "general" || raw === "genaral") return "general";
    if(raw === "rental") return "rental";
    return "";
}

window.addEventListener("load", () => {
            const form = document.getElementById('addUserForm');
            const companyInput = document.getElementById('company');
            const departmentEl = document.getElementById('department');
            const customerTypeWrapEl = document.getElementById('customerTypeWrap');
            const customerTypeEl = document.getElementById('customerType');
            const togglePassword = document.getElementById('togglePassword');
            const passwordInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eyeIcon');

            function updateCustomerTypeVisibility(){
                const showCustomerType = String(departmentEl?.value || "").trim() === "Customer";
                if(customerTypeWrapEl){
                    customerTypeWrapEl.style.display = showCustomerType ? "" : "none";
                }
                if(customerTypeEl){
                    customerTypeEl.required = showCustomerType;
                    if(!showCustomerType){
                        customerTypeEl.value = "";
                    }
                }
            }

            companyInput.style.textTransform = "uppercase";
            companyInput.addEventListener("input", () => {
                const pos = companyInput.selectionStart;
                companyInput.value = companyInput.value.toUpperCase();
                companyInput.setSelectionRange(pos, pos);
            });
            departmentEl?.addEventListener("change", updateCustomerTypeVisibility);

            form.addEventListener('submit', async e => {
                e.preventDefault();
                const selectedDepartment = String(departmentEl?.value || "").trim();
                const selectedCustomerType = normalizeCustomerTypeValue(customerTypeEl?.value);
                if(!USER_DEPARTMENTS.has(selectedDepartment)){
                    alert("Please select a valid department.");
                    return;
                }
                if(selectedDepartment === "Customer" && !CUSTOMER_USER_TYPES.has(selectedCustomerType)){
                    alert("Please select a valid customer type.");
                    return;
                }
                const user = {
                    username: document.getElementById('username').value.trim(),
                    email: document.getElementById('email').value.trim(),
                    password: document.getElementById('password').value,
                    role: document.getElementById('role').value,
                    company: document.getElementById('company').value.trim(),
                    department: selectedDepartment,
                    customer_type: selectedDepartment === "Customer" ? selectedCustomerType : "",
                    telephone: document.getElementById('tel').value.trim()
                };
                try{
                    await request("/users","POST",user);
                    showMessageBox("User saved successfully!");
                    form.reset();
                    updateCustomerTypeVisibility();
                }catch(err){
                    alert(err.message || "Failed to add user");
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

            updateCustomerTypeVisibility();
        });
