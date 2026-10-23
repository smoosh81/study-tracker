/* Study Tracker: main window logic */
(function () {
  'use strict';

  // ---------------- constants ----------------
  const ROOT_SEC = 600;              // 10 minutes for a tree to take root
  // Coins (since 1.3.0): 1 coin per minute studied, paid once the tree takes root at 10 minutes
  // (so rooting pays 10 at once), plus a 5 coin bonus at every full hour. Rare trees multiply it.
  const HOUR_BONUS = 5;
  function coinsFor(sec, species) {
    if (sec < ROOT_SEC) return 0;
    const base = Math.floor(sec / 60) + HOUR_BONUS * Math.floor(sec / 3600);
    return Math.round(base * (1 + boostOf(species)));
  }
  const PALETTE = ['#4ade80', '#38bdf8', '#fb923c', '#f472b6', '#a78bfa', '#facc15', '#2dd4bf', '#f87171', '#60a5fa', '#c084fc', '#34d399', '#fbbf24', '#e879f9', '#94a3b8', '#a3e635', '#22d3ee', '#fda4af', '#d97706'];
  const THEMES = [
    { id: 'forest', name: 'Forest', bg: '#0e1913', sf: '#16281e', ac: '#4ade80', a2: '#a3e635', tx: '#e8f1ea', dark: true },
    { id: 'ocean', name: 'Ocean', bg: '#0a1420', sf: '#112133', ac: '#38bdf8', a2: '#818cf8', tx: '#e6f0f8', dark: true },
    { id: 'sunset', name: 'Sunset', bg: '#1a0f12', sf: '#28171d', ac: '#fb923c', a2: '#f472b6', tx: '#f8ece6', dark: true },
    { id: 'midnight', name: 'Midnight', bg: '#08080e', sf: '#12121d', ac: '#a78bfa', a2: '#22d3ee', tx: '#ececf5', dark: true },
    { id: 'paper', name: 'Paper', bg: '#f3efe7', sf: '#fffdf9', ac: '#2f855a', a2: '#d69e2e', tx: '#1f2420', dark: false },
    { id: 'sakura', name: 'Sakura', bg: '#fbf0f2', sf: '#ffffff', ac: '#db2777', a2: '#f59e0b', tx: '#2b1d22', dark: false },
    { id: 'lavender', name: 'Lavender', bg: '#f2f0fb', sf: '#ffffff', ac: '#7c3aed', a2: '#06b6d4', tx: '#1f1b2e', dark: false },
  ];
  const PRESET_SUBJECTS = [
    'English', 'English Language', 'Literature', 'General Maths', 'Mathematical Methods', 'Specialist Maths',
    'Physics', 'Chemistry', 'Biology', 'Psychology', 'Economics', 'Accounting', 'Business Management',
    'Legal Studies', 'History', 'Geography', 'Health & Human Dev', 'Physical Education',
    'Visual Comm Design', 'Studio Arts', 'Media', 'Software Development', 'Languages', 'Music',
  ];
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  const XICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // ---------------- helpers ----------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fmtHMS = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`; };
  const fmtMS = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; };
  function fmtDur(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    if (m) return `${m}m`;
    return sec > 0 ? `${sec}s` : '0m';
  }
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfWeek = (d) => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function animateNumber(el, to, fmt, dur = 800) {
    const from = +el.dataset.val || 0;
    el.dataset.val = to;
    if (el._raf) cancelAnimationFrame(el._raf);
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(from + (to - from) * easeOut(k));
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  // ---------------- data ----------------
  // SCHEMA is the save-file format version. Bump it and add a migration below whenever
  // the save format changes, so older saves are always upgraded instead of lost.
  const SCHEMA = 10;
  const MIGRATIONS = {
    // 1 -> 2 (app 1.0.1): subjects can be archived; coins are counted per 10-minute milestone
    1: (d) => {
      (d.subjects || []).forEach((s) => { s.archived = !!s.archived; });
      if (d.active) {
        d.active.milestones = d.active.rooted ? 1 + (d.active.bonuses || 0) : 0;
        delete d.active.bonuses;
      }
      return 'Added "finished subject" flag; coin tracking switched to 10-minute milestones';
    },
    // 2 -> 3 (app 1.1.0): tree collection + cases, each session remembers its tree, tutorial flag
    2: (d) => {
      const trees = Array.isArray(d.trees) ? d.trees : [];
      const sessions = Array.isArray(d.sessions) ? d.sessions : [];
      const owned = { oak: 1, pine: 1 };
      trees.forEach((t) => { if (t.species) owned[t.species] = Math.max(owned[t.species] || 0, 1); });
      if (d.active && d.active.species) owned[d.active.species] = Math.max(owned[d.active.species] || 0, 1);
      d.collection = { owned, opened: 0 };
      // link existing garden trees to the session they grew in
      trees.forEach((t) => {
        const s = sessions.find((x) => x.subject === t.subject && x.date === t.date);
        if (s) { s.tree = t.species; s.outcome = 'grown'; t.sessionId = s.id; }
      });
      if (d.active) {
        d.active.sessionId = d.active.sessionId || uid();
        const t = trees.find((x) => x.id === d.active.treeId);
        if (t) t.sessionId = d.active.sessionId;
      }
      const last = trees.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      d.selectedTree = last ? last.species : 'oak';
      d.profile = d.profile || {};
      d.profile.tutorialSeen = false;
      return 'Added tree collection and cases; sessions now remember their tree; garden trees linked to sessions';
    },
    // 3 -> 4 (app 1.2.0): favourite trees (kept at the front of the tree picker)
    3: (d) => {
      if (!Array.isArray(d.favTrees)) d.favTrees = [];
      return 'Added favourite trees';
    },
    // 4 -> 5 (app 1.3.0): achievements; the garden's withered count now comes from history
    4: (d) => {
      if (!d.achievements || typeof d.achievements !== 'object') d.achievements = {};
      d.badgesSeeded = false; // badges already earned are awarded quietly on first launch
      if (d.active) d.active.hours = Math.floor(((d.active.acc || 0) / 1000) / 3600);
      return 'Added achievements; coins now paid per minute; withered count taken from history';
    },
    // 5 -> 6 (app 1.5.0): calendar, grade calculator, achievement rewards, free cases.
    // Everyone upgrading gets one free Seed Pouch (once, here). Badges already earned can claim their reward.
    5: (d) => {
      if (!Array.isArray(d.events)) d.events = [];
      if (!d.gradeExtras || typeof d.gradeExtras !== 'object') d.gradeExtras = {};
      if (!d.gradeTargets || typeof d.gradeTargets !== 'object') d.gradeTargets = {};
      if (!d.grading || typeof d.grading !== 'object') d.grading = { scale: 'school', cuts: {} };
      if (!d.badgeClaims || typeof d.badgeClaims !== 'object') d.badgeClaims = {};
      d.freeCases = d.freeCases && typeof d.freeCases === 'object' ? d.freeCases : {};
      d.freeCases.seed = (+d.freeCases.seed || 0) + 1;
      d.giftNotice = 'upgrade';
      return 'Added calendar, grades and achievement rewards; one free Seed Pouch for upgrading';
    },
    // 6 -> 7 (app 1.6.0): school grades now go E, E+, D ... A, A+, so the old A-E cut-offs no longer fit
    6: (d) => {
      if (d.grading && d.grading.cuts) delete d.grading.cuts.school;
      return 'School grading changed to E to A+ bands (old school cut-offs reset)';
    },
    // 7 -> 8 (app 1.7.0): the calendar is gone. Its tests, exams and assignments move into the
    // Grades tab with their grades and weights, and grades are split into two semesters.
    7: (d) => {
      const extras = d.gradeExtras && typeof d.gradeExtras === 'object' ? d.gradeExtras : (d.gradeExtras = {});
      const semOf = (date) => (+String(date).slice(5, 7) <= 6 ? 1 : 2);
      const nowSem = new Date().getMonth() < 6 ? 1 : 2;
      // assessments typed into the Grades tab had no date, so they go in the current semester
      Object.values(extras).forEach((list) => { if (Array.isArray(list)) list.forEach((x) => { if (x && x.sem == null) x.sem = nowSem; }); });
      const TYPES = { test: 'Test', exam: 'Exam', assignment: 'Assignment' };
      const evs = Array.isArray(d.events) ? d.events.filter((e) => e && e.subject && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) : [];
      evs.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
        const list = Array.isArray(extras[e.subject]) ? extras[e.subject] : (extras[e.subject] = []);
        const sem = semOf(e.date);
        const pct = e.score != null && e.outOf > 0 ? Math.round((e.score / e.outOf) * 10000) / 100 : null;
        const day = new Date(`${e.date}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
        // the first exam in a semester becomes that semester's exam
        const isExam = e.type === 'exam' && !list.some((x) => x && x.exam && x.sem === sem);
        const row = { id: e.id || uid(), name: e.title || `${TYPES[e.type] || 'Test'} (${day})`, pct, weight: Number.isFinite(e.weight) ? e.weight : null, sem };
        if (isExam) row.exam = true;
        list.push(row);
      });
      if (Array.isArray(d.events) && d.events.length) d.calendarArchive = d.events; // the original entries, kept just in case
      delete d.events;
      const tg = d.gradeTargets && typeof d.gradeTargets === 'object' ? d.gradeTargets : (d.gradeTargets = {});
      Object.keys(tg).forEach((k) => { if (typeof tg[k] === 'number') tg[k] = { 1: tg[k], 2: tg[k] }; });
      return `Calendar removed: ${evs.length} calendar item${evs.length === 1 ? '' : 's'} moved into Grades; grades split into Semester 1 and 2`;
    },
    // 8 -> 9 (app 1.8.0): garden decorations bought with coins. Long sessions now grow more
    // trees, worked out from each tree's duration, so nothing in the save needs changing for that.
    8: (d) => {
      if (!d.decor || typeof d.decor !== 'object') d.decor = {};
      return 'Added garden decorations; longer sessions grow more trees';
    },
    // 9 -> 10 (app 1.9.0): friends. Only settings and claimed rewards are kept here; friends live online.
    9: (d) => {
      if (!d.social || typeof d.social !== 'object') d.social = blankSocial();
      return 'Added friends, friend streaks and weekly team tasks';
    },
  };
  // shareGrades: off by default. claims: streak/task rewards taken. gifts: gift ids opened.
  // giftLog: coins given away today. names: names of people you've sent requests to.
  function blankSocial() { return { shareGrades: false, claims: {}, gifts: {}, giftLog: { day: '', spent: 0 }, names: {}, bestStreak: 0, friendsMax: 0 }; }
  let readOnly = false; // true if the save came from a newer version of the app
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    let v = +raw.version || 1;
    if (v > SCHEMA) { readOnly = true; return raw; }
    if (!Array.isArray(raw.migrationLog)) raw.migrationLog = [];
    while (v < SCHEMA) {
      const step = MIGRATIONS[v];
      const note = step ? step(raw) : '';
      raw.migrationLog.push({ from: v, to: v + 1, at: new Date().toISOString(), app: APP_VERSION, note });
      v += 1;
      raw.version = v;
    }
    return raw;
  }
  let APP_VERSION = '';
  let D = null;
  function blank() {
    return {
      version: SCHEMA,
      migrationLog: [],
      profile: { name: '', setupDone: false, theme: 'forest', autoMini: false, tutorialSeen: false, welcome: true },
      collection: { owned: { oak: 1, pine: 1 }, opened: 0 },
      selectedTree: 'oak',
      favTrees: [],
      achievements: {},
      badgesSeeded: true,
      badgeClaims: {},
      freeCases: { seed: 1 }, // every new user starts with one free Seed Pouch
      giftNotice: 'welcome',
      decor: {},
      social: blankSocial(),
      gradeExtras: {},
      gradeTargets: {},
      grading: { scale: 'school', cuts: {} },
      subjects: [],
      sessions: [],
      trees: [],
      coins: 0,
      withered: 0,
      active: null,
    };
  }
  function normalise(x) {
    const b = blank();
    if (!x || typeof x !== 'object') return b;
    const out = Object.assign(b, x);
    out.profile = Object.assign(blank().profile, x.profile || {});
    out.subjects = Array.isArray(x.subjects) ? x.subjects.filter((s) => s && s.name) : [];
    out.sessions = Array.isArray(x.sessions) ? x.sessions.filter((s) => s && s.subject && s.date && s.duration >= 0) : [];
    out.trees = Array.isArray(x.trees) ? x.trees : [];
    out.sessions.forEach((s) => { if (!s.id) s.id = uid(); });
    out.subjects.forEach((s) => { s.archived = !!s.archived; if (!s.id) s.id = uid(); });
    out.collection = Object.assign({ owned: {}, opened: 0 }, x.collection || {});
    out.collection.owned = Object.assign({ oak: 1, pine: 1 }, out.collection.owned || {});
    if (!out.collection.owned[out.selectedTree]) out.selectedTree = 'oak';
    out.achievements = x.achievements && typeof x.achievements === 'object' && !Array.isArray(x.achievements) ? x.achievements : {};
    out.badgesSeeded = x.badgesSeeded !== false;
    out.favTrees = Array.isArray(x.favTrees) ? x.favTrees.filter((id) => typeof id === 'string') : [];
    out.coins = +x.coins || 0;
    out.withered = +x.withered || 0;
    const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    out.badgeClaims = obj(x.badgeClaims) ? x.badgeClaims : {};
    out.decor = obj(x.decor) ? x.decor : {};
    out.social = Object.assign(blankSocial(), obj(x.social) ? x.social : {});
    ['claims', 'gifts', 'names'].forEach((k) => { if (!obj(out.social[k])) out.social[k] = {}; });
    if (!obj(out.social.giftLog)) out.social.giftLog = { day: '', spent: 0 };
    out.social.shareGrades = out.social.shareGrades === true;
    out.freeCases = obj(x.freeCases) ? x.freeCases : {};
    out.gradeExtras = obj(x.gradeExtras) ? x.gradeExtras : {};
    for (const [k, list] of Object.entries(out.gradeExtras)) {
      if (!Array.isArray(list)) { delete out.gradeExtras[k]; continue; }
      out.gradeExtras[k] = list.filter((r) => r && typeof r === 'object');
      out.gradeExtras[k].forEach((r) => { if (!r.id) r.id = uid(); r.sem = r.sem === 2 ? 2 : 1; });
    }
    out.gradeTargets = obj(x.gradeTargets) ? x.gradeTargets : {};
    out.grading = Object.assign({ scale: 'school', cuts: {} }, obj(x.grading) ? x.grading : {});
    if (!SCALES[out.grading.scale]) out.grading.scale = 'school';
    if (x.giftNotice) out.giftNotice = x.giftNotice; else delete out.giftNotice;
    return out;
  }
  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    if (readOnly) return;
    D.appVersion = APP_VERSION;
    if (window.Friends) window.Friends.changed();
    if (now) return window.api.save(D);
    saveTimer = setTimeout(() => window.api.save(D), 250);
  }
  window.addEventListener('beforeunload', () => {
    if (T.state !== 'idle') persistActive();
    if (!readOnly) try { D.appVersion = APP_VERSION; window.api.saveSync(D); } catch (e) {}
  });
  const subj = (name) => D.subjects.find((s) => s.name === name);
  const activeSubjects = () => D.subjects.filter((s) => !s.archived);
  const counted = (s) => !s.cancelled; // cancelled sessions show in history but not in totals
  const owns = (id) => (D.collection.owned[id] || 0) > 0;
  const rarityOf = (id) => window.Tree.RARITIES[window.Tree.get(id).rarity];
  const boostOf = (id) => rarityOf(id).boost;
  const pct = (b) => `+${Math.round(b * 100)}%`;
  const isFav = (id) => D.favTrees.includes(id);
  // favourites first, then rarest first
  function treeOrder(a, b) {
    const ord = window.Tree.RARITY_ORDER;
    return (isFav(b.id) - isFav(a.id)) || (isFav(a.id) && isFav(b.id) ? D.favTrees.indexOf(a.id) - D.favTrees.indexOf(b.id) : 0) || ord.indexOf(b.rarity) - ord.indexOf(a.rarity);
  }
  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
  const starHtml = (id) => `<span class="fav-star${isFav(id) ? ' on' : ''}" role="button" data-fav="${id}" title="${isFav(id) ? 'Remove from favourites' : 'Favourite: keep at the front'}">${STAR}</span>`;
  function toggleFav(id) {
    if (isFav(id)) D.favTrees = D.favTrees.filter((x) => x !== id);
    else D.favTrees.push(id);
    save();
    return isFav(id);
  }
  // a session's tree: the one it grew, or for older/manual sessions a plain oak
  const treeOfSession = (s) => s.tree || 'oak';
  // A session grows one tree for every full 30 minutes: 1 once it takes root, 2 at an hour, 4 at two hours (12 at most).
  const TREE_EVERY = 30 * 60;
  const treesForSec = (sec) => Math.min(12, Math.max(1, Math.floor((sec || 0) / TREE_EVERY)));
  const treeCountOf = (t) => treesForSec(t.duration);
  const totalTrees = () => D.trees.reduce((a, t) => a + treeCountOf(t), 0);
  const isWithered = (s) => s.outcome ? s.outcome === 'withered' : s.duration < ROOT_SEC;
  const sessionTrees = (s) => (isWithered(s) ? 1 : treesForSec(s.duration));
  // the garden's withered count comes straight from history, so deleting a session updates it
  const witheredCount = () => D.sessions.filter(isWithered).length;
  // static (non-animated) tree markup for lists; call paintTrees(container) after inserting
  function staticTree(species, sec, withered, key, loose) {
    return window.Tree.build(species, key).replace('<svg class="tree', `<svg data-sec="${Math.round(sec)}"${withered ? ' data-withered="1"' : ''}${loose ? ' data-loose="1"' : ''} class="tree static`);
  }
  function paintTrees(root) {
    $$('svg.tree.static[data-sec]', root).forEach((svg) => {
      if (svg._painted) return;
      svg._painted = true;
      const sec = +svg.dataset.sec;
      const g = window.Tree.growthFor(svg.dataset.withered ? Math.min(sec, ROOT_SEC * 0.7) : Math.max(sec, ROOT_SEC));
      window.Tree.setGrowth(svg, g.p, g.g);
      if (svg.dataset.withered) svg.classList.add('withered');
      // crop the picture to the tree so small thumbnails stay readable;
      // "loose" keeps some of the size difference between short and long sessions
      if (svg.dataset.fixed) return;
      let sz = svg.dataset.withered ? 0.6 : window.Tree.sizeFor(g.p, g.g);
      if (svg.dataset.loose) sz = Math.max(sz, 0.82);
      const w = 172 * sz, h = 214 * sz;
      svg.setAttribute('viewBox', `${(100 - w / 2).toFixed(1)} ${(217 - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    });
  }
  const colorOf = (name) => (subj(name) || {}).color || '#94a3b8';
  function nextColor() {
    const used = new Set(D.subjects.map((s) => s.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[D.subjects.length % PALETTE.length];
  }
  function ensureSubject(name) {
    const s = subj(name);
    if (!s) D.subjects.push({ id: uid(), name, color: nextColor(), archived: false });
    return s;
  }

  // ---------------- theme ----------------
  function applyTheme(id, ev) {
    const th = THEMES.find((t) => t.id === id) || THEMES[0];
    const doIt = () => {
      document.body.dataset.theme = th.id;
      miniVars = null;
      window.api.setTitleBar('#00000000', th.dark ? '#e8eef0' : '#2a2a2a');
      pushMini();
    };
    if (ev && document.startViewTransition && document.body.dataset.theme !== th.id) {
      document.documentElement.style.setProperty('--rx', ev.clientX + 'px');
      document.documentElement.style.setProperty('--ry', ev.clientY + 'px');
      document.startViewTransition(doIt);
    } else doIt();
  }
  function renderThemeGrid(host) {
    host.innerHTML = THEMES.map((t, i) => `
      <button class="theme-card${D.profile.theme === t.id ? ' selected' : ''}" data-theme="${t.id}" style="--i:${i}">
        <div class="theme-prev" style="background:${t.bg}">
          <div class="sb" style="background:${t.sf}"></div>
          <div class="main" style="background:${t.sf}">
            <div class="line" style="background:${t.tx};opacity:.8;width:60%"></div>
            <div class="line" style="background:${t.tx};opacity:.3;width:80%"></div>
            <div class="line" style="background:${t.ac};width:35%"></div>
          </div>
          <div class="ring-dot" style="border-color:${t.ac};border-right-color:${t.a2}"></div>
        </div>
        <div class="theme-name">${t.name}<span class="tick">${CHECK}</span></div>
      </button>`).join('');
    $$('.theme-card', host).forEach((c) => c.addEventListener('click', (e) => {
      D.profile.theme = c.dataset.theme;
      $$('.theme-card').forEach((x) => x.classList.toggle('selected', x.dataset.theme === D.profile.theme));
      applyTheme(D.profile.theme, e);
      save();
    }));
  }

  // ---------------- day and night ----------------
  // From 7pm to 6am the skies show a moon and stars instead of the sun.
  const isNight = (d = new Date()) => d.getHours() >= 19 || d.getHours() < 6;
  function updateDayPhase() {
    const night = isNight();
    if (document.body.classList.contains('is-night') !== night) document.body.classList.toggle('is-night', night);
  }
  function makeStars() {
    $$('.stars').forEach((el) => {
      if (el.childElementCount) return;
      let h = '';
      for (let i = 0; i < 46; i++) {
        const x = (i * 37.7) % 100, y = ((i * 61.3) % 62), sz = 1 + ((i * 7) % 3), d = 2 + (i % 5);
        h += `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--s:${sz}px;--d:${d}s;--dl:${(-i * 0.37).toFixed(2)}s"></i>`;
      }
      el.innerHTML = h;
    });
  }

  // little animated visitors for the garden
  const BF_COLORS = [['#f9a8d4', '#ec4899'], ['#fde047', '#f59e0b'], ['#93c5fd', '#3b82f6'], ['#c4b5fd', '#8b5cf6'], ['#fdba74', '#ea580c']];
  function butterflies(n, seed) {
    let h = '';
    for (let i = 0; i < n; i++) {
      const k = hashStr(seed + i), [c1, c2] = BF_COLORS[k % BF_COLORS.length];
      h += `<span class="bfly p${k % 3}" style="--dur:${16 + (k % 9)}s;--dl:${-(k % 13)}s"><svg viewBox="-12 -10 24 20"><g class="wl"><path d="M0 0C-3-9-12-9-11-3-10 1-4 2 0 0Z" fill="${c1}"/><path d="M0 0C-2 4-7 9-7 4-7 2-3 1 0 0Z" fill="${c2}"/></g><g class="wr"><path d="M0 0C3-9 12-9 11-3 10 1 4 2 0 0Z" fill="${c1}"/><path d="M0 0C2 4 7 9 7 4 7 2 3 1 0 0Z" fill="${c2}"/></g><rect x="-.8" y="-4" width="1.6" height="8" rx=".8" fill="#3b2a1a"/></svg></span>`;
    }
    return h;
  }
  function birds(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += `<span class="bird" style="--top:${12 + i * 9}%;--dur:${22 + i * 7}s;--dl:${-i * 9}s;--sc:${1 - i * 0.18}"><svg viewBox="0 0 30 12"><path d="M1 8Q8 0 15 7Q22 0 29 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    return h;
  }
  function fireflies(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += `<i class="ffly" style="left:${(i * 29.3) % 92 + 4}%;top:${(i * 17.7) % 55 + 30}%;--dur:${5 + (i % 4)}s;--dl:${-i * 0.9}s"></i>`;
    return h;
  }

  // ---------------- trees react to the mouse ----------------
  // Brushing past a tree pushes it away from the side the mouse came from, then it springs back.
  const mouse = { vx: 0 };
  document.addEventListener('mousemove', (e) => { mouse.vx = mouse.vx * 0.6 + e.movementX * 0.4; }, { passive: true });
  document.addEventListener('mouseover', (e) => {
    const tree = e.target.closest && e.target.closest('svg.tree');
    if (!tree || (e.relatedTarget && tree.contains(e.relatedTarget))) return;
    const g = tree.querySelector('.shake');
    if (!g) return;
    const now = performance.now();
    if (g._at && now - g._at < 280) return;
    g._at = now;
    const r = tree.getBoundingClientRect();
    const dir = Math.abs(mouse.vx) > 0.6 ? Math.sign(mouse.vx) : (e.clientX < r.left + r.width / 2 ? 1 : -1);
    const A = Math.min(14, 5 + Math.abs(mouse.vx) * 0.7) * dir;
    if (g._anim) g._anim.cancel();
    g._anim = g.animate([
      { transform: 'rotate(0deg) skewX(0deg)' },
      { transform: `rotate(${A}deg) skewX(${-A * 0.4}deg)`, offset: 0.18 },
      { transform: `rotate(${-A * 0.55}deg) skewX(${A * 0.2}deg)`, offset: 0.42 },
      { transform: `rotate(${A * 0.28}deg) skewX(0deg)`, offset: 0.64 },
      { transform: `rotate(${-A * 0.1}deg) skewX(0deg)`, offset: 0.84 },
      { transform: 'rotate(0deg) skewX(0deg)' },
    ], { duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }, { passive: true });

  // ---------------- navigation ----------------
  let currentPage = 'timer';
  function moveIndicator() {
    const btn = $(`.nav-item[data-page="${currentPage}"]`);
    $('#nav-indicator').style.transform = `translateY(${btn.offsetTop}px)`;
  }
  // The sidebar starts with only the Timer showing; the arrow under it opens the rest.
  // The page you're on always stays visible, so you never lose your place.
  let navOpen = false;
  function layoutNav(animate) {
    const side = $('#sidebar');
    side.classList.toggle('nav-open', navOpen);
    let k = 0;
    $$('.nav-item').forEach((b) => {
      const show = navOpen || b.dataset.page === 'timer' || b.dataset.page === currentPage;
      b.style.setProperty('--k', show && !b.classList.contains('nav-shown') ? k++ : 0);
      b.classList.toggle('nav-shown', show);
      b.classList.toggle('tucked', !show);
      b.tabIndex = show ? 0 : -1;
    });
    $('#nav-more').title = navOpen ? 'Show fewer tabs' : 'Show all tabs';
    $('#nav-more').setAttribute('aria-expanded', navOpen);
    // keep the highlight on the right tab while the others slide in and out
    if (animate) {
      const t0 = performance.now();
      const follow = () => { moveIndicator(); if (performance.now() - t0 < 700) requestAnimationFrame(follow); };
      requestAnimationFrame(follow);
    } else moveIndicator();
    updateNavDots();
  }
  function toggleNav(open) {
    navOpen = open === undefined ? !navOpen : open;
    layoutNav(true);
  }
  function go(page) {
    if (page === currentPage) return;
    const from = $(`#page-${currentPage}`), to = $(`#page-${page}`);
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    currentPage = page;
    layoutNav(true);
    from.classList.remove('active', 'enter');
    from.classList.add('leave');
    const left = from.id.slice(5);
    setTimeout(() => { from.classList.remove('leave'); freePage(left); }, 280);
    renderPage(page);
    $$('.stagger.anim-done', to).forEach((el) => el.classList.remove('anim-done'));
    to.classList.remove('enter');
    void to.offsetWidth;
    to.classList.add('active', 'enter');
    to.scrollTop = 0;
  }
  // Pages are rebuilt every time you open them, so the big ones (hundreds of tree drawings)
  // are emptied once you leave. This keeps memory down without changing what you see.
  const HEAVY = {
    timer: ['#week-plot'], stats: ['#stats-plot'], garden: ['#garden', '#garden-plot', '#decor-shop'],
    trees: ['#collection', '#cases'], badges: ['#badge-cats'], history: ['#history-list'],
    grades: ['#gr-body', '#gr-chips'], friends: ['#fr-body'],
  };
  function freePage(p) {
    if (p === currentPage) return;
    (HEAVY[p] || []).forEach((sel) => { const el = $(sel); if (el) el.replaceChildren(); });
  }
  function renderPage(p) {
    if (p === 'timer') renderTimerPage();
    if (p === 'stats') renderStats(true);
    if (p === 'garden') renderGarden();
    if (p === 'trees') renderTrees();
    if (p === 'history') renderHistory();
    if (p === 'badges') renderBadges();
    if (p === 'settings') renderSettings();
    if (p === 'grades') renderGrades();
    if (p === 'friends' && window.Friends) window.Friends.render();
  }

  // ---------------- toasts, modals, tooltip, fx ----------------
  function toast(msg, ms = 2600) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = msg;
    $('#toast-host').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }
  function modal({ title, body = '', html = '', extra = '', actions = [{ label: 'OK', primary: true }] }) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = `<div class="modal">${html}<h2>${title}</h2>${body ? `<p>${body}</p>` : ''}${extra}<div class="m-actions"></div></div>`;
      const row = $('.m-actions', back);
      const close = (v) => {
        const chk = $('input[type=checkbox]', back);
        back.classList.add('closing'); setTimeout(() => back.remove(), 260);
        resolve(extra ? { v, checked: !!(chk && chk.checked) } : v);
      };
      actions.forEach((a, i) => {
        const b = document.createElement('button');
        b.className = 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '') + (a.ghost ? ' ghost' : '');
        b.textContent = a.label;
        b.onclick = () => close(a.value !== undefined ? a.value : i);
        row.appendChild(b);
      });
      back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
      $('#modal-host').appendChild(back);
      const handler = (e) => { if (e.key === 'Escape') { close(null); document.removeEventListener('keydown', handler); } };
      document.addEventListener('keydown', handler);
      setTimeout(() => { const p = $('.btn.primary, .btn.danger', back); if (p) p.focus(); }, 50);
    });
  }
  const tip = $('#tooltip');
  function showTip(html, e) {
    tip.innerHTML = html;
    tip.classList.add('show');
    moveTip(e);
  }
  function moveTip(e) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - h - 12;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y < 44) y = e.clientY + 18;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  const hideTip = () => tip.classList.remove('show');

  // particle canvas for leaf/sparkle bursts and confetti
  const fx = $('#fx'), fctx = fx.getContext('2d');
  let parts = [], fxRunning = false;
  sizeFx();
  // Once an entrance animation (pop-in, rise, grow-in...) has finished, switch it off. Its last frame
  // matches the normal look, so nothing changes on screen, but Chromium can drop the extra layers it kept.
  const ENTRY_ANIMS = new Set(['pop', 'rise', 'grow-in', 'ptIn', 'fadeUp', 'barIn']);
  document.addEventListener('animationend', (e) => {
    if (ENTRY_ANIMS.has(e.animationName) && e.target.classList) e.target.classList.add('anim-done');
  }, { passive: true });
  // while the window is minimised or hidden, pause decorative animations and drop cached resources
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('app-hidden', document.hidden);
    if (document.hidden && window.api.trimMemory) window.api.trimMemory();
    if (!document.hidden && D) { updateTimerUI(true); updateTodayHeader(); }
  });
  // the effects canvas is only full size while particles are flying, so it holds no memory when idle
  function sizeFx() {
    const w = fxRunning ? Math.round(innerWidth * devicePixelRatio) : 1, h = fxRunning ? Math.round(innerHeight * devicePixelRatio) : 1;
    if (fx.width !== w) fx.width = w;
    if (fx.height !== h) fx.height = h;
  }
  addEventListener('resize', () => { sizeFx(); moveIndicator(); positionSegs(); });
  function burst(x, y, opts = {}) {
    const n = opts.n || 40;
    const colors = opts.colors || ['#4ade80', '#a3e635', '#fde047', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = (opts.up ? -Math.PI / 2 : 0) + (Math.random() - 0.5) * (opts.up ? 2.2 : Math.PI * 2);
      const v = (opts.speed || 6) * (0.4 + Math.random());
      const shape = opts.shape ? (Array.isArray(opts.shape) ? opts.shape[i % opts.shape.length] : opts.shape) : (opts.leaf !== false && Math.random() < 0.6 ? 'leaf' : 'dot');
      parts.push({ x: x + (opts.spread ? (Math.random() - 0.5) * opts.spread : 0), y: y + (opts.spreadY ? (Math.random() - 0.5) * opts.spreadY : 0), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: (opts.decay || 0.008) + Math.random() * 0.012, r: (opts.size || 3) + Math.random() * 4, c: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * (opts.spin || 0.3), shape, glow: opts.glow, sway: opts.sway || 0, t: Math.random() * 6, g: opts.gravity ?? 0.12 });
    }
    if (!fxRunning) { fxRunning = true; sizeFx(); requestAnimationFrame(fxLoop); }
  }
  function fxLoop() {
    const dpr = devicePixelRatio;
    fctx.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.vy += p.g; p.vx *= 0.985; p.vy *= 0.985; p.t += 0.08; p.x += p.vx + Math.sin(p.t) * p.sway; p.y += p.vy; p.life -= p.decay; p.rot += p.vr;
      fctx.save();
      fctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      fctx.translate(p.x * dpr, p.y * dpr);
      fctx.rotate(p.rot);
      fctx.fillStyle = p.c; fctx.strokeStyle = p.c;
      if (p.glow) { fctx.shadowColor = p.c; fctx.shadowBlur = 10 * dpr; }
      drawParticle(p, p.r * dpr);
      fctx.restore();
    }
    if (parts.length) requestAnimationFrame(fxLoop);
    else { fxRunning = false; sizeFx(); }
  }
  function drawParticle(p, r) {
    const c = fctx;
    c.beginPath();
    switch (p.shape) {
      case 'leaf': c.ellipse(0, 0, r * 1.6, r * 0.8, 0, 0, Math.PI * 2); c.fill(); break;
      case 'petal': c.moveTo(0, -r * 1.2); c.quadraticCurveTo(r * 1.3, 0, 0, r * 1.2); c.quadraticCurveTo(-r * 1.3, 0, 0, -r * 1.2); c.fill(); break;
      case 'needle': c.lineWidth = Math.max(1, r * 0.35); c.lineCap = 'round'; c.moveTo(-r * 1.4, 0); c.lineTo(r * 1.4, 0); c.stroke(); break;
      case 'drop': c.moveTo(0, -r * 1.3); c.quadraticCurveTo(r, r * 0.2, 0, r * 0.9); c.quadraticCurveTo(-r, r * 0.2, 0, -r * 1.3); c.fill(); break;
      case 'bubble': c.lineWidth = Math.max(1, r * 0.25); c.arc(0, 0, r * 0.9, 0, Math.PI * 2); c.stroke(); break;
      case 'star4': for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? r * 0.35 : r * 1.3; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); break;
      case 'star5': for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.55 : r * 1.4; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); break;
      case 'snow': c.lineWidth = Math.max(1, r * 0.25); c.lineCap = 'round'; for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; c.moveTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); c.lineTo(-Math.cos(a) * r * 1.2, -Math.sin(a) * r * 1.2); } c.stroke(); break;
      default: c.arc(0, 0, r * 0.7, 0, Math.PI * 2); c.fill();
    }
  }
  // Particles each species gives off as a new part of it grows in (see Tree.GROW[..].fx).
  const GROW_FX = {
    leaves: (sp) => ({ shape: 'leaf', colors: [sp.leaf1, sp.leaf2, sp.hi], gravity: 0.05, sway: 0.6, speed: 2.4 }),
    needles: (sp) => ({ shape: 'needle', colors: [sp.leaf1, sp.leaf2], gravity: 0.08, speed: 3, spin: 0.5 }),
    maple: (sp) => ({ shape: 'star5', colors: [sp.leaf1, sp.leaf2, '#fde047'], gravity: 0.04, sway: 0.9, speed: 2.2, spin: 0.25 }),
    snow: () => ({ shape: 'snow', colors: ['#ffffff', '#e0f2fe', '#bae6fd'], gravity: 0.02, sway: 0.7, speed: 1.6, decay: 0.006 }),
    bubbles: (sp) => ({ shape: 'bubble', colors: [sp.hi, sp.leaf1, '#ffffff'], gravity: -0.035, sway: 0.5, speed: 1.4, up: true }),
    apples: (sp) => ({ shape: ['dot', 'leaf'], colors: [sp.fruit, sp.leaf1], gravity: 0.14, speed: 3.5, size: 3.5 }),
    petals: (sp) => ({ shape: 'petal', colors: [sp.leaf1, sp.hi, '#ffffff'], gravity: 0.025, sway: 1.1, speed: 1.8, spin: 0.15, decay: 0.005 }),
    glints: () => ({ shape: 'star4', colors: ['#fde047', '#fff7cc', '#f59e0b'], gravity: 0, speed: 2.2, glow: true, decay: 0.018 }),
    drops: (sp) => ({ shape: 'drop', colors: [sp.leaf1, '#bae6fd', sp.hi], gravity: 0.16, speed: 1.4, spin: 0 }),
    redleaves: (sp) => ({ shape: 'leaf', colors: [sp.leaf1, sp.leaf2, '#fb923c'], gravity: 0.04, sway: 1, speed: 2.6, spin: 0.4 }),
    stars: (sp) => ({ shape: 'star4', colors: [sp.hi, sp.leaf1, '#ffffff'], gravity: -0.01, speed: 1.6, glow: true, decay: 0.01 }),
    embers: () => ({ shape: 'dot', colors: ['#fb923c', '#fde047', '#f43f5e'], gravity: -0.05, sway: 0.5, speed: 1.6, glow: true, up: true, size: 1.5 }),
    aurora: () => ({ shape: 'star4', colors: ['#4ade80', '#22d3ee', '#a78bfa', '#f0abfc'], gravity: -0.015, sway: 0.6, speed: 2, glow: true }),
    sunsparks: () => ({ shape: ['star4', 'dot'], colors: ['#fde047', '#fbbf24', '#ffffff'], gravity: 0.02, speed: 4.5, glow: true, decay: 0.016 }),
    wisps: (sp) => ({ shape: 'dot', colors: [sp.glow || sp.leaf1, sp.hi, '#ffffff'], gravity: -0.03, sway: 0.9, speed: 1, glow: true, up: true, decay: 0.006 }),
    cosmic: () => ({ shape: ['star4', 'star5', 'dot'], colors: ['#f0abfc', '#818cf8', '#fde68a', '#a5f3fc', '#ffffff'], gravity: -0.01, sway: 0.8, speed: 3, glow: true, spin: 0.2 }),
  };
  function growFx(species, count) {
    const holder = $('#tree-holder');
    if (!holder || currentPage !== 'timer' || document.hidden) return;
    const sp = window.Tree.get(species), kind = window.Tree.growOf(species).fx;
    const o = (GROW_FX[kind] || GROW_FX.leaves)(sp);
    const r = holder.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height * 0.5, Object.assign({ n: 10 + count * 4, spread: r.width * 0.35, spreadY: r.height * 0.25 }, o));
  }
  function flyCoins(fromEl, amount) {
    const pill = $('#coin-pill');
    const pr = pill.getBoundingClientRect();
    const fr = fromEl.getBoundingClientRect();
    const n = amount <= 3 ? amount : Math.min(10, Math.max(4, Math.round(amount / 2)));
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'coin flying-coin';
      const sx = fr.left + fr.width / 2 + (Math.random() - 0.5) * 80, sy = fr.top + fr.height * 0.45 + (Math.random() - 0.5) * 60;
      c.style.left = sx + 'px'; c.style.top = sy + 'px';
      c.style.transform = 'scale(0)';
      document.body.appendChild(c);
      setTimeout(() => { c.style.transform = 'scale(1.2)'; }, 20 + i * 60);
      setTimeout(() => {
        c.style.transform = `translate(${pr.left + 8 - sx}px, ${pr.top + 4 - sy}px) scale(.8)`;
      }, 260 + i * 70);
      setTimeout(() => {
        c.remove();
        pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
      }, 1150 + i * 70);
    }
    setTimeout(() => renderCoins(), 1150);
  }
  function renderCoins(instant) {
    const el = $('#coin-count');
    if (instant) { el.dataset.val = D.coins; el.textContent = D.coins; return; }
    animateNumber(el, D.coins, (v) => Math.round(v).toLocaleString(), 700);
  }

  // ---------------- timer ----------------
  const T = { state: 'idle', subject: null, raf: 0, lastSec: -1 };
  // D.active = { subject, startedAt, segStart, acc, species, treeId, rooted, bonuses }
  function elapsedSec() {
    const a = D.active;
    if (!a) return 0;
    return (a.acc + (a.segStart ? Date.now() - a.segStart : 0)) / 1000;
  }
  function persistActive() {
    if (!D.active) return;
    // store as paused so time while the app is closed doesn't count
    if (D.active.segStart) { D.active.acc += Date.now() - D.active.segStart; D.active.segStart = Date.now(); }
  }

  let treeSvg = null;
  function mountTree(species) {
    T.shown = undefined;
    $('#tree-holder').innerHTML = window.Tree.build(species, 'main');
    treeSvg = $('#tree-holder .tree');
    $('#tree-holder').classList.add('alive');
  }

  function buildOdometer() {
    const od = $('#odometer');
    // the tens of minutes and seconds only go up to 5
    const maxes = [9, 9, null, 5, 9, null, 5, 9];
    od.innerHTML = maxes.map((m) => m === null ? '<span class="sep">:</span>' :
      `<span class="digit"><span class="roll" data-max="${m}">${Array.from({ length: m + 1 }, (_, n) => `<span>${n}</span>`).join('')}<span>0</span></span></span>`).join('');
  }
  // Each digit rolls upward; wrapping to 0 rolls onto a spare "0" then snaps back unseen.
  function setOdometer(str) {
    const rolls = $$('#odometer .roll');
    str.replace(/:/g, '').split('').forEach((ch, i) => {
      const r = rolls[i];
      if (!r) return;
      const m = +r.dataset.max, count = m + 2;
      const d = Math.min(+ch, m), prev = r._d === undefined ? d : r._d;
      if (d === prev && r.style.transform) return;
      r._d = d;
      const pos = (k) => `translateY(-${(k * 100) / count}%)`;
      clearTimeout(r._t);
      if (d === 0 && prev === m) {
        r.classList.remove('snap');
        r.style.transform = pos(m + 1);
        r._t = setTimeout(() => { r.classList.add('snap'); r.style.transform = pos(0); void r.offsetWidth; r.classList.remove('snap'); }, 600);
      } else if (d < prev) {
        r.classList.add('snap'); r.style.transform = pos(d); void r.offsetWidth; r.classList.remove('snap');
      } else r.style.transform = pos(d);
    });
  }

  function setTimerClass() {
    const card = $('#page-timer');
    card.classList.toggle('idle', T.state === 'idle');
    card.classList.toggle('running', T.state === 'running');
    card.classList.toggle('paused', T.state === 'paused');
    $('#start-label').textContent = T.state === 'running' ? 'Pause' : T.state === 'paused' ? 'Resume' : 'Start';
    $('#subject-zone').classList.toggle('collapsed', T.state !== 'idle');
    $('#greeting-sub').textContent = T.state === 'idle' ? 'Pick a subject and start the stopwatch.' : T.state === 'paused' ? 'Paused. Take a breather, then jump back in.' : 'Stay focused. Your tree is growing.';
    const as = $('#active-subject');
    as.classList.toggle('show', T.state !== 'idle');
    if (D.active) {
      as.style.setProperty('--c', colorOf(D.active.subject));
      $('.name', as).textContent = D.active.subject;
      $('#state-tag').textContent = T.state === 'paused' ? 'Paused' : 'Studying';
    }
  }

  function setTreeStatus(txt) {
    const el = $('#tree-status');
    if (el.textContent === txt) return;
    el.textContent = txt;
    el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
  }

  const CIRC = 2 * Math.PI * 132;
  function updateTimerUI(force) {
    const sec = elapsedSec();
    const whole = Math.floor(sec);
    if (!force && whole === T.lastSec) return;
    T.lastSec = whole;
    // minimised (e.g. the mini player is up): keep counting and paying coins, but skip redrawing
    if (document.hidden && !force) { checkMilestones(sec); pushMini(); return; }
    setOdometer(fmtHMS(whole));
    const rootP = Math.min(1, sec / ROOT_SEC);
    const ring = $('.ring');
    // first lap: the 10 minute rooting countdown; after that: one lap per hour
    let lap;
    if (sec < ROOT_SEC) lap = rootP;
    else lap = ((sec - ROOT_SEC) % 3600) / 3600;
    ring.classList.toggle('rooted', sec >= ROOT_SEC);
    // when a lap wraps round, jump instead of animating backwards
    const wrapped = T.lastLap !== undefined && lap < T.lastLap - 0.3;
    T.lastLap = lap;
    if (wrapped || force) ring.classList.add('snap');
    $('#ring-prog').style.strokeDashoffset = (CIRC * (1 - (sec >= ROOT_SEC ? 1 : lap))).toFixed(1);
    $('#ring-hour').style.strokeDashoffset = (CIRC * (1 - (sec >= ROOT_SEC ? lap : 0))).toFixed(1);
    $('#ring-hour').style.opacity = sec >= ROOT_SEC ? 0.95 : 0;
    $('#ring-knob').style.transform = `rotate(${(lap * 360).toFixed(2)}deg)`;
    $('#root-fill').style.transform = `scaleX(${rootP.toFixed(4)})`;
    if (ring.classList.contains('snap')) { void ring.getBoundingClientRect(); requestAnimationFrame(() => ring.classList.remove('snap')); }
    const cap = $('#clock-caption');
    if (T.state === 'idle') cap.textContent = T.subject ? `Ready: ${T.subject}` : 'Pick a subject to begin';
    else if (sec < ROOT_SEC) cap.textContent = `${fmtMS(ROOT_SEC - sec)} until your tree takes root`;
    else {
      const next = 3600 - (sec % 3600);
      cap.textContent = next <= 600 ? `Hour bonus in ${fmtMS(next)}` : `+1 coin every minute · ${D.active.coins || 0} so far`;
    }
    if (treeSvg && D.active) {
      const g = window.Tree.growthFor(sec);
      const shown = window.Tree.setGrowth(treeSvg, g.p, g.g);
      if (T.shown !== undefined && shown > T.shown && T.state === 'running') growFx(D.active.species, shown - T.shown);
      T.shown = shown;
    }
    if (T.state !== 'idle') {
      if (sec < 20) setTreeStatus(T.state === 'paused' ? 'Paused. Your seed is waiting' : 'A seed has been planted');
      else if (sec < ROOT_SEC * 0.4) setTreeStatus(T.state === 'paused' ? 'Paused. Your sprout is waiting' : 'Sprouting...');
      else if (sec < ROOT_SEC) setTreeStatus(T.state === 'paused' ? 'Paused. Your sapling is waiting' : 'Your sapling is growing');
      else {
        const n = treesForSec(sec), next = Math.ceil(((n + 1) * TREE_EVERY - sec) / 60) * 60;
        setTreeStatus(`${n} tree${n === 1 ? '' : 's'} in your garden${n < 12 ? ` · another in ${fmtDur(next)}` : ' · a whole grove!'}`);
      }
    }
    checkMilestones(sec);
    updateTodayHeader();
    pushMini();
  }

  function checkMilestones(sec) {
    const a = D.active;
    if (!a || T.state === 'idle') return;
    // every 30 minutes past the first, the session plants another tree
    if (a.rooted && treesForSec(sec) > (a.trees || 1)) {
      a.trees = treesForSec(sec);
      const t = D.trees.find((x) => x.id === a.treeId);
      if (t) t.duration = Math.floor(sec);
      if (currentPage === 'timer' && !document.hidden) {
        const r = $('#tree-holder').getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height * 0.4, { n: 45, up: true, speed: 7 });
        treeSvg.classList.remove('celebrate'); void treeSvg.getBBox(); treeSvg.classList.add('celebrate');
      }
      toast(`🌳 Another tree! This session has grown ${a.trees} trees`);
      save();
      checkAchievements();
    }
    const target = coinsFor(sec, a.species);
    if (target <= (a.coins || 0)) {
      if (a.rooted) { const t = D.trees.find((x) => x.id === a.treeId); if (t) t.duration = Math.floor(sec); }
      return;
    }
    const earned = target - (a.coins || 0);
    const hours = Math.floor(sec / 3600);
    const hourBonus = hours > (a.hours || 0);
    a.hours = hours;
    a.milestones = Math.floor(sec / 60); // kept so older versions can still read an unfinished session
    D.coins += earned;
    a.coins = (a.coins || 0) + earned;
    const holder = $('#tree-holder');
    const onTimer = currentPage === 'timer' && !document.hidden;
    if (!a.rooted) {
      a.rooted = true;
      a.trees = 1;
      D.trees.push({ id: a.treeId, species: a.species, subject: a.subject, date: a.startedAt, duration: Math.floor(sec), sessionId: a.sessionId });
      if (onTimer) {
        const r = holder.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height * 0.4, { n: 60, up: true, speed: 8 });
        treeSvg.classList.remove('celebrate'); void treeSvg.getBBox(); treeSvg.classList.add('celebrate');
      }
      toast(`<span class="coin"></span> Your tree took root! +${earned} coins`);
    } else if (hourBonus) {
      if (onTimer) { const r = holder.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height * 0.4, { n: 40, up: true, speed: 7, colors: ['#fde047', '#fbbf24', '#ffffff'] }); }
      toast(`<span class="coin"></span> Hour bonus! +${earned} coins`);
    }
    const t = D.trees.find((x) => x.id === a.treeId);
    if (t) t.duration = Math.floor(sec);
    save();
    if (onTimer) flyCoins(holder, earned); else renderCoins();
    checkAchievements();
  }

  function loop() {
    updateTimerUI();
    T.raf = setTimeout(loop, 200);
  }

  function start() {
    if (T.state === 'running') return pause();
    if (T.state === 'paused') return resume();
    if (!T.subject) {
      const z = $('#subject-chips');
      z.classList.remove('shake'); void z.offsetWidth; z.classList.add('shake');
      $('#subject-hint').textContent = 'Pick a subject first';
      $('#subject-hint').classList.add('warn');
      return;
    }
    if (!T.tree || !owns(T.tree)) {
      const z = $('#tree-chips');
      z.classList.remove('shake'); void z.offsetWidth; z.classList.add('shake');
      $('#tree-hint').textContent = 'Pick a tree first';
      $('#tree-hint').classList.add('warn');
      return;
    }
    const species = T.tree;
    D.selectedTree = species;
    D.active = { subject: T.subject, startedAt: new Date().toISOString(), segStart: Date.now(), acc: 0, species, treeId: uid(), sessionId: uid(), rooted: false, milestones: 0, coins: 0 };
    T.state = 'running';
    showPlot(false);
    mountTree(species);
    window.Tree.setGrowth(treeSvg, 0, 0);
    requestAnimationFrame(() => updateTimerUI(true));
    setTimerClass();
    const r = $('#tree-holder').getBoundingClientRect();
    burst(r.left + r.width / 2, r.bottom - r.height * 0.1, { n: 18, up: true, speed: 4, colors: ['#a0703f', '#c79a64', '#6cc46f'] });
    save();
    if (D.profile.autoMini) setTimeout(() => window.api.openMini(), 400);
  }
  function pause() {
    const a = D.active; if (!a || !a.segStart) return;
    a.acc += Date.now() - a.segStart; a.segStart = null;
    T.state = 'paused'; setTimerClass(); updateTimerUI(true); save();
  }
  function resume() {
    const a = D.active; if (!a) return;
    a.segStart = Date.now();
    T.state = 'running'; setTimerClass(); updateTimerUI(true); save();
  }
  function finishActive() {
    clearTimeout(T.raf);
    const a = D.active;
    D.active = null;
    T.state = 'idle';
    T.lastSec = -1;
    setTimerClass();
    loop();
    return a;
  }
  function witherTree() {
    if (!treeSvg) return;
    treeSvg.classList.add('dying');
    $('#tree-holder').classList.remove('alive');
  }
  function recordSession(a, total, cancelled) {
    const rec = { id: a.sessionId || uid(), subject: a.subject, duration: total, date: a.startedAt, tree: a.species, outcome: a.rooted ? 'grown' : 'withered', coins: a.coins || 0 };
    if (cancelled) rec.cancelled = true;
    D.sessions.push(rec);
    return rec;
  }
  function resetStage(delay) {
    setTimeout(() => {
      if (T.state !== 'idle') return;
      $('#tree-holder').innerHTML = '';
      treeSvg = null;
      previewTree();
      updateTimerUI(true);
    }, delay);
  }

  async function stop() {
    if (T.state === 'idle') return;
    const sec = elapsedSec();
    if (sec < 10) {
      const v = await modal({ title: 'Too short to save', body: 'Sessions under 10 seconds aren\'t saved. Discard it?', actions: [{ label: 'Keep going', ghost: true, value: false }, { label: 'Discard', primary: true, value: true }] });
      if (v) cancel(true);
      return;
    }
    const wasRunning = T.state === 'running';
    if (wasRunning) pause();
    const rooted = D.active.rooted;
    const ok = await modal({
      title: 'Finish this session?',
      body: rooted ? `You studied ${D.active.subject} for ${fmtDur(sec)}. It'll be saved and ${treesForSec(sec) === 1 ? 'your tree stays' : `your ${treesForSec(sec)} trees stay`} in your garden.`
        : `You studied ${D.active.subject} for ${fmtDur(sec)}. The time will be saved, but your sapling needed 10 minutes to take root, so it will wither.`,
      actions: [{ label: 'Keep studying', ghost: true, value: false }, { label: 'Finish & save', primary: true, value: true }],
    });
    if (!ok) { if (wasRunning) resume(); return; }
    const total = Math.floor(elapsedSec());
    const a = finishActive();
    recordSession(a, total, false);
    if (a.rooted) {
      const t = D.trees.find((x) => x.id === a.treeId);
      if (t) t.duration = total;
      const r = $('#tree-holder').getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height * 0.4, { n: 50, up: true, speed: 7, colors: ['#fde047', '#fbbf24', '#ffffff', colorOf(a.subject)] });
      setTreeStatus('Planted in your garden');
      const n = treesForSec(total);
      toast(`Saved ${fmtDur(total)} of ${esc(a.subject)}. ${n === 1 ? 'Your tree is' : `Your ${n} trees are`} in the garden 🌳`);
    } else {
      witherTree();
      setTreeStatus('Your sapling withered. Stay 10 minutes next time');
      toast(`Saved ${fmtDur(total)} of ${esc(a.subject)}`);
    }
    save(true);
    window.api.closeMini();
    renderToday();
    resetStage(a.rooted ? 3200 : 3400);
    setTimeout(() => checkAchievements(), 1400);
  }

  async function cancel(skipConfirm) {
    if (T.state === 'idle') return;
    const wasRunning = T.state === 'running';
    const rooted = D.active.rooted;
    if (!skipConfirm) {
      if (wasRunning) pause();
      const ok = await modal({
        title: 'Cancel this session?',
        body: rooted ? 'This session\'s time won\'t be saved. Your tree already took root, so it stays in your garden.'
          : 'This session\'s time won\'t be saved and your sapling will die.',
        actions: [{ label: 'Keep studying', ghost: true, value: false }, { label: 'Cancel session', danger: true, value: true }],
      });
      if (!ok) { if (wasRunning) resume(); return; }
    }
    const total = Math.floor(elapsedSec());
    const a = finishActive();
    // keep a record (not counted in stats) so it shows in history and can be deleted
    if (total >= 10) recordSession(a, total, true);
    if (!a.rooted) {
      witherTree();
      setTreeStatus('Your sapling died. No coins this time');
    } else setTreeStatus('Session cancelled. Your tree stays in the garden');
    save(true);
    renderToday();
    window.api.closeMini();
    resetStage(3400);
  }

  function renderSubjectChips() {
    const host = $('#subject-chips');
    const list = activeSubjects();
    if (!list.length) {
      host.innerHTML = '<span class="muted">No subjects yet. Add some in Settings.</span>';
      return;
    }
    if (T.subject && !(subj(T.subject) && !subj(T.subject).archived)) T.subject = null;
    host.innerHTML = list.map((s, i) => `<button class="chip${T.subject === s.name ? ' selected' : ''}" style="--c:${s.color};--i:${i}" data-s="${esc(s.name)}"><span class="dot"></span>${esc(s.name)}</button>`).join('');
    $$('.chip', host).forEach((c) => c.addEventListener('click', () => {
      T.subject = c.dataset.s;
      $$('.chip', host).forEach((x) => x.classList.toggle('selected', x === c));
      $('#subject-hint').textContent = 'Press start when you\'re ready';
      $('#subject-hint').classList.remove('warn');
      $('.clock-wrap').style.setProperty('--accent', colorOf(T.subject));
      updateTimerUI(true);
    }));
  }

  function renderTreeChips(keepScroll) {
    const host = $('#tree-chips');
    if (!T.tree || !owns(T.tree)) T.tree = owns(D.selectedTree) ? D.selectedTree : 'oak';
    const list = window.Tree.SPECIES.filter((x) => owns(x.id)).sort(treeOrder);
    host.innerHTML = list.map((sp, i) => {
      const r = window.Tree.RARITIES[sp.rarity];
      return `<button class="tree-chip${T.tree === sp.id ? ' selected' : ''}${isFav(sp.id) ? ' fav' : ''}" style="--rc:${r.color};--i:${i}" data-t="${sp.id}" title="${esc(sp.name)} · ${r.name}${r.boost ? ` · ${pct(r.boost)} coins` : ''}">
        <span class="tc-img">${staticTree(sp.id, 3 * 3600, false, 'tc' + sp.id)}</span><span class="tc-name">${esc(sp.name)}</span>${r.boost ? `<span class="tc-boost">${pct(r.boost)}</span>` : ''}${starHtml(sp.id)}</button>`;
    }).join('');
    paintTrees(host);
    $$('.fav-star', host).forEach((st) => st.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const on = toggleFav(st.dataset.fav);
      toast(on ? `${esc(window.Tree.get(st.dataset.fav).name)} added to favourites` : `${esc(window.Tree.get(st.dataset.fav).name)} removed from favourites`);
      const keep = host.scrollLeft;
      renderTreeChips(true);
      host.scrollLeft = on ? 0 : keep;
      const again = $(`.fav-star[data-fav="${st.dataset.fav}"]`, host);
      if (again) again.classList.add('pop');
    }));
    // keep the selected tree in view (favourites come first, so it may sit further along)
    if (!keepScroll) requestAnimationFrame(() => { const sel = $('.tree-chip.selected', host); if (sel && sel.offsetLeft + sel.offsetWidth > host.clientWidth) host.scrollLeft = sel.offsetLeft - 8; });
    $$('.tree-chip', host).forEach((c) => c.addEventListener('click', () => {
      T.tree = c.dataset.t;
      D.selectedTree = T.tree; save();
      $$('.tree-chip', host).forEach((x) => x.classList.toggle('selected', x === c));
      const sp = window.Tree.get(T.tree), b = boostOf(T.tree);
      $('#tree-hint').textContent = b ? `${sp.name}: ${pct(b)} coins` : sp.name;
      $('#tree-hint').classList.remove('warn');
      previewTree();
    }));
    const sp = window.Tree.get(T.tree), b = boostOf(T.tree);
    $('#tree-hint').textContent = b ? `${sp.name}: ${pct(b)} coins` : 'Last session\'s tree is picked for you';
    $('#tree-hint').classList.remove('warn');
  }
  // while idle, show the chosen tree as a seedling preview in the stage
  // while idle, the stage shows this week's forest instead of a tree
  function previewTree() {
    if (T.state !== 'idle' || treeSvg) return;
    showPlot(true);
  }

  function todaySessions() {
    const k = dayKey(new Date());
    return D.sessions.filter((s) => counted(s) && dayKey(new Date(s.date)) === k).sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  function streakDays() {
    const days = new Set(D.sessions.filter(counted).map((s) => dayKey(new Date(s.date))));
    let d = new Date(), n = 0;
    if (!days.has(dayKey(d)) && !(D.active)) d = addDays(d, -1);
    while (days.has(dayKey(d)) || (n === 0 && D.active && dayKey(d) === dayKey(new Date()))) { n++; d = addDays(d, -1); }
    return n;
  }
  function updateTodayHeader() {
    const tot = todaySessions().reduce((a, s) => a + s.duration, 0) + (D.active ? elapsedSec() : 0);
    $('#today-total').textContent = fmtDur(tot);
  }
  function sessRow(s, i, opts = {}) {
    const d = new Date(s.date), end = new Date(d.getTime() + s.duration * 1000);
    const w = isWithered(s);
    const tag = s.cancelled ? '<span class="tag cancel">Cancelled</span>' : w ? '<span class="tag dead">Withered</span>' : '';
    return `<div class="sess-row with-tree${s.cancelled ? ' is-cancelled' : ''}" style="--c:${colorOf(s.subject)};--i:${i}" data-id="${s.id}">
      <span class="thumb">${staticTree(treeOfSession(s), s.duration, w, 'h' + s.id)}${!w && !s.cancelled && sessionTrees(s) > 1 ? `<b class="tcount">×${sessionTrees(s)}</b>` : ''}</span><span class="nm"><i class="dot"></i>${esc(s.subject)}${tag}${s.coins ? `<span class="tag coins"><span class="coin sm"></span>${s.coins}</span>` : ''}</span>
      <span class="t">${fmtTime(d)} – ${fmtTime(end)}</span>
      <span class="d">${fmtDur(s.duration)}${opts.del !== false ? `<button class="del" title="Delete session">${XICON}</button>` : ''}</span></div>`;
  }
  // Deleting a session also removes its garden tree, its withered count, and optionally its coins.
  async function deleteSession(s) {
    const lines = [`${esc(s.subject)}, ${fmtDur(s.duration)} on ${new Date(s.date).toLocaleDateString()}.`];
    const tree = D.trees.find((t) => t.sessionId === s.id);
    if (tree) lines.push('Its tree will be removed from your garden.');
    const extra = s.coins ? `<label class="m-check"><input type="checkbox" checked> Also take back the ${s.coins} coins it earned</label>` : '';
    const r = await modal({ title: 'Delete this session?', body: lines.join(' '), extra, actions: [{ label: 'Keep', ghost: true, value: false }, { label: 'Delete', danger: true, value: true }] });
    const ok = extra ? r && r.v : r;
    const takeCoins = extra ? r && r.checked : false;
    if (!ok) return false;
    D.sessions = D.sessions.filter((x) => x.id !== s.id);
    if (tree) D.trees = D.trees.filter((t) => t !== tree);
    if (s.coins && takeCoins) { D.coins = Math.max(0, D.coins - s.coins); renderCoins(); }
    save();
    return true;
  }
  function bindDeletes(host, after) {
    $$('.del', host).forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const row = b.closest('.sess-row');
      const s = D.sessions.find((x) => x.id === row.dataset.id);
      if (!s) return;
      if (!(await deleteSession(s))) return;
      row.style.height = row.offsetHeight + 'px';
      row.classList.add('removing');
      setTimeout(() => after && after(), 450);
    }));
  }
  // ---- isometric forest plot: one tree per session, like the Forest app ----
  const PLOT_MAX = 600;
  function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function sessionTip(x) {
    const sp = window.Tree.get(treeOfSession(x));
    const d = new Date(x.date), en = new Date(+d + x.duration * 1000);
    const state = isWithered(x) ? 'Withered' : x.tree ? 'Grown' : 'Logged before trees were tracked';
    return `<div class="tt-title">${esc(x.subject)}</div>
      <div class="tt-row"><span>Date</span><b>${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
      <div class="tt-row"><span>Time</span><b>${fmtTime(d)} – ${fmtTime(en)}</b></div>
      <div class="tt-row"><span>Duration</span><b>${fmtDur(x.duration)}</b></div>
      <div class="tt-row"><span>Trees</span><b>${isWithered(x) ? '1 withered' : sessionTrees(x)}</b></div>
      <div class="tt-row"><span>Tree</span><b>${x.tree ? esc(sp.name) : 'Oak (older session)'}</b></div>
      <div class="tt-row"><span>Subject</span><b><i style="--c:${colorOf(x.subject)}"></i>${esc(x.subject)}</b></div>
      ${isWithered(x) || x.coins ? `<div class="tt-row"><span>Result</span><b>${state}${x.coins ? ` · +${x.coins} coins` : ''}</b></div>` : ''}`;
  }
  // Put each session's trees on neighbouring cells. Sessions start at scattered cells and spread
  // out from there (breadth first), so one session's trees always sit together.
  function placeClusters(n, items, tilesOf, seed, loose) {
    const order = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) order.push([i, j]);
    order.sort((a, b) => hashStr(seed + a) - hashStr(seed + b));
    const used = new Uint8Array(n * n);
    const placed = [];
    let ptr = 0;
    for (const x of items) {
      const want = tilesOf(x);
      let got = 0;
      while (got < want) {
        while (ptr < order.length && used[order[ptr][0] * n + order[ptr][1]]) ptr++;
        if (ptr >= order.length) return null;
        const queue = [order[ptr]];
        while (queue.length && got < want) {
          const [i, j] = queue.shift();
          if (used[i * n + j]) continue;
          used[i * n + j] = 1;
          placed.push({ x, cell: [i, j], k: got++ });
          const nb = [[i + 1, j], [i, j + 1], [i - 1, j], [i, j - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !used[a * n + b]);
          nb.sort((p, q) => hashStr(seed + x.id + p) - hashStr(seed + x.id + q));
          queue.push(...nb);
        }
        if (got < want && !loose) return null; // boxed in: try a bigger plot
      }
    }
    return { placed, empties: order.filter(([i, j]) => !used[i * n + j]) };
  }
  function renderPlot(host, list, opts = {}) {
    const tilesOf = opts.count || (() => 1);
    // newest sessions first until the plot is full
    const shown = [];
    let need = 0;
    for (let k = list.length - 1; k >= 0; k--) {
      const c = tilesOf(list[k]);
      if (need + c > PLOT_MAX && shown.length) break;
      shown.unshift(list[k]);
      need += c;
    }
    const decor = opts.decor || [];
    const seed = opts.seed || 'plot';
    let n = Math.max(opts.min || 4, Math.ceil(Math.sqrt((need + decor.length) * 1.25)));
    let res = null;
    for (let tries = 0; !res; tries++, n++) res = placeClusters(n, shown, tilesOf, seed, tries >= 5);
    n--;
    const { placed, empties } = res;
    const TW = 64, TH = 32, DEPTH = 26, TREE_W = 58, TREE_H = 72;
    const W = n * TW, top = TREE_H - 8, H = top + n * TH + DEPTH + 6;
    const cx0 = W / 2;
    const pos = (i, j) => [cx0 + (i - j) * TW / 2, top + (i + j + 1) * TH / 2];
    const owner = new Map(placed.map((p) => [p.cell[0] * n + p.cell[1], p.x.id]));
    let tiles = '';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const [x, y] = pos(i, j);
      const o = owner.get(i * n + j);
      tiles += `<polygon points="${x},${y - TH / 2} ${x + TW / 2},${y} ${x},${y + TH / 2} ${x - TW / 2},${y}" class="tile ${(i + j) % 2 ? 't1' : 't2'}"${o != null ? ` data-id="${o}"` : ''}/>`;
    }
    // bought decorations take the first free cells; the rest get the odd flower or grass tuft
    const decorCells = empties.slice(0, decor.length);
    let deco = '';
    empties.slice(decor.length).forEach(([i, j]) => {
      const h = hashStr(seed + 'd' + i + ',' + j);
      if (h % 3) return;
      const [x, y] = pos(i, j);
      const ox = (h % 17) - 8, oy = ((h >> 5) % 9) - 4;
      deco += h % 2 ? `<g class="deco" transform="translate(${x + ox},${y + oy})"><path d="M-4 0 q2 -7 1 -9 M0 0 q0 -8 1 -10 M4 0 q-1 -6 0 -8" class="tuft"/></g>`
        : `<g class="deco" transform="translate(${x + ox},${y + oy})"><circle r="2.6" cy="-3" fill="${['#fde047', '#f9a8d4', '#ffffff', '#c4b5fd'][h % 4]}"/><circle r="1.1" cy="-3" fill="#f59e0b"/></g>`;
    });
    // trees and decorations are drawn back to front together
    const items = placed.map((p) => ({ cell: p.cell, tree: p }))
      .concat(decorCells.map((cell, k) => ({ cell, decor: decor[k] })))
      .sort((a, b) => (a.cell[0] + a.cell[1]) - (b.cell[0] + b.cell[1]) || a.cell[0] - b.cell[0]);
    const drawn = items.map((it, k) => {
      const [px, py] = pos(it.cell[0], it.cell[1]);
      if (it.decor) return `<g class="dc" data-d="${it.decor}" transform="translate(${px},${py})" style="--d:${Math.min(k, 120) * 14}ms"><g class="dc-in">${decorSvg(it.decor)}</g></g>`;
      const { x, k: nth } = it.tree;
      const svg = window.Tree.build(treeOfSession(x), (opts.key || 'p') + x.id + '_' + nth)
        .replace('<svg class="tree', `<svg x="${px - TREE_W / 2}" y="${py - TREE_H + 6}" width="${TREE_W}" height="${TREE_H}" data-sec="${Math.round(x.duration)}"${isWithered(x) ? ' data-withered="1"' : ''} data-fixed="1" class="tree static`)
        .replace('viewBox="0 0 200 240"', 'viewBox="14 0 172 220"');
      return `<g class="pt" data-id="${x.id}" style="--d:${Math.min(k, 120) * 14}ms">${svg}</g>`;
    }).join('');
    const y0 = top + n * TH / 2, yb = top + n * TH;
    host.innerHTML = `<svg class="plot" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <polygon points="0,${y0} ${cx0},${yb} ${cx0},${yb + DEPTH} 0,${y0 + DEPTH}" class="side-l"/>
      <polygon points="${W},${y0} ${cx0},${yb} ${cx0},${yb + DEPTH} ${W},${y0 + DEPTH}" class="side-r"/>
      <polygon points="0,${y0} ${cx0},${yb} ${cx0},${yb + 6} 0,${y0 + 6}" class="lip-l"/>
      <polygon points="${W},${y0} ${cx0},${yb} ${cx0},${yb + 6} ${W},${y0 + 6}" class="lip-r"/>
      <g class="tiles">${tiles}</g><g>${deco}</g><g class="trees">${drawn}</g></svg>`;
    paintTrees(host);
    const plot = $('.plot', host);
    const byId = new Map(shown.map((x) => [String(x.id), x]));
    // hovering any tree lights up every tree from that session and shows the session's totals
    const light = (id, on) => {
      plot.classList.toggle('hl', on);
      $$(`.pt[data-id="${CSS.escape(id)}"], .tile[data-id="${CSS.escape(id)}"]`, plot).forEach((el) => el.classList.toggle('lit', on));
    };
    $$('.pt', host).forEach((g) => {
      const x = byId.get(g.dataset.id);
      g.addEventListener('mouseenter', (ev) => { light(g.dataset.id, true); showTip(sessionTip(x), ev); });
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', () => { light(g.dataset.id, false); hideTip(); });
    });
    $$('.dc', host).forEach((g) => {
      const d = DECOR.find((x) => x.id === g.dataset.d);
      g.addEventListener('mouseenter', (ev) => showTip(`<div class="tt-title">${esc(d.name)}</div><div class="muted">${esc(d.desc)}</div>`, ev));
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip);
      g.addEventListener('click', () => { const r = g.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 3, { n: 12, speed: 3, leaf: false, colors: ['#ffffff', '#fde68a', '#86efac'] }); g.classList.remove('boing'); void g.getBBox(); g.classList.add('boing'); });
    });
    return { shown: shown.length, total: list.length };
  }

  // ---- garden decorations: bought with coins, purely for looks ----
  const DECOR = [
    { id: 'flowers', name: 'Flower bed', desc: 'A splash of colour between your trees.', price: 60, max: 8 },
    { id: 'mushrooms', name: 'Mushroom ring', desc: 'Little red toadstools.', price: 80, max: 6 },
    { id: 'rocks', name: 'Mossy rocks', desc: 'Old stones with moss on top.', price: 90, max: 6 },
    { id: 'bench', name: 'Garden bench', desc: 'Somewhere to sit and admire it all.', price: 180, max: 4 },
    { id: 'lantern', name: 'Lantern', desc: 'Glows softly, and brighter at night.', price: 260, max: 6 },
    { id: 'birdhouse', name: 'Birdhouse', desc: 'A home for the garden birds.', price: 320, max: 4 },
    { id: 'pond', name: 'Lily pond', desc: 'Still water with a lily in bloom.', price: 450, max: 3 },
    { id: 'fountain', name: 'Fountain', desc: 'A stone fountain that never stops.', price: 850, max: 2 },
    { id: 'windmill', name: 'Windmill', desc: 'The centrepiece. Its sails turn all day.', price: 1500, max: 1 },
  ];
  // drawn around the middle of a tile (0, 0); a tile is 64 wide and 32 tall
  function decorSvg(id) {
    switch (id) {
      case 'flowers': return [[-12, 0, '#f9a8d4'], [-5, -4, '#fde047'], [3, -2, '#c4b5fd'], [10, 1, '#ffffff'], [-6, 4, '#fb7185'], [5, 5, '#fdba74'], [-1, 1, '#f0abfc']]
        .map(([x, y, c]) => `<path d="M${x} ${y} q1 -4 0 -7" stroke="#4d8f3a" stroke-width="1.3" fill="none"/><circle cx="${x}" cy="${y - 8}" r="2.8" fill="${c}"/><circle cx="${x}" cy="${y - 8}" r="1" fill="#f59e0b"/>`).join('');
      case 'mushrooms': return [[-10, 3, 1], [3, -3, 0.8], [11, 4, 1.15]]
        .map(([x, y, s]) => `<g transform="translate(${x},${y}) scale(${s})"><rect x="-1.8" y="-7" width="3.6" height="7" rx="1.4" fill="#f5efe2"/><path d="M-6 -6 a6 5 0 0 1 12 0 z" fill="#ef4444"/><circle cx="-2.4" cy="-8.5" r="1" fill="#fff"/><circle cx="2" cy="-9.6" r=".9" fill="#fff"/><circle cx="3.4" cy="-7.2" r=".7" fill="#fff"/></g>`).join('');
      case 'rocks': return '<path d="M-16 3 L-12 -7 L-3 -10 L4 -3 L1 5 Z" fill="#94a3b8"/><path d="M-12 -7 L-3 -10 L4 -3 L-4 -4 Z" fill="#cbd5e1"/><ellipse cx="-6" cy="-8" rx="5" ry="2" fill="#6fb54f"/><path d="M5 5 L8 -2 L14 -3 L17 3 L12 7 Z" fill="#8b98aa"/><path d="M8 -2 L14 -3 L13 1 Z" fill="#b8c2d0"/>';
      case 'bench': return '<path d="M-14 -1 v6 M10 -9 v6 M-6 3 v5 M17 -5 v5" stroke="#6b4628" stroke-width="2.2"/><path d="M-15 -2 L10 -12 L18 -8 L-7 2 Z" fill="#b07a45"/><path d="M-15 -2 L10 -12 L10 -20 L-15 -10 Z" fill="#94643a"/><path d="M-15 -6 L10 -16" stroke="#7a5230" stroke-width="1"/>';
      case 'lantern': return '<g class="lamp-glow"><circle cy="-36" r="15" fill="#fde68a" opacity=".3"><animate attributeName="r" values="13;16;13" dur="3s" repeatCount="indefinite"/></circle></g><rect x="-1.6" y="-32" width="3.2" height="33" rx="1" fill="#334155"/><rect x="-5" y="-42" width="10" height="11" rx="2.5" fill="#fef3c7" stroke="#334155" stroke-width="1.4"/><path d="M-6 -42 L0 -47 L6 -42 Z" fill="#334155"/><ellipse cy="1" rx="5" ry="2" fill="rgba(0,0,0,.15)"/>';
      case 'birdhouse': return '<rect x="-1.6" y="-24" width="3.2" height="25" fill="#7a5230"/><rect x="-7" y="-36" width="14" height="13" rx="1.5" fill="#f59e0b"/><path d="M-9 -35 L0 -43 L9 -35 Z" fill="#dc2626"/><circle cy="-30" r="2.6" fill="#3b2412"/><rect x="-3" y="-25.5" width="6" height="1.4" fill="#7a5230"/>';
      case 'pond': return '<ellipse rx="27" ry="13" fill="#7c8a96"/><ellipse rx="24" ry="11" cy="-.5" fill="#38bdf8"/><ellipse rx="15" ry="5" cx="-5" cy="-3" fill="#7dd3fc" opacity=".7"><animate attributeName="rx" values="13;16;13" dur="4s" repeatCount="indefinite"/></ellipse><path d="M6 2 a5 3 0 1 0 6 -3 l-3 2 z" fill="#4ade80"/><circle cx="9" cy="-1" r="2.2" fill="#f9a8d4"/><circle cx="-11" cy="3" r="2.8" fill="#22c55e"/>';
      case 'fountain': return '<ellipse rx="22" ry="10" fill="#94a3b8"/><ellipse rx="19" ry="8" cy="-2" fill="#cbd5e1"/><ellipse rx="16" ry="6" cy="-2" fill="#38bdf8"/><rect x="-2.5" y="-20" width="5" height="18" fill="#cbd5e1"/><ellipse rx="9" ry="3.6" cy="-20" fill="#e2e8f0"/><ellipse rx="7" ry="2.4" cy="-20.5" fill="#7dd3fc"/>'
        + [[-5, 0], [5, 0.4], [0, 0.8]].map(([x, d]) => `<circle cx="${x}" r="1.3" fill="#bae6fd"><animate attributeName="cy" values="-22;-28;-6" dur="1.2s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0" dur="1.2s" begin="${d}s" repeatCount="indefinite"/></circle>`).join('');
      case 'windmill': return '<ellipse cy="1" rx="12" ry="4" fill="rgba(0,0,0,.15)"/><path d="M-9 0 L-5 -38 L5 -38 L9 0 Z" fill="#f5efe2"/><path d="M-9 0 L-5 -38 L-2 -38 L-4 0 Z" fill="#e2d8c3"/><path d="M-7 -38 L0 -48 L7 -38 Z" fill="#b45309"/><path d="M-2.5 0 v-7 a2.5 2.5 0 0 1 5 0 v7 z" fill="#7a5230"/><circle cy="-22" r="2.2" fill="#93c5fd"/>'
        + '<g transform="translate(0,-40)"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite"/>'
        + [0, 90, 180, 270].map((a) => `<g transform="rotate(${a})"><rect x="-1" y="-22" width="2" height="22" fill="#7a5230"/><rect x="1" y="-21" width="6" height="15" fill="#fef3c7" stroke="#a16207" stroke-width=".6"/></g>`).join('')
        + '<circle r="2.4" fill="#7a5230"/></g></g>';
      default: return '';
    }
  }
  const decorList = () => DECOR.flatMap((d) => Array(Math.max(0, Math.min(d.max, D.decor[d.id] || 0))).fill(d.id));
  function renderDecorShop() {
    const host = $('#decor-shop');
    if (!host) return;
    host.innerHTML = DECOR.map((d, i) => {
      const own = D.decor[d.id] || 0, full = own >= d.max, poor = D.coins < d.price;
      return `<div class="decor-card${full ? ' full' : ''}" style="--i:${i}" data-d="${d.id}">
        <svg class="decor-prev" viewBox="-36 -62 72 74">${decorSvg(d.id)}</svg>
        <div class="decor-name">${esc(d.name)}</div>
        <div class="decor-desc">${esc(d.desc)}</div>
        <div class="decor-own">${own ? `${own} in your garden` : 'Not bought yet'}${d.max > 1 ? ` · up to ${d.max}` : ''}</div>
        <button class="btn small${full ? '' : ' primary'}"${full || poor ? ' disabled' : ''}>${full ? 'All placed' : `<span class="coin sm"></span>${d.price.toLocaleString()}`}</button>
      </div>`;
    }).join('');
    $$('.decor-card', host).forEach((c) => $('button', c).addEventListener('click', (e) => {
      const d = DECOR.find((x) => x.id === c.dataset.d);
      if ((D.decor[d.id] || 0) >= d.max) return;
      if (D.coins < d.price) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); return toast('Not enough coins yet'); }
      D.coins -= d.price;
      D.decor[d.id] = (D.decor[d.id] || 0) + 1;
      save();
      renderCoins();
      const r = e.currentTarget.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top, { n: 30, up: true, speed: 6, leaf: false, colors: ['#fde047', '#86efac', '#ffffff'] });
      toast(`${esc(d.name)} added to your garden`);
      renderDecorShop();
      renderGardenScene(D.trees.filter((t) => !gardenFilter || t.subject === gardenFilter));
      setTimeout(() => $('#garden-scene').scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    }));
  }

  const W = { offset: 0 };
  function renderToday() {
    updateTodayHeader();
    const st = streakDays();
    $('#streak').textContent = `${st} day${st === 1 ? '' : 's'}`;
    renderWeek();
  }
  function weekRange() {
    const start = addDays(startOfWeek(new Date()), -7 * W.offset);
    return [start, addDays(start, 7)];
  }
  function renderWeek(dir) {
    const [start, end] = weekRange();
    const e = addDays(end, -1);
    const lbl = $('#week-label');
    lbl.textContent = W.offset === 0 ? 'This week' : W.offset === 1 ? 'Last week' : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
    lbl.className = dir ? (dir > 0 ? 'in-r' : 'in-l') : '';
    $('#week-next').disabled = W.offset === 0;
    const list = sessionsIn(start, end).sort((a, b) => new Date(a.date) - new Date(b.date));
    const total = list.reduce((a, x) => a + x.duration, 0);
    renderPlot($('#week-plot'), list, { seed: 'w' + dayKey(start), key: 'wk', min: 5, count: sessionTrees });
    if (T.state === 'idle' && $('#stage').classList.contains('show-plot')) {
      const grown = list.filter((x) => !isWithered(x)).reduce((n, x) => n + sessionTrees(x), 0), dead = list.filter(isWithered).length;
      const when = W.offset === 0 ? 'This week' : W.offset === 1 ? 'Last week' : 'That week';
      setTreeStatus(list.length ? `${when}: ${grown} tree${grown === 1 ? '' : 's'}${dead ? `, ${dead} withered` : ''} · ${fmtDur(total)}` : `${when}: no trees yet. Start the timer to plant one`);
    }
  }
  function showPlot(on) {
    $('#stage').classList.toggle('show-plot', on);
    if (on) renderWeek();
  }

  function renderTimerPage() {
    const h = new Date().getHours();
    const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('#greeting').textContent = D.profile.name ? `${part}, ${D.profile.name}` : part;
    renderSubjectChips();
    renderTreeChips();
    renderToday();
    setTimerClass();
    if (T.state === 'idle') previewTree();
    updateTimerUI(true);
  }

  // ---------------- mini player bridge ----------------
  let miniOpen = false;
  let miniVars = null; // theme colours for the mini player, worked out once per theme
  function pushMini() {
    if (!miniOpen) return;
    const sec = elapsedSec();
    if (!miniVars) { const cs = getComputedStyle(document.body); miniVars = ['--bg', '--surface', '--surface2', '--text', '--muted', '--accent', '--accent2', '--on-accent', '--border'].reduce((o, k) => (o[k] = cs.getPropertyValue(k).trim(), o), {}); }
    window.api.sendMiniState({
      state: T.state,
      sec,
      subject: D.active ? D.active.subject : '',
      color: D.active ? colorOf(D.active.subject) : '#4ade80',
      species: D.active ? D.active.species : 'oak',
      rooted: D.active ? D.active.rooted : false,
      vars: miniVars,
    });
  }
  window.api.on('mini:command', (cmd) => {
    if (cmd === 'ready') { miniOpen = true; pushMini(); }
    if (cmd === 'toggle') start();
    if (cmd === 'stop') { window.api.miniCommand('expand'); setTimeout(stop, 200); }
  });
  window.api.on('mini:closed', () => { miniOpen = false; });

  // ---------------- stats ----------------
  const S = { period: 'day', anchor: startOfDay(new Date()), yearSplit: 'month' };
  function periodRange() {
    const a = S.anchor;
    if (S.period === 'day') return [a, addDays(a, 1)];
    if (S.period === 'week') return [a, addDays(a, 7)];
    if (S.period === 'month') return [a, new Date(a.getFullYear(), a.getMonth() + 1, 1)];
    if (S.period === 'year') return [a, new Date(a.getFullYear() + 1, 0, 1)];
    const first = D.sessions.filter(counted).reduce((m, s) => Math.min(m, +new Date(s.date)), Date.now());
    return [new Date(new Date(first).getFullYear(), new Date(first).getMonth(), 1), addDays(startOfDay(new Date()), 1)];
  }
  function anchorFor(period, d) {
    if (period === 'day') return startOfDay(d);
    if (period === 'week') return startOfWeek(d);
    if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    if (period === 'year') return new Date(d.getFullYear(), 0, 1);
    return startOfDay(d);
  }
  function shiftAnchor(dir) {
    const a = new Date(S.anchor);
    if (S.period === 'day') a.setDate(a.getDate() + dir);
    if (S.period === 'week') a.setDate(a.getDate() + 7 * dir);
    if (S.period === 'month') a.setMonth(a.getMonth() + dir);
    if (S.period === 'year') a.setFullYear(a.getFullYear() + dir);
    return a;
  }
  function periodLabel() {
    const [a, b] = periodRange();
    const now = new Date();
    if (S.period === 'day') {
      const k = dayKey(a);
      if (k === dayKey(now)) return 'Today';
      if (k === dayKey(addDays(now, -1))) return 'Yesterday';
      return a.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (S.period === 'week') {
      const e = addDays(b, -1);
      const pre = dayKey(a) === dayKey(startOfWeek(now)) ? 'This week · ' : '';
      return `${pre}${a.getDate()} ${MONTHS[a.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
    }
    if (S.period === 'month') return a.toLocaleDateString([], { month: 'long', year: 'numeric' });
    if (S.period === 'year') return String(a.getFullYear());
    return 'All time';
  }
  function sessionsIn(a, b) {
    const t0 = +a, t1 = +b;
    return D.sessions.filter((s) => { const t = +new Date(s.date); return counted(s) && t >= t0 && t < t1; });
  }
  function buckets() {
    const [a, b] = periodRange();
    const out = [];
    if (S.period === 'day') {
      for (let h = 0; h < 24; h++) {
        const s = new Date(a); s.setHours(h);
        const e = new Date(a); e.setHours(h + 1);
        out.push({ s, e, label: h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p') : '', title: `${fmtTime(s)} – ${fmtTime(e)}` });
      }
    } else if (S.period === 'week') {
      for (let i = 0; i < 7; i++) { const s = addDays(a, i); out.push({ s, e: addDays(s, 1), label: DOW[i], title: s.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }), zoom: ['day', s] }); }
    } else if (S.period === 'month') {
      let s = startOfWeek(a);
      let i = 1;
      while (s < b) {
        const e = addDays(s, 7);
        const ls = s < a ? a : s, le = addDays(e > b ? b : e, -1);
        out.push({ s: ls, e: e > b ? b : e, label: `${ls.getDate()}–${le.getDate()}`, title: `Week ${i}: ${ls.getDate()} ${MONTHS[ls.getMonth()]} – ${le.getDate()} ${MONTHS[le.getMonth()]}`, zoom: ['week', s] });
        s = e; i++;
      }
    } else if (S.period === 'year' && S.yearSplit === 'week') {
      let s = startOfWeek(a), i = 1;
      while (s < b) {
        const e = addDays(s, 7);
        out.push({ s: s < a ? a : s, e: e > b ? b : e, label: (i === 1 || i % 4 === 0) ? `W${i}` : '', title: `Week ${i} (from ${s.getDate()} ${MONTHS[s.getMonth()]})`, zoom: ['week', s] });
        s = e; i++;
      }
    } else if (S.period === 'year') {
      for (let m = 0; m < 12; m++) { const s = new Date(a.getFullYear(), m, 1); out.push({ s, e: new Date(a.getFullYear(), m + 1, 1), label: MONTHS[m], title: s.toLocaleDateString([], { month: 'long', year: 'numeric' }), zoom: ['month', s] }); }
    } else {
      let s = new Date(a);
      const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1;
      if (months <= 36) {
        while (s < b) { const e = new Date(s.getFullYear(), s.getMonth() + 1, 1); out.push({ s, e, label: s.getMonth() === 0 || out.length === 0 ? `${MONTHS[s.getMonth()]} ${String(s.getFullYear()).slice(2)}` : (months <= 14 ? MONTHS[s.getMonth()] : ''), title: s.toLocaleDateString([], { month: 'long', year: 'numeric' }), zoom: ['month', s] }); s = e; }
      } else {
        s = new Date(a.getFullYear(), 0, 1);
        while (s < b) { const e = new Date(s.getFullYear() + 1, 0, 1); out.push({ s, e, label: String(s.getFullYear()), title: String(s.getFullYear()), zoom: ['year', s] }); s = e; }
      }
    }
    return out;
  }
  function positionSegs() {
    $$('.seg').forEach((seg) => {
      const act = $('button.active', seg), pill = $('.seg-pill', seg);
      if (!act || !pill) return;
      pill.style.width = act.offsetWidth + 'px';
      pill.style.transform = `translateX(${act.offsetLeft}px)`;
    });
  }
  let lastBucketSig = '';
  function renderStats(fresh, dir) {
    const [a, b] = periodRange();
    const now = new Date();
    $$('#period-seg button').forEach((x) => x.classList.toggle('active', x.dataset.p === S.period));
    $('#year-split').classList.toggle('hidden', S.period !== 'year');
    $$('#year-split button').forEach((x) => x.classList.toggle('active', x.dataset.s === S.yearSplit));
    requestAnimationFrame(positionSegs);
    const lbl = $('#period-label span');
    lbl.textContent = periodLabel();
    lbl.className = dir ? (dir > 0 ? 'in-r' : 'in-l') : '';
    $('#prev-period').disabled = S.period === 'all';
    $('#next-period').disabled = S.period === 'all' || shiftAnchor(1) > now;
    $('#today-period').style.visibility = (S.period === 'all' || +S.anchor === +anchorFor(S.period, now)) ? 'hidden' : 'visible';

    const list = sessionsIn(a, b);
    const total = list.reduce((x, s) => x + s.duration, 0);
    const bySub = {};
    list.forEach((s) => { bySub[s.subject] = (bySub[s.subject] || 0) + s.duration; });
    const ranked = Object.entries(bySub).sort((x, y) => y[1] - x[1]);

    // stat cards
    animateNumber($('#st-total'), total, fmtDur);
    animateNumber($('#st-sessions'), list.length, (v) => Math.round(v));
    let days = 1;
    if (S.period !== 'day') {
      const end = b > now ? addDays(startOfDay(now), 1) : b;
      days = Math.max(1, Math.round((end - a) / 864e5));
    }
    $('#st-avg-label').textContent = S.period === 'day' ? 'Average session' : 'Daily average';
    animateNumber($('#st-avg'), S.period === 'day' ? (list.length ? total / list.length : 0) : total / days, fmtDur);
    const top = $('#st-top');
    top.textContent = ranked.length ? ranked[0][0] : '-';
    top.style.color = ranked.length ? colorOf(ranked[0][0]) : '';
    top.classList.remove('swap'); void top.offsetWidth;
    top.style.animation = 'fadeUp .5s var(--ease)';
    setTimeout(() => { top.style.animation = ''; }, 500);

    renderDonut(ranked, total);
    renderBars(fresh);
    renderHBars(ranked);
    renderStatsPlot(list, a);
  }
  // the period's forest: one tree per session, hover for the details
  function renderStatsPlot(list, a) {
    const host = $('#stats-plot');
    const sorted = list.slice().sort((x, y) => new Date(x.date) - new Date(y.date));
    const r = renderPlot(host, sorted, { seed: S.period + (a ? dayKey(a) : 'all'), key: 'st' + S.period, min: 4, count: sessionTrees });
    const grown = sorted.filter((x) => !isWithered(x)).reduce((n, x) => n + sessionTrees(x), 0), dead = sorted.filter(isWithered).length;
    $('#stats-plot-counts').textContent = !sorted.length ? 'No sessions in this period yet'
      : `${grown} tree${grown === 1 ? '' : 's'}${dead ? ` · ${dead} withered` : ''}${r.shown < r.total ? ` · showing the latest ${r.shown}` : ''}`;
    if (!sorted.length) host.insertAdjacentHTML('beforeend', '<div class="plot-empty">Finish a session to plant a tree here</div>');
  }
  function renderDonut(ranked, total) {
    const host = $('#donut-segs');
    const C = 2 * Math.PI * 84;
    const existing = new Map($$('.donut-seg', host).map((c) => [c.dataset.s, c]));
    let off = 0;
    const gap = ranked.length > 1 ? 3 : 0;
    const seen = new Set();
    ranked.forEach(([name, dur]) => {
      seen.add(name);
      const len = Math.max(0, (dur / total) * C - gap);
      let c = existing.get(name);
      if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', 110); c.setAttribute('cy', 110); c.setAttribute('r', 84);
        c.classList.add('donut-seg');
        c.dataset.s = name;
        c.style.strokeDasharray = `0 ${C}`;
        c.style.strokeDashoffset = -off;
        host.appendChild(c);
        c.addEventListener('mouseenter', (e) => { hl(name, true); showTip(`<div class="tt-title">${esc(name)}</div>${c.dataset.tip}`, e); });
        c.addEventListener('mousemove', moveTip);
        c.addEventListener('mouseleave', () => { hl(name, false); hideTip(); });
        void c.getBoundingClientRect();
      }
      c.style.stroke = colorOf(name);
      c.dataset.tip = `${fmtDur(dur)} · ${Math.round((dur / total) * 100)}%`;
      const o = off;
      requestAnimationFrame(() => {
        c.style.strokeDasharray = `${len} ${C}`;
        c.style.strokeDashoffset = -o;
        c.style.opacity = 1;
      });
      off += (dur / total) * C;
    });
    existing.forEach((c, name) => {
      if (seen.has(name)) return;
      c.style.strokeDasharray = `0 ${C}`;
      c.style.opacity = 0;
      setTimeout(() => c.remove(), 1000);
    });
    animateNumber($('#donut-total'), total, fmtDur);
    $('#legend').innerHTML = ranked.length ? ranked.map(([n, d], i) => `<div class="legend-row" style="--c:${colorOf(n)};--i:${i}" data-s="${esc(n)}"><span class="dot"></span><span class="nm">${esc(n)}<small>${fmtDur(d)}</small></span><span class="pc">${Math.round((d / total) * 100)}%</span></div>`).join('')
      : '<div class="empty">No study time in this period.</div>';
    $$('#legend .legend-row').forEach((r) => {
      r.addEventListener('mouseenter', () => hl(r.dataset.s, true));
      r.addEventListener('mouseleave', () => hl(r.dataset.s, false));
    });
  }
  function hl(name, on) {
    $$('.donut-seg').forEach((c) => c.classList.toggle('hl', on && c.dataset.s === name));
    $$('.legend-row').forEach((c) => c.classList.toggle('hl', on && c.dataset.s === name));
  }
  // pick a tick size so the four gridlines land on friendly numbers
  const TICKS = [5, 10, 15, 30, 60, 120, 180, 240, 300, 600, 900, 1200, 1500, 3000, 6000, 12000].map((m) => m * 60);
  function niceMax(v) {
    const step = TICKS.find((t) => t * 4 >= v) || Math.ceil(v / 4 / 36000) * 36000;
    return step * 4;
  }
  function axisLabel(sec) {
    if (sec === 0) return '0';
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    const h = sec / 3600;
    return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  }
  function renderBars(fresh) {
    const bs = buckets();
    const titles = { day: 'By hour', week: 'By day', month: 'By week', year: S.yearSplit === 'week' ? 'By week' : 'By month', all: 'Over time' };
    $('#bars-title').textContent = titles[S.period];
    $('#bars-note').textContent = S.period === 'day' ? 'Hover a bar for details.' : 'Hover a bar for details. Click one to zoom in.';
    const data = bs.map((bk) => {
      const by = {};
      let tot = 0;
      sessionsIn(bk.s, bk.e).forEach((s) => { by[s.subject] = (by[s.subject] || 0) + s.duration; tot += s.duration; });
      return { ...bk, by, tot };
    });
    const max = niceMax(Math.max(0, ...data.map((d) => d.tot)));
    // grid lines
    const grid = $('#bars-grid');
    grid.innerHTML = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      return `<div class="gl" style="bottom:${f * 100}%"><span>${axisLabel(max * f)}</span></div>`;
    }).join('');
    const cols = $('#bars-cols');
    const sig = `${S.period}-${S.yearSplit}-${bs.length}`;
    cols.style.setProperty('--gap', bs.length > 30 ? '3px' : bs.length > 14 ? '5px' : '10px');
    const rebuild = fresh || sig !== lastBucketSig;
    lastBucketSig = sig;
    const nowT = Date.now();
    if (rebuild) {
      cols.innerHTML = data.map((d, i) => `<div class="bcol" style="--i:${i}"><div class="bstack"></div><span class="blabel">${d.label}</span></div>`).join('');
    }
    const colEls = $$('.bcol', cols);
    data.forEach((d, i) => {
      const col = colEls[i];
      col.classList.toggle('current', nowT >= +d.s && nowT < +d.e);
      $('.blabel', col).textContent = d.label;
      const stack = $('.bstack', col);
      const subs = D.subjects.map((s) => s.name).concat(Object.keys(d.by).filter((n) => !subj(n)));
      const order = subs.filter((n) => d.by[n]);
      // keep one segment per subject so heights can morph smoothly
      const segs = new Map($$('div', stack).map((x) => [x.dataset.s, x]));
      order.forEach((n) => {
        let seg = segs.get(n);
        if (!seg) { seg = document.createElement('div'); seg.dataset.s = n; seg.style.height = '0%'; stack.appendChild(seg); }
        seg.style.background = colorOf(n);
        segs.delete(n);
        requestAnimationFrame(() => { seg.style.height = (d.tot ? (d.by[n] / d.tot) * 100 : 0) + '%'; });
      });
      segs.forEach((seg) => { seg.style.height = '0%'; setTimeout(() => seg.remove(), 900); });
      if (rebuild) {
        stack.style.height = '0%';
        void stack.offsetHeight;
      }
      requestAnimationFrame(() => { stack.style.height = `${(d.tot / max) * 100}%`; });
      col.onmouseenter = (e) => {
        const rows = Object.entries(d.by).sort((x, y) => y[1] - x[1]).map(([n, v]) => `<div class="tt-row"><span><i style="--c:${colorOf(n)}"></i>${esc(n)}</span><b>${fmtDur(v)}</b></div>`).join('');
        showTip(`<div class="tt-title">${d.title}</div>${rows || '<span class="muted">No study</span>'}${d.tot ? `<div class="tt-row" style="margin-top:6px;border-top:1px solid var(--border);padding-top:6px"><span>Total</span><b>${fmtDur(d.tot)}</b></div>` : ''}`, e);
      };
      col.onmousemove = moveTip;
      col.onmouseleave = hideTip;
      col.onclick = () => {
        if (!d.zoom) return;
        hideTip();
        S.period = d.zoom[0];
        S.anchor = anchorFor(d.zoom[0], d.zoom[1]);
        renderStats(true, 1);
      };
    });
  }
  function renderHBars(ranked) {
    const host = $('#hbars');
    if (!ranked.length) { host.innerHTML = '<div class="empty">Study something and it will show up here.</div>'; return; }
    const max = ranked[0][1];
    host.innerHTML = ranked.map(([n, d], i) => `<div class="hbar" style="--c:${colorOf(n)};--i:${i}"><span class="nm"><i></i>${esc(n)}</span><div class="track"><div class="fill"></div></div><span class="v">${fmtDur(d)}</span></div>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$('.hbar .fill', host).forEach((f, i) => { f.style.width = `${(ranked[i][1] / max) * 100}%`; f.style.transitionDelay = `${i * 50}ms`; });
    }));
  }

  // ---------------- garden ----------------
  let gardenFilter = null;
  // garden trees as plot items: the session each grew in, or the tree itself for very old saves
  function gardenItems(list) {
    const byId = new Map(D.sessions.map((s) => [s.id, s]));
    return list.map((t) => byId.get(t.sessionId) || { id: 't' + t.id, subject: t.subject, duration: t.duration, date: t.date, tree: t.species, outcome: 'grown' })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  function renderGardenScene(trees) {
    if (!$('#gs-birds').childElementCount) {
      $('#gs-birds').innerHTML = birds(3);
      $('#gs-life').innerHTML = butterflies(3, 'scene') + fireflies(14);
      makeStars();
    }
    const items = gardenItems(trees);
    const r = renderPlot($('#garden-plot'), items, { seed: 'garden' + (gardenFilter || ''), key: 'gd', min: 5, count: sessionTrees, decor: decorList() });
    const total = trees.reduce((a, t) => a + (t.duration || 0), 0), count = trees.reduce((a, t) => a + treeCountOf(t), 0);
    $('#gs-caption').innerHTML = trees.length ? `<b>${count}</b> tree${count === 1 ? '' : 's'} · ${fmtDur(total)} of growing${r.shown < r.total ? ` · showing the latest ${r.shown}` : ''}` : 'Your first tree will appear here after 10 minutes of study';
  }
  function renderGarden() {
    animateNumber($('#g-trees'), totalTrees(), (v) => Math.round(v), 600);
    renderDecorShop();
    animateNumber($('#g-coins'), D.coins, (v) => Math.round(v), 600);
    animateNumber($('#g-dead'), witheredCount(), (v) => Math.round(v), 600);
    const subs = [...new Set(D.trees.map((t) => t.subject))];
    const chips = $('#garden-chips');
    chips.innerHTML = subs.length ? [`<button class="chip${!gardenFilter ? ' selected' : ''}" data-s="">All trees</button>`].concat(subs.map((s, i) => `<button class="chip${gardenFilter === s ? ' selected' : ''}" style="--c:${colorOf(s)};--i:${i + 1}" data-s="${esc(s)}"><span class="dot"></span>${esc(s)}</button>`)).join('') : '';
    $$('.chip', chips).forEach((c) => c.addEventListener('click', () => { gardenFilter = c.dataset.s || null; renderGarden(); }));
    const host = $('#garden');
    const trees = D.trees.filter((t) => !gardenFilter || t.subject === gardenFilter).sort((a, b) => new Date(b.date) - new Date(a.date));
    renderGardenScene(trees);
    if (!trees.length) {
      host.innerHTML = `<div class="garden-empty">${window.Tree.build('oak', 'empty')}<h3>Your garden is waiting</h3><p>Study for 10 minutes in one go and your first tree will be planted here.</p></div>`;
      window.Tree.setGrowth($('.garden-empty .tree'), 0.15, 0);
      return;
    }
    const groups = new Map();
    trees.forEach((t) => {
      const d = new Date(t.date);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (!groups.has(k)) groups.set(k, { label: d.toLocaleDateString([], { month: 'long', year: 'numeric' }), list: [] });
      groups.get(k).list.push(t);
    });
    let idx = 0;
    const FLOWERS = ['#fde047', '#f9a8d4', '#ffffff', '#c4b5fd', '#fca5a5'];
    host.innerHTML = [...groups.values()].map((g, gi) => { const cnt = g.list.reduce((a, t) => a + treeCountOf(t), 0); return `<div class="garden-month"><h3>${g.label} · ${cnt} tree${cnt > 1 ? 's' : ''}</h3><div class="garden-field">${
      g.list.map((t) => Array.from({ length: treeCountOf(t) }, (_, k) => { const h = hashStr(t.id + k); return `<div class="garden-tile${treeCountOf(t) > 1 ? ' multi' : ''}" style="--i:${Math.min(idx++, 40)};--fl:${FLOWERS[h % 5]};--fx:${(h >> 3) % 70 + 15}%" data-id="${t.id}">${window.Tree.build(t.species, 'g' + t.id + '_' + k)}</div>`; }).join('')).join('')
    }${butterflies(gi % 2 ? 1 : 2, 'f' + gi)}</div></div>`; }).join('');
    $$('.garden-tile', host).forEach((tile) => {
      const t = D.trees.find((x) => x.id === tile.dataset.id);
      const svg = $('.tree', tile);
      const gr = window.Tree.growthFor(t.duration);
      const sz = Math.max(0.8, window.Tree.sizeFor(1, gr.g)), vw = 172 * sz, vh = 214 * sz;
      svg.setAttribute('viewBox', `${100 - vw / 2} ${217 - vh} ${vw} ${vh}`);
      // skip the grow transition so garden trees appear fully formed
      $$('.part, .gpart, .grow, .shadow', svg).forEach((n) => { n.style.transition = 'none'; });
      window.Tree.setGrowth(svg, 1, gr.g);
      requestAnimationFrame(() => $$('.part, .gpart, .grow, .shadow', svg).forEach((n) => { n.style.transition = ''; }));
      const sp = window.Tree.SPECIES.find((x) => x.id === t.species) || { name: 'Tree' };
      // hovering one tree lights up all the trees from the same session
      const mates = () => $$(`.garden-tile[data-id="${CSS.escape(t.id)}"]`, host);
      const sess = D.sessions.find((x) => x.id === t.sessionId);
      tile.addEventListener('mouseenter', (e) => {
        host.classList.add('hl'); mates().forEach((m) => m.classList.add('lit'));
        const n = treeCountOf(t);
        showTip(`<div class="tt-title">${n > 1 ? `${n} × ` : ''}${sp.name}</div><div class="tt-row"><span><i style="--c:${colorOf(t.subject)}"></i>${esc(t.subject)}</span><b>${fmtDur(t.duration)}</b></div>${sess && sess.coins ? `<div class="tt-row"><span>Coins</span><b>+${sess.coins}</b></div>` : ''}<div class="muted" style="margin-top:4px">${new Date(t.date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>`, e);
      });
      tile.addEventListener('mousemove', moveTip);
      tile.addEventListener('mouseleave', () => { host.classList.remove('hl'); mates().forEach((m) => m.classList.remove('lit')); hideTip(); });
      tile.addEventListener('click', () => {
        const r = tile.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height * 0.4, { n: 14, speed: 3, colors: [sp.leaf1 || '#4ade80', sp.leaf2 || '#2e7d3b'] });
      });
    });
  }

  // ---------------- trees page: cases + collection ----------------
  const CASES = [
    { id: 'seed', name: 'Seed Pouch', price: 50, color: '#a3e635', odds: { common: 70, uncommon: 25, rare: 5 } },
    { id: 'sapling', name: 'Sapling Crate', price: 150, color: '#38bdf8', odds: { common: 35, uncommon: 40, rare: 20, epic: 5 } },
    { id: 'grove', name: 'Grove Chest', price: 400, color: '#fbbf24', odds: { uncommon: 30, rare: 39, epic: 22, legendary: 8, mythical: 1 } },
    { id: 'vault', name: 'Mythic Vault', price: 1000, color: '#ff4d8d', odds: { epic: 50, legendary: 38, mythical: 12 } },
  ];
  function rollCase(c) {
    const entries = Object.entries(c.odds);
    let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0), rarity = entries[0][0];
    for (const [k, w] of entries) { if ((r -= w) < 0) { rarity = k; break; } }
    const pool = window.Tree.SPECIES.filter((x) => x.rarity === rarity);
    return pool[Math.floor(Math.random() * pool.length)].id;
  }
  function renderTrees() {
    const all = window.Tree.SPECIES;
    animateNumber($('#tr-owned'), all.filter((x) => owns(x.id)).length, (v) => `${Math.round(v)} / ${all.length}`, 600);
    animateNumber($('#tr-coins'), D.coins, (v) => Math.round(v).toLocaleString(), 600);
    $('#cases').innerHTML = CASES.map((c, i) => `<div class="case-card" style="--cc:${c.color};--i:${i}" data-c="${c.id}">
      <div class="case-stage"><div class="case-rays"></div><div class="case-beam"></div><div class="case-sparks">${'<i></i>'.repeat(12)}</div>
      <div class="case-box"><div class="cb-lid"></div><div class="cb-body"></div><div class="cb-band"></div><div class="cb-shine"></div></div></div>
      <h3>${c.name}</h3>
      <div class="odds">${window.Tree.RARITY_ORDER.filter((r) => c.odds[r]).map((r) => `<span style="--rc:${window.Tree.RARITIES[r].color}"><i></i>${window.Tree.RARITIES[r].name}<b>${c.odds[r]}%</b></span>`).join('')}</div>
      ${freeCount(c.id) ? `<button class="btn primary open-case free" data-free="1">🎁 Open free${freeCount(c.id) > 1 ? ` (${freeCount(c.id)})` : ''}</button>
        <span class="need">or <span class="coin sm"></span>${c.price} coins</span>`
        : `<button class="btn primary open-case"${D.coins < c.price ? ' disabled' : ''}><span class="coin sm"></span>${c.price}</button>
      ${D.coins < c.price ? `<span class="need">Need ${c.price - D.coins} more coins</span>` : '<span class="need">&nbsp;</span>'}`}
      ${freeCount(c.id) ? `<span class="free-ribbon">${freeCount(c.id)} free</span>` : ''}
    </div>`).join('');
    $$('.case-card').forEach((card) => {
      $('.open-case', card).addEventListener('click', (ev) => openCase(CASES.find((c) => c.id === card.dataset.c), !!ev.currentTarget.dataset.free));
      // tilt towards the mouse and kick off a little burst of sparkles on the way in
      card.addEventListener('mouseenter', () => {
        const r = $('.case-box', card).getBoundingClientRect();
        const c = CASES.find((x) => x.id === card.dataset.c);
        burst(r.left + r.width / 2, r.top + r.height * 0.3, { n: 16, up: true, speed: 4.5, shape: ['star4', 'dot'], glow: true, gravity: 0.06, colors: [c.color, '#ffffff', '#fde68a'] });
      });
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--rx', `${(((e.clientY - r.top) / r.height) - 0.5) * -12}deg`);
        card.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - 0.5) * 14}deg`);
        card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      });
      card.addEventListener('mouseleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
    const ord = window.Tree.RARITY_ORDER;
    const sorted = all.slice().sort((a, b) => (isFav(b.id) - isFav(a.id)) || ord.indexOf(a.rarity) - ord.indexOf(b.rarity));
    $('#collection').innerHTML = sorted.map((sp, i) => {
      const r = window.Tree.RARITIES[sp.rarity], n = D.collection.owned[sp.id] || 0;
      return `<div class="col-card${n ? '' : ' locked'}${D.selectedTree === sp.id ? ' selected' : ''}" style="--rc:${r.color};--i:${i}" data-t="${sp.id}">
        <div class="col-img">${staticTree(sp.id, 3 * 3600, false, 'col' + sp.id)}${n ? '' : '<span class="lock">?</span>'}</div>${n ? starHtml(sp.id) : ''}
        <div class="col-name">${esc(sp.name)}</div>
        <div class="col-meta"><span class="rar">${r.name}</span>${r.boost ? `<span class="boost">${pct(r.boost)} coins</span>` : ''}${n > 1 ? `<span class="cnt">×${n}</span>` : ''}</div>
      </div>`;
    }).join('');
    paintTrees($('#collection'));
    $$('#collection .fav-star').forEach((st) => st.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const on = toggleFav(st.dataset.fav);
      st.classList.toggle('on', on); st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop');
      st.title = on ? 'Remove from favourites' : 'Favourite: keep at the front';
      toast(on ? `${esc(window.Tree.get(st.dataset.fav).name)} will show first when picking a tree` : `${esc(window.Tree.get(st.dataset.fav).name)} removed from favourites`);
    }));
    $$('.col-card').forEach((c) => c.addEventListener('click', () => {
      if (c.classList.contains('locked')) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); return; }
      if (T.state !== 'idle') { toast('You can change trees once this session ends'); return; }
      D.selectedTree = T.tree = c.dataset.t; save();
      $$('.col-card').forEach((x) => x.classList.toggle('selected', x === c));
      toast(`${esc(window.Tree.get(c.dataset.t).name)} will grow in your next session`);
    }));
  }
  const REEL_W = 132;
  function openCase(c, free) {
    if (free) {
      if (!freeCount(c.id)) return;
      D.freeCases[c.id] = freeCount(c.id) - 1;
      updateNavDots();
    } else {
      if (D.coins < c.price) return;
      D.coins -= c.price;
      renderCoins();
    }
    const won = rollCase(c);
    const sp = window.Tree.get(won), r = window.Tree.RARITIES[sp.rarity];
    const isNew = !owns(won);
    D.collection.owned[won] = (D.collection.owned[won] || 0) + 1;
    D.collection.opened = (D.collection.opened || 0) + 1;
    if (!isNew) D.coins += r.refund;
    save(true); // the result is stored before the animation, so closing the app can't lose it

    const ov = $('#case-overlay');
    $('#co-title').textContent = `Opening ${c.name}`;
    $('#co-result').innerHTML = '';
    $('#co-actions').innerHTML = '';
    const N = 56, WIN = 48;
    const items = Array.from({ length: N }, (_, i) => (i === WIN ? won : rollCase(c)));
    const reel = $('#reel');
    reel.style.transition = 'none';
    reel.style.transform = 'translateX(0)';
    reel.innerHTML = items.map((id, i) => {
      const x = window.Tree.get(id);
      return `<div class="reel-item${i === WIN ? ' winner' : ''}" style="--rc:${window.Tree.RARITIES[x.rarity].color}">${staticTree(id, 3 * 3600, false, `re${i}`)}<span>${esc(x.name)}</span></div>`;
    }).join('');
    paintTrees(reel);
    ov.classList.remove('hidden', 'closing');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const wrapW = $('.reel-wrap').offsetWidth;
      const jitter = (Math.random() - 0.5) * (REEL_W * 0.6);
      const x = WIN * REEL_W - wrapW / 2 + (REEL_W - 12) / 2 + jitter;
      reel.style.transition = 'transform 5.4s cubic-bezier(.06,.62,.1,1)';
      reel.style.transform = `translateX(${-x}px)`;
    }));
    const done = () => {
      reel.removeEventListener('transitionend', done);
      // settle exactly on the winner
      const wrapW = $('.reel-wrap').offsetWidth;
      reel.style.transition = 'transform .5s cubic-bezier(.34,1.56,.64,1)';
      reel.style.transform = `translateX(${-(WIN * REEL_W - wrapW / 2 + (REEL_W - 12) / 2)}px)`;
      $('.reel-item.winner').classList.add('win');
      $('#co-title').textContent = isNew ? 'New tree unlocked!' : 'Duplicate';
      $('#co-result').innerHTML = `<div class="cr-card" style="--rc:${r.color}">
        <div class="cr-tree" id="cr-tree">${window.Tree.build(won, 'cr')}</div>
        <div class="cr-rar">${r.name}</div><div class="cr-name">${esc(sp.name)}</div>
        <div class="cr-info">${isNew ? (r.boost ? `Earns ${pct(r.boost)} coins while you study with it` : 'Added to your collection') : `You already have this one. <b>+${r.refund}</b> coins back`}</div></div>`;
      const t = $('#cr-tree .tree');
      $('#cr-tree').classList.add('alive');
      window.Tree.setGrowth(t, 0, 0);
      [0.3, 0.6, 1].forEach((p, i) => setTimeout(() => window.Tree.setGrowth(t, p, p === 1 ? 0.6 : 0), 120 + i * 380));
      const box = $('.cr-card').getBoundingClientRect();
      const big = sp.rarity === 'legendary' || sp.rarity === 'epic' || sp.rarity === 'mythical';
      burst(box.left + box.width / 2, box.top + box.height * 0.35, { n: big ? 110 : 50, up: true, speed: big ? 10 : 7, colors: [r.color, '#ffffff', sp.leaf1, sp.leaf2] });
      if (!isNew) renderCoins();
      setTimeout(() => checkAchievements(), 900);
      const freeLeft = freeCount(c.id), again = freeLeft > 0 || D.coins >= c.price;
      $('#co-actions').innerHTML = `<button class="btn ghost" data-a="close">Close</button>
        ${T.state === 'idle' ? '<button class="btn" data-a="use">Use this tree</button>' : ''}
        <button class="btn primary" data-a="again"${again ? '' : ' disabled'}>${freeLeft ? `Open another free (${freeLeft})` : `Open another <span class="coin sm"></span>${c.price}`}</button>`;
      $$('#co-actions .btn').forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'again') return openCase(c, freeCount(c.id) > 0);
        if (a === 'use') { D.selectedTree = T.tree = won; save(); toast(`${esc(sp.name)} will grow in your next session`); }
        ov.classList.add('closing');
        setTimeout(() => { ov.classList.add('hidden'); ov.classList.remove('closing'); renderTrees(); }, 300);
      }));
    };
    reel.addEventListener('transitionend', done);
  }

  // ---------------- achievements ----------------
  // Badges are earned once and kept (no rewards yet). D.achievements = { badgeId: ISO date earned }.
  const H = 3600;
  const BADGE_CATS = [
    { id: 'time', name: 'Time spent', sub: 'Hours of study, all subjects together' },
    { id: 'grown', name: 'Trees grown', sub: 'Trees planted in your garden' },
    { id: 'collected', name: 'Trees collected', sub: 'Species unlocked from cases' },
    { id: 'school', name: 'School', sub: 'Planning tests and tracking your grades' },
    { id: 'friends', name: 'Friends', sub: 'Streaks and weekly team tasks with friends' },
  ];
  const TIERS = {
    bronze: ['#ffd3a8', '#c9773a', '#7a3f16'], silver: ['#ffffff', '#b4bfcc', '#5b6675'], gold: ['#fff4b0', '#f5b301', '#9a6200'],
    platinum: ['#e6fdff', '#67d4f5', '#1f6a8f'], diamond: ['#f7e8ff', '#b77cff', '#5b21b6'], mythic: ['#ffe0ec', '#ff4d8d', '#8f1048'],
  };
  const BADGES = [
    { id: 'time-1', cat: 'time', name: 'First hour', desc: 'Study for 1 hour in total', metric: 'total', goal: 1 * H, tier: 'bronze', label: '1h', icon: 'clock' },
    { id: 'time-5', cat: 'time', name: 'Warming up', desc: 'Study for 5 hours in total', metric: 'total', goal: 5 * H, tier: 'bronze', label: '5h', icon: 'clock' },
    { id: 'time-10', cat: 'time', name: 'Committed', desc: 'Study for 10 hours in total', metric: 'total', goal: 10 * H, tier: 'silver', label: '10h', icon: 'clock' },
    { id: 'time-25', cat: 'time', name: 'Dedicated', desc: 'Study for 25 hours in total', metric: 'total', goal: 25 * H, tier: 'silver', label: '25h', icon: 'clock' },
    { id: 'time-50', cat: 'time', name: 'Scholar', desc: 'Study for 50 hours in total', metric: 'total', goal: 50 * H, tier: 'gold', label: '50h', icon: 'clock' },
    { id: 'time-100', cat: 'time', name: 'Centurion', desc: 'Study for 100 hours in total', metric: 'total', goal: 100 * H, tier: 'platinum', label: '100h', icon: 'clock' },
    { id: 'time-250', cat: 'time', name: 'Master', desc: 'Study for 250 hours in total', metric: 'total', goal: 250 * H, tier: 'diamond', label: '250h', icon: 'clock' },
    { id: 'time-500', cat: 'time', name: 'Living legend', desc: 'Study for 500 hours in total', metric: 'total', goal: 500 * H, tier: 'mythic', label: '500h', icon: 'clock' },
    { id: 'focus-1', cat: 'time', name: 'Deep focus', desc: 'Study for 1 hour in a single session', metric: 'longest', goal: 1 * H, tier: 'silver', label: '1h', icon: 'bolt' },
    { id: 'focus-2', cat: 'time', name: 'Marathon', desc: 'Study for 2 hours in a single session', metric: 'longest', goal: 2 * H, tier: 'gold', label: '2h', icon: 'bolt' },
    { id: 'focus-3', cat: 'time', name: 'Iron will', desc: 'Study for 3 hours in a single session', metric: 'longest', goal: 3 * H, tier: 'diamond', label: '3h', icon: 'bolt' },
    { id: 'grown-1', cat: 'grown', name: 'First sprout', desc: 'Grow your first tree', metric: 'grown', goal: 1, tier: 'bronze', label: '1', icon: 'sprout' },
    { id: 'grown-5', cat: 'grown', name: 'Little grove', desc: 'Grow 5 trees', metric: 'grown', goal: 5, tier: 'bronze', label: '5', icon: 'sprout' },
    { id: 'grown-10', cat: 'grown', name: 'Young forest', desc: 'Grow 10 trees', metric: 'grown', goal: 10, tier: 'silver', label: '10', icon: 'tree' },
    { id: 'grown-25', cat: 'grown', name: 'Thicket', desc: 'Grow 25 trees', metric: 'grown', goal: 25, tier: 'silver', label: '25', icon: 'tree' },
    { id: 'grown-50', cat: 'grown', name: 'Woodland', desc: 'Grow 50 trees', metric: 'grown', goal: 50, tier: 'gold', label: '50', icon: 'tree' },
    { id: 'grown-100', cat: 'grown', name: 'Forest keeper', desc: 'Grow 100 trees', metric: 'grown', goal: 100, tier: 'platinum', label: '100', icon: 'forest' },
    { id: 'grown-250', cat: 'grown', name: 'Ancient forest', desc: 'Grow 250 trees', metric: 'grown', goal: 250, tier: 'diamond', label: '250', icon: 'forest' },
    { id: 'grown-500', cat: 'grown', name: 'Evergreen', desc: 'Grow 500 trees', metric: 'grown', goal: 500, tier: 'mythic', label: '500', icon: 'forest' },
    { id: 'coll-3', cat: 'collected', name: 'Collector', desc: 'Own 3 different trees', metric: 'owned', goal: 3, tier: 'bronze', label: '3', icon: 'leaf' },
    { id: 'coll-6', cat: 'collected', name: 'Botanist', desc: 'Own 6 different trees', metric: 'owned', goal: 6, tier: 'silver', label: '6', icon: 'leaf' },
    { id: 'coll-10', cat: 'collected', name: 'Arborist', desc: 'Own 10 different trees', metric: 'owned', goal: 10, tier: 'gold', label: '10', icon: 'leaf' },
    { id: 'coll-15', cat: 'collected', name: 'Curator', desc: 'Own 15 different trees', metric: 'owned', goal: 15, tier: 'platinum', label: '15', icon: 'leaf' },
    { id: 'coll-all', cat: 'collected', name: 'Completionist', desc: 'Own every tree', metric: 'owned', goal: 'all', tier: 'mythic', label: 'ALL', icon: 'crown' },
    { id: 'rar-rare', cat: 'collected', name: 'Rare find', desc: 'Unlock a rare tree', metric: 'rarity:rare', goal: 1, tier: 'silver', label: 'R', icon: 'gem' },
    { id: 'rar-epic', cat: 'collected', name: 'Epic find', desc: 'Unlock an epic tree', metric: 'rarity:epic', goal: 1, tier: 'gold', label: 'E', icon: 'gem' },
    { id: 'rar-legendary', cat: 'collected', name: 'Legendary find', desc: 'Unlock a legendary tree', metric: 'rarity:legendary', goal: 1, tier: 'platinum', label: 'L', icon: 'gem' },
    { id: 'rar-mythical', cat: 'collected', name: 'Myth made real', desc: 'Unlock the mythical tree', metric: 'rarity:mythical', goal: 1, tier: 'mythic', label: 'M', icon: 'gem' },
    { id: 'case-1', cat: 'collected', name: 'Unboxer', desc: 'Open your first case', metric: 'opened', goal: 1, tier: 'bronze', label: '1', icon: 'box' },
    { id: 'case-10', cat: 'collected', name: 'Case cracker', desc: 'Open 10 cases', metric: 'opened', goal: 10, tier: 'silver', label: '10', icon: 'box' },
    { id: 'case-50', cat: 'collected', name: 'High roller', desc: 'Open 50 cases', metric: 'opened', goal: 50, tier: 'gold', label: '50', icon: 'box' },
    { id: 'grade-1', cat: 'school', name: 'Report card', desc: 'Record your first grade', metric: 'graded', goal: 1, tier: 'bronze', label: '1', icon: 'grade' },
    { id: 'grade-10', cat: 'school', name: 'Keeping score', desc: 'Record 10 grades', metric: 'graded', goal: 10, tier: 'silver', label: '10', icon: 'grade' },
    { id: 'friend-1', cat: 'friends', name: 'Study buddy', desc: 'Add your first friend', metric: 'friends', goal: 1, tier: 'bronze', label: '1', icon: 'people' },
    { id: 'friend-5', cat: 'friends', name: 'Study group', desc: 'Have 5 friends', metric: 'friends', goal: 5, tier: 'silver', label: '5', icon: 'people' },
    { id: 'fstreak-3', cat: 'friends', name: 'Spark', desc: 'Reach a 3 day streak with a friend', metric: 'fstreak', goal: 3, tier: 'bronze', label: '3', icon: 'flame' },
    { id: 'fstreak-7', cat: 'friends', name: 'On fire', desc: 'Reach a 7 day streak with a friend', metric: 'fstreak', goal: 7, tier: 'silver', label: '7', icon: 'flame' },
    { id: 'fstreak-30', cat: 'friends', name: 'Inseparable', desc: 'Reach a 30 day streak with a friend', metric: 'fstreak', goal: 30, tier: 'gold', label: '30', icon: 'flame' },
    { id: 'fstreak-100', cat: 'friends', name: 'Legendary duo', desc: 'Reach a 100 day streak with a friend', metric: 'fstreak', goal: 100, tier: 'diamond', label: '100', icon: 'flame' },
    { id: 'quest-1', cat: 'friends', name: 'Team player', desc: 'Complete a weekly team task', metric: 'tasks', goal: 1, tier: 'bronze', label: '1', icon: 'flag' },
    { id: 'quest-10', cat: 'friends', name: 'Dream team', desc: 'Complete 10 weekly team tasks', metric: 'tasks', goal: 10, tier: 'silver', label: '10', icon: 'flag' },
    { id: 'quest-50', cat: 'friends', name: 'Unstoppable', desc: 'Complete 50 weekly team tasks', metric: 'tasks', goal: 50, tier: 'gold', label: '50', icon: 'flag' },
    { id: 'questweek-1', cat: 'friends', name: 'Clean sweep', desc: 'Finish all three team tasks in one week', metric: 'fullweeks', goal: 1, tier: 'silver', label: '3/3', icon: 'flag' },
    { id: 'questweek-10', cat: 'friends', name: 'Perfect partners', desc: 'Finish all three team tasks in 10 weeks', metric: 'fullweeks', goal: 10, tier: 'platinum', label: '10', icon: 'crown' },
    { id: 'grade-top', cat: 'school', name: 'Top marks', desc: 'Score 90% or more on a test, exam or assignment', metric: 'top', goal: 1, tier: 'silver', label: '90', icon: 'star' },
  ];
  function badgeMetrics() {
    const counted_ = D.sessions.filter(counted);
    const owned = window.Tree.SPECIES.filter((x) => owns(x.id));
    return {
      total: counted_.reduce((a, s) => a + s.duration, 0),
      longest: counted_.reduce((m, s) => Math.max(m, s.duration), D.active ? elapsedSec() : 0),
      grown: totalTrees(),
      owned: owned.length,
      opened: (D.collection && D.collection.opened) || 0,
      graded: allGradeRows().filter((x) => x.pct != null).length,
      top: allGradeRows().filter((x) => x.pct >= 90).length,
      rarity: (r) => owned.filter((x) => x.rarity === r).length,
      ...(window.Friends ? window.Friends.badgeMetrics() : { friends: 0, fstreak: 0, tasks: 0, fullweeks: 0 }),
    };
  }
  function badgeProgress(b, m) {
    const goal = b.goal === 'all' ? window.Tree.SPECIES.length : b.goal;
    const cur = b.metric.startsWith('rarity:') ? m.rarity(b.metric.slice(7)) : m[b.metric];
    return { cur: Math.min(cur, goal), goal, done: cur >= goal };
  }
  const BADGE_ICONS = {
    clock: '<circle cx="50" cy="47" r="15" fill="none" stroke="currentColor" stroke-width="5"/><path d="M50 38v10l7 5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    bolt: '<path d="M54 28 38 52h11l-4 18 17-25H51z" fill="currentColor"/>',
    sprout: '<path d="M50 66V48" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M50 50c-12 0-17-8-17-16 10 0 17 6 17 16zM50 46c0-10 7-16 17-16 0 8-5 16-17 16z" fill="currentColor"/>',
    tree: '<path d="M50 70V54" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="42" r="15" fill="currentColor"/>',
    forest: '<path d="M38 68V58M62 68V58M50 70V56" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M38 30l-11 28h22zM62 30l-11 28h22z" fill="currentColor" opacity=".75"/><path d="M50 26l-12 31h24z" fill="currentColor"/>',
    leaf: '<path d="M33 64C33 40 48 30 68 30c0 24-12 34-30 34z" fill="currentColor"/><path d="M34 64l20-20" stroke="rgba(0,0,0,.25)" stroke-width="3" stroke-linecap="round"/>',
    crown: '<path d="M32 62h36l4-26-12 10-10-16-10 16-12-10z" fill="currentColor"/>',
    gem: '<path d="M38 34h24l9 11-21 25-21-25z" fill="currentColor"/><path d="M29 45h42M44 34l6 36 6-36" stroke="rgba(0,0,0,.22)" stroke-width="2" fill="none"/>',
    cal: '<rect x="30" y="32" width="40" height="34" rx="5" fill="currentColor"/><path d="M30 42h40" stroke="rgba(0,0,0,.25)" stroke-width="3"/><path d="M39 27v9M61 27v9" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M41 54l6 6 12-12" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    grade: '<path d="M34 28h24l10 10v30H34z" fill="currentColor"/><path d="M42 58l7-20 7 20M45 51h8" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
    star: '<path d="M50 27l6.5 13.5 14.5 2-10.5 10 2.5 14.5L50 60l-13 7 2.5-14.5-10.5-10 14.5-2z" fill="currentColor"/>',
    people: '<circle cx="42" cy="38" r="8" fill="currentColor"/><path d="M28 64c1-10 6-15 14-15s13 5 14 15z" fill="currentColor"/><circle cx="60" cy="40" r="7" fill="currentColor" opacity=".7"/><path d="M52 51c2-1 5-2 8-2 7 0 11 5 12 14H58" fill="currentColor" opacity=".7"/>',
    flame: '<path d="M50 26c2 8 13 12 13 25a13 13 0 0 1-26 0c0-6 4-10 6-12 0 4 2 6 4 6 0-8-2-12 3-19z" fill="currentColor"/><path d="M50 50c2 3 6 5 6 10a6 6 0 0 1-12 0c0-3 2-5 3-6 .4 2 1.6 2.8 3 2.8 0-3.2-1.2-4.8 0-6.8z" fill="rgba(255,255,255,.6)"/>',
    flag: '<path d="M36 28v42" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M38 30c8-5 14 4 24-1v20c-10 5-16-4-24 1z" fill="currentColor"/>',
    box: '<path d="M32 42h36v24H32z" fill="currentColor"/><path d="M29 34h42v9H29z" fill="currentColor" opacity=".8"/><path d="M47 34h6v32h-6z" fill="rgba(255,255,255,.55)"/>',
  };
  function badgeSvg(b, uidKey) {
    const [hi, mid, lo] = TIERS[b.tier];
    const k = `bd-${uidKey}`;
    const pts = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 38 : 43; return `${(50 + Math.cos(a) * r).toFixed(1)},${(48 + Math.sin(a) * r).toFixed(1)}`; }).join(' ');
    return `<svg class="badge-svg" viewBox="0 0 100 112">
      <defs><linearGradient id="${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
      <linearGradient id="${k}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>
      <path d="M30 76 22 108l14-7 9 11 7-30zM70 76l8 32-14-7-9 11-7-30z" fill="url(#${k}r)"/>
      <polygon points="${pts}" fill="url(#${k})"/>
      <circle cx="50" cy="48" r="31" fill="${lo}" opacity=".9"/>
      <circle cx="50" cy="48" r="28" fill="url(#${k})"/>
      <g class="badge-icon" color="${lo}" transform="translate(0,-2)">${BADGE_ICONS[b.icon]}</g>
      <rect x="31" y="66" width="38" height="13" rx="6.5" fill="${lo}"/>
      <text x="50" y="76" text-anchor="middle" font-size="9.5" font-weight="800" fill="${hi}" font-family="inherit">${b.label}</text>
      <ellipse class="badge-gloss" cx="40" cy="30" rx="16" ry="8" fill="#fff" opacity=".28" transform="rotate(-25 40 30)"/>
    </svg>`;
  }
  // Award any badges that are now complete. silent: no celebration (used when seeding an upgraded save).
  let badgeQueue = [], badgeShowing = false;
  function checkAchievements(silent) {
    if (!D || !D.achievements) return [];
    const m = badgeMetrics(), now = new Date().toISOString(), fresh = [];
    BADGES.forEach((b) => { if (!D.achievements[b.id] && badgeProgress(b, m).done) { D.achievements[b.id] = now; fresh.push(b); } });
    if (!fresh.length) return fresh;
    save();
    if (!silent) { badgeQueue.push(...fresh); showNextBadge(); }
    if (currentPage === 'badges') renderBadges();
    updateNavDots();
    return fresh;
  }
  function showNextBadge() {
    if (badgeShowing || !badgeQueue.length) return;
    badgeShowing = true;
    const b = badgeQueue.shift();
    const el = document.createElement('div');
    el.className = 'badge-pop';
    el.innerHTML = `<div class="bp-card" style="--tc:${TIERS[b.tier][1]}"><div class="bp-rays"></div><div class="bp-badge">${badgeSvg(b, 'pop' + b.id)}</div><div class="bp-kicker">Badge unlocked</div><h2>${esc(b.name)}</h2><p>${esc(b.desc)}</p><div class="bp-reward"><b>${rewardChip(rewardOf(b))}</b><span>Claim it on the Badges page</span></div>${badgeQueue.length ? `<span class="bp-more">+${badgeQueue.length} more</span>` : ''}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      const r = $('.bp-badge', el).getBoundingClientRect();
      setTimeout(() => burst(r.left + r.width / 2, r.top + r.height / 2, { n: 70, speed: 8, colors: [...TIERS[b.tier], '#ffffff'] }), 350);
    });
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      el.classList.add('out');
      setTimeout(() => { el.remove(); badgeShowing = false; showNextBadge(); }, 380);
    };
    el.addEventListener('click', close);
    setTimeout(close, 3600);
  }
  function renderBadges() {
    const m = badgeMetrics();
    const earned = BADGES.filter((b) => D.achievements[b.id]).length;
    animateNumber($('#bd-earned'), earned, (v) => `${Math.round(v)} / ${BADGES.length}`, 600);
    const latest = BADGES.filter((b) => D.achievements[b.id]).sort((a, b) => D.achievements[b.id].localeCompare(D.achievements[a.id]))[0];
    $('#bd-latest').textContent = latest ? latest.name : 'None yet';
    let idx = 0;
    $('#badge-cats').innerHTML = BADGE_CATS.map((c, ci) => {
      const list = BADGES.filter((b) => b.cat === c.id);
      const got = list.filter((b) => D.achievements[b.id]).length;
      return `<section class="card badge-cat stagger" style="--i:${ci + 1}">
        <div class="card-head"><div><h3>${c.name}</h3><span class="muted">${c.sub}</span></div><span class="bc-count"><b>${got}</b> / ${list.length}</span></div>
        <div class="bc-bar"><i style="--p:${(got / list.length).toFixed(3)}"></i></div>
        <div class="badge-grid">${list.map((b) => {
          const pr = badgeProgress(b, m), on = !!D.achievements[b.id];
          const curTxt = b.metric === 'total' || b.metric === 'longest' ? `${fmtDur(pr.cur)} / ${fmtDur(pr.goal)}` : `${pr.cur} / ${pr.goal}`;
          return `<div class="badge${on ? ' earned' : ''} t-${b.tier}" style="--i:${idx++};--tc:${TIERS[b.tier][1]}" data-b="${b.id}">
            <div class="badge-art">${badgeSvg(b, b.id)}${on ? '' : '<span class="badge-lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>'}</div>
            <div class="badge-name">${esc(b.name)}</div>
            <div class="badge-desc">${esc(b.desc)}</div>
            ${on ? `<div class="badge-when">Earned ${new Date(D.achievements[b.id]).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</div>`
              : `<div class="badge-prog"><i style="--p:${(pr.cur / pr.goal).toFixed(3)}"></i></div><div class="badge-when">${curTxt}</div>`}
            ${on && !D.badgeClaims[b.id] ? `<button class="btn primary small claim-btn" title="${esc(rewardText(rewardOf(b)))}">Claim ${rewardShort(rewardOf(b))}</button>`
              : `<div class="badge-reward${on ? ' claimed' : ''}">${on ? `${CHECK}<span>${esc(rewardText(rewardOf(b)))}</span>` : rewardChip(rewardOf(b))}</div>`}
          </div>`;
        }).join('')}</div></section>`;
    }).join('');
    const unc = unclaimed();
    $('#bd-claim-all').classList.toggle('hidden', unc.length < 2);
    $('#bd-claim-all').innerHTML = `Claim all ${unc.length} rewards`;
    $$('#badge-cats .claim-btn').forEach((btn) => btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const el = btn.closest('.badge'), b = BADGES.find((x) => x.id === el.dataset.b);
      claimReward(b, $('.badge-art', el));
      el.classList.add('just-claimed');
      const r = rewardOf(b);
      btn.outerHTML = `<div class="badge-reward claimed pop-in">${CHECK}<span>${esc(rewardText(r))}</span></div>`;
      const left = unclaimed().length;
      $('#bd-claim-all').classList.toggle('hidden', left < 2);
      $('#bd-claim-all').innerHTML = `Claim all ${left} rewards`;
      if (r.box && !claimingAll) toast(`${caseName(r.box)} added. Open it free on the Trees page`, 3200);
    }));
    // a little 3D tilt that follows the mouse
    $$('#badge-cats .badge').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--rx', `${(((e.clientY - r.top) / r.height) - 0.5) * -16}deg`);
        el.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - 0.5) * 18}deg`);
        el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      });
      el.addEventListener('mouseleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
      el.addEventListener('click', () => {
        if (!el.classList.contains('earned')) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
        const art = $('.badge-art', el); art.classList.remove('spin'); void art.offsetWidth; art.classList.add('spin');
        const r = art.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, { n: 24, speed: 4, leaf: false, colors: [...TIERS[BADGES.find((b) => b.id === el.dataset.b).tier], '#ffffff'] });
      });
    });
  }


  // ---------------- free cases + achievement rewards (1.5.0) ----------------
  // Rewards are claimed on the Badges page. Small coin rewards for easy badges, free cases for big ones.
  // Sized against 65 coins per hour of study so they feel good without flooding the economy.
  const TIER_REWARD = {
    bronze: { coins: 20 },
    silver: { coins: 50 },
    gold: { box: 'sapling' },
    platinum: { box: 'grove' },
    diamond: { box: 'grove', coins: 250 },
    mythic: { box: 'vault', coins: 500 },
  };
  const BADGE_REWARD = { 'coll-all': { coins: 1500 } }; // nothing left to unlock, so coins instead
  const rewardOf = (b) => BADGE_REWARD[b.id] || TIER_REWARD[b.tier] || { coins: 0 };
  const caseName = (id) => (CASES.find((c) => c.id === id) || {}).name || 'Case';
  function rewardText(r) {
    const parts = [];
    if (r.box) parts.push(caseName(r.box));
    if (r.coins) parts.push(`${r.coins} coins`);
    return parts.join(' + ');
  }
  function rewardChip(r) {
    return `${r.box ? `<span class="rw-box" style="--cc:${CASES.find((c) => c.id === r.box).color}"></span>` : ''}${r.coins && !r.box ? '<span class="coin sm"></span>' : ''}${esc(rewardText(r))}`;
  }
  function rewardShort(r) {
    const box = r.box ? `<span class="rw-box" style="--cc:${CASES.find((c) => c.id === r.box).color}"></span>` : '';
    if (r.box && r.coins) return `${box}+${r.coins}`;
    if (r.box) return box;
    return `<span class="coin sm"></span>${r.coins}`;
  }
  const unclaimed = () => BADGES.filter((b) => D.achievements[b.id] && !D.badgeClaims[b.id]);
  const freeCount = (id) => (D.freeCases && D.freeCases[id]) || 0;
  const totalFree = () => Object.values(D.freeCases || {}).reduce((a, n) => a + (n > 0 ? n : 0), 0);
  function updateNavDots() {
    const set = (page, n) => {
      const b = $(`.nav-item[data-page="${page}"]`);
      if (!b) return;
      let dot = $('.ndot', b);
      if (n > 0) {
        if (!dot) { dot = document.createElement('i'); dot.className = 'ndot'; b.appendChild(dot); }
        dot.textContent = n > 9 ? '9+' : n;
      } else if (dot) dot.remove();
    };
    set('badges', unclaimed().length);
    set('trees', totalFree());
    if (window.Friends) set('friends', window.Friends.pending());
    // a red dot on the arrow when a hidden tab has something waiting
    const more = $('#nav-more');
    if (more) {
      const hidden = $$('.nav-item.tucked .ndot').length;
      more.classList.toggle('has-dot', !navOpen && hidden > 0);
    }
  }
  // flies a little gift box from an element to the Trees tab
  function flyGift(fromEl, color) {
    const to = $('.nav-item[data-page="trees"]').getBoundingClientRect();
    const fr = fromEl.getBoundingClientRect();
    const g = document.createElement('div');
    g.className = 'flying-gift';
    g.style.setProperty('--cc', color);
    const sx = fr.left + fr.width / 2 - 14, sy = fr.top + fr.height / 2 - 14;
    g.style.left = sx + 'px'; g.style.top = sy + 'px';
    document.body.appendChild(g);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      g.style.transform = `translate(${to.left + to.width / 2 - 14 - sx}px, ${to.top + to.height / 2 - 14 - sy}px) scale(.6) rotate(-20deg)`;
      g.style.opacity = '.4';
    }));
    setTimeout(() => {
      g.remove();
      const nav = $('.nav-item[data-page="trees"]');
      nav.classList.remove('bump'); void nav.offsetWidth; nav.classList.add('bump');
      updateNavDots();
    }, 950);
  }
  function claimReward(b, el) {
    if (!D.achievements[b.id] || D.badgeClaims[b.id]) return;
    const r = rewardOf(b);
    D.badgeClaims[b.id] = new Date().toISOString();
    if (r.coins) D.coins += r.coins;
    if (r.box) D.freeCases[r.box] = freeCount(r.box) + 1;
    save(true);
    if (el) {
      const rr = el.getBoundingClientRect();
      burst(rr.left + rr.width / 2, rr.top + rr.height / 2, { n: 30, speed: 5, shape: ['star4', 'dot'], glow: true, colors: [...TIERS[b.tier], '#ffffff'] });
      if (r.coins) flyCoins(el, Math.min(r.coins, 30)); else renderCoins();
      if (r.box) flyGift(el, CASES.find((c) => c.id === r.box).color);
    } else renderCoins();
    updateNavDots();
  }
  let claimingAll = false;
  function claimAll() {
    const btns = $$('#badge-cats .claim-btn');
    if (!btns.length) return;
    const boxes = unclaimed().filter((b) => rewardOf(b).box).length;
    claimingAll = true;
    btns.forEach((b, i) => setTimeout(() => b.click(), i * 170));
    setTimeout(() => { claimingAll = false; if (boxes) toast(`${boxes} free case${boxes > 1 ? 's' : ''} added. Open ${boxes > 1 ? 'them' : 'it'} on the Trees page`, 3600); }, btns.length * 170 + 50);
  }
  function showGiftNotice() {
    if (!D.giftNotice) return;
    const kind = D.giftNotice;
    delete D.giftNotice;
    save();
    setTimeout(() => toast(kind === 'welcome'
      ? '🎁 Here\'s a free Seed Pouch to start your collection. Open it on the Trees page'
      : '🎁 Thanks for studying with us! A free Seed Pouch is waiting on the Trees page', 5200), 1800);
    updateNavDots();
  }

  // ---------------- grading (Australian scales) ----------------
  const SCALES = {
    // the user's school: E 0-39, E+ 40-49, D 50-54, D+ 55-59, C 60-64, C+ 65-69, B 70-74, B+ 75-79, A 80-89, A+ 90+
    school: { name: 'School (E to A+)', grades: [['A+', 90], ['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['D+', 55], ['D', 50], ['E+', 40], ['E', 0]] },
    uni: { name: 'University (HD to F)', grades: [['HD', 85], ['D', 75], ['C', 65], ['P', 50], ['F', 0]] },
  };
  function scaleGrades() {
    const sc = SCALES[D.grading.scale] || SCALES.school;
    const cuts = (D.grading.cuts && D.grading.cuts[D.grading.scale]) || {};
    return sc.grades.map(([l, min], i) => ({ l, min: i === sc.grades.length - 1 ? 0 : (Number.isFinite(cuts[l]) ? cuts[l] : min), i, n: sc.grades.length }));
  }
  function letterOf(p) {
    if (p == null || !Number.isFinite(p)) return null;
    return scaleGrades().find((g) => p >= g.min - 1e-9) || scaleGrades().slice(-1)[0];
  }
  // green for top grades through to red for the lowest
  const gradeColor = (g) => (g ? `hsl(${Math.round(140 - (g.i / Math.max(1, g.n - 1)) * 140)} 70% 52%)` : 'var(--muted)');
  const fmtPct = (p) => `${(Math.round(p * 10) / 10).toFixed(Math.abs(p - Math.round(p)) < 0.05 ? 0 : 1)}%`;
  const gradeTag = (p) => { const g = letterOf(p); return g ? `<span class="gtag" style="--gc:${gradeColor(g)}">${esc(g.l)}</span>` : ''; };

  // ---------------- grade calculator ----------------
  // Each subject has two semesters. Rows live in D.gradeExtras[subject]: {id, name, pct, weight, sem: 1|2, exam?}.
  // A row with exam: true is that semester's exam (one per semester).
  const curSem = () => (new Date().getMonth() < 6 ? 1 : 2);
  const G = { subject: null, sem: curSem() };
  const semRows = (subject, sem) => (D.gradeExtras[subject] || []).filter((x) => x.sem === sem);
  const allGradeRows = () => Object.values(D.gradeExtras).flat().filter(Boolean);
  function semTarget(subject, sem) {
    const t = D.gradeTargets[subject];
    if (t && typeof t === 'object') return Number.isFinite(t[sem]) ? t[sem] : null;
    return Number.isFinite(t) ? t : null;
  }
  function setSemTarget(subject, sem, v) {
    if (!D.gradeTargets[subject] || typeof D.gradeTargets[subject] !== 'object') D.gradeTargets[subject] = {};
    D.gradeTargets[subject][sem] = v;
  }
  const EXAM_ICON = '<svg viewBox="0 0 24 24"><path d="M4 5h11l5 5v9H4z"/><path d="M8 11h8M8 15h5"/></svg>';
  const MOVE_ICON = '<svg viewBox="0 0 24 24"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>';
  function gradeMath(items) {
    const graded = items.filter((x) => x.pct != null);
    const gw = graded.filter((x) => x.weight > 0);
    const allW = items.filter((x) => x.weight > 0).reduce((a, x) => a + x.weight, 0);
    const total = Math.max(100, allW);
    let avg = null, mode = 'none';
    if (gw.length) { mode = 'weighted'; avg = gw.reduce((a, x) => a + x.pct * x.weight, 0) / gw.reduce((a, x) => a + x.weight, 0); }
    else if (graded.length) { mode = 'plain'; avg = graded.reduce((a, x) => a + x.pct, 0) / graded.length; }
    const doneW = gw.reduce((a, x) => a + x.weight, 0);
    const earned = gw.reduce((a, x) => a + x.pct * x.weight, 0) / total; // points already locked in (of 100)
    const remainW = Math.max(0, total - doneW);
    const upcomingW = items.filter((x) => x.pct == null && x.weight > 0).reduce((a, x) => a + x.weight, 0);
    return { graded, gw, avg, mode, doneW, earned, remainW, upcomingW, total, allW, unweighted: graded.length - gw.length };
  }
  function renderGrades() {
    const subs = D.subjects.filter((s) => !s.archived || (D.gradeExtras[s.name] || []).length);
    if (!subs.find((s) => s.name === G.subject)) G.subject = (subs.find((s) => (D.gradeExtras[s.name] || []).length) || subs[0] || {}).name || null;
    $('#gr-chips').innerHTML = subs.map((s, i) => `<button class="chip${s.name === G.subject ? ' selected' : ''}" style="--c:${s.color};--i:${i}" data-s="${esc(s.name)}"><span class="dot"></span>${esc(s.name)}</button>`).join('') || '<div class="empty">Add a subject in Settings first.</div>';
    $$('#gr-chips .chip').forEach((c) => c.addEventListener('click', () => {
      if (G.subject === c.dataset.s) return;
      G.subject = c.dataset.s;
      $$('#gr-chips .chip').forEach((x) => x.classList.toggle('selected', x === c));
      renderGradeBody(true);
    }));
    renderGradeBody(true);
  }
  function renderGradeBody(fresh) {
    const host = $('#gr-body');
    if (!G.subject) { host.innerHTML = ''; return; }
    const sem = G.sem, other = sem === 1 ? 2 : 1;
    const rows = semRows(G.subject, sem);
    const items = rows.filter((x) => !x.exam), exams = rows.filter((x) => x.exam);
    const color = colorOf(G.subject);
    const row = (x, i) => `<div class="gi-row extra${x.exam ? ' is-exam' : ''}" style="--i:${i};--c:${color}" data-id="${x.id}"><span class="gi-ic ${x.exam ? 'exam' : 'plus'}">${x.exam ? EXAM_ICON : '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'}</span>
          <div class="gi-name"><input class="input gi-in-name" maxlength="50" placeholder="${x.exam ? 'Exam name' : 'Assessment name'}" value="${esc(x.name || '')}"></div>
          <span class="gi-w"><span class="suffix-in sm"><input type="number" class="input gi-in-w" min="0" max="100" step="0.5" placeholder="Weight" value="${x.weight ?? ''}"><b>%</b></span></span>
          <span class="gi-score"><span class="suffix-in sm"><input type="number" class="input gi-in-p" min="0" max="150" step="0.5" placeholder="Score" value="${x.pct ?? ''}"><b>%</b></span><span class="gi-tag">${x.pct != null ? gradeTag(x.pct) : ''}</span></span>
          <span class="gi-act"><button class="icon-btn sm gi-move" title="Move to Semester ${other}">${MOVE_ICON}</button><button class="icon-btn sm gi-del" title="Remove">${XICON}</button></span></div>`;
    // the summary circles: each semester's average and its exams, left out when there's nothing in them
    const all = (n) => semRows(G.subject, n);
    const stats = [
      { id: 'a1', sem: 1, kind: 'avg', rows: all(1) },
      { id: 'a2', sem: 2, kind: 'avg', rows: all(2) },
      { id: 'e1', sem: 1, kind: 'exam', rows: all(1).filter((x) => x.exam) },
      { id: 'e2', sem: 2, kind: 'exam', rows: all(2).filter((x) => x.exam) },
    ].filter((s) => s.rows.length);
    host.innerHTML = `${stats.length ? `<div class="sem-row n${stats.length}">${stats.map((s, i) => `<button class="card sem-card stagger${s.kind === 'exam' ? ' exam' : ''}${s.sem === sem ? ' on' : ''}" data-sem="${s.sem}" data-kind="${s.kind}" style="--i:${i + 2};--c:${color}" id="st-${s.id}"></button>`).join('')}</div>` : ''}
    <div class="grades-layout">
      <div class="card gr-items stagger" style="--i:6">
        <div class="card-head"><div class="seg" id="gr-sem"><div class="seg-pill"></div>${[1, 2].map((n) => `<button data-sem="${n}"${n === sem ? ' class="active"' : ''}>Semester ${n}${n === curSem() ? ' <i class="now">Now</i>' : ''}</button>`).join('')}</div></div>
        <div class="gi-head"><span></span><span>Assessment</span><span>Weight</span><span>Score</span><span></span></div>
        <div class="gi-list">${items.length ? items.map(row).join('') : `<div class="empty">No assessments in Semester ${sem} yet.</div>`}</div>
        ${exams.length ? `<div class="gi-sub">${exams.length === 1 ? 'Exam' : 'Exams'}</div><div class="gi-list exams">${exams.map((x, i) => row(x, i + items.length)).join('')}</div>` : ''}
        <div class="btn-row"><button class="btn" id="gi-add"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Add an assessment</button><button class="btn" id="gi-add-exam">${EXAM_ICON}Add an exam</button></div>
        <p class="muted tiny-note">Leave a score empty if you haven't done it yet. Weights are the % of the semester grade each one is worth. No exam this semester? Just don't add one, or remove it with ✕.</p>
      </div>
      <div class="gr-side"><div class="card gr-target stagger" style="--i:7" id="gr-target"></div></div>
    </div>`;
    if (!fresh) $$('.stagger', host).forEach((el) => el.classList.add('anim-done'));
    requestAnimationFrame(positionSegs);
    wireGradeRows();
    renderGradeResult();
  }
  function wireGradeRows() {
    const host = $('#gr-body');
    const num = (v) => (v.trim() === '' || !Number.isFinite(+v) ? null : Math.max(0, +v));
    const list = () => (D.gradeExtras[G.subject] = D.gradeExtras[G.subject] || []);
    const tidy = () => { if (!list().length) delete D.gradeExtras[G.subject]; };
    const pickSem = (n) => {
      if (n === G.sem) return;
      G.sem = n;
      renderGradeBody(false);
      $$('.gi-row', host).forEach((el) => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
    };
    $$('.sem-card', host).forEach((c) => c.addEventListener('click', () => pickSem(+c.dataset.sem)));
    $$('#gr-sem button', host).forEach((b) => b.addEventListener('click', () => pickSem(+b.dataset.sem)));
    const add = (exam) => {
      const n = list().filter((y) => y.exam && y.sem === G.sem).length;
      list().push(exam ? { id: uid(), name: n ? `Exam ${n + 1}` : `Semester ${G.sem} exam`, pct: null, weight: null, sem: G.sem, exam: true } : { id: uid(), name: '', pct: null, weight: null, sem: G.sem });
      save();
      renderGradeBody(false);
      const ins = $$(`.gi-row${exam ? '.is-exam' : ':not(.is-exam)'} ${exam ? '.gi-in-w' : '.gi-in-name'}`, host);
      if (ins.length) ins[ins.length - 1].focus();
    };
    $('#gi-add', host).addEventListener('click', () => add(false));
    $('#gi-add-exam', host).addEventListener('click', () => add(true));
    $$('.gi-row.extra', host).forEach((r) => {
      const x = list().find((y) => y.id === r.dataset.id);
      if (!x) return;
      $('.gi-in-name', r).addEventListener('input', (ev) => { x.name = ev.target.value; save(); });
      $('.gi-in-w', r).addEventListener('input', (ev) => { x.weight = num(ev.target.value); if (x.weight > 100) x.weight = 100; save(); renderGradeResult(); });
      $('.gi-in-p', r).addEventListener('input', (ev) => { x.pct = num(ev.target.value); save(); $('.gi-tag', r).innerHTML = x.pct != null ? gradeTag(x.pct) : ''; renderGradeResult(); });
      $('.gi-in-p', r).addEventListener('change', () => checkAchievements());
      const out = (msg) => {
        save();
        r.style.height = r.offsetHeight + 'px'; r.classList.add('removing');
        setTimeout(() => renderGradeBody(false), 380);
        if (msg) toast(msg);
      };
      $('.gi-move', r).addEventListener('click', () => { x.sem = G.sem === 1 ? 2 : 1; out(`Moved to Semester ${x.sem}`); });
      $('.gi-del', r).addEventListener('click', () => { D.gradeExtras[G.subject] = list().filter((y) => y.id !== x.id); tidy(); out(); });
    });
  }
  // the summary circles (semester averages and exams) and the "what do I need" card for the open semester
  function renderGradeResult() {
    $$('#gr-body .sem-card').forEach((el) => {
      const n = +el.dataset.sem, isExam = el.dataset.kind === 'exam';
      const rows = semRows(G.subject, n).filter((x) => !isExam || x.exam);
      const m = gradeMath(rows);
      const g = letterOf(m.avg);
      const R = 30, C = 2 * Math.PI * R;
      const prevP = +(el.dataset.p || 0), p = m.avg != null ? Math.min(100, m.avg) : 0;
      const label = isExam ? `Semester ${n} ${rows.length > 1 ? 'exams' : 'exam'}` : `Semester ${n} average`;
      const sub = m.avg == null ? (isExam ? 'No score yet' : 'No scores yet')
        : isExam ? (rows.length > 1 ? `${m.graded.length} of ${rows.length} done${m.mode === 'weighted' ? ', weighted' : ''}` : m.gw.length ? `worth ${fmtPct(m.doneW)}` : 'Done')
        : m.mode === 'weighted' ? `from ${fmtPct(m.doneW)} of the weight` : 'plain average (no weights yet)';
      el.innerHTML = `<div class="sem-ring"><svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="${R}" class="trk"/><circle cx="38" cy="38" r="${R}" class="val" style="stroke:${gradeColor(g)};stroke-dasharray:${C};stroke-dashoffset:${C * (1 - prevP / 100)}"/></svg><span class="sem-letter" style="color:${gradeColor(g)}">${g ? esc(g.l) : '–'}</span></div>
        <div class="sem-info"><span class="sem-k">${label}</span><b>${m.avg != null ? fmtPct(m.avg) : '–'}</b><span class="muted">${sub}</span>${!isExam && m.allW > 100.01 ? `<span class="gr-warn">Weights add up to ${fmtPct(m.allW)}</span>` : ''}</div>`;
      el.dataset.p = p;
      const v = $('.val', el);
      requestAnimationFrame(() => requestAnimationFrame(() => { v.style.strokeDashoffset = C * (1 - p / 100); }));
    });
    renderGradeTarget(gradeMath(semRows(G.subject, G.sem)));
  }
  function renderGradeTarget(m) {
    const box = $('#gr-target');
    const saved = semTarget(G.subject, G.sem);
    const target = saved != null ? saved : 80;
    box.innerHTML = `<div class="card-head"><h3>What do I need?</h3><span class="muted">Semester ${G.sem}</span></div>
      <div class="tg-input-row"><span class="tg-custom big"><input type="number" class="input" id="tg-custom" min="1" max="100" step="0.5" value="${target}"><b>%</b></span><span class="tg-letter" id="tg-letter"></span></div>
      <div id="tg-verdict"></div>`;
    const inp = $('#tg-custom', box);
    const show = (v, animate) => {
      const g = letterOf(v);
      const tag = $('#tg-letter', box);
      const html = v > 0 && v <= 100 && g ? `<span class="gtag big" style="--gc:${gradeColor(g)}">${esc(g.l)}</span>` : '';
      if (tag.dataset.l !== (g && v > 0 && v <= 100 ? g.l : '')) {
        tag.innerHTML = html;
        tag.dataset.l = g && v > 0 && v <= 100 ? g.l : '';
        if (animate && html) { const t = $('.gtag', tag); t.classList.add('pop-in'); }
      }
      inp.style.setProperty('--gc', g && v > 0 && v <= 100 ? gradeColor(g) : 'var(--border)');
      $('#tg-verdict', box).innerHTML = v > 0 && v <= 100 ? targetVerdict(m, v) : '<p class="muted">Type a percentage between 1 and 100.</p>';
    };
    show(target, false);
    inp.addEventListener('input', () => {
      const v = +inp.value;
      show(v, true);
      if (v > 0 && v <= 100) { setSemTarget(G.subject, G.sem, v); save(); }
    });
  }
  function targetVerdict(m, target) {
    if (m.mode !== 'weighted') return '<p class="muted">Add weights to your assessments to see what you need on the rest.</p>';
    if (m.remainW <= 0.001) return `<div class="tg-verdict done"><span>Everything is graded. Your final result is <b>${fmtPct(m.earned)}</b> ${gradeTag(m.earned)}</span></div>`;
    const need = ((target - m.earned) * m.total) / m.remainW;
    const ng = letterOf(need);
    if (need <= 0) return `<div class="tg-verdict ok">You've already locked in ${fmtPct(target)}. Even 0% on the rest keeps you there 🎉</div>`;
    if (need > 100) return `<div class="tg-verdict no"><span>Out of reach this time: even 100% on everything left gives you <b>${fmtPct(m.earned + m.remainW / m.total * 100)}</b> ${gradeTag(m.earned + m.remainW / m.total * 100)}</span></div>`;
    return `<div class="tg-verdict"><span class="tg-need" style="--gc:${gradeColor(ng)}"><b>${fmtPct(need)}</b>${gradeTag(need)}</span>
      <span>average needed on the remaining <b>${fmtPct(m.remainW)}</b> of the weight${m.upcomingW > 0 && Math.abs(m.upcomingW - m.remainW) > 0.01 ? ` (${fmtPct(m.upcomingW)} of it is listed)` : ''}</span>
      <div class="tg-bar"><i style="--p:${Math.min(100, need).toFixed(1)}%;--gc:${gradeColor(ng)}"></i></div></div>`;
  }

  // settings card: grading scale and its cut-offs
  function renderGradingSettings() {
    const sel = $('#set-scale');
    sel.innerHTML = Object.entries(SCALES).map(([k, s]) => `<option value="${k}"${k === D.grading.scale ? ' selected' : ''}>${s.name}</option>`).join('');
    const grades = scaleGrades();
    $('#set-cuts').innerHTML = grades.map((g, i) => `<label class="cut" style="--gc:${gradeColor(g)};--i:${i}"><span class="gtag" style="--gc:${gradeColor(g)}">${esc(g.l)}</span>${i === grades.length - 1 ? '<span class="muted">below</span>' : `<span class="suffix-in sm"><input type="number" class="input" data-l="${esc(g.l)}" min="1" max="100" step="0.5" value="${g.min}"><b>%</b></span>`}</label>`).join('');
    $$('#set-cuts input').forEach((inp) => inp.addEventListener('change', () => {
      const v = +inp.value;
      const gs = scaleGrades(), i = gs.findIndex((g) => g.l === inp.dataset.l);
      const above = i > 0 ? gs[i - 1].min : 101, below = i < gs.length - 2 ? gs[i + 1].min : 0;
      if (!(v > 0 && v <= 100) || v >= above || v <= below) {
        toast(`${esc(inp.dataset.l)} has to be between ${below}% and ${Math.min(100, above)}%`);
        renderGradingSettings();
        return;
      }
      D.grading.cuts = D.grading.cuts || {};
      const cur = D.grading.cuts[D.grading.scale] = D.grading.cuts[D.grading.scale] || {};
      cur[inp.dataset.l] = v;
      save();
      renderGradingSettings();
    }));
  }

  // ---------------- tutorial ----------------
  const TOUR = [
    { sel: null, title: 'Welcome to Study Tracker', text: 'Here\'s a quick tour of how it works. It takes about 30 seconds.' },
    { sel: '#subject-chips', title: 'Pick a subject', text: 'Choose what you\'re about to study. You need a subject before you can start.' },
    { sel: '#tree-chips', title: 'Pick a tree', text: 'Choose which tree to grow. Your last session\'s tree is picked for you. Rare trees earn bonus coins.' },
    { sel: '.controls', title: 'Start the stopwatch', text: 'Start and pause as you need. Stop saves the session. Cancel throws it away. The space bar also starts and pauses.' },
    { sel: '.tree-card', title: 'Your forest and your tree', text: 'Before you start, this shows your forest for the week. Each session grows one tree for every half hour, planted side by side. Hover over one to light up its session, and use the arrows to see earlier weeks. Once you start, your new tree grows here. At 10 minutes it takes root and earns 10 coins, then 1 coin for every extra minute, plus a 5 coin bonus at each full hour. Cancel before 10 minutes and it dies.' },
    { sel: '#nav-more', title: 'More tabs', text: 'At first only the Timer tab shows, to keep things simple. Press this arrow to open all the other tabs, and press it again to tuck them away.' },
    { sel: '.nav-item[data-page="stats"]', title: 'Stats', text: 'Pie and bar charts for any day, week, month or year.' },
    { sel: '.nav-item[data-page="grades"]', title: 'Grades', text: 'Pick a subject to see your Semester 1 and Semester 2 averages and exams, and what you need on the rest to get the grade you want.' },
    { sel: '.nav-item[data-page="garden"]', title: 'Garden', text: 'Every tree that took root is planted here. You can also spend coins on decorations in the Garden shop.' },
    { sel: '.nav-item[data-page="trees"]', title: 'Trees', text: 'Spend coins on cases to unlock new trees. Pricier cases have rarer trees. Duplicates give some coins back.' },
    { sel: '.nav-item[data-page="friends"]', title: 'Friends', text: 'Add friends with their 4-letter code (yours is at the top of this tab). Open a friend to see their stats, sessions, trees and badges, or send them a gift. Start a streak by both studying 15 minutes a day, and team up on weekly tasks, where each of you has to do your share. Both earn coins and free cases. Your grades stay private unless you choose to share them.' },
    { sel: '.nav-item[data-page="badges"]', title: 'Badges', text: 'Earn badges as you study, including friend streak and team task badges. Each one has a reward to claim: coins, or free cases for the big ones.' },
    { sel: '.nav-item[data-page="history"]', title: 'History', text: 'Every past session with its tree. You can delete sessions here, including withered and cancelled ones.' },
    { sel: '.nav-item[data-page="settings"]', title: 'Settings', text: 'Change subjects, mark finished ones, switch themes, and back up your data.' },
    { sel: '#coin-pill', title: 'Your coins', text: 'Your coin total is always up here. That\'s everything. Happy studying!' },
  ];
  let tourStep = 0;
  function startTour() {
    if (T.state === 'idle' && currentPage !== 'timer') go('timer');
    tourStep = 0;
    $('#tour').classList.remove('hidden', 'closing');
    setTimeout(showTourStep, 60);
  }
  function endTour() {
    D.profile.tutorialSeen = true; save();
    if (navOpen && currentPage === 'timer') toggleNav(false);
    $('#tour').classList.add('closing');
    setTimeout(() => $('#tour').classList.add('hidden'), 350);
    $('#page-timer').scrollTo({ top: 0, behavior: 'smooth' });
  }
  function showTourStep() {
    const st = TOUR[tourStep];
    const spot = $('#tour-spot'), card = $('#tour-card');
    const el = st.sel ? $(st.sel) : null;
    const place = () => {
      let r;
      if (el && el.offsetParent !== null) {
        const b = el.getBoundingClientRect();
        r = { x: b.left - 8, y: b.top - 8, w: b.width + 16, h: b.height + 16 };
        spot.classList.remove('none');
      } else {
        r = { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 };
        spot.classList.add('none');
      }
      Object.assign(spot.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      $('#tour-step').textContent = `${tourStep + 1} of ${TOUR.length}`;
      $('#tour-title').textContent = st.title;
      $('#tour-text').textContent = st.text;
      $('#tour-back').style.visibility = tourStep ? 'visible' : 'hidden';
      $('#tour-next').textContent = tourStep === TOUR.length - 1 ? 'Finish' : 'Next';
      card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let x, y;
      if (!r.w) { x = innerWidth / 2 - cw / 2; y = innerHeight / 2 - ch / 2; }
      else if (r.x + r.w + cw + 24 < innerWidth) { x = r.x + r.w + 16; y = r.y + r.h / 2 - ch / 2; }
      else if (r.y + r.h + ch + 20 < innerHeight) { x = r.x + r.w / 2 - cw / 2; y = r.y + r.h + 14; }
      else { x = r.x + r.w / 2 - cw / 2; y = r.y - ch - 14; }
      x = Math.max(16, Math.min(innerWidth - cw - 16, x));
      y = Math.max(50, Math.min(innerHeight - ch - 16, y));
      card.style.left = x + 'px'; card.style.top = y + 'px';
    };
    // the tabs are tucked away until the arrow is pressed, so open them for the tour
    if (st.sel && st.sel.startsWith('.nav-item') && !navOpen) {
      toggleNav(true);
      $('#tour-spot').classList.add('none');
      setTimeout(place, 650);
      return;
    }
    if (st.sel === '#nav-more' && navOpen && currentPage === 'timer') { toggleNav(false); setTimeout(place, 650); return; }
    if (el && el.closest('.page')) {
      const b = el.getBoundingClientRect();
      if (b.top < 50 || b.bottom > innerHeight - 10) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(place, 420); return; }
    }
    place();
  }

  // ---------------- history ----------------
  let histLimit = 30;
  function renderHistory() {
    const sel = $('#hist-filter');
    const cur = sel.value;
    const names = [...new Set(D.subjects.map((s) => s.name).concat(D.sessions.map((s) => s.subject)))];
    sel.innerHTML = '<option value="">All subjects</option>' + `<option value="__dead"${cur === '__dead' ? ' selected' : ''}>Withered &amp; cancelled only</option>` + names.map((n) => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('');
    $('#m-subject').innerHTML = activeSubjects().map((s) => `<option>${esc(s.name)}</option>`).join('');
    const mt = $('#m-tree'), curTree = mt.value || D.selectedTree;
    mt.innerHTML = window.Tree.SPECIES.filter((x) => owns(x.id)).sort(treeOrder)
      .map((sp) => `<option value="${sp.id}"${sp.id === curTree ? ' selected' : ''}>${isFav(sp.id) ? '★ ' : ''}${esc(sp.name)} (${window.Tree.RARITIES[sp.rarity].name})</option>`).join('');
    const f = sel.value;
    const list = D.sessions.filter((s) => !f || (f === '__dead' ? (s.cancelled || isWithered(s)) : s.subject === f)).sort((a, b) => new Date(b.date) - new Date(a.date));
    const groups = new Map();
    list.forEach((s) => { const k = dayKey(new Date(s.date)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    const keys = [...groups.keys()];
    const host = $('#history-list');
    if (!keys.length) { host.innerHTML = '<div class="empty">No sessions yet.</div>'; $('#hist-more').classList.add('hidden'); return; }
    const today = dayKey(new Date()), yest = dayKey(addDays(new Date(), -1));
    host.innerHTML = keys.slice(0, histLimit).map((k, gi) => {
      const ss = groups.get(k);
      const d = new Date(ss[0].date);
      const name = k === today ? 'Today' : k === yest ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return `<div class="day-group" style="--i:${Math.min(gi, 12)}"><div class="day-head"><span>${name}</span><span class="muted">${fmtDur(ss.filter(counted).reduce((a, s) => a + s.duration, 0))}</span></div><div class="sess-list">${ss.map((s, i) => sessRow(s, i)).join('')}</div></div>`;
    }).join('');
    paintTrees(host);
    bindDeletes(host, renderHistory);
    $('#hist-more').classList.toggle('hidden', keys.length <= histLimit);
  }
  function saveManual() {
    const msg = $('#m-msg');
    const sub = $('#m-subject').value, date = $('#m-date').value, st = $('#m-start').value, en = $('#m-end').value;
    if (!sub || !date || !st || !en) { msg.textContent = 'Fill in every field.'; msg.style.color = '#f87171'; return; }
    const start = new Date(`${date}T${st}`), end = new Date(`${date}T${en}`);
    let dur = (end - start) / 1000;
    if (dur <= 0) dur += 86400; // past midnight
    if (dur <= 0 || dur > 86400) { msg.textContent = 'That time range doesn\'t look right.'; msg.style.color = '#f87171'; return; }
    const tree = owns($('#m-tree').value) ? $('#m-tree').value : (owns(D.selectedTree) ? D.selectedTree : 'oak');
    const grown = dur >= ROOT_SEC;
    // added sessions plant their tree too, but earn no coins
    const rec = { id: uid(), subject: sub, duration: Math.round(dur), date: start.toISOString(), manual: true, tree, outcome: grown ? 'grown' : 'withered', coins: 0 };
    D.sessions.push(rec);
    if (grown) D.trees.push({ id: uid(), species: tree, subject: sub, date: rec.date, duration: rec.duration, sessionId: rec.id, manual: true });
    save();
    msg.style.color = '';
    checkAchievements();
    msg.textContent = `Added ${fmtDur(dur)} of ${sub} with a${/^[aeiou]/i.test(window.Tree.get(tree).name) ? 'n' : ''} ${window.Tree.get(tree).name}${grown ? '' : ' (under 10 minutes, so it withered)'}.`;
    renderHistory();
  }

  // ---------------- settings ----------------
  function renderSettings() {
    $('#set-name').value = D.profile.name || '';
    $('#set-automini').classList.toggle('on', !!D.profile.autoMini);
    $('#set-welcome').classList.toggle('on', D.profile.welcome !== false);
    renderThemeGrid($('#set-themes'));
    renderSubjectSettings();
    renderGradingSettings();
  }
  const ARCHIVE_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>';
  const RESTORE_ICON = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  function renderSubjectSettings() {
    const counts = {};
    D.sessions.forEach((s) => { counts[s.subject] = (counts[s.subject] || 0) + s.duration; });
    const row = (s, i) => `<div class="subj-row" style="--c:${s.color};--i:${i}" data-id="${s.id}">
      <button class="swatch" title="Change colour"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>
      <input class="input" value="${esc(s.name)}" maxlength="40">
      <span class="cnt">${fmtDur(counts[s.name] || 0)}</span>
      <span class="row-btns">${s.archived
        ? `<button class="icon-btn act-restore" title="Bring back to the timer">${RESTORE_ICON}</button>`
        : `<button class="icon-btn act-archive" title="Finished: hide from the timer, keep in stats">${ARCHIVE_ICON}</button>`}
      <button class="icon-btn act-remove" title="Remove">${XICON}</button></span></div>`;
    const act = activeSubjects(), arch = D.subjects.filter((s) => s.archived);
    $('#set-subjects').innerHTML = act.length ? act.map(row).join('') : '<div class="empty">No subjects yet.</div>';
    $('#set-archived').innerHTML = arch.map(row).join('');
    $('#archived-wrap').classList.toggle('hidden', !arch.length);
    $$('#set-subjects .subj-row, #set-archived .subj-row').forEach((row) => {
      const host = row.parentElement;
      const s = D.subjects.find((x) => x.id === row.dataset.id);
      $('.swatch', row).addEventListener('click', () => {
        const open = $('.palette-pop', row);
        $$('.palette-pop', host).forEach((p) => p.remove());
        if (open) return;
        const pop = document.createElement('div');
        pop.className = 'palette-pop';
        pop.innerHTML = PALETTE.map((c, i) => `<button style="--c:${c};--i:${i}" data-c="${c}"${c === s.color ? ' class="on"' : ''}></button>`).join('')
          + `<label class="pal-custom" title="Pick any colour" style="--i:${PALETTE.length}"><input type="color" value="${s.color}"><span>Any colour</span></label>`;
        row.appendChild(pop);
        const setColor = (c, close) => {
          s.color = c; save();
          row.style.setProperty('--c', s.color);
          $$('button', pop).forEach((x) => x.classList.toggle('on', x.dataset.c === c));
          const sw = $('.swatch', row); sw.classList.remove('bump'); void sw.offsetWidth; sw.classList.add('bump');
          if (close) pop.remove();
          renderSubjectChips();
        };
        $$('button', pop).forEach((b) => b.addEventListener('click', () => setColor(b.dataset.c, true)));
        const ci = $('input[type=color]', pop);
        ci.addEventListener('input', () => setColor(ci.value, false));
        ci.addEventListener('change', () => { setColor(ci.value, true); toast(`${esc(s.name)} has a new colour`); });
      });
      const inp = $('.input', row);
      inp.addEventListener('change', () => {
        const v = inp.value.trim();
        if (!v || (v !== s.name && subj(v))) { inp.value = s.name; inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 500); return; }
        const old = s.name;
        s.name = v;
        D.sessions.forEach((x) => { if (x.subject === old) x.subject = v; });
        D.trees.forEach((x) => { if (x.subject === old) x.subject = v; });
        if (D.gradeExtras[old]) { D.gradeExtras[v] = D.gradeExtras[old]; delete D.gradeExtras[old]; }
        if (D.gradeTargets[old] != null) { D.gradeTargets[v] = D.gradeTargets[old]; delete D.gradeTargets[old]; }
        if (G.subject === old) G.subject = v;
        if (D.active && D.active.subject === old) D.active.subject = v;
        if (T.subject === old) T.subject = v;
        save();
        toast(`Renamed to ${esc(v)}`);
        renderSubjectChips();
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      const slideOut = () => { row.style.height = row.offsetHeight + 'px'; row.classList.add('sess-row', 'removing'); setTimeout(renderSubjectSettings, 450); };
      const arc = $('.act-archive', row);
      if (arc) arc.addEventListener('click', () => {
        if (D.active && D.active.subject === s.name) { toast('Finish the current session first'); return; }
        s.archived = true; save(); slideOut(); renderSubjectChips();
        toast(`${esc(s.name)} moved to finished subjects. Its stats are kept`);
      });
      const res = $('.act-restore', row);
      if (res) res.addEventListener('click', () => {
        s.archived = false; save(); slideOut(); renderSubjectChips();
        toast(`${esc(s.name)} is back on the timer`);
      });
      $('.act-remove', row).addEventListener('click', async () => {
        if (D.active && D.active.subject === s.name) { toast('Finish the current session first'); return; }
        const has = D.sessions.some((x) => x.subject === s.name);
        const ok = await modal({ title: `Remove ${esc(s.name)}?`, body: has ? 'Your past sessions stay in your history and stats, but the subject loses its colour. To just hide it from the timer, use the "finished" button instead.' : '', actions: [{ label: 'Keep', ghost: true, value: false }, { label: 'Remove', danger: true, value: true }] });
        if (!ok) return;
        D.subjects = D.subjects.filter((x) => x.id !== s.id);
        save(); slideOut(); renderSubjectChips();
      });
    });
  }
  function addSubjectFromInput(inp) {
    const v = inp.value.trim();
    if (!v) return false;
    const ex = subj(v);
    if (ex && ex.archived) { ex.archived = false; inp.value = ''; save(); toast(`${esc(v)} is back on the timer`); return true; }
    if (ex) { inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 500); return false; }
    D.subjects.push({ id: uid(), name: v, color: nextColor(), archived: false });
    inp.value = '';
    save();
    return true;
  }

  // ---------------- import / export ----------------
  function toCSV() {
    const rows = [['Subject', 'Date', 'Time', 'Duration (min)', 'Duration (h:m:s)']];
    D.sessions.filter(counted).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((s) => {
      const d = new Date(s.date);
      rows.push([s.subject, dayKey(d), `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`, +(s.duration / 60).toFixed(2), fmtHMS(s.duration)]);
    });
    return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }
  function parseCSVLine(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const rows = lines.slice(1).map(parseCSVLine).filter((c) => c.length >= 4);
    // old exports used the computer's local date format; work out day/month order
    let dmy = true;
    for (const r of rows) {
      const m = r[1].match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
      if (m) { if (+m[1] > 12) { dmy = true; break; } if (+m[2] > 12) { dmy = false; break; } }
    }
    const out = [];
    for (const r of rows) {
      const [subject, ds, ts, mins] = r;
      const dur = Math.round(parseFloat(mins) * 60);
      if (!subject || !(dur >= 0)) continue;
      let y, mo, d;
      let m = ds.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else if ((m = ds.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) {
        y = +m[3]; if (y < 100) y += 2000;
        if (dmy) { d = +m[1]; mo = +m[2]; } else { mo = +m[1]; d = +m[2]; }
      } else { const p = new Date(ds); if (isNaN(p)) continue; y = p.getFullYear(); mo = p.getMonth() + 1; d = p.getDate(); }
      let hh = 0, mm = 0, ss = 0;
      const tm = (ts || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
      if (tm) {
        hh = +tm[1]; mm = +tm[2]; ss = +(tm[3] || 0);
        if (tm[4]) { const pm = /p/i.test(tm[4]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
      }
      const date = new Date(y, mo - 1, d, hh, mm, ss);
      if (isNaN(date)) continue;
      out.push({ subject: subject.trim(), duration: dur, date: date.toISOString() });
    }
    return out;
  }
  function parseOldHTML(text) {
    const grab = (key) => {
      const i = text.indexOf(`'${key}'`);
      if (i < 0) return null;
      const lineEnd = text.indexOf('\n', i);
      const line = text.slice(i, lineEnd < 0 ? undefined : lineEnd);
      let m = line.match(/JSON\.stringify\((\[[\s\S]*\])\)\s*\)\s*;?\s*$/);
      if (!m) m = line.match(/\|\|\s*'(\[[\s\S]*?\])'\s*\)/);
      if (!m) return null;
      try { return JSON.parse(m[1]); } catch (e) { return null; }
    };
    const subjects = grab('vce_subjects') || [];
    const sessions = grab('vce_sessions') || [];
    return { subjects, sessions: sessions.filter((s) => s && s.subject && s.date) };
  }
  // Returns { added, skipped, subjects } after merging into D
  function mergeImport(file) {
    const name = file.name.toLowerCase();
    let sessions = [], subjects = [], backup = null;
    if (name.endsWith('.json')) {
      const j = JSON.parse(file.content);
      if (Array.isArray(j)) sessions = j;
      else backup = normalise(j && typeof j === 'object' && (+j.version || 1) < SCHEMA ? migrate(j) : j);
    } else if (name.endsWith('.csv')) {
      sessions = parseCSV(file.content);
    } else {
      const o = parseOldHTML(file.content);
      sessions = o.sessions; subjects = o.subjects;
    }
    if (backup) {
      const keepActive = D.active;
      const hadSetup = D.profile.setupDone;
      // merge a backup: union of sessions/trees, keep the bigger coin total
      const key = (s) => `${s.subject}|${s.date}|${s.duration}`;
      const have = new Set(D.sessions.map(key));
      let added = 0;
      backup.sessions.forEach((s) => { if (!have.has(key(s))) { D.sessions.push(s); have.add(key(s)); added++; } });
      const th = new Set(D.trees.map((t) => t.id));
      backup.trees.forEach((t) => { if (!th.has(t.id)) D.trees.push(t); });
      backup.subjects.forEach((s) => { if (!subj(s.name)) D.subjects.push({ id: s.id || uid(), name: s.name, color: s.color || nextColor(), archived: !!s.archived }); });
      D.coins = Math.max(D.coins, backup.coins);
      for (const [id, n] of Object.entries(backup.collection.owned || {})) D.collection.owned[id] = Math.max(D.collection.owned[id] || 0, n || 0);
      D.collection.opened = Math.max(D.collection.opened || 0, backup.collection.opened || 0);
      for (const [id, at] of Object.entries(backup.achievements || {})) if (!D.achievements[id] || at < D.achievements[id]) D.achievements[id] = at;
      backup.favTrees.forEach((id) => { if (!D.favTrees.includes(id)) D.favTrees.push(id); });
      for (const [sname, list] of Object.entries(backup.gradeExtras || {})) {
        const mine = D.gradeExtras[sname] = D.gradeExtras[sname] || [];
        (Array.isArray(list) ? list : []).forEach((x) => { if (x && !mine.some((y) => y.id === x.id)) mine.push(x); });
      }
      for (const [id, at] of Object.entries(backup.badgeClaims || {})) if (!D.badgeClaims[id]) D.badgeClaims[id] = at;
      if (!hadSetup) { D.profile = Object.assign(D.profile, backup.profile, { setupDone: false }); }
      D.active = keepActive;
      return { added, skipped: backup.sessions.length - added, total: backup.sessions.length };
    }
    subjects.forEach((s) => ensureSubject(String(s)));
    const key = (s) => `${s.subject}|${new Date(s.date).toISOString()}|${s.duration}`;
    const have = new Set(D.sessions.map(key));
    let added = 0;
    sessions.forEach((s) => {
      if (!s.subject || isNaN(new Date(s.date)) || !(s.duration >= 0)) return;
      const rec = { id: uid(), subject: String(s.subject), duration: Math.round(+s.duration), date: new Date(s.date).toISOString() };
      if (have.has(key(rec))) return;
      have.add(key(rec));
      D.sessions.push(rec);
      ensureSubject(rec.subject);
      added++;
    });
    return { added, skipped: sessions.length - added, total: sessions.length };
  }
  async function doImport(msgEl) {
    const f = await window.api.importFile();
    if (!f) return null;
    try {
      const r = mergeImport(f);
      save(true);
      checkAchievements();
      const txt = r.total === 0 ? `No sessions found in ${f.name}.` : `Imported ${r.added} session${r.added === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} already here or unreadable)` : ''}.`;
      if (msgEl) msgEl.textContent = txt;
      toast(txt, 3500);
      return r;
    } catch (e) {
      const txt = `Couldn't read ${f.name}. Is it a file from this app, a CSV export, or the old tracker?`;
      if (msgEl) msgEl.textContent = txt;
      toast(txt, 4000);
      return null;
    }
  }

  // ---------------- onboarding ----------------
  let obStep = 0;
  const obPicked = new Set();
  function showOnboarding() {
    document.body.classList.add('onboarding');
    $('#onboarding').classList.remove('hidden', 'closing');
    $('#ob-name').value = D.profile.name || '';
    obPicked.clear();
    activeSubjects().forEach((s) => obPicked.add(s.name));
    $('#ob-tree').innerHTML = window.Tree.build('blossom', 'ob1');
    $('#ob-tree').classList.add('alive');
    const t = $('#ob-tree .tree');
    window.Tree.setGrowth(t, 0, 0);
    // grow the welcome tree from seed to full in a few seconds
    let p = 0;
    const iv = setInterval(() => { p += 0.07; window.Tree.setGrowth(t, p, Math.max(0, p - 1) * 2); if (p >= 1.5) clearInterval(iv); }, 160);
    obGoto(0, 1);
  }
  function renderObChips() {
    const names = [...new Set([...obPicked].concat(PRESET_SUBJECTS))];
    $('#ob-chips').innerHTML = names.map((n, i) => `<button class="chip${obPicked.has(n) ? ' selected' : ''}" style="--i:${i};--c:${(subj(n) || {}).color || PALETTE[i % PALETTE.length]}" data-s="${esc(n)}"><span class="check">${CHECK}</span>${esc(n)}</button>`).join('');
    $$('#ob-chips .chip').forEach((c) => c.addEventListener('click', () => {
      const n = c.dataset.s;
      if (obPicked.has(n)) obPicked.delete(n); else obPicked.add(n);
      c.classList.toggle('selected', obPicked.has(n));
      c.animate([{ transform: 'scale(.9)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      updateObNext();
    }));
    updateObNext();
  }
  function updateObNext() {
    const b = $('#ob-subj-next');
    b.textContent = obPicked.size ? `Continue with ${obPicked.size} subject${obPicked.size > 1 ? 's' : ''}` : 'Pick at least one';
    b.disabled = !obPicked.size;
  }
  function obGoto(n, dir) {
    obStep = n;
    $$('.ob-step').forEach((s) => {
      const on = +s.dataset.step === n;
      s.classList.toggle('active', on);
      s.classList.remove('in-next', 'in-prev');
      if (on) { void s.offsetWidth; s.classList.add(dir >= 0 ? 'in-next' : 'in-prev'); }
    });
    $$('.ob-dots span').forEach((d, i) => { d.classList.toggle('active', i === n); d.classList.toggle('done', i < n); });
    if (n === 1) renderObChips();
    if (n === 2) renderThemeGrid($('#ob-themes'));
    if (n === 3) {
      const nm = $('#ob-name').value.trim();
      $('#ob-done-title').textContent = nm ? `You're all set, ${nm}` : 'You\'re all set';
      $('#ob-tree-final').innerHTML = window.Tree.build('oak', 'ob2');
      $('#ob-tree-final').classList.add('alive');
      const t = $('#ob-tree-final .tree');
      window.Tree.setGrowth(t, 0, 0);
      setTimeout(() => window.Tree.setGrowth(t, 0.3, 0), 150);
      setTimeout(() => window.Tree.setGrowth(t, 0.7, 0), 700);
      setTimeout(() => window.Tree.setGrowth(t, 1, 0.3), 1300);
    }
  }
  function finishOnboarding() {
    D.profile.name = $('#ob-name').value.trim();
    // subjects: keep chosen ones (preserving colours), add new ones
    // unpicked subjects with history are kept as "finished" so their stats keep their colour
    const used = new Set(D.sessions.map((x) => x.subject));
    D.subjects = D.subjects.filter((s) => obPicked.has(s.name) || s.archived || used.has(s.name));
    D.subjects.forEach((s) => { s.archived = !obPicked.has(s.name); });
    [...obPicked].forEach((n) => ensureSubject(n));
    D.profile.setupDone = true;
    save(true);
    const b = $('#ob-finish').getBoundingClientRect();
    burst(b.left + b.width / 2, b.top, { n: 70, up: true, speed: 9 });
    $('#onboarding').classList.add('closing');
    setTimeout(() => {
      $('#onboarding').classList.add('hidden');
      document.body.classList.remove('onboarding');
      enterApp();
      if (!D.profile.tutorialSeen) setTimeout(startTour, 900);
      showGiftNotice();
    }, 650);
  }

  function enterApp() {
    renderCoins(true);
    updateNavDots();
    const pg = $(`#page-${currentPage}`);
    renderPage(currentPage);
    pg.classList.remove('enter'); void pg.offsetWidth; pg.classList.add('enter');
    layoutNav(false);
    requestAnimationFrame(moveIndicator);
  }

  // ---------------- wiring ----------------
  function wire() {
    $$('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.page)));
    $('#nav-more').addEventListener('click', () => toggleNav());
    $('#btn-start').addEventListener('click', start);
    $('#btn-stop').addEventListener('click', stop);
    $('#btn-cancel').addEventListener('click', () => cancel(false));
    $('#btn-mini').addEventListener('click', () => window.api.openMini());
    $('#week-prev').addEventListener('click', () => { W.offset++; renderWeek(-1); });
    $('#week-next').addEventListener('click', () => { if (W.offset) { W.offset--; renderWeek(1); } });
    $('#tour-next').addEventListener('click', () => { if (tourStep >= TOUR.length - 1) return endTour(); tourStep++; showTourStep(); });
    $('#tour-back').addEventListener('click', () => { if (tourStep) { tourStep--; showTourStep(); } });
    $('#tour-skip').addEventListener('click', endTour);
    $('#set-tutorial').addEventListener('click', () => { if (T.state !== 'idle') return toast('Finish the current session first'); go('timer'); setTimeout(startTour, 500); });
    addEventListener('resize', () => { if (!$('#tour').classList.contains('hidden')) showTourStep(); });
    document.addEventListener('keydown', (e) => {
      if (!$('#tour').classList.contains('hidden')) {
        if (e.key === 'Escape') endTour();
        if (e.key === 'ArrowRight' || e.key === 'Enter') $('#tour-next').click();
        if (e.key === 'ArrowLeft' && tourStep) $('#tour-back').click();
        e.preventDefault();
        return;
      }
      if (e.target.matches('input, select, textarea') || $('.modal-back') || !$('#onboarding').classList.contains('hidden') || !$('#case-overlay').classList.contains('hidden')) return;
      if (e.code === 'Space' && currentPage === 'timer') { e.preventDefault(); start(); }
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') go(['timer', 'stats', 'grades', 'garden', 'trees', 'friends', 'badges', 'history', 'settings'][+e.key - 1]);
    });

    // stats
    $$('#period-seg button').forEach((b) => b.addEventListener('click', () => {
      if (S.period === b.dataset.p) return;
      S.period = b.dataset.p;
      S.anchor = anchorFor(S.period, new Date());
      renderStats(true);
    }));
    $$('#year-split button').forEach((b) => b.addEventListener('click', () => { S.yearSplit = b.dataset.s; renderStats(true); }));
    $('#prev-period').addEventListener('click', () => { S.anchor = shiftAnchor(-1); renderStats(false, -1); });
    $('#next-period').addEventListener('click', () => { S.anchor = shiftAnchor(1); renderStats(false, 1); });
    $('#today-period').addEventListener('click', () => { S.anchor = anchorFor(S.period, new Date()); renderStats(false, 1); });

    // history
    $('#hist-filter').addEventListener('change', () => { histLimit = 30; renderHistory(); });
    $('#hist-more').addEventListener('click', () => { histLimit += 30; renderHistory(); });
    $('#btn-add-manual').addEventListener('click', () => {
      const c = $('#manual-card');
      c.classList.toggle('collapsed');
      if (!c.classList.contains('collapsed')) {
        const now = new Date();
        $('#m-date').value = dayKey(now);
        const st = new Date(now - 3600e3);
        $('#m-start').value = `${pad(st.getHours())}:${pad(st.getMinutes())}`;
        $('#m-end').value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        $('#m-msg').textContent = '';
      }
    });
    $('#m-close').addEventListener('click', () => $('#manual-card').classList.add('collapsed'));
    $('#m-save').addEventListener('click', saveManual);

    $('#bd-claim-all').addEventListener('click', claimAll);
    $('#set-scale').addEventListener('change', () => { D.grading.scale = $('#set-scale').value; save(); renderGradingSettings(); toast(`Grades now use ${SCALES[D.grading.scale].name}`); });
    $('#set-cuts-reset').addEventListener('click', () => { if (D.grading.cuts) delete D.grading.cuts[D.grading.scale]; save(); renderGradingSettings(); });

    // settings
    $('#set-name').addEventListener('change', () => {
      D.profile.name = $('#set-name').value.trim(); save();
      if (window.Friends && window.Friends.cleanName(D.profile.name).censored) toast('Friends will see "Student" instead, because that name has a word that isn\'t allowed', 4200);
    });
    $('#set-automini').addEventListener('click', () => { D.profile.autoMini = !D.profile.autoMini; $('#set-automini').classList.toggle('on', D.profile.autoMini); save(); });
    $('#set-welcome').addEventListener('click', () => { D.profile.welcome = D.profile.welcome === false; $('#set-welcome').classList.toggle('on', D.profile.welcome); save(); });
    const addS = () => { if (addSubjectFromInput($('#set-new-subject'))) { renderSubjectSettings(); renderSubjectChips(); } };
    $('#set-add-subject').addEventListener('click', addS);
    $('#set-new-subject').addEventListener('keydown', (e) => { if (e.key === 'Enter') addS(); });
    $('#set-export').addEventListener('click', async () => {
      const p = await window.api.exportFile({ content: JSON.stringify(D, null, 1), defaultName: `study-tracker-backup-${dayKey(new Date())}.json`, filters: [{ name: 'Backup', extensions: ['json'] }] });
      if (p) toast('Backup saved');
    });
    $('#set-export-csv').addEventListener('click', async () => {
      if (!D.sessions.length) return toast('No sessions to export yet');
      const p = await window.api.exportFile({ content: toCSV(), defaultName: `study-sessions-${dayKey(new Date())}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (p) toast('Sessions exported');
    });
    $('#set-import').addEventListener('click', async () => { if (await doImport()) renderSettings(); });
    $('#set-rerun').addEventListener('click', () => { if (T.state !== 'idle') return toast('Finish the current session first'); showOnboarding(); });
    $('#set-clear').addEventListener('click', async () => {
      if (T.state !== 'idle') return toast('Finish the current session first');
      const ok = await modal({ title: 'Delete everything?', body: 'This removes all sessions, trees, coins and settings from this PC. Export a backup first if you might want it back.', actions: [{ label: 'Keep my data', ghost: true, value: false }, { label: 'Delete all', danger: true, value: true }] });
      if (!ok) return;
      const sure = await modal({ title: 'Are you sure?', body: 'This can\'t be undone.', actions: [{ label: 'No', ghost: true, value: false }, { label: 'Yes, delete it all', danger: true, value: true }] });
      if (!sure) return;
      D = blank();
      save(true);
      T.subject = null;
      renderCoins(true);
      applyTheme('forest');
      showOnboarding();
    });

    // onboarding
    $$('#onboarding [data-next]').forEach((b) => b.addEventListener('click', () => obGoto(obStep + 1, 1)));
    $$('#onboarding [data-back]').forEach((b) => b.addEventListener('click', () => obGoto(obStep - 1, -1)));
    $('#ob-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') obGoto(1, 1); });
    const obAdd = () => {
      const inp = $('#ob-custom');
      const v = inp.value.trim();
      if (!v) return;
      obPicked.add(v);
      inp.value = '';
      renderObChips();
    };
    $('#ob-add').addEventListener('click', obAdd);
    $('#ob-custom').addEventListener('keydown', (e) => { if (e.key === 'Enter') obAdd(); });
    $('#ob-import').addEventListener('click', async () => {
      const r = await doImport($('#ob-import-msg'));
      if (r) {
        activeSubjects().forEach((s) => obPicked.add(s.name));
        if (D.profile.name) $('#ob-name').value = D.profile.name;
        applyTheme(D.profile.theme);
      }
    });
    $('#ob-finish').addEventListener('click', finishOnboarding);
  }

  // ---------------- automatic updates ----------------
  let updState = { status: 'idle' };
  let updPillDismissed = false;
  function renderUpdate(st) {
    updState = st || updState;
    const s = updState;
    const dot = $('#upd-dot'), title = $('#upd-title'), sub = $('#upd-sub'), bar = $('#upd-bar');
    const check = $('#upd-check'), go = $('#upd-restart');
    if (!dot) return;
    const busy = ['checking', 'downloading', 'unpacking'].includes(s.status);
    dot.className = 'upd-dot ' + ({ current: 'ok', ready: 'ready', error: 'err', failed: 'err' }[s.status] || (busy ? 'busy' : ''));
    const texts = {
      idle: ['Updates install by themselves', 'New versions download in the background and install when you close the app. Your saves are never touched.'],
      checking: ['Checking for updates…', 'Looking for a newer version.'],
      current: ["You're up to date", `Version ${APP_VERSION} is the newest. New versions install by themselves when you close the app.`],
      downloading: [`Downloading version ${esc(s.version)}…`, 'Keep studying, this happens in the background.'],
      unpacking: [`Getting version ${esc(s.version)} ready…`, 'Almost done.'],
      ready: [`Version ${esc(s.version)} is ready`, 'It installs when you close the app, or press Restart to update now. Your saves are never touched.'],
      error: ["Couldn't check for updates", `${esc(s.error || 'No internet?')} It'll try again later.`],
      unsupported: ['Automatic updates are off here', 'They only work in the installed Study Tracker folder on Windows.'],
      failed: ["This update couldn't install by itself", `Download version ${esc(s.version)} from <a href="${esc(s.url || 'https://github.com/smoosh81/study-tracker/releases/latest')}" target="_blank">the releases page</a> and replace your Study Tracker folder. Your saves are kept.`],
    }[s.status] || ['Updates', ''];
    title.innerHTML = texts[0];
    sub.innerHTML = texts[1];
    check.classList.toggle('hidden', ['ready', 'unsupported', 'failed'].includes(s.status));
    check.disabled = busy;
    go.classList.toggle('hidden', s.status !== 'ready');
    bar.classList.toggle('hidden', !busy);
    bar.classList.toggle('indet', s.status !== 'downloading' || !s.progress);
    $('span', bar).style.width = `${Math.round((s.progress || 0) * 100)}%`;
    const pill = $('#upd-pill');
    if (s.status === 'ready' && !updPillDismissed) {
      $('.upd-pill-text', pill).textContent = `Version ${s.version} is ready`;
      if (pill.classList.contains('hidden')) { pill.classList.remove('hidden', 'out'); }
    } else if (!pill.classList.contains('hidden')) hidePill();
  }
  function hidePill() {
    const pill = $('#upd-pill');
    pill.classList.add('out');
    setTimeout(() => { pill.classList.add('hidden'); pill.classList.remove('out'); }, 360);
  }
  async function restartToUpdate() {
    if (T.state === 'running') {
      const ok = await modal({ title: 'Restart now?', body: 'Your timer will pause while the app updates. Press Resume afterwards to keep going.', actions: [{ label: 'Not now', ghost: true, value: false }, { label: 'Restart', primary: true, value: true }] });
      if (!ok) return;
    }
    try { save(true); } catch (e) {}
    const done = await window.api.restartToUpdate();
    if (!done) toast("Couldn't start the update. It'll try again when you close the app", 4000);
  }
  function setupUpdates() {
    if (!window.api.updateState) return;
    window.api.on('update:state', (st) => renderUpdate(st));
    window.api.updateState().then((st) => renderUpdate(st));
    $('#upd-check').addEventListener('click', async () => {
      const st = await window.api.checkForUpdate();
      renderUpdate(st);
      if (st.status === 'current') toast("You're on the newest version");
    });
    $('#upd-restart').addEventListener('click', restartToUpdate);
    $('#upd-pill-go').addEventListener('click', restartToUpdate);
    $('#upd-pill-x').addEventListener('click', () => { updPillDismissed = true; hidePill(); });
  }

  // ---------------- friends (see friends.js) ----------------
  // grade averages, only sent to friends when "Share my grades" is on
  function gradeSummary() {
    const cell = (rows) => {
      const m = gradeMath(rows);
      if (m.avg == null) return null;
      const g = letterOf(m.avg);
      return { p: Math.round(m.avg * 10) / 10, l: g ? g.l : '', c: gradeColor(g) };
    };
    return Object.keys(D.gradeExtras).filter((n) => (D.gradeExtras[n] || []).some((x) => x.pct != null)).map((n) => ({
      n, c: colorOf(n),
      s1: cell(semRows(n, 1)), s2: cell(semRows(n, 2)),
      e1: cell(semRows(n, 1).filter((x) => x.exam)), e2: cell(semRows(n, 2).filter((x) => x.exam)),
    }));
  }
  function friendsCtx() {
    return {
      D: () => D, readOnly: () => readOnly, currentPage: () => currentPage,
      save, toast, modal, burst, esc, fmtDur, fmtTime, dayKey, startOfDay, startOfWeek, addDays,
      counted, isWithered, sessionTrees, totalTrees, witheredCount, colorOf, streakDays, elapsedSec, owns,
      staticTree, paintTrees, flyCoins, flyGift, renderCoins, showTip, moveTip, hideTip, positionSegs,
      checkAchievements, updateNavDots, gradeSummary, rewardChip, rewardText, caseName, CASES, BADGES, TIERS, badgeSvg,
      caseColor: (id) => (CASES.find((c) => c.id === id) || { color: '#fbbf24' }).color,
      validTree: (id) => (window.Tree.SPECIES.some((x) => x.id === id) ? id : 'oak'),
    };
  }

  // ---------------- boot ----------------
  // What the welcome screen needs from the app (see welcome.js)
  function welcomeCtx(ready, onLeave) {
    return {
      ready, D, staticTree, paintTrees, totalTrees, fmtDur, animateNumber, butterflies, onLeave,
      todayTotal: () => todaySessions().reduce((a, s) => a + s.duration, 0) + (D.active ? elapsedSec() : 0),
      streak: streakDays,
      weekTotals: () => {
        const out = [];
        for (let i = 6; i >= 0; i--) {
          const d = addDays(new Date(), -i), k = dayKey(d);
          const sec = D.sessions.filter((s) => counted(s) && dayKey(new Date(s.date)) === k).reduce((a, s) => a + s.duration, 0) + (i === 0 && D.active ? elapsedSec() : 0);
          out.push({ label: d.toLocaleDateString([], { weekday: 'narrow' }), sec, today: i === 0 });
        }
        return out;
      },
      unclaimed: () => (readOnly ? 0 : unclaimed().length),
      freeCases: () => (readOnly ? 0 : totalFree()),
      treeBurst: (id, r) => {
        const sp = window.Tree.get(id), o = (GROW_FX[window.Tree.growOf(id).fx] || GROW_FX.leaves)(sp);
        burst(r.left + r.width / 2, r.top + r.height * 0.4, Object.assign({ n: 34, spread: r.width * 0.5, spreadY: r.height * 0.3 }, o));
      },
      paused: D.active ? { subject: D.active.subject, sec: elapsedSec() } : null,
    };
  }
  // open the app on a given page without the usual page-change animation
  function setStartPage(page) {
    if (!page || page === currentPage || !$(`#page-${page}`)) return;
    $(`#page-${currentPage}`).classList.remove('active');
    currentPage = page;
    $(`#page-${page}`).classList.add('active');
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    layoutNav(false);
  }
  async function boot() {
    // the startup animation plays while the save loads
    let ready;
    const readyP = new Promise((r) => { ready = r; });
    const introP = window.Welcome ? window.Welcome.intro({ ready: readyP }).catch(() => {}) : Promise.resolve();
    APP_VERSION = await window.api.version();
    const raw = await window.api.load();
    const prevVersion = raw && typeof raw === 'object' ? raw.appVersion : null; // the version that last saved
    const before = raw && typeof raw === 'object' ? (+raw.version || 1) : SCHEMA;
    if (raw && before < SCHEMA) await window.api.backupBeforeUpgrade(raw, before);
    D = normalise(migrate(raw));
    if (raw && before < SCHEMA) save(true);
    $('#app-version').textContent = `Version ${APP_VERSION} · save format ${SCHEMA}`;
    applyTheme(D.profile.theme);
    makeStars();
    updateDayPhase();
    buildOdometer();
    wire();
    setupUpdates();
    if (window.Friends) window.Friends.init(friendsCtx());
    // restore a session that was running when the app closed (it resumes paused)
    if (D.active) {
      D.active.segStart = null;
      T.state = 'paused';
      T.subject = D.active.subject;
      T.tree = D.active.species;
      mountTree(D.active.species);
      const g = window.Tree.growthFor(elapsedSec());
      window.Tree.setGrowth(treeSvg, g.p, g.g);
    }
    loop();
    ready();
    // everything that used to pop up on open now waits until the welcome screen is gone
    const afterOpen = (resumed) => {
      if (D.active && !resumed) toast('Your last session was paused when the app closed. Press Resume to continue', 4500);
      if (!readOnly) showGiftNotice();
      // say so once after the app has updated itself
      if (prevVersion && prevVersion !== APP_VERSION && !readOnly) setTimeout(() => toast(`✨ Updated to version ${esc(APP_VERSION)}`, 4200), 900);
      if (!D.profile.tutorialSeen && !D.active) setTimeout(startTour, 1100);
      if (!readOnly) {
        if (!D.badgesSeeded) {
          const n = checkAchievements(true).length;
          D.badgesSeeded = true; save();
          if (n) setTimeout(() => toast(`New: Achievements! You've already earned ${n} badge${n === 1 ? '' : 's'}`, 4200), 1600);
        } else setTimeout(() => checkAchievements(), 1500);
      }
      if (readOnly) modal({ title: 'This save is from a newer version', body: 'Your save data was made by a newer version of Study Tracker. This older version will show it but won\'t change it, so nothing gets lost. Download the latest version to keep tracking.' });
    };
    await introP;
    if (!D.profile.setupDone) {
      document.body.classList.remove('booting');
      showOnboarding();
    } else if (D.profile.welcome !== false && window.Welcome) {
      window.Welcome.show(welcomeCtx(readyP, (page) => {
        const isResume = page === 'resume';
        setStartPage(isResume ? 'timer' : page || 'timer');
        document.body.classList.remove('booting');
        enterApp();
        if (isResume && T.state === 'paused') setTimeout(() => resume(), 650);
        setTimeout(() => {
          afterOpen(isResume);
        }, 700);
      }));
    } else {
      document.body.classList.remove('booting');
      enterApp();
      afterOpen();
    }
    // friends load in the background; offline this just quietly does nothing
    if (window.Friends && !readOnly) setTimeout(() => window.Friends.start(), 2500);
    // refresh "today" and the greeting when the date rolls over
    setInterval(() => { updateDayPhase(); if (currentPage === 'timer') { renderToday(); } }, 60000);
  }
  window.__dbg = {
    get D() { return D; }, T, S,
    // replays the startup animation and welcome screen (handy for testing)
    replayWelcome: () => window.Welcome.intro({ ready: Promise.resolve() })
      .then(() => window.Welcome.show(welcomeCtx(Promise.resolve(), (p) => go(p === 'resume' ? 'timer' : p || currentPage)))),
  };
  boot();
})();
