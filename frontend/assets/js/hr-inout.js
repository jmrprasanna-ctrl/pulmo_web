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

function isMobileDevice() {
  const ua = String(navigator.userAgent || "").toLowerCase();
  return /android|iphone|ipad|ipod|windows phone|mobile/.test(ua);
}

async function getGpsPayload() {
  const hint = document.getElementById("gpsHint");
  const mobile = isMobileDevice();
  if (!mobile) {
    if (hint) hint.textContent = "Location: Computer";
    return { lat: null, lng: null, accuracy: null, location_label: "Computer" };
  }
  if (!navigator.geolocation) {
    if (hint) hint.textContent = "Location: Mobile (GPS not available).";
    return { lat: null, lng: null, accuracy: null, location_label: "Mobile" };
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
          location_label: "GPS",
        });
      },
      (_err) => {
        if (hint) hint.textContent = "Location: Mobile (GPS blocked/unavailable).";
        resolve({ lat: null, lng: null, accuracy: null, location_label: "Mobile" });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

function renderStatusCard(status) {
  const latest = status?.latest || null;
  const isCheckedIn = !!status?.is_checked_in;
  const hasTodayIn = !!status?.has_today_in;
  const hasTodayOut = !!status?.has_today_out;
  const canCheckIn = typeof status?.can_check_in_today === "boolean"
    ? status.can_check_in_today
    : !hasTodayIn;
  const canCheckOut = typeof status?.can_check_out_today === "boolean" ? status.can_check_out_today : (hasTodayIn && !hasTodayOut);

  document.getElementById("inoutUserName").value = String(localStorage.getItem("userName") || localStorage.getItem("userEmail") || "User");
  if (isCheckedIn) {
    document.getElementById("inoutStatus").value = "Checked In";
  } else if (hasTodayOut) {
    document.getElementById("inoutStatus").value = "Completed Today";
  } else {
    document.getElementById("inoutStatus").value = "Checked Out";
  }
  document.getElementById("lastCheckInAt").value = fmtDateTime(latest?.check_in_at);
  document.getElementById("lastCheckOutAt").value = fmtDateTime(latest?.check_out_at);
  const checkInBtn = document.getElementById("checkInBtn");
  const checkOutBtn = document.getElementById("checkOutBtn");
  if (checkInBtn) {
    checkInBtn.disabled = !canCheckIn;
    checkInBtn.title = hasTodayIn ? "Today's Time In already saved." : "Save today's Time In";
  }
  if (checkOutBtn) {
    checkOutBtn.disabled = !canCheckOut;
    checkOutBtn.title = hasTodayOut
      ? "Today's Time Out already saved."
      : (hasTodayIn ? "Save today's Time Out" : "Save Time In first.");
  }
}

async function loadInOutState() {
  const status = await request("/hr/inout/status", "GET");
  renderStatusCard(status || {});
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
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const inBtn = document.getElementById("checkInBtn");
  const outBtn = document.getElementById("checkOutBtn");
  inBtn?.addEventListener("click", () => performCheckInOut("in"));
  outBtn?.addEventListener("click", () => performCheckInOut("out"));
  loadInOutState();
});

