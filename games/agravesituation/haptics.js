// Haptics for the HTML5 build (GML side: scripts/scr_haptics). Loaded before the game script by tools/publish.sh (and tools/serve.py for local checks).
// GameMaker's resource tool cannot make extensions, and .yy files are never hand-edited, so GML talks to this file through the console: haptic() calls
// show_debug_message("@@hap:<0|1|2>") (light, medium, heavy), the pause menu's toggle sends "@@hapon:<0|1>", and the touch buttons' circles go out as
// "@@hapz:<view w>,<view h>|<x>,<y>,<r>|..." (GUI px) so a touch that starts on ATTACK, DASH or BLOCK can tick an iPhone from inside its own gesture.
// Every path feature-detects and fails silently:
//   Android / Chrome  navigator.vibrate(pattern)
//   gamepads          gamepad.vibrationActuator.playEffect("dual-rumble", ...)  (Chrome, Edge, Safari)
//   iPhone (iOS 18+)  a hidden <input type="checkbox" switch> inside a <label>; label.click() inside a real touch handler gives the system's tick.
//                     It only works from a user gesture, so it is NOT used for the combat events (hits, slams: they come from the game loop), only for the hero's own presses, at touch time.
(function () {
    var on = true, zones = [], vw = 0, vh = 0;
    var ua = navigator.userAgent || "";
    var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var canVibrate = typeof navigator.vibrate === "function";
    var PAT = [[12], [26], [40, 24, 60]];                                                   // vibrate patterns: light, medium, heavy (ms)
    var RUMBLE = [{ duration: 40, weakMagnitude: 0.35, strongMagnitude: 0.0 }, { duration: 90, weakMagnitude: 0.6, strongMagnitude: 0.35 }, { duration: 170, weakMagnitude: 0.7, strongMagnitude: 0.9 }];

    var label = null;
    function iosTick() {                                                                     // call from inside a touch / click handler only
        try {
            if (!label) {
                label = document.createElement("label");
                label.setAttribute("aria-hidden", "true");
                label.style.display = "none";
                var input = document.createElement("input");
                input.type = "checkbox";
                input.setAttribute("switch", "");
                label.appendChild(input);
                document.head.appendChild(label);
            }
            label.click();
        } catch (e) { }
    }

    function pulse(level) {
        if (!on) return;
        level = level < 0 ? 0 : level > 2 ? 2 : level | 0;
        try { if (canVibrate) navigator.vibrate(PAT[level]); } catch (e) { }
        try {
            var pads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (var i = 0; i < pads.length; i++) {
                var p = pads[i], a = p && p.vibrationActuator;
                if (a && a.playEffect) a.playEffect("dual-rumble", { startDelay: 0, duration: RUMBLE[level].duration, weakMagnitude: RUMBLE[level].weakMagnitude, strongMagnitude: RUMBLE[level].strongMagnitude }).catch(function () { });
            }
        } catch (e) { }
    }

    // GML -> JS: the console
    var log = console.log;
    console.log = function () {
        try {
            var s = arguments[0];
            if (typeof s === "string" && s.charCodeAt(0) === 64 && s.charCodeAt(1) === 64) {               // "@@"
                if (s.indexOf("@@hap:") === 0) { pulse(parseInt(s.slice(6), 10)); return; }
                if (s.indexOf("@@hapon:") === 0) { on = s.charAt(8) !== "0"; return; }
                if (s.indexOf("@@hapz:") === 0) {
                    var parts = s.slice(7).split("|"), head = parts[0].split(",");
                    vw = +head[0]; vh = +head[1]; zones = [];
                    for (var i = 1; i < parts.length; i++) { var z = parts[i].split(","); if (z.length === 3) zones.push([+z[0], +z[1], +z[2]]); }
                    return;
                }
            }
        } catch (e) { }
        return log.apply(console, arguments);
    };
    window.__haptic = pulse;                                                                          // for the console: __haptic(0..2)

    // iPhone: a touch that starts on one of the hero's buttons ticks at once, inside the gesture
    if (ios) {
        window.addEventListener("touchstart", function (e) {
            if (!on || !zones.length || !vw) return;
            var cv = document.querySelector("canvas");
            if (!cv) return;
            var r = cv.getBoundingClientRect();
            for (var t = 0; t < e.changedTouches.length; t++) {
                var tc = e.changedTouches[t], gx = (tc.clientX - r.left) / r.width * vw, gy = (tc.clientY - r.top) / r.height * vh;
                for (var i = 0; i < zones.length; i++) {
                    var z = zones[i], dx = gx - z[0], dy = gy - z[1];
                    if (dx * dx + dy * dy <= z[2] * z[2]) { iosTick(); return; }
                }
            }
        }, { capture: true, passive: true });
    }
})();
