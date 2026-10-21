// Writes maps/_template.tmj: blank 30x30 map with the right layers and tilesets. Copy it for each new landmark or set.
// Run: node tiled/make-template.js   (Tiled puts a missing preview layer at the TOP of a map, so start from this file)
const fs = require('fs'), path = require('path');
const C = require('./common.js');
const W = 30, H = 30;
const layer = (id, name) => name === 'Objects'
  ? { id, name, type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: [] }
  : { id, name, type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: new Array(W * H).fill(0) };
const map = {
  type: 'map', version: '1.10', tiledversion: '1.12.2', class: 'chunk', orientation: 'orthogonal', renderorder: 'right-down',
  infinite: false, compressionlevel: -1, width: W, height: H, tilewidth: 64, tileheight: 64, backgroundcolor: C.BG,
  nextlayerid: C.LAYERS.length + 1, nextobjectid: 1,
  properties: [{ name: 'kind', type: 'string', propertytype: 'chunkKind', value: 'landmark' }, { name: 'biomes', type: 'string', value: '' },
    { name: 'minIsland', type: 'int', value: 1 }, { name: 'weight', type: 'float', value: 1 }, { name: 'mirror', type: 'bool', value: false }],
  tilesets: C.tilesets(), layers: C.LAYERS.map((n, i) => layer(i + 1, n)),
};
fs.writeFileSync(path.join(__dirname, '../maps/_template.tmj'), JSON.stringify(map, null, 1) + '\n');
console.log('maps/_template.tmj written');
