// Pure Tiled .tmj reader for Pawn Run: shared by the browser (fetch loader) and node (fs loader).
// readMap(path, loadJson) -> { w, h, tw, cls, props, ground, raised, stairs, water, stairTiles, objects, images, tileLayers }
// Tile layers are read by NAME (Ground/Raised/Stairs/Water): any tile = 1. Missing layers = all zero.
// Image layers (interiors) come back as images: [{ name, image (path from the game root), x, y, props }], bottom to top.
// Any other tile layer (interiors: floor, walls) comes back in tileLayers: [{ name, props, tiles: [{ col, row, image, sx, sy, w, h, rects }] }],
// bottom to top; image is the sheet's path from the game root, sx/sy/w/h the tile's pixels in it, rects its collision shapes (tile px).
// roomShape(m) turns an interior into { floors, blocks } rects in world px: the `floor` layer's tiles (plus `floor` objects) and the
// `block` objects plus every collision shape of the tiles and tile objects.
// Note: Tiled may omit class members left at their default, so callers should apply their own defaults.
async function readMap(path, loadJson) {
  const dir = p => p.slice(0, p.lastIndexOf('/') + 1);
  const join = (base, rel) => {
    const out = [];
    for (const s of (dir(base) + rel).split('/')) { if (s === '..') out.pop(); else if (s !== '.') out.push(s); }
    return out.join('/');
  };
  const propsOf = a => { const o = {}; for (const p of a || []) o[p.name] = p.value; return o; };

  const map = await loadJson(path);
  if (map.infinite) throw new Error(path + ': infinite maps are not supported');
  const { width: w, height: h } = map;

  // tilesets, sorted by firstgid (external ones are resolved relative to the map)
  const sets = [];
  for (const ts of map.tilesets || []) {
    const d = ts.source ? await loadJson(join(path, ts.source)) : ts;
    const tiles = {};
    for (const t of d.tiles || []) tiles[t.id] = t;
    sets.push({ first: ts.firstgid, tiles, d, path: ts.source ? join(path, ts.source) : path });
  }
  sets.sort((a, b) => a.first - b.first);
  const tileOf = gid => {
    let s = null;
    for (const c of sets) if (c.first <= gid) s = c;
    return s && { local: gid - s.first, def: s.tiles[gid - s.first] || {}, set: s };
  };

  const FLIP_X = 0x80000000, MASK = 0x1fffffff;
  const out = { w, h, tw: map.tilewidth, images: [], tileLayers: [], cls: map.class || '', props: propsOf(map.properties),
    ground: new Uint8Array(w * h), raised: new Uint8Array(w * h), stairs: new Uint8Array(w * h), water: new Uint8Array(w * h),
    stairTiles: new Int16Array(w * h).fill(-1), objects: [] };
  const mask = { ground: 'ground', raised: 'raised', stairs: 'stairs', water: 'water' };

  const walk = layers => {
    for (const l of layers) {
      if (l.type === 'group') walk(l.layers);
      else if (l.type === 'tilelayer') {
        const m = mask[(l.name || '').toLowerCase()];
        if (l.chunks || typeof l.data === 'string' || l.encoding && l.encoding !== 'csv' || l.compression)
          throw new Error(path + ': layer ' + l.name + ' must be uncompressed CSV');
        if (l.width !== w || l.height !== h) throw new Error(path + ': layer ' + l.name + ' size differs from map');
        if (!m) {
          const tiles = [];
          l.data.forEach((g, i) => {
            const gid = (g >>> 0) & MASK, t = gid && tileOf(gid);
            if (!t || !t.set.d.image) return;              // image-collection tiles only make sense as objects
            const d = t.set.d, c = d.columns, tw = d.tilewidth, th = d.tileheight;
            tiles.push({ col: i % w, row: (i / w) | 0, image: join(t.set.path, d.image), sx: (t.local % c) * tw, sy: Math.floor(t.local / c) * th, w: tw, h: th, rects: rectsOf(t.def, tw, false) });
          });
          out.tileLayers.push({ name: l.name, props: propsOf(l.properties), tiles });
          continue;
        }
        l.data.forEach((g, i) => {
          const gid = (g >>> 0) & MASK;
          if (!gid) return;
          out[m][i] = 1;
          if (m === 'stairs') out.stairTiles[i] = tileOf(gid).local;
        });
      } else if (l.type === 'imagelayer') {
        if (l.visible !== false) out.images.push({ name: l.name, image: join(path, l.image), x: l.offsetx || 0, y: l.offsety || 0, props: propsOf(l.properties) });
      } else if (l.type === 'objectgroup') {
        for (const o of l.objects) out.objects.push(readObject(o));
      }
    }
  };

  // collision shapes drawn on the tile in Tiled's collision editor, in image pixels from the frame's top-left
  // (rectangles and ellipses count as their bounding box; mirrored with the object)
  const rectsOf = (def, w, flipX) => ((def.objectgroup && def.objectgroup.objects) || []).filter(r => r.width > 0 && r.height > 0)
    .map(r => ({ x: flipX ? w - r.x - r.width : r.x, y: r.y, w: r.width, h: r.height }));

  function readObject(o) {
    if (o.gid) {
      const t = tileOf((o.gid >>> 0) & MASK), def = t ? t.def : {};
      const props = { ...propsOf(def.properties), ...propsOf(o.properties) };
      // art added in Tiled without a key property is named after its file, the same way Boot loads it
      const key = props.key || (def.image ? def.image.split('/').pop().replace(/\.png$/i, '') : undefined), bl = props.block;
      delete props.key; delete props.block;
      const block = bl ? String(bl).split(',').map(Number) : [0, 0];
      const flipX = !!((o.gid >>> 0) & FLIP_X), w = def.width || def.imagewidth || o.width, h = def.height || def.imageheight || o.height;
      const rects = rectsOf(def, w, flipX);
      return { key, image: def.image && join(t.set.path, def.image), x: o.x, y: o.y, w, h, flipX, cls: o.class || o.type || def.class || def.type || '', props, block, rects };
    }
    return { cls: o.class || o.type || '', name: o.name || '', x: o.x, y: o.y, w: o.width || 0, h: o.height || 0, props: propsOf(o.properties), ...(o.polygon && { poly: o.polygon }) };   // poly: points from x, y (a camp drawn as a shape)
  }

  walk(map.layers || []);
  for (let i = 0; i < w * h; i++) if (out.water[i]) out.ground[i] = out.raised[i] = 0;   // painted water wins
  return out;
}

// ponytail: a tile object is drawn bottom-centre at x,y (objectalignment bottom); a tile of the `floor` layer is a full cell
function roomShape(m) {
  const rect = (r, x, y) => ({ x: x + r.x, y: y + r.y, w: r.w, h: r.h });
  const floors = m.objects.filter(o => o.cls === 'floor'), blocks = m.objects.filter(o => o.cls === 'block');
  for (const l of m.tileLayers) for (const t of l.tiles) {
    const x = t.col * m.tw, y = t.row * m.tw;
    if (l.name.toLowerCase() === 'floor') floors.push({ x, y, w: m.tw, h: m.tw });
    for (const r of t.rects) blocks.push(rect(r, x, y));
  }
  for (const o of m.objects) for (const r of o.rects || []) blocks.push(rect(r, o.x - o.w / 2, o.y - o.h));
  return { floors, blocks };
}

if (typeof module === 'object') module.exports = { readMap, roomShape };
