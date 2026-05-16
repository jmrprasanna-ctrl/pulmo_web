function fmtDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function gpsLabel(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return "-";
  return `${nLat.toFixed(6)}, ${nLng.toFixed(6)}`;
}

async function getGpsPayload() {
  const hint = document.getElementById("gpsHint");
  if (!navigator.geolocation) {
    if (hint) hint.textContent = "Location: GPS not available on this device/browser.";
    return { lat: null, lng: null, accuracy: null };
  }
  if (hint) hint.textContent = "Location: Getting GPS...";
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos?.coords?.latitude);
        const lng = Number(pos?.coords?.longitude);
        const accuracy = Number(pos?.coords?.accuracy);
        if (hint) hint.textContent = `Location: ${gpsLabel(lat, lng)} (+/-${Number.isFinite(accuracy) ? Math.round(accuracy) : "-"}m)`;
        resolve({
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
        });
      },
      (_err) => {
        if (hint) hint.textContent = "Location: Unable to read GPS. Saving without location.";
        resolve({ lat: null, lng: null, accuracy: null });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

function renderStatusCard(latest, isCheckedIn) {
  document.getElementById("inoutUserName").value = String(localStorage.getItem("userName") || localStorage.getItem("userEmail") || "User");
  document.getElementById("inoutStatus").value = isCheckedIn ? "Checked In" : "Checked Out";
  document.getElementById("lastCheckInAt").value = fmtDateTime(latest?.check_in_at);
  document.getElementById("lastCheckOutAt").value = fmtDateTime(latest?.check_out_at);
  const checkInBtn = document.getElementById("checkInBtn");
  const checkOutBtn = document.getElementById("checkOutBtn");
  if (checkInBtn) checkInBtn.disabled = !!isCheckedIn;
  if (checkOutBtn) checkOutBtn.disabled = !isCheckedIn;
}

async function loadInOutState() {
  const status = await request("/hr/inout/status", "GET");
  renderStatusCard(status?.latest || null, !!status?.is_checked_in);
}

async function performCheckInOut(mode) {
  const isCheckIn = mode === "in";
  const btn = document.getElementById(isCheckIn ? "checkInBtn" : "checkOutBtn");
  if (btn) btn.disabled = true;
  try {
    const gps = await getGpsPayload();
    const endpoint = isCheckIn ? "/hr/inout/check-in" : "/hr/inout/check-out";
    const res = await request(endpoint, "POST", gps);
    if (window.showMessageBox) showMessageBox(res?.message || (isCheckIn ? "Check In saved." : "Time Out saved."));
    await loadInOutState();
  } catch (err) {
    if (window.showMessageBox) {
      showMessageBox(err.message || "Failed to save INOUT log.", "error");
    } else {
      alert(err.message || "Failed to save INOUT log.");
    }
    await loadInOutState();
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const inBtn = document.getElementById("checkInBtn");
  const outBtn = document.getElementById("checkOutBtn");
  inBtn?.addEventListener("click", () => performCheckInOut("in"));
  outBtn?.addEventListener("click", () => performCheckInOut("out"));
  loadInOutState();
});

