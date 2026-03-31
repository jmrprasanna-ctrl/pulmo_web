function getUserId(){
            const params = new URLSearchParams(window.location.search);
            return params.get("id");
        }

        async function loadUser(){
            const id = getUserId();
            if(!id){
                alert("Missing user id");
                window.location.href = "user-list.html";
                return;
            }
            try{
                const user = await request(`/users/${id}`,"GET");
                document.getElementById('username').value = user.username || "";
                document.getElementById('company').value = user.company || "";
                document.getElementById('department').value = user.department || "";
                document.getElementById('tel').value = user.telephone || "";
                document.getElementById('email').value = user.email || "";
                document.getElementById('role').value = user.role || "";
            }catch(err){
                alert(err.message || "Failed to load user");
                window.location.href = "user-list.html";
            }
        }

        window.addEventListener("load", () => {
            const form = document.getElementById('editUserForm');
            const companyInput = document.getElementById('company');
            const togglePassword = document.getElementById('togglePassword');
            const passwordInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eyeIcon');

            companyInput.style.textTransform = "uppercase";
            companyInput.addEventListener("input", () => {
                const pos = companyInput.selectionStart;
                companyInput.value = companyInput.value.toUpperCase();
                companyInput.setSelectionRange(pos, pos);
            });

            form.addEventListener('submit', async e => {
                e.preventDefault();
                const id = getUserId();
                const payload = {
                    username: document.getElementById('username').value.trim(),
                    email: document.getElementById('email').value.trim(),
                    role: document.getElementById('role').value,
                    company: document.getElementById('company').value.trim(),
                    department: document.getElementById('department').value.trim(),
                    telephone: document.getElementById('tel').value.trim()
                };
                const password = document.getElementById('password').value;
                if(password){
                    payload.password = password;
                }
                try{
                    await request(`/users/${id}`,"PUT",payload);
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

            loadUser();
        });
