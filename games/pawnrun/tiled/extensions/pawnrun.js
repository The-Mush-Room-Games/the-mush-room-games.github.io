// Pawn Run Tiled extension: Map > "Rebuild terrain previews" (Ctrl+Shift+M).
// Automapping adds preview tiles (foam, shadows, cliffs) but never removes old ones, so after you erase land or
// raised ground, run this: it clears those three layers (creating them in the right place if missing) and automaps.
const PREVIEW = ['Foam (preview)', 'Shadows (preview)', 'Cliffs (preview)'];
const BEFORE = { 'Foam (preview)': 'Ground', 'Shadows (preview)': 'Raised', 'Cliffs (preview)': 'Stairs' }; // layer each sits just under

function rebuild(map) {
  map.macro('Rebuild terrain previews', () => {
    for (const name of PREVIEW) {
      let layer = map.layers.find(l => l.name === name);
      if (!layer) {
        const anchor = map.layers.findIndex(l => l.name === BEFORE[name]);
        layer = new TileLayer(name);
        layer.width = map.width; layer.height = map.height;
        map.insertLayerAt(anchor < 0 ? map.layerCount : anchor, layer);
      }
      const e = layer.edit();
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (layer.tileAt(x, y)) e.setTile(x, y, null);
      e.apply();
    }
    map.autoMap();
  });
}

if (typeof tiled.registerAction === 'function') {
  const action = tiled.registerAction('PawnRunRebuild', () => {
    const map = tiled.activeAsset;
    if (map && map.isTileMap) rebuild(map);
  });
  action.text = 'Rebuild terrain previews';
  action.shortcut = 'Ctrl+Shift+M';
  tiled.extendMenu('Map', [{ action: 'PawnRunRebuild', before: 'AutoMap' }]);
}
if (typeof module !== 'undefined') module.exports = { rebuild };
