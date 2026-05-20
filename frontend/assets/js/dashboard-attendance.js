(function () {
    const timeInBtn = document.getElementById("topbarTimeInBtn");
    const timeOutBtn = document.getElementById("topbarTimeOutBtn");
    if (!timeInBtn || !timeOutBtn) return;

    let latestStatus = null;
    timeInBtn.disabled = true;
    timeOutBtn.disabled = true;

    function isMobileDevice() {
        const ua = String(navigator.userAgent || "").toLowerCase();
        return /android|iphone|ipad|ipod|windows phone|mobile/.test(ua);
    }

    async function getGpsPayload() {
        if (!isMobileDevice()) {
            return { lat: null, lng: null, accuracy: null, location_label: "Computer" };
        }

        if (!navigator.geolocation) {
            return { lat: null, lng: null, accuracy: null, location_label: "Mobile" };
        }

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = Number(pos?.coords?.latitude);
                    const lng = Number(pos?.coords?.longitude);
                    const accuracy = Number(pos?.coords?.accuracy);
                    resolve({
                        lat: Number.isFinite(lat) ? lat : null,
                        lng: Number.isFinite(lng) ? lng : null,
                        accuracy: Number.isFinite(accuracy) ? accuracy : null,
                        location_label: "GPS",
                    });
                },
                () => {
                    resolve({ lat: null, lng: null, accuracy: null, location_label: "Mobile" });
                },
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
            );
        });
    }

    function setButtonBusy(btn, busy) {
        if (!btn) return;
        btn.dataset.busy = busy ? "1" : "0";
        btn.classList.toggle("is-busy", !!busy);
    }

    function syncAttendanceButtons(status) {
        const hasTodayIn = !!status?.has_today_in;
        const hasTodayOut = !!status?.has_today_out;
        const canIn = typeof status?.can_check_in_today === "boolean"
            ? status.can_check_in_today
            : !hasTodayIn;
        const canOut = typeof status?.can_check_out_today === "boolean"
            ? status.can_check_out_today
            : (hasTodayIn && !hasTodayOut);

        const inBusy = timeInBtn.dataset.busy === "1";
        const outBusy = timeOutBtn.dataset.busy === "1";

        timeInBtn.disabled = inBusy || !canIn;
        timeOutBtn.disabled = outBusy || !canOut;

        timeInBtn.classList.toggle("is-locked", !canIn);
        timeOutBtn.classList.toggle("is-locked", !canOut);

        timeInBtn.title = hasTodayIn ? "Today's Time In already saved." : "Save today's Time In";
        if (hasTodayOut) {
            timeOutBtn.title = "Today's Time Out already saved.";
        } else if (!hasTodayIn) {
            timeOutBtn.title = "Save Time In first.";
        } else {
            timeOutBtn.title = "Save today's Time Out";
        }
    }

    async function loadAttendanceStatus(silent) {
        try {
            latestStatus = await request("/hr/inout/status", "GET");
            syncAttendanceButtons(latestStatus);
        } catch (err) {
            if (!silent) {
                const msg = err?.message || "Failed to load Time In/Out status.";
                if (window.showMessageBox) {
                    showMessageBox(msg, "error");
                } else {
                    alert(msg);
                }
            }
            syncAttendanceButtons(latestStatus || {});
        }
    }

    async function submitAttendance(mode) {
        const isIn = mode === "in";
        const activeBtn = isIn ? timeInBtn : timeOutBtn;
        const endpoint = isIn ? "/hr/inout/check-in" : "/hr/inout/check-out";
        setButtonBusy(activeBtn, true);
        syncAttendanceButtons(latestStatus || {});

        try {
            const gpsPayload = await getGpsPayload();
            const res = await request(endpoint, "POST", gpsPayload);
            if (window.showMessageBox) {
                showMessageBox(res?.message || (isIn ? "Time In saved." : "Time Out saved."));
            }
            await loadAttendanceStatus(false);
        } catch (err) {
            const msg = err?.message || (isIn ? "Failed to save Time In." : "Failed to save Time Out.");
            if (window.showMessageBox) {
                showMessageBox(msg, "error");
            } else {
                alert(msg);
            }
            await loadAttendanceStatus(true);
        } finally {
            setButtonBusy(activeBtn, false);
            syncAttendanceButtons(latestStatus || {});
        }
    }

    timeInBtn.addEventListener("click", () => submitAttendance("in"));
    timeOutBtn.addEventListener("click", () => submitAttendance("out"));

    loadAttendanceStatus(true);
    window.setInterval(() => {
        if (timeInBtn.dataset.busy === "1" || timeOutBtn.dataset.busy === "1") return;
        loadAttendanceStatus(true);
    }, 60000);
})();
