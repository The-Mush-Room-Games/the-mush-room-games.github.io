// Frame cap for 120 Hz screens (iPhone Pro Safari): the game misses most 8 ms deadlines there and stutters between 8, 17 and 25 ms frames.
// Runs the game on every other display frame instead, a steady 60. Loaded before the GameMaker script (tools/publish.sh adds the tag);
// game speed 60: sprite animations step once per tick, so the tick rate must be the real frame rate. When the runtime's own
// timer asks for a short wait (under 8 ms), the skip here still lands it on the next 60 Hz slot.
// ?perf in the URL shows a meter (top left, each second): display Hz, game fps, JS ms per game frame (avg / max, ALL of the runtime's work),
// and the gaps between game frames in buckets (<20 ms, <30, <45, longer). Long gaps with low JS ms are the GPU or the browser, not our code.
(function () {
	var raf = window.requestAnimationFrame.bind(window), last = -1e9;
	var perf = /[?&]perf\b/.test(location.search), box, hz = 0, n = 0, js = 0, jsMax = 0, g = [0, 0, 0, 0], t0 = performance.now();
	window.requestAnimationFrame = function (cb) {
		return raf(function tick(t) {
			hz++;
			if (t - last < 1000 / 60 - 4) { raf(tick); return; }     // a 120 Hz frame 8 ms after the last game frame: skip it
			var gap = t - last;
			last = t;
			if (!perf) { cb(t); return; }
			var s = performance.now();
			cb(t);
			var d = performance.now() - s;
			n++; js += d; jsMax = Math.max(jsMax, d);
			g[gap < 20 ? 0 : gap < 30 ? 1 : gap < 45 ? 2 : 3]++;
			if (s - t0 >= 1000) {
				if (!box) { box = document.createElement("div"); box.style.cssText = "position:fixed;left:4px;top:4px;z-index:9;pointer-events:none;font:12px monospace;color:#fff;background:rgba(0,0,0,.6);padding:3px 5px;white-space:pre"; document.body.appendChild(box); }
				var sec = (s - t0) / 1000;
				box.textContent = "HZ " + Math.round(hz / sec) + "  FPS " + Math.round(n / sec) + "\nJS " + (js / n).toFixed(1) + " / " + jsMax.toFixed(0) + " ms\nGAPS " + g.join(" ");
				t0 = s; hz = 0; n = 0; js = 0; jsMax = 0; g = [0, 0, 0, 0];
			}
		});
	};
})();
