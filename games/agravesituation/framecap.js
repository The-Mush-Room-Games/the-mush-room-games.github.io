// Frame cap for 120 Hz screens (iPhone Pro Safari): the game misses most 8 ms deadlines there and stutters between 8, 17 and 25 ms frames.
// Runs the game on every other display frame instead, a steady 60. Loaded before the GameMaker script (tools/publish.sh adds the tag);
// the game speed is 120, so the runtime itself never waits and only this decides the rate. ?fps=120 turns the cap off.
(function () {
	if (/[?&]fps=120\b/.test(location.search)) return;
	var raf = window.requestAnimationFrame.bind(window), last = -1e9;
	window.requestAnimationFrame = function (cb) {
		return raf(function tick(t) {
			if (t - last < 1000 / 60 - 4) { raf(tick); return; }     // a 120 Hz frame 8 ms after the last game frame: skip it
			last = t;
			cb(t);
		});
	};
})();
