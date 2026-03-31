window.addEventListener("DOMContentLoaded", loadSales);

        function logout(){
            localStorage.removeItem("token");
            localStorage.removeItem("role");
            window.location.href="../login.html";
        }
