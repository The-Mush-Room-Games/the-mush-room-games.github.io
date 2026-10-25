// iOS Safari treats a held finger as "select text" (the magnifier loupe and the copy callout) and pinches / double taps as zoom, which steals a held block.
// Nothing on the page is selectable or zoomable; the game's own touch handling (on the canvas) is untouched. Loaded before the game script by tools/publish.sh.
(function () {
    var css = "html,body,canvas,div{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:none;overscroll-behavior:none}";
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    var stop = function (e) { e.preventDefault(); };
    ["contextmenu", "selectstart", "gesturestart", "gesturechange", "gestureend", "dblclick"].forEach(function (t) { document.addEventListener(t, stop, { passive: false }); });
    document.addEventListener("touchmove", stop, { passive: false });          // no page scroll or rubber-band under a dragging thumb
})();
