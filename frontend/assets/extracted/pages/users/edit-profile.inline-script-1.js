function getTargetUserId(){
    const params = new URLSearchParams(window.location.search);
    return params.get("userId") || params.get("id");
}

function isViewOnlyMode(){
    const params = new URLSearchParams(window.location.search);
    const mode = String(params.get("mode") || "").trim().toLowerCase();
    return mode === "view" || mode === "readonly";
}

function safeText(value){
    return String(value || "").trim();
}

function getInitials(name){
    const parts = safeText(name).split(/\s+/).filter(Boolean);
    if(parts.length === 0) return "U";
    if(parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function buildAvatarDataUri(label){
    const text = encodeURIComponent(String(label || "U").slice(0, 2).toUpperCase());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" rx="20" ry="20" fill="#e8f2ff"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="700" fill="#0d4f90">${text}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function setPreviewFallback(name){
    const preview = document.getElementById("profilePicturePreview");
    if(!preview) return;
    preview.src = buildAvatarDataUri(getInitials(name));
    preview.style.visibility = "visible";
}

function syncViewOnlyFieldHeights(){
    if(!isViewOnlyMode()) return;
    const textareas = document.querySelectorAll("#editProfileForm textarea");
    textareas.forEach((el) => {
        el.style.height = "auto";
        const next = Math.max(el.scrollHeight, 28);
        el.style.height = `${next}px`;
    });
}

function toBase64(file){
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read selected image"));
        reader.readAsDataURL(file);
    });
}

async function loadProfilePicture(userId, options = {}){
    const preview = document.getElementById("profilePicturePreview");
    const token = localStorage.getItem("token");
    const preserveOnFail = Boolean(options && options.preserveOnFail);
    const fallbackName = safeText(options && options.fallbackName);
    const directPictureUrl = safeText(options && options.pictureUrl);
    if(!preview || !token) return;

    try{
        const apiBase = (window.BASE_URL || `${window.location.origin.replace(/\/+$/, "")}/api`).replace(/\/+$/, "");
        const originBase = window.location.origin.replace(/\/+$/, "");
        let endpoint = "";
        if(directPictureUrl){
            if(directPictureUrl.startsWith("http")){
                endpoint = directPictureUrl;
            }else if(directPictureUrl.startsWith("/api/")){
                endpoint = `${originBase}${directPictureUrl}`;
            }else if(directPictureUrl.startsWith("/")){
                endpoint = `${originBase}/api${directPictureUrl}`;
            }else{
                endpoint = `${apiBase}/${directPictureUrl}`;
            }
        }else{
            endpoint = `${apiBase}/users/profiles/${encodeURIComponent(userId)}/picture`;
        }
        const res = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}t=${Date.now()}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if(!res.ok){
            if(!preserveOnFail){
                setPreviewFallback(fallbackName);
            }
            preview.style.visibility = "visible";
            return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        preview.src = objectUrl;
        preview.style.visibility = "visible";
    }catch(_err){
        if(!preserveOnFail){
            setPreviewFallback(fallbackName);
        }
        preview.style.visibility = "visible";
    }
}

async function loadProfile(){
    const userId = Number(getTargetUserId() || 0);
    if(!Number.isFinite(userId) || userId <= 0){
        alert("Missing user id");
        window.location.href = "profile-list.html";
        return;
    }

    try{
        const profile = await request(`/users/profiles/${userId}`, "GET");
        document.getElementById("profile_name").value = profile.profile_name || "";
        document.getElementById("address").value = profile.address || "";
        document.getElementById("mobile").value = profile.mobile || "";
        document.getElementById("id_number").value = profile.id_number || "";
        document.getElementById("emergency_contact_no").value = profile.emergency_contact_no || "";
        document.getElementById("authoris_officer").value = profile.authoris_officer || "";
        document.getElementById("metaLoginUser").innerText = profile.login_user || "-";
        document.getElementById("metaEmail").innerText = profile.email || "-";
        document.getElementById("metaDepartment").innerText = profile.department || "-";
        const fallbackName = profile.profile_name || profile.login_user || "U";
        const hasUploadedPicture = Boolean(safeText(profile.picture_url));
        const preview = document.getElementById("profilePicturePreview");
        if(hasUploadedPicture && preview){
            // Avoid initial-letter flicker before real image is fetched.
            preview.style.visibility = "hidden";
        }else{
            setPreviewFallback(fallbackName);
        }
        await loadProfilePicture(userId, {
            fallbackName,
            pictureUrl: profile.picture_url || ""
        });

        if(isViewOnlyMode()){
            const titleEl = document.querySelector(".page-head h2");
            if(titleEl){
                titleEl.innerText = "Profile View";
            }
            syncViewOnlyFieldHeights();
        }
    }catch(err){
        alert(err.message || "Failed to load profile");
        window.location.href = "profile-list.html";
    }
}

function applyViewOnlyState(){
    if(!isViewOnlyMode()) return;
    const form = document.getElementById("editProfileForm");
    if(!form) return;
    form.querySelectorAll("input, textarea, select").forEach((el) => {
        if(el.id === "profilePictureFile"){
            el.disabled = true;
            return;
        }
        el.setAttribute("readonly", "readonly");
        el.removeAttribute("disabled");
        el.classList.add("view-only-text");
    });
    const pictureActions = document.querySelector(".profile-picture-actions");
    if(pictureActions){
        pictureActions.style.display = "none";
    }
    const formActions = document.querySelector(".form-actions");
    if(formActions){
        formActions.style.display = "none";
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    applyViewOnlyState();

    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }

    const form = document.getElementById("editProfileForm");
    const pictureInput = document.getElementById("profilePictureFile");
    const userId = Number(getTargetUserId() || 0);
    const readOnly = isViewOnlyMode();

    if(form && !readOnly){
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            try{
                await request(`/users/profiles/${userId}`, "PUT", {
                    profile_name: document.getElementById("profile_name").value.trim(),
                    address: document.getElementById("address").value.trim(),
                    mobile: document.getElementById("mobile").value.trim(),
                    id_number: document.getElementById("id_number").value.trim(),
                    emergency_contact_no: document.getElementById("emergency_contact_no").value.trim(),
                    authoris_officer: document.getElementById("authoris_officer").value.trim()
                });
                showMessageBox("Profile saved successfully");
                window.location.href = "profile-list.html";
            }catch(err){
                alert(err.message || "Failed to save profile");
            }
        });
    }

    if(pictureInput && !readOnly){
        pictureInput.addEventListener("change", async (event) => {
            const file = event.target.files && event.target.files[0];
            if(!file) return;
            try{
                const fileDataBase64 = await toBase64(file);
                const preview = document.getElementById("profilePicturePreview");
                if(preview){
                    // Show selected photo immediately so company logo does not flash back.
                    preview.src = fileDataBase64;
                    preview.style.visibility = "visible";
                }
                await request(`/users/profiles/${userId}/picture`, "POST", {
                    fileName: file.name,
                    fileDataBase64
                });
                showMessageBox("Profile picture uploaded");
                await loadProfilePicture(userId, {
                    preserveOnFail: true,
                    fallbackName: document.getElementById("profile_name")?.value || document.getElementById("metaLoginUser")?.innerText || "U"
                });
            }catch(err){
                alert(err.message || "Failed to upload profile picture");
            }finally{
                pictureInput.value = "";
            }
        });
    }

    await loadProfile();
});
