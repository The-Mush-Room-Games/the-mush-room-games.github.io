// Frame cap for 120 Hz screens (iPhone Pro Safari): the game misses most 8 ms deadlines there and stutters between 8, 17 and 25 ms frames.
// Runs the game on every other display frame instead, a steady 60. Loaded before the GameMaker script (tools/publish.sh adds the tag);
// game speed 60: sprite animations step once per tick, so the tick rate must be the real frame rate. When the runtime's own
// timer asks for a short wait (under 8 ms), the skip here still lands it on the next 60 Hz slot.
(function () {
	var raf = window.requestAnimationFrame.bind(window), last = -1e9;
	window.requestAnimationFrame = function (cb) {
		return raf(function tick(t) {
			if (t - last < 1000 / 60 - 4) { raf(tick); return; }     // a 120 Hz frame 8 ms after the last game frame: skip it
			last = t;
			cb(t);
		});
	};
})();
