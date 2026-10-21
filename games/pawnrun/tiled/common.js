// Shared by make-rules.js, make-test-map.js, make-template.js: tileset ids and layer order of every Pawn Run map.
const SETS = [ // [name, file in maps/, tile count]; firstgids are assigned in this order
  ['low', 'terrain.tsj', 54], ['high', 'terrain-high.tsj', 54], ['water', 'water.tsj', 1],
  ['foam', 'foam.tsj', 16], ['shadow', 'shadow.tsj', 1], ['objects', 'objects.tsj', 0],
];
const FIRST = {}; let n = 1;
for (const [name, , count] of SETS) { FIRST[name] = n; n += count; }
module.exports = {
  FIRST,
  BG: '#47aba9', // the game's camera colour: the water
  tilesets: (prefix = '') => SETS.map(([name, file]) => ({ firstgid: FIRST[name], source: prefix + file })),
  // bottom to top, as the game draws them
  LAYERS: ['Water', 'Foam (preview)', 'Ground', 'Shadows (preview)', 'Raised', 'Cliffs (preview)', 'Stairs', 'Objects'],
};
