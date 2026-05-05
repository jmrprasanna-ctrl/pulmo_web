/*
  System: PULMO WEB SYSTEM
  Owner : CRONIT SOLLUTIONS
  Author: JMR Prasanna
*/
(function () {
    "use strict";

    var LOADER_DELAY_MS = 1800;
    var titleEl = document.querySelector(".loading-text");
    var baseText = "Starting PULMO WEB SYSTEM";
    var dotFrame = 0;

    if (titleEl) {
        window.setInterval(function () {
            dotFrame = (dotFrame + 1) % 4;
            titleEl.textContent = baseText + ".".repeat(dotFrame);
        }, 350);
    }

    window.setTimeout(function () {
        window.location.replace("login.html");
    }, LOADER_DELAY_MS);
})();
