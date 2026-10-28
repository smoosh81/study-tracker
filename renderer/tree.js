// Procedural tree drawing shared by the timer, the garden, history, the shop and the mini player.
// growth: p = 0..1 covers the first 10 minutes (seed -> young tree),
//         g = 0..1 covers 10 -> 180 minutes (the tree keeps getting bigger and grows fruit).
(function () {
  const RARITIES = {
    common:    { name: 'Common',    color: '#9ca3af', refund: 15 },
    uncommon:  { name: 'Uncommon',  color: '#4ade80', refund: 35 },
    rare:      { name: 'Rare',      color: '#38bdf8', refund: 80 },
    epic:      { name: 'Epic',      color: '#c084fc', refund: 180 },
    legendary: { name: 'Legendary', color: '#fbbf24', refund: 450 },
    mythical:  { name: 'Mythical',  color: '#ff4d8d', refund: 1200 },
  };
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'];

  // Species ids from 1.0.x (oak, pine, blossom, maple, mint, gold, spruce) must never change.
  const SPECIES = [
    { id: 'oak', name: 'Oak', rarity: 'common', starter: true, shape: 'round', leaf1: '#45a852', leaf2: '#2e7d3b', hi: '#7fd38a', trunk: '#7a4b2a', fruit: '#ef4444' },
    { id: 'pine', name: 'Pine', rarity: 'common', starter: true, shape: 'pine', leaf1: '#2f8a5c', leaf2: '#1f6542', hi: '#5fbf8a', trunk: '#6b4226', fruit: '#c08a3e' },
    { id: 'birch', name: 'Birch', rarity: 'common', shape: 'round', model: 'birch', leaf1: '#a3d96b', leaf2: '#76b947', hi: '#d4f0b0', trunk: '#e9e4d8', fruit: '#facc15' },
    { id: 'fir', name: 'Fir', rarity: 'common', shape: 'pine', model: 'fir', leaf1: '#1f7a4d', leaf2: '#145634', hi: '#3fa36f', trunk: '#5a3a22', fruit: '#a16207' },
    { id: 'maple', name: 'Maple', rarity: 'uncommon', shape: 'round', model: 'maple', leaf1: '#fb923c', leaf2: '#e2571a', hi: '#fdc28a', trunk: '#6b3f2a', fruit: '#fde047' },
    { id: 'spruce', name: 'Blue spruce', rarity: 'uncommon', shape: 'pine', model: 'spruce', leaf1: '#5b9bb5', leaf2: '#3a7189', hi: '#9cc9db', trunk: '#5e4030', fruit: '#f8fafc' },
    { id: 'mint', name: 'Mint willow', rarity: 'uncommon', shape: 'round', model: 'fountain', leaf1: '#5eead4', leaf2: '#16a394', hi: '#b2f5ea', trunk: '#5b3b26', fruit: '#a78bfa' },
    { id: 'apple', name: 'Apple', rarity: 'uncommon', shape: 'round', model: 'orchard', leaf1: '#4fb35a', leaf2: '#2f8a3c', hi: '#8ad693', trunk: '#73492b', fruit: '#dc2626', fruitAlways: true },
    { id: 'cypress', name: 'Cypress', rarity: 'uncommon', shape: 'cypress', leaf1: '#2f7d4f', leaf2: '#205c39', hi: '#4fa874', trunk: '#5b3b26', fruit: '#a3e635' },
    { id: 'blossom', name: 'Cherry blossom', rarity: 'rare', shape: 'round', model: 'blossom', leaf1: '#f9a8d4', leaf2: '#ec6fae', hi: '#ffd6ea', trunk: '#5e3a2a', fruit: '#ffffff' },
    { id: 'gold', name: 'Golden ash', rarity: 'rare', shape: 'round', model: 'pads', leaf1: '#fcd34d', leaf2: '#d99a06', hi: '#fff1b3', trunk: '#6e4a2c', fruit: '#f97316' },
    { id: 'willow', name: 'Weeping willow', rarity: 'rare', shape: 'willow', leaf1: '#86c55a', leaf2: '#5e9c3a', hi: '#b8e391', trunk: '#6b4a2e', fruit: '#fef08a' },
    { id: 'crimson', name: 'Crimson oak', rarity: 'rare', shape: 'round', model: 'spread', leaf1: '#ef4444', leaf2: '#b91c1c', hi: '#fca5a5', trunk: '#4a2c20', fruit: '#fde68a' },
    { id: 'frost', name: 'Frost pine', rarity: 'epic', shape: 'pine', model: 'frost', leaf1: '#e0f2fe', leaf2: '#a5d8f3', hi: '#ffffff', trunk: '#64748b', fruit: '#7dd3fc', sparkle: '#ffffff', glow: '#bae6fd' },
    { id: 'twilight', name: 'Twilight', rarity: 'epic', shape: 'round', model: 'crystal', leaf1: '#a78bfa', leaf2: '#6d28d9', hi: '#ddd6fe', trunk: '#3b2a4f', fruit: '#f0abfc', sparkle: '#f5d0fe' },
    { id: 'ember', name: 'Ember', rarity: 'epic', shape: 'cypress', model: 'flame', leaf1: '#fb7185', leaf2: '#e11d48', hi: '#fecdd3', trunk: '#3f1d1d', fruit: '#fdba74', glow: '#fb7185' },
    { id: 'aurora', name: 'Aurora', rarity: 'legendary', shape: 'round', model: 'ribbon', leaf1: '#4ade80', leaf2: '#22d3ee', hi: '#e0f2fe', trunk: '#334155', fruit: '#f0abfc', glow: '#67e8f9', sparkle: '#ffffff', hue: true },
    { id: 'sunfire', name: 'Sunfire', rarity: 'legendary', shape: 'round', model: 'sunburst', leaf1: '#fde047', leaf2: '#f59e0b', hi: '#fffbeb', trunk: '#78350f', fruit: '#ffffff', glow: '#fcd34d', sparkle: '#fff7cc' },
    { id: 'spirit', name: 'Spirit willow', rarity: 'legendary', shape: 'willow', model: 'wisp', leaf1: '#99f6e4', leaf2: '#2dd4bf', hi: '#f0fdfa', trunk: '#1e3a3a', fruit: '#e0e7ff', glow: '#5eead4', sparkle: '#ccfbf1', translucent: true },
    { id: 'celestial', name: 'Celestial Elder', rarity: 'mythical', shape: 'round', model: 'orb', leaf1: '#818cf8', leaf2: '#5b21b6', hi: '#f5d0fe', trunk: '#1e1b4b', fruit: '#fde68a', glow: '#c084fc', sparkle: '#ffffff', hue: true, orbit: true },
  ];

  // How each species grows in: how its leaves arrive (enter), in what order (order),
  // how the trunk grows (trunk), the easing (ease) and the particles it gives off (fx).
  const GROW = {
    oak:       { enter: 'pop', order: 'bottomUp', trunk: 'straight', ease: 'spring', fx: 'leaves' },
    pine:      { enter: 'rise', order: 'natural', trunk: 'tall', ease: 'smooth', fx: 'needles' },
    birch:     { enter: 'unfurl', order: 'leftRight', trunk: 'tall', ease: 'smooth', fx: 'leaves' },
    fir:       { enter: 'drop', order: 'topDown', trunk: 'straight', ease: 'bounce', fx: 'needles' },
    maple:     { enter: 'spin', order: 'spiral', trunk: 'wobble', ease: 'spring', fx: 'maple' },
    spruce:    { enter: 'stretch', order: 'bottomUp', trunk: 'tall', ease: 'smooth', fx: 'snow' },
    mint:      { enter: 'rise', order: 'centerOut', trunk: 'wobble', ease: 'bounce', fx: 'bubbles' },
    apple:     { enter: 'pop', order: 'random', trunk: 'straight', ease: 'bounce', fx: 'apples' },
    cypress:   { enter: 'shoot', order: 'bottomUp', trunk: 'tall', ease: 'spring', fx: 'leaves' },
    blossom:   { enter: 'bloom', order: 'outsideIn', trunk: 'twist', ease: 'smooth', fx: 'petals' },
    gold:      { enter: 'squash', order: 'topDown', trunk: 'straight', ease: 'spring', fx: 'glints' },
    willow:    { enter: 'drop', order: 'leftRight', trunk: 'wobble', ease: 'smooth', fx: 'drops' },
    crimson:   { enter: 'swirlL', order: 'rightLeft', trunk: 'twist', ease: 'spring', fx: 'redleaves' },
    frost:     { enter: 'crystal', order: 'centerOut', trunk: 'tall', ease: 'smooth', fx: 'snow' },
    twilight:  { enter: 'swirlR', order: 'spiral', trunk: 'wobble', ease: 'smooth', fx: 'stars' },
    ember:     { enter: 'flicker', order: 'bottomUp', trunk: 'tall', ease: 'spring', fx: 'embers' },
    aurora:    { enter: 'crystal', order: 'random', trunk: 'twist', ease: 'bounce', fx: 'aurora' },
    sunfire:   { enter: 'burst', order: 'centerOut', trunk: 'straight', ease: 'spring', fx: 'sunsparks' },
    spirit:    { enter: 'ghost', order: 'topDown', trunk: 'wobble', ease: 'smooth', fx: 'wisps' },
    celestial: { enter: 'cosmic', order: 'spiral', trunk: 'twist', ease: 'spring', fx: 'cosmic' },
  };
  const EASES = {
    spring: 'cubic-bezier(.34,1.56,.64,1)',
    smooth: 'cubic-bezier(.22,1,.36,1)',
    bounce: 'cubic-bezier(.5,1.9,.5,.8)',
  };
  const growOf = (id) => GROW[id] || GROW.oak;

  // Leaf entrance: every style returns the same list of transform functions, so the
  // browser can blend smoothly from one growth step to the next.
  const f = (n) => n.toFixed(3);
  const ENTER = {
    pop:     (s) => `translate(0px,0px) rotate(0deg) scale(${f(s)},${f(s)})`,
    rise:    (s) => `translate(0px,${f((1 - s) * 34)}px) rotate(0deg) scale(${f(s)},${f(s)})`,
    drop:    (s) => `translate(0px,${f(-(1 - s) * 46)}px) rotate(0deg) scale(${f(s)},${f(s)})`,
    spin:    (s) => `translate(0px,0px) rotate(${f((1 - s) * -220)}deg) scale(${f(s)},${f(s)})`,
    unfurl:  (s) => `translate(0px,0px) rotate(${f((1 - s) * 80)}deg) scale(${f(s)},${f(s)})`,
    stretch: (s) => `translate(0px,0px) rotate(0deg) scale(${f(s * s)},${f(Math.sqrt(s))})`,
    squash:  (s) => `translate(0px,0px) rotate(0deg) scale(${f(Math.sqrt(s))},${f(s * s)})`,
    shoot:   (s) => `translate(0px,${f((1 - s) * 70)}px) rotate(0deg) scale(${f(Math.pow(s, 1.6))},${f(Math.sqrt(s))})`,
    bloom:   (s) => `translate(0px,0px) rotate(${f((1 - s) * 45)}deg) scale(${f(s)},${f(s)})`,
    swirlL:  (s) => `translate(${f(-(1 - s) * 60)}px,${f(-(1 - s) * 24)}px) rotate(${f((1 - s) * -120)}deg) scale(${f(s)},${f(s)})`,
    swirlR:  (s) => `translate(${f((1 - s) * 60)}px,${f(-(1 - s) * 24)}px) rotate(${f((1 - s) * 120)}deg) scale(${f(s)},${f(s)})`,
    crystal: (s) => `translate(0px,0px) rotate(${f((1 - s) * 30)}deg) scale(${f(1 + (1 - s) * 0.7)},${f(1 + (1 - s) * 0.7)})`,
    flicker: (s) => `translate(${f(Math.sin(s * 19) * 6 * (1 - s))}px,${f((1 - s) * 30)}px) rotate(${f(Math.sin(s * 23) * 18 * (1 - s))}deg) scale(${f(s)},${f(s)})`,
    burst:   (s) => `translate(0px,0px) rotate(0deg) scale(${f(s * (1 + Math.sin(s * Math.PI) * 0.35))},${f(s * (1 + Math.sin(s * Math.PI) * 0.35))})`,
    ghost:   (s) => `translate(0px,${f(-(1 - s) * 18)}px) rotate(0deg) scale(${f(1 + (1 - s) * 0.4)},${f(1 + (1 - s) * 0.4)})`,
    cosmic:  (s) => `translate(${f(Math.cos(s * 9) * 40 * (1 - s))}px,${f(Math.sin(s * 9) * 40 * (1 - s))}px) rotate(${f((1 - s) * 360)}deg) scale(${f(s)},${f(s)})`,
  };
  const FADE_IN = { crystal: 1, ghost: 1 }; // these fade in instead of popping
  const TRUNK = {
    straight: (s) => `rotate(0deg) skewX(0deg) scale(${f(s)},${f(s)})`,
    tall:     (s) => `rotate(0deg) skewX(0deg) scale(1,${f(s)})`,
    twist:    (s) => `rotate(0deg) skewX(${f((1 - s) * 28)}deg) scale(${f(0.4 + 0.6 * s)},${f(s)})`,
    wobble:   (s) => `rotate(${f(Math.sin(s * 12) * 10 * (1 - s))}deg) skewX(0deg) scale(${f(s)},${f(s)})`,
  };

  // Re-time the leaf clusters so each species fills in its canopy in its own order.
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function orderTimes(items, order, seed) {
    const times = items.map((x) => x.t).sort((a, b) => a - b);
    const key = {
      natural: (x, i) => i,
      bottomUp: (x) => -x.y,
      topDown: (x) => x.y,
      leftRight: (x) => x.x,
      rightLeft: (x) => -x.x,
      centerOut: (x) => Math.hypot(x.x - 100, x.y - 100),
      outsideIn: (x) => -Math.hypot(x.x - 100, x.y - 100),
      spiral: (x) => (Math.atan2(x.y - 100, x.x - 100) + Math.PI * 2.5) % (Math.PI * 2),
      random: (x, i) => hash(seed + i),
    }[order] || ((x, i) => i);
    const ranked = items.map((x, i) => [key(x, i), i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(items.length);
    ranked.forEach(([, i], r) => { out[i] = times[r]; });
    return out;
  }

  const ROUND_CLUSTERS = [
    [100, 104, 34, 0.50], [72, 120, 24, 0.55], [128, 116, 26, 0.60], [84, 90, 22, 0.66],
    [118, 86, 24, 0.72], [100, 70, 22, 0.80], [64, 102, 16, 0.86], [138, 98, 16, 0.92],
  ];
  const FRUITS = [[86, 112, 0.2], [116, 100, 0.35], [100, 84, 0.5], [130, 124, 0.65], [72, 98, 0.8], [108, 122, 0.95]];
  const SPARKS = [[58, 78], [146, 70], [70, 46], [136, 132], [100, 34], [52, 124]];

  const DEFAULT_BRANCHES = [['M99 156 Q86 146 76 132', 4.5, 'right'], ['M101 146 Q116 136 125 122', 4.5, 'left']];
  const get = (id) => SPECIES.find((x) => x.id === id) || SPECIES[0];

  // ---- Tree models ----
  // Most species have their own model: a trunk, branches, a canopy made of leaf parts,
  // optional extras (bark, snow, veins...) and where the fruit hangs.
  const r1 = (n) => Math.round(n * 10) / 10;
  const poly = (pts) => pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
  const L = (tag, attrs, fill, x, y, o) => Object.assign({ tag, attrs, fill, x, y }, o || {});
  const ell = (x, y, rx, ry, fill, o) => L('ellipse', `cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"`, fill, x, y, o);
  const circ = (x, y, r, fill, o) => L('circle', `cx="${x}" cy="${y}" r="${r}"`, fill, x, y, o);
  const path = (d, fill, x, y, o) => L('path', `d="${d}"`, fill, x, y, o);
  const pg = (pts, fill, x, y, o) => L('polygon', `points="${pts}"`, fill, x, y, o);
  // an extra piece that grows in at a set time (highlights, snow, veins, bark)
  const xp = (tag, attrs, cls, t, i, origin) =>
    `<${tag} ${attrs} class="part ${cls}" style="--i:${i}" data-t="${(+t).toFixed(3)}" data-span="0.12"${origin ? ` data-origin="${origin}"` : ''}/>`;
  const shine = (x, y, r, s, t, i) => xp('circle', `cx="${x}" cy="${y}" r="${r}" fill="${s.hi}" opacity="0.5"`, 'leaf hl', t, i);
  const alt = (s, i) => (i % 2 ? s.leaf1 : s.leaf2);

  function lobe(cx, cy, deg, len, w) {
    const a = (deg * Math.PI) / 180, d = [Math.cos(a), Math.sin(a)], p = [-d[1], d[0]];
    const at = (k, side) => [cx + d[0] * len * k + p[0] * w * side, cy + d[1] * len * k + p[1] * w * side];
    return { pts: poly([at(0.1, -0.45), at(0.5, -1), at(0.62, -0.55), at(0.8, -0.8), at(1, 0), at(0.8, 0.8), at(0.62, 0.55), at(0.5, 1), at(0.1, 0.45)]), mid: at(0.55, 0), vein: at(0.85, 0) };
  }
  function jagTier(a, b, w, n) {
    const pts = [[100, a], [100 + w * 0.42, a + (b - a) * 0.55]];
    for (let j = 0; j <= n * 2; j++) pts.push([100 + w - (j * w) / n, j % 2 ? b - 9 : b]);
    pts.push([100 - w * 0.42, a + (b - a) * 0.55]);
    return poly(pts);
  }
  function crystal(cx, cy, w, h, deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const rot = ([x, y]) => [cx + x * c - y * sn, cy + x * sn + y * c];
    return {
      full: poly([[0, -h], [w, -h * 0.45], [w, h * 0.55], [0, h], [-w, h * 0.55], [-w, -h * 0.45]].map(rot)),
      facet: poly([[0, -h], [0, h], [-w, h * 0.55], [-w, -h * 0.45]].map(rot)),
    };
  }
  const flame = (x, b, w, h, lean) =>
    `M${x} ${b} C${r1(x - w * 1.1)} ${r1(b - h * 0.25)} ${r1(x - w * 0.6)} ${r1(b - h * 0.7)} ${x + lean} ${b - h} C${r1(x + w * 0.4)} ${r1(b - h * 0.65)} ${r1(x + w * 1.1)} ${r1(b - h * 0.35)} ${x} ${b}Z`;
  function band(yc, hw, th, amp) {
    const x0 = 100 - hw, x1 = 100 + hw, n = Math.max(2, Math.round(hw / 12)), st = (x1 - x0) / n, yt = yc - th / 2, yb = yc + th / 2;
    let d = `M${r1(x0)} ${yt} Q${r1(x0 + st / 2)} ${yt - amp} ${r1(x0 + st)} ${yt}`;
    for (let i = 2; i <= n; i++) d += ` T${r1(x0 + st * i)} ${yt}`;
    d += ` A${th / 2} ${th / 2} 0 0 1 ${r1(x1)} ${yb} Q${r1(x1 - st / 2)} ${yb + amp} ${r1(x1 - st)} ${yb}`;
    for (let i = 2; i <= n; i++) d += ` T${r1(x1 - st * i)} ${yb}`;
    return d + ` A${th / 2} ${th / 2} 0 0 1 ${r1(x0)} ${yt}Z`;
  }

  const MODELS = {
    // slender white trunk with dark bark marks and small airy leaf clusters
    birch: {
      trunk: 'M96.5 211 Q98 150 99 64 L101 64 Q102 150 103.5 211 Z',
      branches: [['M100 142 Q88 130 78 114', 2.6, 'right'], ['M100 120 Q112 108 122 92', 2.6, 'left'], ['M100 98 Q90 88 86 76', 2.2, 'right']],
      leaves: (s) => [[66, 128, 10, 13], [78, 110, 14, 18], [134, 118, 11, 14], [122, 92, 15, 19], [96, 96, 11, 14], [86, 76, 13, 17], [113, 62, 14, 18], [100, 44, 12, 16]]
        .map(([x, y, rx, ry], i) => ell(x, y, rx, ry, alt(s, i))),
      extra: (s, ts) => [[97, 192, 4], [99, 176, 3], [97.5, 158, 4], [99.5, 140, 3], [98, 122, 3], [99.5, 104, 2.5], [98.5, 86, 2]]
        .map(([x, y, w], i) => xp('path', `d="M${x} ${y} h${w}" stroke="#3b3b3b" stroke-width="1.8" stroke-linecap="round" fill="none"`, 'bark', 0.5 + i * 0.01, i)).join('')
        + [[74, 104, 5, 1], [118, 85, 5, 3], [82, 70, 4.5, 5], [109, 56, 4.5, 6]].map(([x, y, r, j], i) => shine(x, y, r, s, ts[j] + 0.04, i + 8)).join(''),
      fruits: [[80, 126], [124, 109], [88, 92], [115, 78], [100, 58], [134, 131]],
    },
    // tall and narrow with many thin tiers
    fir: {
      trunk: 'M95 211 Q97 190 98 150 L102 150 Q103 190 105 211 Z',
      leaves: (s) => [[136, 186, 34], [116, 164, 30], [96, 142, 26], [76, 120, 22], [56, 98, 17], [34, 76, 12]]
        .map(([a, b, w], i) => path(`M100 ${a} L${100 - w} ${b} Q100 ${b + 6} ${100 + w} ${b}Z`, alt(s, i + 1), 100, (a + b) / 2, { origin: 'bottom' })),
      fruits: [[86, 178], [113, 156], [91, 134], [110, 112], [96, 90], [106, 172]],
    },
    // a big maple leaf: five pointed lobes with light veins
    maple: {
      leaves: (s) => {
        const out = [[-155, 62, 21], [-25, 62, 21], [145, 44, 15], [35, 44, 15], [-90, 72, 24]].map(([deg, len, w], i) => {
          const l = lobe(100, 108, deg, len, w);
          return pg(l.pts, alt(s, i), l.mid[0], l.mid[1], { vein: l.vein });
        });
        out.push(circ(100, 108, 24, s.leaf2));
        return out;
      },
      extra: (s, ts, parts) => parts.filter((p) => p.vein).map((p, i) => xp('path', `d="M100 108 L${r1(p.vein[0])} ${r1(p.vein[1])}" stroke="${s.hi}" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6"`, 'leaf hl line', ts[5] + 0.04, i + 6)).join(''),
      fruits: [[100, 62], [66, 92], [134, 92], [78, 128], [122, 128], [100, 120]],
    },
    // blue tiers with jagged, drooping edges
    spruce: {
      leaves: (s) => [[120, 190, 52], [88, 158, 43], [58, 126, 33], [32, 94, 21]]
        .map(([a, b, w], i) => pg(jagTier(a, b, w, 4), alt(s, i), 100, (a + b) / 2, { origin: 'bottom' })),
      extra: (s, ts) => [[120, 190, 52], [88, 158, 43], [58, 126, 33]]
        .map(([a, b, w], i) => xp('polygon', `points="${poly([[100, a + 4], [100 - w * 0.3, a + (b - a) * 0.6], [100 - w * 0.12, a + (b - a) * 0.66]])}" fill="${s.hi}" opacity="0.45"`, 'leaf hl', ts[i] + 0.04, i + 4)).join(''),
      fruits: [[72, 196], [128, 164], [84, 132], [116, 100], [100, 200], [90, 164]],
    },
    // arching fronds that spill over like a fountain
    fountain: {
      trunk: 'M95 211 Q97 175 98 128 L102 128 Q103 175 105 211 Z',
      leaves: (s) => {
        const out = [ell(100, 94, 18, 32, s.leaf1)];
        [[42, 162, 50, 72], [158, 162, 150, 72], [58, 150, 62, 56], [142, 150, 138, 56], [80, 138, 82, 44], [120, 138, 118, 44]].forEach(([tx, ty, ax, ay], i) => {
          const ix = r1(ax + (100 - ax) * 0.25);
          out.push(path(`M100 124 Q${ax} ${ay} ${tx} ${ty} Q${ix} ${ay + 26} 100 134Z`, alt(s, i), (100 + 2 * ax + tx) / 4, (124 + 2 * ay + ty) / 4));
        });
        out.push(circ(100, 128, 16, s.leaf2));
        return out;
      },
      extra: (s, ts) => shine(94, 80, 6, s, ts[0] + 0.04, 8) + shine(95, 122, 5, s, ts[7] + 0.04, 9),
      fruits: [[70, 108], [130, 108], [90, 86], [110, 86], [56, 140], [144, 140]],
    },
    // short sturdy orchard tree with a low, wide crown
    orchard: {
      trunk: 'M91 211 Q95 175 96 140 L104 140 Q105 175 109 211 Z',
      branches: [['M98 152 Q80 142 62 128', 5, 'right'], ['M102 152 Q120 142 138 128', 5, 'left'], ['M100 144 Q100 128 100 112', 4.5, 'bottom']],
      leaves: (s) => [[46, 124, 14, 11], [154, 124, 14, 11], [64, 116, 24, 18], [136, 116, 24, 18], [100, 106, 36, 24], [78, 92, 24, 18], [122, 92, 24, 18], [100, 80, 22, 16]]
        .map(([x, y, rx, ry], i) => ell(x, y, rx, ry, alt(s, i))),
      extra: (s, ts) => [[90, 96, 9, 4], [70, 108, 7, 2], [114, 84, 7, 6], [94, 74, 6, 7]].map(([x, y, r, j], i) => shine(x, y, r, s, ts[j] + 0.04, i + 8)).join(''),
      fruits: [[70, 124], [130, 124], [100, 114], [86, 100], [116, 98], [52, 128]],
    },
    // twisted limbs ending in puffs of blossom
    blossom: {
      trunk: 'M94 211 Q90 180 98 160 Q104 146 96 132 L102 130 Q110 146 104 162 Q98 180 106 211 Z',
      branches: [['M98 138 Q78 128 70 108 Q66 96 54 92', 4.5, 'right'], ['M100 134 Q116 122 128 112 Q140 104 148 96', 4.5, 'left'], ['M99 132 Q96 110 104 92 Q108 80 100 66', 4, 'bottom'],
        ['M86 124 Q72 126 58 128', 3, 'right'], ['M118 120 Q132 126 146 130', 3, 'left']],
      leaves: (s) => [[58, 126, 12], [146, 130, 12], [54, 90, 15], [66, 82, 11], [148, 94, 15], [136, 86, 11], [82, 100, 11], [122, 104, 10], [100, 64, 15], [112, 72, 10], [88, 70, 10]]
        .map(([x, y, r], i) => circ(x, y, r, alt(s, i))),
      extra: (s, ts) => [[50, 85, 5, 2], [144, 89, 5, 4], [96, 59, 5, 8], [55, 122, 4, 0], [143, 126, 4, 1]].map(([x, y, r, j], i) => shine(x, y, r, s, ts[j] + 0.04, i + 11)).join(''),
      fruits: [[54, 84], [148, 88], [100, 56], [60, 118], [144, 122], [84, 94]],
    },
    // bonsai-style cloud pads on a winding trunk
    pads: {
      trunk: 'M94 211 Q92 170 100 140 Q106 120 99 100 L103 98 Q111 122 105 142 Q98 170 106 211 Z',
      branches: [['M100 152 Q80 148 64 138', 4.5, 'right'], ['M104 128 Q122 122 136 112', 4, 'left'], ['M101 110 Q90 96 82 86', 3.5, 'right']],
      leaves: (s) => {
        const out = [];
        [[60, 134, 30], [140, 108, 28], [80, 82, 24], [104, 56, 20]].forEach(([x, y, w]) => {
          out.push(ell(x, y, w, w * 0.42, s.leaf2));
          out.push(ell(x - w * 0.12, y - w * 0.3, w * 0.62, w * 0.36, s.leaf1));
        });
        return out;
      },
      extra: (s, ts) => [[52, 124, 5, 1], [133, 98, 5, 3], [74, 74, 4, 5], [99, 50, 4, 7]].map(([x, y, r, j], i) => shine(x, y, r, s, ts[j] + 0.04, i + 8)).join(''),
      fruits: [[60, 146], [140, 119], [80, 92], [104, 65], [44, 136], [154, 110]],
    },
    // a broad old oak: thick flared trunk, heavy limbs and a crown wider than it is tall
    spread: {
      trunk: 'M82 212 Q92 206 93 190 Q95 160 94 128 L106 128 Q105 160 107 190 Q108 206 118 212 Z',
      branches: [['M96 148 Q76 132 54 126', 6, 'right'], ['M104 148 Q124 132 146 126', 6, 'left'], ['M98 136 Q92 116 84 104', 5, 'right'], ['M102 134 Q110 114 118 102', 5, 'left']],
      leaves: (s) => [[47, 120, 16], [153, 120, 16], [56, 102, 18], [144, 102, 18], [68, 116, 22], [132, 116, 22], [100, 100, 30], [80, 82, 22], [120, 82, 22], [100, 66, 20]]
        .map(([x, y, r], i) => circ(x, y, r, alt(s, i))),
      extra: (s, ts) => [[91, 90, 10, 6], [73, 75, 7, 7], [113, 75, 7, 8], [94, 60, 6, 9], [61, 109, 7, 4]].map(([x, y, r, j], i) => shine(x, y, r, s, ts[j] + 0.04, i + 10)).join(''),
      fruits: [[70, 126], [130, 126], [100, 114], [48, 132], [152, 132], [86, 96]],
    },
    // a pine with bell-shaped tiers, snow caps and icicles
    frost: {
      leaves: (s) => [[112, 188, 52], [82, 154, 42], [54, 122, 32], [30, 90, 20]].map(([a, b, w], i) => {
        const h = b - a;
        return path(`M100 ${a} Q${r1(100 - w * 0.35)} ${r1(a + h * 0.55)} ${100 - w} ${b} Q100 ${b + 8} ${100 + w} ${b} Q${r1(100 + w * 0.35)} ${r1(a + h * 0.55)} 100 ${a}Z`, alt(s, i + 1), 100, (a + b) / 2, { origin: 'bottom', tier: [a, b, w] });
      }),
      extra: (s, ts, parts) => parts.map((p, i) => {
        const [a, b, w] = p.tier, h = b - a, y = (k) => r1(a + h * k), x = (k) => r1(100 + w * k);
        return xp('path', `d="M100 ${a - 1} Q${x(-0.2)} ${y(0.3)} ${x(-0.44)} ${y(0.52)} Q${x(-0.26)} ${y(0.42)} ${x(-0.1)} ${y(0.5)} Q100 ${y(0.4)} ${x(0.14)} ${y(0.5)} Q${x(0.3)} ${y(0.42)} ${x(0.44)} ${y(0.52)} Q${x(0.2)} ${y(0.3)} 100 ${a - 1}Z" fill="#ffffff"`, 'snow', ts[i] + 0.06, i + 4);
      }).join('') + [72, 90, 110, 128].map((x, i) => xp('path', `d="M${x - 3} 190 L${x + 3} 190 L${x} ${200 + (i % 2) * 4}Z" fill="${s.glow}"`, 'snow', 0.9, i + 8, 'top')).join(''),
      fruits: [[78, 176], [122, 146], [86, 112], [114, 84], [100, 176], [100, 58]],
    },
    // a cluster of glowing crystals
    crystal: {
      leaves: (s) => [[58, 132, 10, 20, -40], [142, 132, 10, 20, 40], [72, 108, 14, 30, -25], [128, 108, 14, 30, 25], [100, 124, 16, 26, 0], [84, 70, 10, 22, -12], [118, 66, 10, 24, 14], [100, 84, 18, 40, 0]]
        .map(([x, y, w, h, deg], i) => { const c = crystal(x, y, w, h, deg); return pg(c.full, alt(s, i), x, y, { facet: c.facet }); }),
      extra: (s, ts, parts) => parts.map((p, i) => xp('polygon', `points="${p.facet}" fill="${s.hi}" opacity="0.38"`, 'leaf hl', ts[i] + 0.04, i + 8)).join(''),
      fruits: [[72, 140], [128, 140], [100, 152], [58, 154], [142, 154], [100, 44]],
    },
    // tongues of flame instead of leaves
    flame: {
      trunk: 'M95 211 Q97 190 98 170 L102 170 Q103 190 105 211 Z',
      leaves: (s) => [[60, 174, 13, 56, -14], [140, 174, 13, 56, 14], [74, 172, 20, 92, -10], [126, 172, 20, 92, 10], [100, 170, 30, 130, 4], [88, 168, 14, 64, -6], [114, 168, 14, 64, 6]]
        .map(([x, b, w, h, lean], i) => path(flame(x, b, w, h, lean), alt(s, i), x, b - h / 2, { origin: 'bottom' })),
      extra: (s, ts) => xp('path', `d="${flame(100, 168, 14, 82, 2)}" fill="${s.hi}" opacity="0.6"`, 'leaf hl line', ts[4] + 0.05, 8, 'bottom'),
      fruits: [[80, 112], [120, 106], [100, 80], [66, 142], [134, 138], [100, 132]],
    },
    // stacked rippling bands of light
    ribbon: {
      leaves: (s) => [[152, 58, 22], [125, 50, 21], [99, 41, 20], [75, 31, 18], [54, 20, 16]]
        .map(([y, hw, th], i) => path(band(y, hw, th, 5), alt(s, i), 100, y)),
      extra: (s, ts) => [[152, 58, 22], [125, 50, 21], [99, 41, 20]].map(([y, hw, th], i) => xp('path', `d="M${100 - hw * 0.7} ${y - th * 0.18} Q100 ${y - th * 0.42} ${100 + hw * 0.7} ${y - th * 0.18}" stroke="${s.hi}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.6"`, 'leaf hl line', ts[i] + 0.04, i + 5)).join(''),
      fruits: [[70, 146], [130, 146], [86, 120], [114, 120], [100, 94], [100, 50]],
    },
    // a blazing sun: rays around a bright core
    sunburst: {
      leaves: (s) => {
        const out = [];
        for (let k = 0; k < 12; k++) {
          const a = ((k * 30 - 90) * Math.PI) / 180, R = k % 2 ? 54 : 64, sp = 0.2;
          const pt = (r, da) => [100 + Math.cos(a + da) * r, 96 + Math.sin(a + da) * r];
          const tip = pt(R, 0);
          out.push(pg(poly([pt(26, -sp), tip, pt(26, sp)]), alt(s, k), tip[0], tip[1], { origin: 'center' }));
        }
        out.push(circ(100, 96, 32, s.leaf2));
        out.push(circ(100, 96, 22, s.leaf1));
        return out;
      },
      extra: (s, ts) => shine(92, 88, 8, s, ts[13] + 0.04, 14),
      fruits: [0, 1, 2, 3, 4, 5].map((k) => { const a = ((k * 60 - 75) * Math.PI) / 180; return [r1(100 + Math.cos(a) * 42), r1(96 + Math.sin(a) * 42)]; }),
    },
    // thin willow with a small crescent crown and long curling wisps
    wisp: {
      trunk: 'M95 211 Q98 150 99 74 L101 74 Q102 150 105 211 Z',
      leaves: (s) => [ell(78, 82, 20, 13, s.leaf2), ell(122, 82, 20, 13, s.leaf2), ell(100, 72, 34, 20, s.leaf1), ell(100, 58, 20, 12, s.leaf2)],
      extra: (s) => [62, 71.5, 81, 90.5, 100, 109.5, 119, 128.5, 138].map((x, i) => {
        const k = 1 - Math.abs(x - 100) / 42, y1 = r1(84 + k * 6), y2 = r1(146 + k * 40), sw = i % 2 ? 8 : -8;
        return `<path d="M${x} ${y1} C${x + sw} ${r1(y1 + 28)} ${x - sw} ${r1(y2 - 30)} ${x} ${y2} q${sw * 0.6} 3 ${sw * 0.4} -6" stroke="${i % 2 ? s.leaf1 : s.hi}" stroke-width="3.5" stroke-linecap="round" fill="none" class="part leaf strand line" style="--i:${i + 4}" data-t="${(0.68 + i * 0.025).toFixed(3)}" data-span="0.12" data-origin="top"/>`;
      }).join(''),
      fruits: [[80, 96], [120, 96], [100, 88], [66, 90], [134, 90], [100, 100]],
    },
    // a glowing orb held up by the trunk, with smaller moons on its branches
    orb: {
      branches: [['M100 142 Q76 134 62 122', 4, 'right'], ['M100 142 Q124 134 138 122', 4, 'left'], ['M100 114 Q80 88 72 68', 3.5, 'right'], ['M100 114 Q120 88 128 68', 3.5, 'left']],
      leaves: (s) => [circ(60, 118, 14, s.leaf2), circ(140, 118, 14, s.leaf2), circ(70, 62, 12, s.leaf1), circ(128, 62, 12, s.leaf1), circ(100, 92, 30, s.leaf2), circ(100, 92, 20, s.leaf1)],
      extra: (s, ts) => [[55, 113, 5, 0], [135, 113, 5, 1], [66, 58, 4, 2], [124, 58, 4, 3], [91, 82, 9, 4]].map(([x, y, r, j], i) => shine(x, y, r, s, ts[j] + 0.04, i + 6)).join('')
        + xp('circle', `cx="100" cy="92" r="26" fill="none" stroke="${s.hi}" stroke-width="1.4" stroke-dasharray="2 4" opacity="0.7"`, 'ring', ts[4] + 0.05, 11),
      fruits: [[100, 130], [48, 96], [152, 96], [86, 76], [114, 76], [100, 54]],
    },
  };
  const modelOf = (s) => MODELS[s.model] || null;

  function canopyFor(s) {
    let c = '';
    const leaf = (tag, attrs, fill, t, i, origin) =>
      `<${tag} ${attrs} fill="${fill}" class="part leaf" style="--i:${i}" data-t="${t}" data-span="0.12"${origin ? ` data-origin="${origin}"` : ''}/>`;
    const order = growOf(s.id).order;
    const m = modelOf(s);
    if (m) {
      const parts = m.leaves(s), n = parts.length;
      const ts = orderTimes(parts.map((p, i) => ({ t: +(0.5 + (0.4 * i) / Math.max(1, n - 1)).toFixed(3), x: p.x, y: p.y })), order, s.id);
      parts.forEach((p, i) => { c += leaf(p.tag, p.attrs, p.fill, ts[i], i, p.origin); });
      if (m.extra) c += m.extra(s, ts, parts);
      return c;
    }
    if (s.shape === 'pine') {
      const tiers = [['100,112 54,182 146,182', 0.5, s.leaf2, 150], ['100,84 62,150 138,150', 0.64, s.leaf1, 120], ['100,56 72,118 128,118', 0.78, s.leaf2, 90], ['100,36 82,88 118,88', 0.9, s.leaf1, 64]];
      const ts = orderTimes(tiers.map(([, t, , y]) => ({ t, x: 100, y })), order, s.id);
      tiers.forEach(([pts, , f], i) => { c += leaf('polygon', `points="${pts}"`, f, ts[i], i, 'bottom'); });
    } else if (s.shape === 'cypress') {
      const parts = [[100, 150, 26, 44, 0.5, s.leaf2], [100, 116, 22, 40, 0.62, s.leaf1], [100, 84, 17, 34, 0.74, s.leaf2], [100, 58, 11, 24, 0.86, s.leaf1]];
      const ts = orderTimes(parts.map(([cx, cy, , , t]) => ({ t, x: cx, y: cy })), order, s.id);
      parts.forEach(([cx, cy, rx, ry, , f], i) => { c += leaf('ellipse', `cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`, f, ts[i], i, 'bottom'); });
      c += leaf('ellipse', 'cx="94" cy="104" rx="6" ry="22"', s.hi, 0.9, 5).replace('class="part leaf"', 'class="part leaf hl" opacity="0.45"');
    } else if (s.shape === 'willow') {
      const blobs = [[100, 92, 40, 0.5], [74, 104, 26, 0.56], [126, 104, 26, 0.6], [100, 70, 26, 0.66]];
      const ts = orderTimes(blobs.map(([cx, cy, , t]) => ({ t, x: cx, y: cy })), order, s.id);
      blobs.forEach(([cx, cy, r], i) => { c += leaf('circle', `cx="${cx}" cy="${cy}" r="${r}"`, i % 2 ? s.leaf1 : s.leaf2, ts[i], i); });
      // hanging strands
      [[58, 104, 172], [70, 112, 182], [84, 116, 188], [100, 118, 190], [116, 116, 188], [130, 112, 182], [142, 104, 172]]
        .forEach(([x, y1, y2], i) => {
          c += `<path d="M${x} ${y1} Q${x + (i % 2 ? 4 : -4)} ${(y1 + y2) / 2} ${x} ${y2}" stroke="${i % 2 ? s.leaf1 : s.leaf2}" stroke-width="7" stroke-linecap="round" fill="none" class="part leaf strand line" style="--i:${i + 4}" data-t="${0.7 + i * 0.03}" data-span="0.12" data-origin="top"/>`;
        });
    } else {
      const ts = orderTimes(ROUND_CLUSTERS.map(([cx, cy, , t]) => ({ t, x: cx, y: cy })), order, s.id);
      ROUND_CLUSTERS.forEach(([cx, cy, r], i) => { c += leaf('circle', `cx="${cx}" cy="${cy}" r="${r}"`, i % 2 ? s.leaf1 : s.leaf2, ts[i], i); });
      ROUND_CLUSTERS.slice(0, 5).forEach(([cx, cy, r], i) => {
        c += `<circle cx="${cx - r * 0.3}" cy="${cy - r * 0.35}" r="${r * 0.35}" fill="${s.hi}" opacity="0.55" class="part leaf hl" style="--i:${i + 8}" data-t="${(ts[i] + 0.04).toFixed(3)}" data-span="0.12"/>`;
      });
    }
    return c;
  }

  function build(speciesId, uid) {
    const s = get(speciesId);
    const id = uid || Math.random().toString(36).slice(2, 8);
    const pineLike = s.shape === 'pine' || s.shape === 'cypress';
    const m = modelOf(s);
    let fruit = '';
    FRUITS.forEach(([fx, fy, t], i) => {
      const cx = m ? m.fruits[i][0] : fx;
      const y = m ? m.fruits[i][1] : pineLike ? fy + 26 : s.shape === 'willow' ? fy - 6 : fy;
      fruit += `<circle cx="${cx}" cy="${y}" r="4.5" fill="${s.fruit}" stroke="rgba(0,0,0,.15)" stroke-width="1" class="${s.fruitAlways ? 'part' : 'gpart'} fruit" style="--i:${i}" data-t="${s.fruitAlways ? 0.85 + i * 0.02 : t}" data-span="0.08"/>`;
    });
    let sparks = '';
    if (s.sparkle) {
      SPARKS.forEach(([x, y], i) => {
        sparks += `<path d="M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6}Z" fill="${s.sparkle}" class="part spark" style="--i:${i}" data-t="0.75" data-span="0.15"/>`;
      });
    }
    const branchList = m ? m.branches || [] : s.shape === 'round' || s.shape === 'willow' ? DEFAULT_BRANCHES : [];
    const branches = branchList.map(([d, w, o], i) => `<path d="${d}" stroke="${s.trunk}" stroke-width="${w}" fill="none" stroke-linecap="round" class="part branch" data-t="${(0.42 + i * 0.03).toFixed(2)}" data-span="0.12" data-origin="${o}"/>`).join('');
    const aura = s.glow ? `<circle cx="100" cy="100" r="78" fill="url(#gl-${id})" class="part aura" data-t="0.5" data-span="0.4"/>` : '';
    const cls = ['tree', `r-${s.rarity}`, s.hue ? 'fx-hue' : '', s.translucent ? 'fx-ghost' : ''].join(' ');
    const gw = growOf(s.id);
    // a tilted ring of orbiting lights for the mythical tree
    const ring = 'M30 104 A70 18 0 1 0 170 104 A70 18 0 1 0 30 104';
    const orbit = s.orbit ? `<g class="part orbit" data-t="0.85" data-span="0.15">
      <ellipse cx="100" cy="104" rx="70" ry="18" fill="none" stroke="${s.hi}" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="3 5"/>
      ${[0, 1, 2].map((k) => `<circle r="${4 - k * 0.8}" fill="${['#fde68a', '#f0abfc', '#a5f3fc'][k]}"><animateMotion dur="${5 + k}s" begin="${-k * 1.7}s" repeatCount="indefinite" path="${ring}"/></circle>`).join('')}
    </g>` : '';
    return `<svg class="${cls}" viewBox="0 0 200 240" data-uid="${id}" data-species="${s.id}" style="--ge:${EASES[gw.ease]}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sh-${id}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(0,0,0,.28)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    <linearGradient id="soil-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8a5a35"/><stop offset="100%" stop-color="#5c3a20"/></linearGradient>
    ${s.glow ? `<radialGradient id="gl-${id}"><stop offset="0%" stop-color="${s.glow}" stop-opacity=".55"/><stop offset="100%" stop-color="${s.glow}" stop-opacity="0"/></radialGradient>` : ''}
  </defs>
  <ellipse cx="100" cy="214" rx="70" ry="9" fill="url(#sh-${id})" class="shadow"/>
  <ellipse cx="100" cy="211" rx="30" ry="8" fill="url(#soil-${id})" class="soil"/>
  <ellipse cx="100" cy="205" rx="6" ry="4.5" fill="#a0703f" class="seed"/>
  <g class="shake">
  <g class="grow">
   <g class="sway">
    ${aura}
    <path d="M100 210 Q98.5 198 100 186" stroke="#4caf50" stroke-width="3.2" fill="none" stroke-linecap="round" class="part stem" data-t="0.03" data-span="0.1" data-origin="bottom"/>
    <path d="M100 189 q-13 -11 -22 -3 q10 9 22 3z" fill="#6cc46f" class="part sprout" data-t="0.08" data-span="0.1" data-origin="right"/>
    <path d="M100 187 q13 -12 23 -4 q-10 10 -23 4z" fill="#5bb85e" class="part sprout" data-t="0.11" data-span="0.1" data-origin="left"/>
    <path d="${(m && m.trunk) || 'M93 211 Q96 160 97.5 108 L102.5 108 Q104 160 107 211 Z'}" fill="${s.trunk}" class="part trunk" data-t="0.2" data-span="0.32" data-origin="bottom"/>
    ${branches}
    <g class="canopy">${canopyFor(s)}</g>
    <g class="fruits">${fruit}</g>
    <g class="sparks">${sparks}</g>
    ${orbit}
   </g>
  </g>
  </g>
</svg>`;
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // Overall size: small sapling at first, roughly doubling in size by the 3 hour mark.
  function sizeFor(p, g) { return 0.5 + 0.15 * p + 0.35 * g; }

  // Push growth values onto an existing tree svg. CSS transitions do the smoothing.
  function setGrowth(svg, p, g) {
    if (!svg) return;
    p = clamp01(p); g = clamp01(g || 0);
    const gw = growOf(svg.dataset.species);
    const enter = ENTER[gw.enter] || ENTER.pop, trunk = TRUNK[gw.trunk] || TRUNK.straight, fade = FADE_IN[gw.enter];
    let shown = 0;
    svg.querySelectorAll('.part').forEach((n) => {
      const s = clamp01((p - +n.dataset.t) / +n.dataset.span);
      const c = n.classList;
      if (c.contains('strand')) n.style.transform = `scale(${f(Math.sqrt(s))},${f(s)})`;
      else if (c.contains('leaf')) n.style.transform = enter(s);
      else if (c.contains('trunk') || c.contains('branch')) n.style.transform = trunk(s);
      else n.style.transform = `scale(${s.toFixed(4)})`;
      n.style.opacity = s <= 0 ? 0 : fade && c.contains('leaf') && s < 1 ? f(s) : '';
      if (s > 0 && c.contains('leaf')) shown++;
    });
    svg.querySelectorAll('.gpart').forEach((n) => {
      const s = clamp01((g - +n.dataset.t) / +n.dataset.span);
      n.style.transform = `scale(${s.toFixed(4)})`;
      n.style.opacity = s > 0 ? '' : 0;
    });
    // the first two sprout leaves fade once the real canopy has grown in
    svg.querySelectorAll('.sprout').forEach((n) => { if (p > 0.6) n.style.opacity = 0; });
    const seed = svg.querySelector('.seed');
    if (seed) seed.style.opacity = p < 0.06 ? 1 : 0;
    const grow = svg.querySelector('.grow');
    if (grow) grow.style.transform = `scale(${sizeFor(p, g).toFixed(4)})`;
    const sh = svg.querySelector('.shadow');
    if (sh) sh.style.transform = `scaleX(${(0.2 + 0.8 * p * sizeFor(p, g)).toFixed(3)})`;
    return shown;
  }

  // Growth values for an elapsed number of seconds.
  function growthFor(sec) {
    const p = sec / 600;
    const g = sec <= 600 ? 0 : (sec - 600) / (170 * 60);
    return { p: clamp01(p), g: clamp01(g) };
  }

  window.Tree = { SPECIES, RARITIES, RARITY_ORDER, GROW, get, build, setGrowth, growthFor, sizeFor, growOf };
})();
