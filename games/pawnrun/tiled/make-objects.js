// Builds maps/objects.tsj (image-collection tileset) from src/assets.js. Re-runnable: node tiled/make-objects.js
// One tile per placeable asset, showing only its first frame; objectalignment=bottom => object x,y = bottom centre.
// Re-running keeps each tile's id (maps refer to tiles by id), any properties or class edited in Tiled, and tiles
// added in Tiled that aren't in assets.js. New assets get new ids at the end.
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const { ASSETS } = require(path.join(R, 'src/assets.js'));

const GROUPS = ['props', 'town', 'enemies', 'pickups'];
const EXTRA = k => /^water-rocks\d+$/.test(k) || k === 'obridge'; // terrain-group extras
const ENEMY = k => /-idle$/.test(k) || k === 'acorn';              // placeable enemy markers (other sheets are just art)

// walkability footprint "w,h" in tiles at the base; 0,0 = walkable
function block(group, key, w) {
  if (group === 'town' && !/-idle$/.test(key)) return `${Math.round(w / 64)},2`; // buildings
  if (/^(tree|stump|rock|gold-stone)\d/.test(key) && !/highlight/.test(key) || key === 'dead-tree') return '1,1';
  if (/^(gnome-hut|gnome-tower|cave)$/.test(key)) return `${Math.round(w / 64)},2`;
  return '0,0';
}
function pngSize(f) {
  const b = fs.readFileSync(f);
  if (b.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG: ' + f);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
const str = (name, value) => ({ name, type: 'string', value });

const OUT = path.join(R, 'maps/objects.tsj');
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).tiles || [] : [];
const keyOf = t => (t.properties || []).find(p => p.name === 'key')?.value || t.image.split('/').pop().replace(/\.png$/i, '');
const prev = new Map(old.map(t => [keyOf(t), t]));
let nextId = old.reduce((m, t) => Math.max(m, t.id + 1), 0);

const tiles = [];
for (const [key, [file, fw, fh]] of Object.entries(ASSETS)) {
  const group = file.split('/')[0];
  if (!GROUPS.includes(group) && !EXTRA(key)) continue;
  const [iw, ih] = pngSize(path.join(R, 'assets', file));
  const w = fw || iw, h = fh || ih;
  const t = { id: -1, image: '../assets/' + file, imagewidth: iw, imageheight: ih, x: 0, y: 0, width: w, height: h,
    properties: [str('key', key), str('block', block(group, key, w))] };
  if (group === 'enemies' && ENEMY(key)) { t.type = 'enemy'; t.properties.push(str('kind', key)); }  // Tiled 1.10+ calls a tile's class "type"
  const p = prev.get(key);
  if (p) {                                     // existing tile: same id, and Tiled edits win over the defaults
    t.id = p.id; t.properties = p.properties || t.properties;
    if (p.type || p.class) { t.type = p.type || p.class; }
    prev.delete(key);
  } else t.id = nextId++;
  tiles.push(t);
}
tiles.push(...prev.values());                  // art added in Tiled that assets.js doesn't list: keep as is
tiles.sort((a, b) => a.id - b.id);
const ts = {
  type: 'tileset', name: 'objects', tiledversion: '1.12.2', version: '1.10', objectalignment: 'bottom',
  columns: 0, tilecount: tiles.length, margin: 0, spacing: 0,
  tilewidth: Math.max(...tiles.map(t => t.width)), tileheight: Math.max(...tiles.map(t => t.height)),
  grid: { orientation: 'orthogonal', width: 1, height: 1 }, tiles,
};
fs.writeFileSync(OUT, JSON.stringify(ts, null, 1) + '\n');
console.log('objects.tsj:', tiles.length, 'tiles');
