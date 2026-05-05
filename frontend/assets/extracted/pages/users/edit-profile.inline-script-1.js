function getTargetUserId(){
    const params = new URLSearchParams(window.location.search);
    return params.get("userId") || params.get("id");
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
    if(!preview || !token) return;

    try{
        const apiBase = (window.BASE_URL || `${window.location.origin.replace(/\/+$/, "")}/api`).replace(/\/+$/, "");
        const res = await fetch(`${apiBase}/users/profiles/${encodeURIComponent(userId)}/picture?t=${Date.now()}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if(!res.ok){
            if(!preserveOnFail){
                setPreviewFallback(fallbackName);
            }
            return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        preview.src = objectUrl;
    }catch(_err){
        if(!preserveOnFail){
            setPreviewFallback(fallbackName);
        }
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
        setPreviewFallback(profile.profile_name || profile.login_user || "U");
        await loadProfilePicture(userId, { fallbackName: profile.profile_name || profile.login_user || "U" });
    }catch(err){
        alert(err.message || "Failed to load profile");
        window.location.href = "profile-list.html";
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    if(typeof window.__waitForUserAccessPermissions === "function"){
        await window.__waitForUserAccessPermissions();
    }

    const form = document.getElementById("editProfileForm");
    const pictureInput = document.getElementById("profilePictureFile");
    const userId = Number(getTargetUserId() || 0);

    if(form){
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

    if(pictureInput){
        pictureInput.addEventListener("change", async (event) => {
            const file = event.target.files && event.target.files[0];
            if(!file) return;
            try{
                const fileDataBase64 = await toBase64(file);
                const preview = document.getElementById("profilePicturePreview");
                if(preview){
                    // Show selected photo immediately so company logo does not flash back.
                    preview.src = fileDataBase64;
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
