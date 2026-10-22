// Procedural tree drawing shared by the timer, the garden, history, the shop and the mini player.
// growth: p = 0..1 covers the first 10 minutes (seed -> young tree),
//         g = 0..1 covers 10 -> 180 minutes (the tree keeps getting bigger and grows fruit).
(function () {
  const RARITIES = {
    common:    { name: 'Common',    color: '#9ca3af', boost: 0,    refund: 15 },
    uncommon:  { name: 'Uncommon',  color: '#4ade80', boost: 0,    refund: 35 },
    rare:      { name: 'Rare',      color: '#38bdf8', boost: 0.05, refund: 80 },
    epic:      { name: 'Epic',      color: '#c084fc', boost: 0.10, refund: 180 },
    legendary: { name: 'Legendary', color: '#fbbf24', boost: 0.20, refund: 450 },
    mythical:  { name: 'Mythical',  color: '#ff4d8d', boost: 0.35, refund: 1200 },
  };
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'];

  // Species ids from 1.0.x (oak, pine, blossom, maple, mint, gold, spruce) must never change.
  const SPECIES = [
    { id: 'oak', name: 'Oak', rarity: 'common', starter: true, shape: 'round', leaf1: '#45a852', leaf2: '#2e7d3b', hi: '#7fd38a', trunk: '#7a4b2a', fruit: '#ef4444' },
    { id: 'pine', name: 'Pine', rarity: 'common', starter: true, shape: 'pine', leaf1: '#2f8a5c', leaf2: '#1f6542', hi: '#5fbf8a', trunk: '#6b4226', fruit: '#c08a3e' },
    { id: 'birch', name: 'Birch', rarity: 'common', shape: 'round', leaf1: '#a3d96b', leaf2: '#76b947', hi: '#d4f0b0', trunk: '#e9e4d8', fruit: '#facc15' },
    { id: 'fir', name: 'Fir', rarity: 'common', shape: 'pine', leaf1: '#1f7a4d', leaf2: '#145634', hi: '#3fa36f', trunk: '#5a3a22', fruit: '#a16207' },
    { id: 'maple', name: 'Maple', rarity: 'uncommon', shape: 'round', leaf1: '#fb923c', leaf2: '#e2571a', hi: '#fdc28a', trunk: '#6b3f2a', fruit: '#fde047' },
    { id: 'spruce', name: 'Blue spruce', rarity: 'uncommon', shape: 'pine', leaf1: '#5b9bb5', leaf2: '#3a7189', hi: '#9cc9db', trunk: '#5e4030', fruit: '#f8fafc' },
    { id: 'mint', name: 'Mint willow', rarity: 'uncommon', shape: 'round', leaf1: '#5eead4', leaf2: '#16a394', hi: '#b2f5ea', trunk: '#5b3b26', fruit: '#a78bfa' },
    { id: 'apple', name: 'Apple', rarity: 'uncommon', shape: 'round', leaf1: '#4fb35a', leaf2: '#2f8a3c', hi: '#8ad693', trunk: '#73492b', fruit: '#dc2626', fruitAlways: true },
    { id: 'cypress', name: 'Cypress', rarity: 'uncommon', shape: 'cypress', leaf1: '#2f7d4f', leaf2: '#205c39', hi: '#4fa874', trunk: '#5b3b26', fruit: '#a3e635' },
    { id: 'blossom', name: 'Cherry blossom', rarity: 'rare', shape: 'round', leaf1: '#f9a8d4', leaf2: '#ec6fae', hi: '#ffd6ea', trunk: '#5e3a2a', fruit: '#ffffff' },
    { id: 'gold', name: 'Golden ash', rarity: 'rare', shape: 'round', leaf1: '#fcd34d', leaf2: '#d99a06', hi: '#fff1b3', trunk: '#6e4a2c', fruit: '#f97316' },
    { id: 'willow', name: 'Weeping willow', rarity: 'rare', shape: 'willow', leaf1: '#86c55a', leaf2: '#5e9c3a', hi: '#b8e391', trunk: '#6b4a2e', fruit: '#fef08a' },
    { id: 'crimson', name: 'Crimson oak', rarity: 'rare', shape: 'round', leaf1: '#ef4444', leaf2: '#b91c1c', hi: '#fca5a5', trunk: '#4a2c20', fruit: '#fde68a' },
    { id: 'frost', name: 'Frost pine', rarity: 'epic', shape: 'pine', leaf1: '#e0f2fe', leaf2: '#a5d8f3', hi: '#ffffff', trunk: '#64748b', fruit: '#7dd3fc', sparkle: '#ffffff', glow: '#bae6fd' },
    { id: 'twilight', name: 'Twilight', rarity: 'epic', shape: 'round', leaf1: '#a78bfa', leaf2: '#6d28d9', hi: '#ddd6fe', trunk: '#3b2a4f', fruit: '#f0abfc', sparkle: '#f5d0fe' },
    { id: 'ember', name: 'Ember', rarity: 'epic', shape: 'cypress', leaf1: '#fb7185', leaf2: '#e11d48', hi: '#fecdd3', trunk: '#3f1d1d', fruit: '#fdba74', glow: '#fb7185' },
    { id: 'aurora', name: 'Aurora', rarity: 'legendary', shape: 'round', leaf1: '#4ade80', leaf2: '#22d3ee', hi: '#e0f2fe', trunk: '#334155', fruit: '#f0abfc', glow: '#67e8f9', sparkle: '#ffffff', hue: true },
    { id: 'sunfire', name: 'Sunfire', rarity: 'legendary', shape: 'round', leaf1: '#fde047', leaf2: '#f59e0b', hi: '#fffbeb', trunk: '#78350f', fruit: '#ffffff', glow: '#fcd34d', sparkle: '#fff7cc' },
    { id: 'spirit', name: 'Spirit willow', rarity: 'legendary', shape: 'willow', leaf1: '#99f6e4', leaf2: '#2dd4bf', hi: '#f0fdfa', trunk: '#1e3a3a', fruit: '#e0e7ff', glow: '#5eead4', sparkle: '#ccfbf1', translucent: true },
    { id: 'celestial', name: 'Celestial Elder', rarity: 'mythical', shape: 'round', leaf1: '#818cf8', leaf2: '#5b21b6', hi: '#f5d0fe', trunk: '#1e1b4b', fruit: '#fde68a', glow: '#c084fc', sparkle: '#ffffff', hue: true, orbit: true },
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

  const get = (id) => SPECIES.find((x) => x.id === id) || SPECIES[0];

  function canopyFor(s) {
    let c = '';
    const leaf = (tag, attrs, fill, t, i, origin) =>
      `<${tag} ${attrs} fill="${fill}" class="part leaf" style="--i:${i}" data-t="${t}" data-span="0.12"${origin ? ` data-origin="${origin}"` : ''}/>`;
    const order = growOf(s.id).order;
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
          c += `<path d="M${x} ${y1} Q${x + (i % 2 ? 4 : -4)} ${(y1 + y2) / 2} ${x} ${y2}" stroke="${i % 2 ? s.leaf1 : s.leaf2}" stroke-width="7" stroke-linecap="round" fill="none" class="part leaf strand" style="--i:${i + 4}" data-t="${0.7 + i * 0.03}" data-span="0.12" data-origin="top"/>`;
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
    let fruit = '';
    FRUITS.forEach(([cx, cy, t], i) => {
      const y = pineLike ? cy + 26 : s.shape === 'willow' ? cy - 6 : cy;
      fruit += `<circle cx="${cx}" cy="${y}" r="4.5" fill="${s.fruit}" stroke="rgba(0,0,0,.15)" stroke-width="1" class="${s.fruitAlways ? 'part' : 'gpart'} fruit" style="--i:${i}" data-t="${s.fruitAlways ? 0.85 + i * 0.02 : t}" data-span="0.08"/>`;
    });
    let sparks = '';
    if (s.sparkle) {
      SPARKS.forEach(([x, y], i) => {
        sparks += `<path d="M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6}Z" fill="${s.sparkle}" class="part spark" style="--i:${i}" data-t="0.75" data-span="0.15"/>`;
      });
    }
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
    <path d="M93 211 Q96 160 97.5 108 L102.5 108 Q104 160 107 211 Z" fill="${s.trunk}" class="part trunk" data-t="0.2" data-span="0.32" data-origin="bottom"/>
    ${s.shape === 'round' || s.shape === 'willow' ? `<path d="M99 156 Q86 146 76 132" stroke="${s.trunk}" stroke-width="4.5" fill="none" stroke-linecap="round" class="part branch" data-t="0.42" data-span="0.12" data-origin="right"/>
    <path d="M101 146 Q116 136 125 122" stroke="${s.trunk}" stroke-width="4.5" fill="none" stroke-linecap="round" class="part branch" data-t="0.46" data-span="0.12" data-origin="left"/>` : ''}
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
