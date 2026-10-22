/* Study Tracker: startup intro (loader, logo) and the welcome screen shown on every launch.
   app.js calls Welcome.intro(ctx) and Welcome.show(ctx); ctx carries the data and helpers it needs. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // small seeded random so the landscape looks the same every launch
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------------------------------------------------------------- intro
  // 1) a loading ring while the app gets ready, 2) the logo builds itself, 3) it flies into the screen.
  let skipIntro = null;
  function intro(ctx) {
    const el = document.createElement('div');
    el.id = 'intro';
    el.innerHTML = `
      <div class="in-bg"><div class="in-glow"></div>${'<i class="in-mote"></i>'.repeat(26)}</div>
      <div class="in-loader">
        <svg viewBox="0 0 120 120" class="in-rings">
          <defs><linearGradient id="in-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#a3e635"/></linearGradient></defs>
          <circle cx="60" cy="60" r="50" class="r1"/><circle cx="60" cy="60" r="40" class="r2"/><circle cx="60" cy="60" r="30" class="r3"/>
        </svg>
        <div class="in-core"></div>
        <div class="in-text">Growing your garden<span>.</span><span>.</span><span>.</span></div>
      </div>
      <div class="in-logo">
        <div class="in-tile">
          <svg viewBox="0 0 200 200" class="in-ring"><circle cx="100" cy="100" r="94" class="trk"/><circle cx="100" cy="100" r="94" class="arc"/></svg>
          <div class="in-tree"></div>
          <div class="in-shine"></div>
        </div>
        <div class="in-word">${'Study Tracker'.split('').map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</div>
        <div class="in-tag">Focus. Grow. Repeat.</div>
      </div>
      <div class="in-shock"></div><div class="in-shock s2"></div>
      <div class="in-flash"></div>
      <div class="in-skip">Click to skip</div>
      <div class="wl-drag"></div>`;
    document.body.appendChild(el);
    $$('.in-mote', el).forEach((m, i) => {
      const a = (i / 26) * Math.PI * 2, d = 38 + (i * 37) % 30;
      m.style.cssText = `--x:${(Math.cos(a) * d).toFixed(1)}vmin;--y:${(Math.sin(a) * d).toFixed(1)}vmin;--d:${(1.4 + (i % 5) * 0.25).toFixed(2)}s;--dl:${(-(i * 0.17)).toFixed(2)}s;--s:${2 + (i % 3)}px`;
    });
    $('.in-tree', el).innerHTML = window.Tree.build('oak', 'intro');
    const tree = $('.in-tree .tree', el);
    window.Tree.setGrowth(tree, 0, 0);

    let skipped = false;
    const done = new Promise((resolve) => {
      skipIntro = () => {
        if (skipped) return; skipped = true;
        el.classList.add('skipping');
        setTimeout(() => { el.remove(); resolve(); }, 380);
      };
      const run = async () => {
        await Promise.all([wait(1500), ctx.ready]);
        if (skipped) return;
        el.classList.add('logo');               // loader folds away, tile pops in
        await wait(450);
        if (skipped) return;
        [0.35, 0.7, 1].forEach((p, i) => setTimeout(() => !skipped && window.Tree.setGrowth(tree, p, p === 1 ? 0.7 : 0), i * 260));
        await wait(1150);
        if (skipped) return;
        el.classList.add('shine');              // light sweep + shockwave
        await wait(900);
        if (skipped) return;
        el.classList.add('fly');                // the logo rushes into the screen
        await wait(620);
        if (skipped) return;
        el.classList.add('out');
        skipped = true;
        resolve();
        setTimeout(() => el.remove(), 900);
      };
      run();
    });
    const onSkip = (e) => { if (e.type === 'keydown' && !['Escape', ' ', 'Enter'].includes(e.key)) return; skipIntro && skipIntro(); };
    el.addEventListener('mousedown', onSkip);
    document.addEventListener('keydown', onSkip);
    return done.then(() => { document.removeEventListener('keydown', onSkip); });
  }

  // ---------------------------------------------------------------- welcome screen
  const QUOTES = [
    ['The secret of getting ahead is getting started.', 'Mark Twain'],
    ['Small steps every day add up to big results.', ''],
    ['A tree grows a ring at a time. So do you.', ''],
    ['Success is the sum of small efforts, repeated day in and day out.', 'Robert Collier'],
    ['It always seems impossible until it\'s done.', 'Nelson Mandela'],
    ['The expert in anything was once a beginner.', 'Helen Hayes'],
    ['Don\'t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
    ['Focus on being productive instead of busy.', 'Tim Ferriss'],
    ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Proverb'],
    ['You don\'t have to be great to start, but you have to start to be great.', 'Zig Ziglar'],
    ['Learning never exhausts the mind.', 'Leonardo da Vinci'],
    ['Discipline is choosing between what you want now and what you want most.', ''],
  ];
  function phaseOf(h) {
    if (h >= 5 && h < 7) return 'dawn';
    if (h >= 7 && h < 17) return 'day';
    if (h >= 17 && h < 19) return 'dusk';
    return 'night';
  }
  function greetingOf(h) {
    if (h < 5) return 'Burning the midnight oil';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  // hills: a smooth curve on a 1000 x 300 box; y(x) is reused to stand trees on the slope
  function hillFn(seed, base, amp, peaks) {
    const r = rng(seed);
    const waves = Array.from({ length: 3 }, (_, i) => ({ f: (i + 1) * (0.9 + r() * 0.6) * Math.PI / 1000, p: r() * Math.PI * 2, a: amp / (i + 1.4) }));
    return (x) => {
      let y = base;
      waves.forEach((w) => { y -= Math.sin(x * w.f + w.p) * w.a; });
      (peaks || []).forEach(([cx, h, wdt]) => { y -= h * Math.exp(-((x - cx) ** 2) / (2 * wdt * wdt)); });
      return y;
    };
  }
  function hillPath(fn) {
    let d = `M0 300 L0 ${fn(0).toFixed(1)}`;
    for (let x = 10; x <= 1000; x += 10) d += ` L${x} ${fn(x).toFixed(1)}`;
    return d + ' L1000 300 Z';
  }

  let state = null;
  function show(ctx) {
    return new Promise((resolve) => {
      const now = new Date(), h = now.getHours();
      const phase = phaseOf(h);
      const D = ctx.D;
      const root = document.createElement('div');
      root.id = 'welcome';
      root.className = `ph-${phase}`;
      const species = window.Tree.SPECIES;
      const showcase = species.filter((s) => ['common', 'uncommon', 'rare'].includes(s.rarity));
      const far = species.filter((s) => s.rarity === 'legendary' || s.rarity === 'mythical');
      const owned = (id) => (D.collection.owned[id] || 0) > 0;

      // layers, back to front: depth sets how much each one follows the mouse
      const L = {
        far: { fn: hillFn(11, 205, 10, [[640, 70, 120]]), h: 70, depth: 0.08 },
        ridge: { fn: hillFn(23, 170, 26, [[180, 30, 160]]), h: 62, depth: 0.16 },
        mid: { fn: hillFn(37, 150, 22, [[820, 26, 130]]), h: 44, depth: 0.32 },
        near: { fn: hillFn(51, 120, 30, [[120, 30, 150], [930, 24, 120]]), h: 33, depth: 0.6 },
      };
      const r = rng(7);
      // tree spots: [layer, x(0-1000), species]
      const spots = [];
      // the far hill: legendary trees around the mythical Celestial Elder at the top
      [['aurora', 560], ['sunfire', 715], ['spirit', 600], ['celestial', 645]].forEach(([id, x]) => { if (far.find((f) => f.id === id)) spots.push(['far', x, id]); });
      // the ridge and mid hills: a loose forest of every common-to-rare tree.
      // The gap in the middle keeps the view to the far hill open.
      const ridgeXs = [60, 140, 215, 300, 380, 455, 800, 880, 955];
      ridgeXs.forEach((x, i) => spots.push(['ridge', x + (r() - 0.5) * 30, showcase[(i * 7 + 1) % showcase.length].id]));
      const midXs = [25, 95, 165, 235, 305, 375, 445, 510, 775, 845, 910, 975];
      midXs.forEach((x, i) => spots.push(['mid', x + (r() - 0.5) * 26, showcase[(i * 5 + 3) % showcase.length].id]));
      // the near hills: bigger trees, rare ones get the best spots
      const nearXs = [35, 150, 270, 395, 800, 890, 975];
      const nearOrder = showcase.slice().sort((a, b) => ['rare', 'uncommon', 'common'].indexOf(a.rarity) - ['rare', 'uncommon', 'common'].indexOf(b.rarity));
      nearXs.forEach((x, i) => spots.push(['near', x + (r() - 0.5) * 24, nearOrder[(i * 3) % nearOrder.length].id]));

      const treeHtml = (layer, x, id, i) => {
        const y = L[layer].fn(x);
        const bottom = ((300 - y) / 300) * 100;
        const sp = window.Tree.get(id);
        const big = layer === 'near', far_ = layer === 'far';
        const hgt = far_ ? (id === 'celestial' ? 7.2 : 5.4) : big ? 21 + r() * 5 : layer === 'ridge' ? 6.5 + r() * 2 : 11 + r() * 3.5;
        const sec = 2 * 3600 + Math.floor(r() * 3600);
        return `<div class="wl-tree${far_ ? ' far' : ''}${id === 'celestial' ? ' mythic' : ''}" data-sp="${id}" style="left:${(x / 10).toFixed(2)}%;bottom:calc(${bottom.toFixed(2)}% - ${far_ ? 0.4 : 1}vh);height:${hgt.toFixed(1)}vh;--i:${i};--sw:${(5.5 + r() * 3).toFixed(2)}s;--dl:${(-r() * 6).toFixed(2)}s">
          ${id === 'celestial' ? '<div class="my-aura"><i class="my-rays"></i><i class="my-glow"></i>' + Array.from({ length: 12 }, (_, k) => `<b style="--x:${(Math.cos(k * 2.4) * (2 + (k % 4))).toFixed(2)}vh;--y:${(Math.sin(k * 2.4) * (1.5 + (k % 3)) - 1).toFixed(2)}vh;--d:${(3 + (k % 4) * 0.7).toFixed(1)}s;--dl:${(-k * 0.45).toFixed(2)}s"></b>`).join('') + '</div>' : ''}
          ${ctx.staticTree(id, sec, false, `wl${i}`, true)}${far_ ? '' : owned(id) ? '' : '<span class="wl-lock"></span>'}
        </div>`;
      };
      const layerHtml = (name, extra = '') => {
        const l = L[name];
        return `<div class="wl-layer l-${name}" style="height:${l.h}%;--depth:${l.depth}">
          <svg class="wl-hill" viewBox="0 0 1000 300" preserveAspectRatio="none"><path d="${hillPath(l.fn)}"/></svg>
          ${spots.map((s, i) => (s[0] === name ? treeHtml(s[0], s[1], s[2], i) : '')).join('')}${extra}
        </div>`;
      };
      // grass blades and flowers along the very front
      let grass = '';
      const gr = rng(99);
      for (let i = 0; i < 140; i++) grass += `<i class="blade" style="left:${(i / 1.4).toFixed(2)}%;--h:${(14 + gr() * 26).toFixed(0)}px;--r:${((gr() - 0.5) * 18).toFixed(1)}deg;--d:${(2.4 + gr() * 2).toFixed(2)}s;--dl:${(-gr() * 3).toFixed(2)}s"></i>`;
      const FLOW = ['#f9a8d4', '#fde047', '#c4b5fd', '#ffffff', '#fdba74'];
      for (let i = 0; i < 26; i++) grass += `<i class="flower" style="left:${(gr() * 100).toFixed(2)}%;--c:${FLOW[i % FLOW.length]};--h:${(10 + gr() * 18).toFixed(0)}px;--dl:${(-gr() * 3).toFixed(2)}s"></i>`;

      // ---- data for the panels
      const today = ctx.todayTotal();
      const streak = ctx.streak();
      const grown = D.trees.length;
      const next = ctx.nextEvent();
      const week = ctx.weekTotals(); // [{label, sec, today}]
      const wmax = Math.max(1, ...week.map((w) => w.sec));
      const q = QUOTES[(now.getFullYear() * 400 + now.getMonth() * 31 + now.getDate()) % QUOTES.length];
      const name = D.profile.name;
      const hello = greetingOf(h) + (name ? `, ${name}` : '');
      const unc = ctx.unclaimed(), free = ctx.freeCases();
      const titleHtml = hello.split(' ').map((w, wi) => `<span class="wd">${w.split('').map((c, ci) => `<span class="ch" style="--i:${wi * 6 + ci}">${esc(c)}</span>`).join('')}</span>`).join(' ');

      root.innerHTML = `
        <div class="wl-scene" id="wl-scene">
          <div class="wl-sky"><div class="wl-stars">${Array.from({ length: 90 }, (_, i) => `<i style="left:${((i * 47.3) % 100).toFixed(1)}%;top:${((i * 23.9) % 58).toFixed(1)}%;--s:${1 + (i % 3)}px;--d:${2 + (i % 5)}s;--dl:${(-i * 0.31).toFixed(2)}s"></i>`).join('')}</div>
            <div class="wl-aurora"></div>
            <div class="wl-orb" style="--depth:.04"><div class="wl-orb-in"></div></div>
            <div class="wl-clouds" style="--depth:.06"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i></div>
            <div class="wl-birds"></div>
          </div>
          ${layerHtml('far')}
          <div class="wl-haze h1"></div>
          ${layerHtml('ridge')}
          <div class="wl-haze h2"></div>
          ${layerHtml('mid')}
          ${layerHtml('near')}
          <div class="wl-grass" style="--depth:.9"><div class="gr-in">${grass}</div></div>
          <div class="wl-life"></div>
        </div>
        <canvas class="wl-fx"></canvas>
        <div class="wl-drag"></div>
        <div class="wl-ui">
          <div class="wl-top">
            <div class="wl-hello">
              <div class="wl-date">${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <h1 class="wl-title">${titleHtml}</h1>
              <p class="wl-quote">“${esc(q[0])}”${q[1] ? `<span> ${esc(q[1])}</span>` : ''}</p>
              <div class="wl-stats">
                <div class="wl-stat" style="--i:0"><span class="k">Today</span><span class="v" data-sec="${today}">0m</span></div>
                <div class="wl-stat" style="--i:1"><span class="k">Streak</span><span class="v"><b class="flame${streak ? ' on' : ''}"></b><span data-n="${streak}">0</span> day${streak === 1 ? '' : 's'}</span></div>
                <div class="wl-stat" style="--i:2"><span class="k">Trees grown</span><span class="v" data-n="${grown}">0</span></div>
                <div class="wl-stat" style="--i:3"><span class="k">Coins</span><span class="v"><span class="coin sm"></span><span data-n="${D.coins}">0</span></span></div>
              </div>
            </div>
            <div class="wl-side">
              <div class="wl-card next" style="--i:0">
                <div class="k">Next up</div>
                ${next ? `<div class="nx" style="--c:${next.color}"><i></i><div><b>${esc(next.label)}</b><span>${esc(next.subject)} · ${esc(next.type)}</span></div><span class="when${next.days <= 3 ? ' soon' : ''}">${esc(next.when)}</span></div>`
                  : '<div class="nx empty">No tests or assignments coming up. Add them in the Calendar.</div>'}
              </div>
              <div class="wl-card week" style="--i:1">
                <div class="k">This week <span>${ctx.fmtDur(week.reduce((a, w) => a + w.sec, 0))}</span></div>
                <div class="wk">${week.map((w, i) => `<div class="wb${w.today ? ' today' : ''}" style="--i:${i};--p:${(w.sec / wmax).toFixed(3)}" title="${ctx.fmtDur(w.sec)}"><i></i><span>${w.label}</span></div>`).join('')}</div>
              </div>
              ${unc || free ? `<div class="wl-card perks" style="--i:2">${unc ? `<button class="perk" data-go="badges"><b>${unc}</b> reward${unc > 1 ? 's' : ''} to claim</button>` : ''}${free ? `<button class="perk" data-go="trees"><b>${free}</b> free case${free > 1 ? 's' : ''} to open</button>` : ''}</div>` : ''}
            </div>
          </div>
          <div class="wl-actions">
            ${ctx.paused ? `<button class="btn primary big wl-go" data-go="resume"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>Resume ${esc(ctx.paused.subject)} <small>${ctx.fmtDur(ctx.paused.sec)}</small></button>`
              : '<button class="btn primary big wl-go" data-go="timer"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>Start studying</button>'}
            <button class="btn wl-btn" data-go="calendar"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>Calendar</button>
            <button class="btn wl-btn" data-go="grades"><svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5z"/><path d="M8.5 17l3-8 3 8M9.6 14.3h3.8"/></svg>Grades</button>
            <button class="btn wl-btn" data-go="garden"><svg viewBox="0 0 24 24"><path d="M12 22v-8M12 14c-4 0-7-3-7-7 4 0 7 3 7 7zM12 12c0-4 3-7 7-7 0 4-3 7-7 7z"/></svg>Garden</button>
          </div>
          <div class="wl-hint">Press <kbd>Enter</kbd> to start · hover the trees · something glows on the far hill…</div>
        </div>
        <div class="wl-tip" id="wl-tip"></div>
        <div class="wl-caption" id="wl-caption"></div>`;
      document.body.appendChild(root);
      ctx.paintTrees(root);

      // ---- life: birds by day, fireflies at night, butterflies, falling leaves
      const life = $('.wl-life', root);
      let lh = '';
      if (phase !== 'night') {
        $('.wl-birds', root).innerHTML = Array.from({ length: 4 }, (_, i) => `<span class="bird" style="--top:${10 + i * 7}%;--dur:${24 + i * 6}s;--dl:${-i * 7}s;--sc:${1 - i * 0.16}"><svg viewBox="0 0 30 12"><path d="M1 8Q8 0 15 7Q22 0 29 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`).join('');
        lh += ctx.butterflies(5, 'wl');
      } else {
        for (let i = 0; i < 26; i++) lh += `<i class="ffly" style="left:${(i * 29.3) % 96 + 2}%;top:${(i * 17.7) % 34 + 58}%;--dur:${5 + (i % 4)}s;--dl:${-i * 0.9}s"></i>`;
      }
      for (let i = 0; i < 9; i++) lh += `<i class="wl-fall" style="--x:${(i * 11.3) % 100}%;--dur:${11 + (i % 5) * 2}s;--dl:${-i * 2.3}s;--c:${['#86efac', '#fcd34d', '#fb923c', '#f9a8d4'][i % 4]}"></i>`;
      life.innerHTML = lh;

      // ---- count-up numbers and the greeting reveal
      requestAnimationFrame(() => root.classList.add('in'));
      setTimeout(() => {
        $$('.wl-stat [data-n]', root).forEach((el) => ctx.animateNumber(el, +el.dataset.n, (v) => Math.round(v).toLocaleString(), 1400));
        $$('.wl-stat [data-sec]', root).forEach((el) => ctx.animateNumber(el, +el.dataset.sec, (v) => ctx.fmtDur(v), 1400));
      }, 900);

      // ---- parallax: every layer follows the mouse by its depth (smoothed)
      const scene = $('#wl-scene', root);
      const layers = $$('[style*="--depth"]', scene);
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, alive = true;
      const onMove = (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; trail(e); };
      root.addEventListener('mousemove', onMove);
      const tick = () => {
        if (!alive) return;
        cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
        layers.forEach((l) => { const d = +l.style.getPropertyValue('--depth'); l.style.transform = `translate3d(${(-cx * d * 90).toFixed(2)}px, ${(-cy * d * 40).toFixed(2)}px, 0)`; });
        $('.wl-ui', root).style.transform = `translate3d(${(cx * 10).toFixed(2)}px, ${(cy * 6).toFixed(2)}px, 0)`;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      // ---- a little particle canvas just for this screen (mouse trail, bursts, shooting stars)
      const cv = $('.wl-fx', root), cxx = cv.getContext('2d');
      const dpr = devicePixelRatio || 1;
      const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
      size();
      addEventListener('resize', size);
      let parts = [], lastTrail = 0;
      function trail(e) {
        const t = performance.now();
        if (t - lastTrail < 34) return;
        lastTrail = t;
        parts.push({ x: e.clientX, y: e.clientY, vx: (Math.random() - 0.5) * 0.6, vy: -0.2 - Math.random() * 0.5, life: 1, decay: 0.02, r: 1.4 + Math.random() * 1.6, c: phase === 'night' ? '#fef9c3' : '#ffffff', glow: true, g: -0.004 });
      }
      function sparkle(x, y, colors, n = 26, speed = 4) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, decay: 0.012 + Math.random() * 0.012, r: 1.5 + Math.random() * 3, c: colors[i % colors.length], glow: true, g: 0.06, star: Math.random() < 0.5 });
        }
      }
      function shootingStar(x, y) {
        const a = Math.PI * (0.78 + Math.random() * 0.1);
        for (let i = 0; i < 26; i++) parts.push({ x: x - Math.cos(a) * i * 4, y: y - Math.sin(a) * i * 4, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, life: 1 - i * 0.03, decay: 0.022, r: 2.4 - i * 0.07, c: '#ffffff', glow: true, g: 0 });
      }
      const fxLoop = () => {
        if (!alive) return;
        cxx.clearRect(0, 0, cv.width, cv.height);
        parts = parts.filter((p) => p.life > 0);
        for (const p of parts) {
          p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life -= p.decay;
          cxx.globalAlpha = Math.max(0, Math.min(1, p.life));
          cxx.fillStyle = p.c;
          cxx.shadowColor = p.c; cxx.shadowBlur = p.glow ? 8 * dpr : 0;
          cxx.beginPath();
          if (p.star) { const R = p.r * dpr * 1.5; for (let k = 0; k < 8; k++) { const an = (k / 8) * Math.PI * 2, rr = k % 2 ? R * 0.35 : R; cxx.lineTo(p.x * dpr + Math.cos(an) * rr, p.y * dpr + Math.sin(an) * rr); } cxx.closePath(); }
          else cxx.arc(p.x * dpr, p.y * dpr, Math.max(0.1, p.r * dpr), 0, Math.PI * 2);
          cxx.fill();
        }
        requestAnimationFrame(fxLoop);
      };
      requestAnimationFrame(fxLoop);
      // a shooting star every so often at night, and a gust of wind now and then
      const timers = [];
      if (phase === 'night') timers.push(setInterval(() => shootingStar(innerWidth * (0.3 + Math.random() * 0.7), innerHeight * (0.05 + Math.random() * 0.2)), 5200));
      timers.push(setInterval(() => { root.classList.add('gust'); setTimeout(() => root.classList.remove('gust'), 2600); }, 9000));

      // ---- trees: tooltip, shake on hover (app.js handles .shake), a burst of their own particles on click
      const tip = $('#wl-tip', root);
      const RAR = window.Tree.RARITIES;
      $$('.wl-tree', root).forEach((t) => {
        const sp = window.Tree.get(t.dataset.sp), rr = RAR[sp.rarity];
        const isFar = t.classList.contains('far');
        t.addEventListener('mouseenter', () => {
          tip.innerHTML = isFar
            ? (sp.rarity === 'mythical' ? '<b>Something glows on the far hill…</b><span>Click to take a closer look</span>' : '<b>A faint shape in the distance</b><span>Click to take a closer look</span>')
            : `<b>${esc(sp.name)}</b><span style="color:${rr.color}">${rr.name}${rr.boost ? ` · +${Math.round(rr.boost * 100)}% coins` : ''}</span><span>${owned(sp.id) ? 'In your collection' : 'Unlock it from a case'}</span>`;
          tip.classList.add('show');
        });
        t.addEventListener('mousemove', (e) => { tip.style.left = `${e.clientX + 16}px`; tip.style.top = `${e.clientY - 12}px`; });
        t.addEventListener('mouseleave', () => tip.classList.remove('show'));
        t.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isFar) return focusFar(t, sp);
          const b = t.getBoundingClientRect();
          ctx.treeBurst(sp.id, b);
          t.classList.remove('hop'); void t.offsetWidth; t.classList.add('hop');
        });
      });
      // zoom the whole landscape towards a far-off tree and name it
      let focused = false;
      function focusFar(t, sp) {
        if (focused) return;
        focused = true;
        const b = t.getBoundingClientRect();
        const ox = b.left + b.width / 2, oy = b.top + b.height / 2;
        // zoom in around the tree and bring it towards the middle of the screen
        scene.style.transformOrigin = `${ox}px ${oy}px`;
        scene.style.transform = `translate(${(innerWidth / 2 - ox).toFixed(0)}px, ${(innerHeight * 0.6 - oy).toFixed(0)}px) scale(3.2)`;
        root.classList.add('focus');
        tip.classList.remove('show');
        const rr = RAR[sp.rarity];
        const cap = $('#wl-caption', root);
        cap.innerHTML = `<span class="r" style="color:${rr.color}">${rr.name}</span><b>${esc(sp.name)}</b><span>${sp.rarity === 'mythical' ? 'Found in a Grove Chest (1%) or a Mythic Vault (12%). It earns +35% coins.' : `A legendary tree. Find one in a Grove Chest or a Mythic Vault. It earns +${Math.round(rr.boost * 100)}% coins.`}</span>${owned(sp.id) ? '<em>You own this one ✨</em>' : ''}`;
        cap.classList.add('show');
        setTimeout(() => sparkle(innerWidth / 2, innerHeight * 0.6 - b.height * 1.2, sp.rarity === 'mythical' ? ['#f0abfc', '#818cf8', '#fde68a', '#a5f3fc'] : [rr.color, '#ffffff'], 60, 6), 700);
        setTimeout(() => { root.classList.remove('focus'); scene.style.transform = ''; cap.classList.remove('show'); setTimeout(() => { focused = false; }, 1500); }, 4200);
      }
      // the sky: click for sparkles (or a shooting star at night); the sun and moon pulse
      $('.wl-sky', root).addEventListener('click', (e) => {
        if (e.target.closest('.wl-orb')) { const o = $('.wl-orb', root); o.classList.remove('pulse'); void o.offsetWidth; o.classList.add('pulse'); }
        if (phase === 'night') shootingStar(e.clientX, e.clientY);
        else sparkle(e.clientX, e.clientY, ['#ffffff', '#fde68a', '#bae6fd'], 18, 3);
      });
      $$('.blade, .flower', root).forEach((g) => g.addEventListener('mouseenter', () => { g.classList.remove('brush'); void g.offsetWidth; g.classList.add('brush'); }));

      // ---- leaving: fly down into the hills, then hand back to the app
      let leaving = false;
      const leave = (page) => {
        if (leaving) return;
        leaving = true;
        scene.style.transform = '';
        root.classList.add('leaving');
        ctx.onLeave(page);
        setTimeout(() => {
          alive = false; cancelAnimationFrame(raf); timers.forEach(clearInterval);
          removeEventListener('resize', size);
          document.removeEventListener('keydown', onKey);
          root.remove();
          resolve(page);
        }, 1000);
      };
      $$('[data-go]', root).forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const r2 = b.getBoundingClientRect();
        sparkle(r2.left + r2.width / 2, r2.top + r2.height / 2, ['#ffffff', '#86efac', '#fde68a'], 30, 5);
        leave(b.dataset.go);
      }));
      const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); leave('timer'); } if (e.key === 'Escape') leave(null); };
      document.addEventListener('keydown', onKey);
      state = { leave };
    });
  }

  window.Welcome = { intro, show, skip: () => skipIntro && skipIntro() };
})();
