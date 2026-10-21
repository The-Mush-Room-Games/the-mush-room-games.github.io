// Pure Tiled .tmj reader for Pawn Run: shared by the browser (fetch loader) and node (fs loader).
// readMap(path, loadJson) -> { w, h, tw, cls, props, ground, raised, stairs, water, stairTiles, objects, images }
// Tile layers are read by NAME (Ground/Raised/Stairs/Water): any tile = 1. Missing layers = all zero.
// Image layers (interiors) come back as images: [{ name, image (path from the game root), x, y, props }], bottom to top.
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
    sets.push({ first: ts.firstgid, tiles });
  }
  sets.sort((a, b) => a.first - b.first);
  const tileOf = gid => {
    let s = null;
    for (const c of sets) if (c.first <= gid) s = c;
    return s && { local: gid - s.first, def: s.tiles[gid - s.first] || {} };
  };

  const FLIP_X = 0x80000000, MASK = 0x1fffffff;
  const out = { w, h, tw: map.tilewidth, images: [], cls: map.class || '', props: propsOf(map.properties),
    ground: new Uint8Array(w * h), raised: new Uint8Array(w * h), stairs: new Uint8Array(w * h), water: new Uint8Array(w * h),
    stairTiles: new Int16Array(w * h).fill(-1), objects: [] };
  const mask = { ground: 'ground', raised: 'raised', stairs: 'stairs', water: 'water' };

  const walk = layers => {
    for (const l of layers) {
      if (l.type === 'group') walk(l.layers);
      else if (l.type === 'tilelayer') {
        const m = mask[(l.name || '').toLowerCase()];
        if (!m) continue;
        if (l.chunks || typeof l.data === 'string' || l.encoding && l.encoding !== 'csv' || l.compression)
          throw new Error(path + ': layer ' + l.name + ' must be uncompressed CSV');
        if (l.width !== w || l.height !== h) throw new Error(path + ': layer ' + l.name + ' size differs from map');
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

  function readObject(o) {
    if (o.gid) {
      const t = tileOf((o.gid >>> 0) & MASK), def = t ? t.def : {};
      const props = { ...propsOf(def.properties), ...propsOf(o.properties) };
      // art added in Tiled without a key property is named after its file, the same way Boot loads it
      const key = props.key || (def.image ? def.image.split('/').pop().replace(/\.png$/i, '') : undefined), bl = props.block;
      delete props.key; delete props.block;
      const block = bl ? String(bl).split(',').map(Number) : [0, 0];
      const flipX = !!((o.gid >>> 0) & FLIP_X), w = def.width || def.imagewidth || o.width, h = def.height || def.imageheight || o.height;
      // collision shapes drawn on the tile in Tiled's collision editor, in image pixels from the frame's top-left
      // (rectangles and ellipses count as their bounding box; mirrored with the object)
      const rects = ((def.objectgroup && def.objectgroup.objects) || []).filter(r => r.width > 0 && r.height > 0)
        .map(r => ({ x: flipX ? w - r.x - r.width : r.x, y: r.y, w: r.width, h: r.height }));
      return { key, x: o.x, y: o.y, w, h, flipX, cls: o.class || o.type || def.class || def.type || '', props, block, rects };
    }
    return { cls: o.class || o.type || '', name: o.name || '', x: o.x, y: o.y, w: o.width || 0, h: o.height || 0, props: propsOf(o.properties) };
  }

  walk(map.layers || []);
  for (let i = 0; i < w * h; i++) if (out.water[i]) out.ground[i] = out.raised[i] = 0;   // painted water wins
  return out;
}

if (typeof module === 'object') module.exports = { readMap };
