/* Study Tracker: Friends tab, friend streaks, weekly team tasks and gifts.
   Talks to the online server through window.api.social (see social.js in the main process).
   app.js hands over its helpers with Friends.init(ctx). Everything here is optional: offline,
   the rest of the app carries on exactly the same. */
(function () {
  'use strict';
  let C = null; // ctx from app.js
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const D = () => C.D();

  // ---------------- name filter ----------------
  // Names are checked when they're sent and again when a friend's name is shown.
  const BAD_PARTS = ['fuck', 'fck', 'shit', 'sh1t', 'cunt', 'nigg', 'faggot', 'bitch', 'biatch', 'whore', 'slut', 'rapist', 'porn', 'penis', 'vagina', 'pussy', 'wanker', 'twat', 'retard', 'nazi', 'hitler', 'molest', 'paedo', 'pedophile', 'dildo', 'boob', 'blowjob', 'handjob', 'jizz', 'bastard', 'asshole', 'arsehole', 'dickhead', 'motherf', 'killyourself', 'horny', 'sexy', 'orgasm', 'testicle', 'scrotum', 'tranny', 'wetback', 'skank', 'bollock', 'bellend', 'douche', 'suicide', 'cocksuck'];
  // short words only count when they stand alone ("Cassie", "Hancock" and "Dickens" are fine)
  const BAD_WORDS = ['ass', 'arse', 'dick', 'cock', 'tit', 'tits', 'cum', 'sex', 'fag', 'nig', 'nigga', 'butt', 'poo', 'poop', 'turd', 'homo', 'lesbo', 'nob', 'knob', 'bum', 'wtf', 'stfu', 'milf', 'dilf', 'anal', 'rape', 'pedo', 'semen', 'heil', 'dyke', 'thot', 'hoe', 'hoes', 'spic', 'kike', 'coon', 'gook', 'chink', 'piss', 'crap', 'damn', 'wank', 'nude', 'clit', 'prick', 'kys', 'kkk', 'fuk', 'pussy', 'kill', 'die'];
  // real names and words that contain a bad part
  const ALLOW = ['scunthorpe', 'kshitij', 'shitake', 'shiitake', 'therapist', 'analyst', 'cocksure'];
  const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', '+': 't', '€': 'e', '(': 'c' };
  function norm(s) {
    return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .split('').map((ch) => LEET[ch] || ch).join('');
  }
  function isBadName(name) {
    const n = norm(name);
    const words = n.split(/[^a-z]+/).filter(Boolean);
    // stretched letters ("fuuuck") and spaced out letters ("f u c k") are caught too
    const squash = (t) => t.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
    let joined = n.replace(/[^a-z]/g, '');
    for (const ok of ALLOW) joined = joined.split(ok).join('_');
    const joinedSq = squash(joined);
    if (BAD_PARTS.some((b) => joined.includes(b) || (!/(.)\1/.test(b) && joinedSq.includes(b)))) return true;
    const isWord = (w) => BAD_WORDS.includes(w) || BAD_WORDS.includes(squash(w)) || (w.length > 3 && BAD_WORDS.includes(w.replace(/s$/, '')));
    if (words.some(isWord)) return true;
    // single letters spelling a word: "a s s", "d.i.c.k"
    const letters = n.split(/[^a-z]+/).filter(Boolean);
    if (letters.length >= 3 && letters.every((w) => w.length === 1) && isWord(letters.join(''))) return true;
    return false;
  }
  // What friends see. Inappropriate names become "Student".
  function cleanName(name) {
    const s = String(name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!s) return { name: '', censored: false };
    if (isBadName(s)) return { name: 'Student', censored: true };
    return { name: s, censored: false };
  }
  const shownName = (n) => cleanName(n).name || 'Student';

  // ---------------- state ----------------
  const F = {
    configured: null, loading: false, offline: false, error: '', loadedAt: 0,
    me: null, code: null, friends: [], inbox: [], view: null, tab: 'stats', busy: false,
  };
  const STREAK_MIN = 15 * 60;       // each of you studies 15 minutes for the day to count
  const MAX_REQUESTS = 20;          // friend requests shown at once (newest first)
  const MAX_STREAKS = 3;            // streak rewards from up to 3 friends at a time
  const MAX_TEAMS = 3;              // weekly task rewards from up to 3 friends a week
  const GIFT_DAY_LIMIT = 400;       // coins (or the price of cases) you can give away per day
  const GIFT_COINS = [10, 25, 50, 100];

  // streak rewards, per person, for each run
  const STREAK_REWARDS = [
    { d: 3, coins: 20 }, { d: 7, box: 'seed' }, { d: 14, coins: 75 }, { d: 21, box: 'sapling' },
    { d: 30, coins: 150 }, { d: 50, box: 'grove' }, { d: 75, coins: 300 }, { d: 100, box: 'grove', coins: 300 },
  ];
  function streakRewardsUpTo(n) {
    const list = STREAK_REWARDS.slice();
    for (let d = 150; d <= Math.max(150, n + 50); d += 50) list.push({ d, coins: 250 });
    return list;
  }
  // Weekly team tasks. `each` is what each of you has to do, so nobody can carry the other.
  const TASKS = [
    { id: 'min5', kind: 'sec', goal: 5 * 3600, each: 2 * 3600, title: 'Study 5 hours together', reward: { coins: 60 } },
    { id: 'min8', kind: 'sec', goal: 8 * 3600, each: 3 * 3600, title: 'Study 8 hours together', reward: { coins: 100 } },
    { id: 'sess8', kind: 'sess', goal: 8, each: 3, title: 'Finish 8 sessions together', reward: { coins: 50 } },
    { id: 'tree10', kind: 'trees', goal: 10, each: 4, title: 'Grow 10 trees together', reward: { coins: 60 } },
    { id: 'same4', kind: 'same', goal: 4, title: 'Study on the same day 4 times', note: 'Both of you study at least 20 minutes on the same day', reward: { coins: 70 } },
    { id: 'days5', kind: 'days', goal: 10, each: 5, title: 'Both study on 5 different days', note: 'At least 10 minutes counts as a day', reward: { coins: 70 } },
    { id: 'long1', kind: 'long', goal: 2, each: 1, title: 'Each finish a 1 hour session', reward: { coins: 50 } },
  ];
  const TASK_BONUS = { box: 'sapling' };

  const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const AV_COLORS = ['#f472b6', '#38bdf8', '#a78bfa', '#fb923c', '#4ade80', '#facc15', '#2dd4bf', '#f87171', '#818cf8', '#34d399'];
  function avatar(name, uid, size = '') {
    const n = shownName(name);
    return `<span class="fr-av ${size}" style="--av:${AV_COLORS[hash(uid || n) % AV_COLORS.length]}">${C.esc(n.slice(0, 1).toUpperCase())}</span>`;
  }
  const parse = (s) => { try { return typeof s === 'string' && s ? JSON.parse(s) : null; } catch (e) { return null; } };

  // ---------------- friend data is checked before use ----------------
  // Everything below comes from someone else's computer, and they can send anything.
  // Each piece is rebuilt with the type it should have, so only plain numbers, short
  // text (which is still escaped when shown), known ids and real colours get through.
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const int = (v, max = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; };
  const txt = (v, max = 60) => (typeof v === 'string' ? v.slice(0, max) : '');
  const color = (c) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#94a3b8');
  const isoDate = (v) => { if (typeof v !== 'string' || v.length > 40) return null; const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
  function cleanInfo(raw) {
    if (!isObj(raw)) return null;
    const out = {
      coins: int(raw.coins), trees: int(raw.trees), withered: int(raw.withered), opened: int(raw.opened),
      total: int(raw.total), longest: int(raw.longest, 86400 * 2), count: int(raw.count), streak: int(raw.streak, 100000),
    };
    out.owned = {};
    if (isObj(raw.owned)) window.Tree.SPECIES.forEach((sp) => { if (own(raw.owned, sp.id)) out.owned[sp.id] = int(raw.owned[sp.id], 9999); });
    out.badges = {};
    if (isObj(raw.badges)) C.BADGES.forEach((b) => { if (own(raw.badges, b.id) && raw.badges[b.id]) { const t = Number(raw.badges[b.id]); out.badges[b.id] = Number.isFinite(t) && t > 0 ? t : Date.now(); } });
    out.show = (Array.isArray(raw.show) ? raw.show : []).filter((id) => typeof id === 'string' && own(out.badges, id)).slice(0, 3);
    out.subjects = (Array.isArray(raw.subjects) ? raw.subjects : []).slice(0, 8).filter(isObj).map((s) => ({ n: txt(s.n) || 'Study', c: color(s.c), s: int(s.s) }));
    out.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).slice(0, 40).filter(isObj).map((s) => {
      const d = isoDate(s.d);
      return d && { d, s: int(s.s, 86400), n: txt(s.n) || 'Study', c: color(s.c), t: C.validTree(s.t), w: s.w ? 1 : 0, k: int(s.k, 1e6), x: int(s.x, 999) };
    }).filter(Boolean);
    out.days = {};
    if (isObj(raw.days)) Object.keys(raw.days).filter((k) => DAY_RE.test(k)).slice(-500).forEach((k) => {
      const e = raw.days[k];
      if (Array.isArray(e)) out.days[k] = [int(e[0], 86400), int(e[1], 1000), int(e[2], 10000), int(e[3], 86400)];
    });
    out.decor = {};
    if (isObj(raw.decor)) Object.keys(raw.decor).filter((k) => SAFE_ID.test(k)).slice(0, 100).forEach((k) => { out.decor[k] = int(raw.decor[k], 999); });
    // the garden is checked again, piece by piece, when it's drawn (friendGarden in app.js)
    out.garden = isObj(raw.garden) ? raw.garden : null;
    const lv = raw.live;
    out.live = isObj(lv) ? { s: txt(lv.s, 40), c: color(lv.c), e: int(lv.e, 86400 * 2), t: isoDate(lv.t), p: lv.p ? 1 : 0 } : null;
    return out;
  }
  function cleanGrades(raw) {
    if (!Array.isArray(raw)) return null;
    const cell = (x) => {
      if (!isObj(x)) return null;
      const p = Number(x.p);
      return Number.isFinite(p) ? { p: Math.max(0, Math.min(1000, p)), l: txt(x.l, 3), c: color(x.c) } : null;
    };
    return raw.slice(0, 60).filter(isObj).map((s) => ({ n: txt(s.n) || 'Subject', c: color(s.c), s1: cell(s.s1), s2: cell(s.s2), e1: cell(s.e1), e2: cell(s.e2) }));
  }
  function cleanStreak(st) {
    if (!isObj(st) || !Array.isArray(st.members)) return null;
    return {
      members: st.members.filter((m) => typeof m === 'string').slice(0, 2), by: txt(st.by, 128),
      status: st.status === 'active' ? 'active' : 'pending', since: DAY_RE.test(st.since) ? st.since : C.dayKey(new Date()), updated: txt(st.updated, 40),
    };
  }
  function cleanFriend(f) {
    if (!isObj(f) || typeof f.uid !== 'string' || !SAFE_ID.test(f.uid)) return null;
    return {
      uid: f.uid, pair: txt(f.pair, 260), mutual: f.mutual === true, name: txt(f.name, 40) || null,
      code: typeof f.code === 'string' && /^[A-Z]{4}$/.test(f.code) ? f.code : null, updated: isoDate(f.updated),
      streak: cleanStreak(f.streak), info: cleanInfo(parse(f.data)), gradeInfo: cleanGrades(parse(f.grades)),
    };
  }
  const BOXES = ['seed', 'sapling', 'grove'];
  function cleanItem(x) {
    if (!isObj(x) || typeof x.id !== 'string' || !SAFE_ID.test(x.id) || typeof x.from !== 'string' || !SAFE_ID.test(x.from)) return null;
    const base = { id: x.id, from: x.from, name: txt(x.name, 40), at: txt(x.at, 40) };
    if (x.type === 'request' && x.id === 'req_' + x.from) return { ...base, type: 'request', code: typeof x.code === 'string' && /^[A-Z]{4}$/.test(x.code) ? x.code : '' };
    if (x.type === 'gift' && x.kind === 'coins') return { ...base, type: 'gift', kind: 'coins', amount: Math.max(1, int(x.amount, 500)) };
    if (x.type === 'gift' && x.kind === 'case' && BOXES.includes(x.box)) return { ...base, type: 'gift', kind: 'case', box: x.box };
    return null;
  }
  const call = (op, args) => window.api.social(op, args);
  const myName = () => cleanName(D().profile.name).name;
  const S = () => D().social;

  // ---------------- my data for friends ----------------
  // day key -> [seconds, sessions that took root, trees, longest session]
  function myDays(limitDays = 400) {
    const out = {};
    const from = +C.addDays(C.startOfDay(new Date()), -limitDays);
    D().sessions.forEach((s) => {
      if (!C.counted(s)) return;
      const t = new Date(s.date);
      if (+t < from) return;
      const k = C.dayKey(t);
      const e = out[k] || (out[k] = [0, 0, 0, 0]);
      e[0] += s.duration;
      if (!C.isWithered(s)) { e[1] += 1; e[2] += C.sessionTrees(s); }
      e[3] = Math.max(e[3], s.duration);
    });
    // a session that's still running isn't counted until it's saved
    return out;
  }
  function publicData() {
    const d = D();
    const counted = d.sessions.filter(C.counted);
    const bySub = {};
    counted.forEach((s) => { bySub[s.subject] = (bySub[s.subject] || 0) + s.duration; });
    const subjects = Object.entries(bySub).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, sec]) => ({ n, c: C.colorOf(n), s: sec }));
    const sessions = d.sessions.filter((s) => !s.cancelled).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40)
      .map((s) => ({ d: s.date, s: s.duration, n: s.subject, c: C.colorOf(s.subject), t: s.tree || 'oak', w: C.isWithered(s) ? 1 : 0, k: s.coins || 0, x: C.isWithered(s) ? 1 : C.sessionTrees(s) }));
    return JSON.stringify({
      v: 1, coins: d.coins, trees: C.totalTrees(), withered: C.witheredCount(), owned: d.collection.owned, opened: d.collection.opened || 0,
      badges: d.achievements, total: counted.reduce((a, s) => a + s.duration, 0), longest: counted.reduce((m, s) => Math.max(m, s.duration), 0),
      count: counted.length, streak: C.streakDays(), subjects, sessions, days: myDays(), decor: d.decor,
      show: myShowcase(), live: liveNow(), garden: C.gardenShare(),
    });
  }
  // what I'm doing right now, for the online / studying dot friends see
  function liveNow() {
    const a = D().active;
    if (!a) return null;
    return { s: a.subject, c: C.colorOf(a.subject), e: Math.floor(C.elapsedSec()), t: new Date().toISOString(), p: a.segStart ? 0 : 1 };
  }
  // up to 3 earned badges picked to show next to my name
  const myShowcase = () => (Array.isArray(S().showcase) ? S().showcase : []).filter((id) => D().achievements[id]).slice(0, 3);
  function gradesData() {
    if (!S().shareGrades) return '';
    return JSON.stringify(C.gradeSummary());
  }

  // ---------------- syncing ----------------
  // Changes are sent a few seconds after they happen, and at most every 2 minutes while studying.
  let pubTimer = null, pubBusy = false, pubAgain = false, lastPub = 0;
  function schedulePublish(ms = 4000) {
    if (!F.configured) return;
    const wait = Math.max(ms, lastPub + 120000 - Date.now());
    if (pubTimer && ms >= 4000) return; // one is already on its way
    clearTimeout(pubTimer);
    pubTimer = setTimeout(() => { pubTimer = null; publish(); }, ms < 4000 ? ms : wait);
  }
  async function publish() {
    if (!F.configured || C.readOnly()) return;
    if (pubBusy) { pubAgain = true; return; }
    pubBusy = true;
    lastPub = Date.now();
    const r = await call('publish', { name: myName(), data: publicData(), grades: gradesData() });
    pubBusy = false;
    if (r.ok) { F.code = r.value.code; F.me = r.value.uid; F.offline = false; paintCode(); }
    else {
      if (r.offline) F.offline = true;
      setTimeout(() => schedulePublish(1000), 60000); // try again in a minute
    }
    if (pubAgain) { pubAgain = false; schedulePublish(1000); }
  }
  async function refresh(opts = {}) {
    if (!F.configured || F.loading) return;
    F.loading = true;
    if (opts.show) paint();
    const r = await call('refresh', { name: myName() });
    F.loading = false;
    if (r.ok) {
      const v = r.value;
      const before = new Set(F.inbox.map((x) => x.id));
      F.me = v.uid; F.code = v.code; F.offline = false; F.error = '';
      F.friends = (Array.isArray(v.friends) ? v.friends : []).map(cleanFriend).filter(Boolean);
      // newest first, and only so many requests at once, so a flood of them can't bury the page
      const items = (Array.isArray(v.inbox) ? v.inbox : []).map(cleanItem).filter(Boolean).sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));
      const blocked = S().blocked || {};
      F.inbox = items.filter((x) => x.type === 'gift').slice(0, 60)
        .concat(items.filter((x) => x.type === 'request' && !blocked[x.from]).slice(0, MAX_REQUESTS));
      // requests from blocked people are cleared away quietly
      items.filter((x) => x.type === 'request' && blocked[x.from]).slice(0, 20).forEach((x) => call('dismiss', { id: x.id }));
      F.loadedAt = Date.now();
      const mutual = F.friends.filter((f) => f.mutual).length;
      if (mutual > (S().friendsMax || 0)) { S().friendsMax = mutual; C.save(); }
      trackStreaks();
      // say hello to anything new that arrived while the app was open
      if (opts.notify) {
        const fresh = F.inbox.filter((x) => !before.has(x.id));
        const gifts = fresh.filter((x) => x.type === 'gift'), reqs = fresh.filter((x) => x.type === 'request');
        if (gifts.length) C.toast(`🎁 ${C.esc(shownName(gifts[0].name))} sent you a gift${gifts.length > 1 ? ` (+${gifts.length - 1} more)` : ''}. Open it on the Friends tab`, 4200);
        if (reqs.length) C.toast(`👋 ${C.esc(shownName(reqs[0].name))} wants to be friends`, 4200);
      }
    } else if (r.offline) F.offline = true;
    else F.error = r.error || 'Something went wrong';
    C.updateNavDots();
    C.checkAchievements();
    if (C.currentPage() === 'friends') paint();
  }
  let bgTimer = null, pingTimer = null, fastTimer = null;
  async function start() {
    const st = await call('status');
    F.configured = !!(st.ok && st.value && st.value.configured);
    if (st.ok) { F.code = st.value.code; F.me = st.value.uid; }
    if (!F.configured) { if (C.currentPage() === 'friends') paint(); return; }
    await publish();
    await refresh({ notify: true });
    clearInterval(bgTimer);
    bgTimer = setInterval(() => { refresh({ notify: true }); }, 6 * 60 * 1000);
    // tell friends I'm online every 2 minutes (skipped when a full update just went out)
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (!C.readOnly() && Date.now() - lastPub > 100000) call('ping'); }, 2 * 60 * 1000);
    // while the Friends tab is open, check on friends more often so online dots stay fresh
    clearInterval(fastTimer);
    fastTimer = setInterval(() => { if (C.currentPage() === 'friends' && !document.hidden && Date.now() - F.loadedAt > 80000) refresh(); }, 30000);
  }

  // ---------------- online now ----------------
  const ONLINE_MS = 5 * 60 * 1000;
  function presence(f) {
    const info = f.info || {};
    const seen = f.updated ? Date.parse(f.updated) : 0;
    const online = seen && Date.now() - seen < ONLINE_MS;
    const live = info.live && typeof info.live === 'object' ? info.live : null;
    if (online && live && !live.p) {
      const sec = (+live.e || 0) + Math.max(0, (Date.now() - Date.parse(live.t || f.updated)) / 1000);
      return { k: 'studying', rank: 0, t: `Studying ${shownSubject(live.s)}`, long: C.fmtDur(sec), c: live.c };
    }
    if (online && live) return { k: 'break', rank: 1, t: 'On a break' };
    if (online) return { k: 'online', rank: 2, t: 'Online' };
    return { k: 'off', rank: 3, t: seen ? `Last on ${ago(f.updated)}` : 'Offline' };
  }
  const shownSubject = (n) => C.esc(String(n || 'something').slice(0, 40));
  const presDot = (p) => `<i class="fr-pres ${p.k}" title="${p.k === 'studying' ? `${p.t} · ${p.long}` : p.t}"></i>`;

  // ---------------- showcase badges ----------------
  function showBadges(ids, earned, key, size = '') {
    const list = (Array.isArray(ids) ? ids : []).map((id) => C.BADGES.find((b) => b.id === id)).filter((b) => b && (!earned || earned[b.id])).slice(0, 3);
    if (!list.length) return '';
    return `<span class="fr-show ${size}">${list.map((b, i) => `<span class="fr-mini t-${b.tier}" style="--i:${i};--tc:${C.TIERS[b.tier][1]}" title="${C.esc(b.name)}">${C.badgeSvg(b, `${key}${i}${b.id}`)}</span>`).join('')}</span>`;
  }
  function pickBadge(slot) {
    const got = D().achievements || {};
    const cur = myShowcase();
    const earned = C.BADGES.filter((b) => got[b.id]);
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal fr-pick"><h2>Pick a badge to show</h2><p>Friends see it next to your name.</p>
      ${earned.length ? `<div class="fr-pick-grid">${earned.map((b, i) => `<button class="fr-pick-b t-${b.tier}${cur.includes(b.id) ? ' on' : ''}" style="--i:${i};--tc:${C.TIERS[b.tier][1]}" data-id="${b.id}"><span class="fr-pick-art">${C.badgeSvg(b, 'pk' + b.id)}</span><span>${C.esc(b.name)}</span></button>`).join('')}</div>` : '<p class="muted">You haven\'t earned any badges yet. They\'re on the Badges tab.</p>'}
      <div class="m-actions">${cur[slot] ? '<button class="btn ghost" data-x="remove">Remove</button>' : ''}<button class="btn" data-x="close">Close</button></div></div>`;
    const close = () => { back.classList.add('closing'); setTimeout(() => back.remove(), 260); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    const set = (list) => { S().showcase = list.slice(0, 3); C.save(); schedulePublish(1500); close(); paint(); };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    $$('.fr-pick-b', back).forEach((b) => b.addEventListener('click', () => {
      // picking one that's already shown swaps it into this slot
      const arr = [cur[0], cur[1], cur[2]], at = arr.indexOf(b.dataset.id);
      if (at >= 0) arr[at] = arr[slot];
      arr[slot] = b.dataset.id;
      set(arr.filter(Boolean));
    }));
    $$('[data-x]', back).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.x === 'remove') set(cur.filter((_, i) => i !== slot)); else close();
    }));
    $('#modal-host').appendChild(back);
  }
  function showcaseCard(i) {
    const got = D().achievements || {};
    const cur = myShowcase();
    return `<div class="card fr-showcase stagger" style="--i:${i}">
      <div class="card-head"><h3>Show off your badges</h3><span class="muted">Friends see these next to your name</span></div>
      <div class="fr-slots">${[0, 1, 2].map((k) => {
        const b = C.BADGES.find((x) => x.id === cur[k]);
        return b && got[b.id] ? `<button class="fr-slot full t-${b.tier}" style="--i:${k};--tc:${C.TIERS[b.tier][1]}" data-slot="${k}" title="Change"><span class="fr-slot-art">${C.badgeSvg(b, 'sl' + k + b.id)}</span><span class="fr-slot-name">${C.esc(b.name)}</span></button>`
          : `<button class="fr-slot" style="--i:${k}" data-slot="${k}"><span class="fr-slot-plus">+</span><span class="fr-slot-name">Pick a badge</span></button>`;
      }).join('')}</div>
    </div>`;
  }

  // ---------------- weekly leaderboard ----------------
  const hrs = (sec) => `${(sec / 3600).toFixed(1)} h`;
  function leaderboardCard(mutual, i) {
    const rows = [{ me: true, uid: F.me || 'me', name: D().profile.name, sec: personWeek(myDays(10)).sec, show: myShowcase(), earned: D().achievements }]
      .concat(mutual.map((f) => ({ f, uid: f.uid, name: f.name, sec: personWeek((f.info || {}).days || {}).sec, show: (f.info || {}).show, earned: (f.info || {}).badges || {} })))
      .sort((a, b) => b.sec - a.sec || (a.me ? -1 : 1));
    const top = Math.max(60, rows[0].sec);
    return `<div class="card fr-board stagger" style="--i:${i}">
      <div class="card-head"><h3>This week's leaderboard</h3><span class="muted">Hours studied since Monday</span></div>
      <div class="fr-board-list">${rows.map((r, k) => {
        const p = r.f ? presence(r.f) : null;
        return `<${r.f ? 'button' : 'div'} class="fr-board-row${r.me ? ' me' : ''}${k < 3 && r.sec > 0 ? ` m${k + 1}` : ''}" style="--i:${k};--w:${Math.max(2, (r.sec / top) * 100).toFixed(1)}%"${r.f ? ` data-uid="${C.esc(r.uid)}"` : ''}>
          <span class="fr-rank">${k + 1}</span>
          <span class="fr-av-wrap">${avatar(r.name, r.uid, 'sm2')}${p ? presDot(p) : ''}</span>
          <span class="fr-board-name"><b>${C.esc(r.me ? 'You' : shownName(r.name))}</b>${showBadges(r.show, r.earned, 'lb' + k, 'tiny')}</span>
          <span class="fr-board-bar"><i></i></span>
          <span class="fr-board-h">${hrs(r.sec)}</span>
        </${r.f ? 'button' : 'div'}>`;
      }).join('')}</div>
    </div>`;
  }

  // ---------------- streaks ----------------
  const todayKey = () => C.dayKey(new Date());
  const prevKey = (k, n = 1) => C.dayKey(C.addDays(new Date(`${k}T12:00`), -n));
  function streakInfo(f) {
    const st = f.streak;
    if (!st || st.status !== 'active' || !f.info) return null;
    const mine = myDays(), theirs = f.info.days || {};
    const ok = (k) => (mine[k] ? mine[k][0] : 0) >= STREAK_MIN && (theirs[k] ? theirs[k][0] : 0) >= STREAK_MIN;
    const today = todayKey();
    let k = ok(today) ? today : prevKey(today);
    let n = 0, start = null;
    while (k >= st.since && ok(k)) { n++; start = k; k = prevKey(k); }
    return {
      n, start, since: st.since,
      todayMe: (mine[today] ? mine[today][0] : 0), todayThem: (theirs[today] ? theirs[today][0] : 0), todayDone: ok(today),
      // the streak is still alive if yesterday counted or it only started today/yesterday
      atRisk: !ok(today) && n > 0,
    };
  }
  function trackStreaks() {
    let best = S().bestStreak || 0;
    F.friends.forEach((f) => { const i = streakInfo(f); if (i && i.n > best) best = i.n; });
    if (best !== (S().bestStreak || 0)) { S().bestStreak = best; C.save(); }
  }
  const streakKey = (f, i, d) => `s|${f.pair}|${i.start}|${d}`;
  function streakClaimable(f) {
    const i = streakInfo(f);
    if (!i || !i.n) return [];
    return streakRewardsUpTo(i.n).filter((r) => r.d <= i.n && !S().claims[streakKey(f, i, r.d)]);
  }
  const activeStreaks = () => F.friends.filter((f) => f.mutual && f.streak);

  // ---------------- weekly tasks ----------------
  const weekKey = () => C.dayKey(C.startOfWeek(new Date()));
  function weekDays() { const s = C.startOfWeek(new Date()); return Array.from({ length: 7 }, (_, i) => C.dayKey(C.addDays(s, i))); }
  function tasksFor(f) {
    const h = hash(f.pair + weekKey());
    const sec = TASKS.filter((t) => t.kind === 'sec'), rest = TASKS.filter((t) => t.kind !== 'sec');
    const first = sec[h % sec.length];
    const a = rest[(h >>> 4) % rest.length];
    const others = rest.filter((t) => t !== a);
    const b = others[(h >>> 9) % others.length];
    return [first, a, b];
  }
  function personWeek(days) {
    const out = { sec: 0, sess: 0, trees: 0, days: 0, long: 0, active: {} };
    weekDays().forEach((k) => {
      const e = days[k];
      if (!e) return;
      out.sec += e[0]; out.sess += e[1]; out.trees += e[2];
      if (e[0] >= 600) out.days += 1;
      if (e[3] >= 3600) out.long = 1;
      out.active[k] = e[0];
    });
    return out;
  }
  function taskProgress(t, me, them) {
    if (t.kind === 'same') {
      const n = weekDays().filter((k) => (me.active[k] || 0) >= 1200 && (them.active[k] || 0) >= 1200).length;
      return { me: n, them: n, total: Math.min(n, t.goal), done: n >= t.goal, shared: true };
    }
    const m = me[t.kind], o = them[t.kind];
    // each person counts for at most goal minus the other person's share, so the bar can't fill from one side
    const cap = t.goal - t.each;
    const total = Math.min(t.goal, Math.min(m, cap) + Math.min(o, cap));
    return { me: m, them: o, total, done: m >= t.each && o >= t.each && m + o >= t.goal };
  }
  const taskKey = (f, t) => `t|${weekKey()}|${f.pair}|${t.id}`;
  const bonusKey = (f) => `tb|${weekKey()}|${f.pair}`;
  function teamsThisWeek() {
    const w = weekKey();
    return new Set(Object.keys(S().claims).filter((k) => k.startsWith(`t|${w}|`)).map((k) => k.split('|')[2]));
  }
  const teamAllowed = (f) => { const t = teamsThisWeek(); return t.has(f.pair) || t.size < MAX_TEAMS; };
  function taskState(f) {
    if (!f.info) return null;
    const me = personWeek(myDays(14)), them = personWeek(f.info.days || {});
    const list = tasksFor(f).map((t) => Object.assign({ t }, taskProgress(t, me, them), { claimed: !!S().claims[taskKey(f, t)] }));
    const allDone = list.every((x) => x.done);
    return { list, allDone, bonusClaimed: !!S().claims[bonusKey(f)], me, them };
  }
  function tasksClaimable(f) {
    const s = taskState(f);
    if (!s || !teamAllowed(f)) return 0;
    return s.list.filter((x) => x.done && !x.claimed).length + (s.allDone && !s.bonusClaimed ? 1 : 0);
  }

  // ---------------- rewards ----------------
  function give(r, el) {
    if (r.coins) D().coins += r.coins;
    if (r.box) D().freeCases[r.box] = (D().freeCases[r.box] || 0) + 1;
    C.save(true);
    if (el) {
      const b = el.getBoundingClientRect();
      C.burst(b.left + b.width / 2, b.top + b.height / 2, { n: 34, up: true, speed: 6, shape: ['star4', 'dot'], glow: true, colors: ['#fde047', '#fb923c', '#ffffff', '#f472b6'] });
      if (r.coins) C.flyCoins(el, Math.min(r.coins, 30)); else C.renderCoins();
      if (r.box) C.flyGift(el, C.caseColor(r.box));
    } else C.renderCoins();
    C.updateNavDots();
    schedulePublish();
  }
  const rewardHtml = (r) => C.rewardChip(r);

  // ---------------- badge counts for the Badges page ----------------
  function badgeMetrics() {
    const claims = Object.keys(S().claims || {});
    return {
      friends: S().friendsMax || 0,
      fstreak: S().bestStreak || 0,
      tasks: claims.filter((k) => k.startsWith('t|')).length,
      fullweeks: claims.filter((k) => k.startsWith('tb|')).length,
    };
  }
  function pending() {
    if (!F.configured) return 0;
    let n = F.inbox.length;
    F.friends.forEach((f) => {
      if (!f.mutual) return;
      if (f.streak && f.streak.status === 'pending' && f.streak.by !== F.me) n++;
      n += streakClaimable(f).length ? 1 : 0;
      n += tasksClaimable(f) ? 1 : 0;
    });
    return n;
  }

  // ---------------- page ----------------
  function paintCode() {
    const el = $('#fr-code');
    if (!el) return;
    el.classList.toggle('hidden', F.configured === false);
    const code = F.code || '····';
    if (el.dataset.code === code) return;
    el.dataset.code = code;
    el.innerHTML = `<span class="ms-label">Your friend code</span><span class="fr-code-letters">${code.split('').map((ch, i) => `<b style="--i:${i}">${C.esc(ch)}</b>`).join('')}</span>`;
    el.title = F.code ? 'Click to copy' : '';
  }
  function render() {
    paintCode();
    paint(true);
    if (F.configured && Date.now() - F.loadedAt > 20000) refresh({ show: !F.loadedAt });
  }
  function free() { const b = $('#fr-body'); if (b) b.replaceChildren(); }

  // A background refresh rebuilds the page. Without care every card would restart its entrance
  // animation and the page would blink out and back in, so a repaint that isn't fresh carries each
  // animation on from where the last fresh paint left it (finished ones stay finished).
  let paintedAt = 0;
  function settle(host, skip) {
    if (!host.getAnimations) return;
    const t = performance.now() - paintedAt;
    host.getAnimations({ subtree: true }).forEach((a) => {
      if (skip && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(skip)) return;
      const tm = a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming();
      if (!tm || !Number.isFinite(tm.endTime) || tm.iterations === Infinity) return;
      if (t >= tm.endTime) a.finish();
      else a.currentTime = t;
    });
  }
  function paint(fresh) {
    const host = $('#fr-body');
    if (!host || C.currentPage() !== 'friends') return;
    // when the loading skeletons are swapped for real friend cards, those cards still pop in
    const skel = !!host.querySelector('.skel');
    if (fresh) paintedAt = performance.now();
    paintInner(host, fresh);
    if (!fresh) settle(host, skel ? '.fr-card' : null);
  }
  function paintInner(host, fresh) {
    paintCode();
    if (F.configured === false) {
      host.innerHTML = `<div class="card fr-setup stagger" style="--i:1">${peopleArt()}<h2>Friends are almost here</h2><p class="muted">Friends need the app's online server, which isn't switched on in this version yet. It will turn on by itself with an update. Everything else keeps working as usual.</p></div>`;
      return;
    }
    if (F.view) return paintProfile(host, fresh);
    const mutual = F.friends.filter((f) => f.mutual).sort((a, b) => presence(a).rank - presence(b).rank), waiting = F.friends.filter((f) => !f.mutual);
    const reqs = F.inbox.filter((x) => x.type === 'request' && !F.friends.some((f) => f.uid === x.from && f.mutual));
    const gifts = F.inbox.filter((x) => x.type === 'gift');
    const nm = cleanName(D().profile.name);
    let i = 1;
    host.innerHTML = `
      ${F.offline ? `<div class="fr-banner stagger" style="--i:${i++}">You're offline. Friends will load when you're back online.</div>` : ''}
      ${F.error && !F.offline ? `<div class="fr-banner err stagger" style="--i:${i++}">${C.esc(F.error)}</div>` : ''}
      ${!nm.name || nm.censored ? `<div class="card fr-name stagger" style="--i:${i++}"><div><h3>${nm.censored ? 'Pick a different name' : 'What should friends call you?'}</h3><p class="muted">${nm.censored ? 'Your name has a word that isn\'t allowed, so friends see "Student". ' : ''}Friends see the name from your profile.</p></div><div class="add-row"><input class="input" id="fr-name-in" maxlength="24" placeholder="Your name" value="${C.esc(nm.censored ? '' : D().profile.name || '')}"><button class="btn primary" id="fr-name-save">Save</button></div></div>` : ''}
      <div class="fr-top stagger" style="--i:${i++}">
        <div class="card fr-add">
          <div class="card-head"><h3>Add a friend</h3><span class="muted">Ask for the 4-letter code on their Friends tab</span></div>
          <div class="fr-add-row"><div class="code-boxes" id="fr-boxes">${[0, 1, 2, 3].map((k) => `<input maxlength="1" data-k="${k}" autocomplete="off" spellcheck="false">`).join('')}</div><button class="btn primary" id="fr-add-btn" disabled>Add friend</button></div>
          <p class="muted fr-add-msg" id="fr-add-msg"></p>
        </div>
        <div class="card fr-privacy">
          <div class="card-head"><h3>Privacy</h3></div>
          <div class="row-field"><label>Share my grades with friends</label><button class="switch${S().shareGrades ? ' on' : ''}" id="fr-share" role="switch"><span></span></button></div>
          <p class="muted tiny-note">Friends you add can see your name, coins, trees, badges and study sessions. Grades stay private unless you switch this on.</p>
        </div>
      </div>
      ${showcaseCard(i++)}
      ${reqs.length ? `<div class="card stagger" style="--i:${i++}"><div class="card-head"><h3>Friend requests</h3></div><div class="fr-reqs">${reqs.map((r, k) => `<div class="fr-req" style="--i:${k}" data-id="${C.esc(r.id)}">${avatar(r.name, r.from)}<span class="fr-req-name"><b>${C.esc(shownName(r.name))}</b><small>${C.esc(r.code || '')} wants to be friends</small></span><button class="btn ghost small" data-a="block" title="Hide requests from this person from now on">Block</button><button class="btn ghost small" data-a="no">Not now</button><button class="btn primary small" data-a="yes">Accept</button></div>`).join('')}</div></div>` : ''}
      ${gifts.length ? `<div class="card stagger fr-gifts-card" style="--i:${i++}"><div class="card-head"><h3>Gifts for you</h3><span class="muted">Click a gift to open it</span></div><div class="fr-gifts">${gifts.map((g, k) => `<button class="fr-gift" style="--i:${k};--cc:${g.kind === 'case' ? C.caseColor(g.box) : '#fbbf24'}" data-id="${C.esc(g.id)}"><span class="fr-gift-box"><i class="lid"></i><i class="body"></i><i class="ribbon"></i></span><span class="fr-gift-from">From <b>${C.esc(shownName(g.name))}</b></span></button>`).join('')}</div></div>` : ''}
      ${mutual.length ? leaderboardCard(mutual, i++) : ''}
      <div class="card stagger" style="--i:${i++}">
        <div class="card-head"><h3>Your friends${mutual.length ? ` · ${mutual.length}` : ''}</h3><button class="btn small ghost" id="fr-refresh"${F.loading ? ' disabled' : ''}><svg viewBox="0 0 24 24" class="${F.loading ? 'spin' : ''}"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>${F.loading ? 'Loading' : 'Refresh'}</button></div>
        ${!F.loadedAt && F.loading ? '<div class="fr-grid">' + '<div class="fr-card skel"></div>'.repeat(3) + '</div>'
          : mutual.length || waiting.length ? `<div class="fr-grid">${mutual.map(friendCard).join('')}${waiting.map(waitingCard).join('')}</div>`
          : `<div class="fr-empty">${peopleArt()}<h3>No friends yet</h3><p class="muted">Share your code <b>${C.esc(F.code || '')}</b> or add a friend with theirs. Then you can start a streak and do weekly tasks together.</p></div>`}
      </div>`;
    wireList(host);
  }
  function friendCard(f, k) {
    const info = f.info || {};
    const si = streakInfo(f);
    const week = personWeek(info.days || {}).sec;
    const today = (info.days && info.days[todayKey()]) ? info.days[todayKey()][0] : 0;
    const dots = streakClaimable(f).length + tasksClaimable(f) + (f.streak && f.streak.status === 'pending' && f.streak.by !== F.me ? 1 : 0);
    const p = presence(f);
    return `<button class="fr-card pres-${p.k}" style="--i:${k}" data-uid="${C.esc(f.uid)}">
      ${dots ? `<i class="ndot">${dots}</i>` : ''}
      <span class="fr-card-top"><span class="fr-av-wrap">${avatar(f.name, f.uid)}${presDot(p)}</span><span class="fr-card-name"><span class="fr-name-row"><b>${C.esc(shownName(f.name))}</b>${showBadges(info.show, info.badges, 'fc' + k)}</span><small>${C.esc(f.code || '')}</small></span>
      ${si && si.n ? `<span class="fr-flame${si.todayDone ? ' lit' : ''}" title="${si.n} day streak">${flameSvg()}<b>${si.n}</b></span>` : f.streak && f.streak.status === 'pending' ? '<span class="fr-chip">Streak invite</span>' : ''}</span>
      <span class="fr-card-stats"><span><small>This week</small><b>${C.fmtDur(week)}</b></span><span><small>Trees</small><b>${info.trees || 0}</b></span><span><small>Coins</small><b>${(info.coins || 0).toLocaleString()}</b></span></span>
      <span class="fr-status ${p.k}"${p.c ? ` style="--sc:${C.esc(p.c)}"` : ''}>${p.k === 'studying' ? `<b>${p.t}</b> · ${p.long}` : `${p.t}${today >= 600 ? ` · studied ${C.fmtDur(today)} today` : ''}`}</span>
    </button>`;
  }
  function waitingCard(f, k) {
    return `<div class="fr-card waiting" style="--i:${k + 1}">
      <span class="fr-card-top">${avatar(S().names[f.uid] || '?', f.uid)}<span class="fr-card-name"><b>${C.esc(shownName(S().names[f.uid] || 'Friend'))}</b><small>Request sent</small></span></span>
      <span class="muted fr-wait-txt">Waiting for them to add you back. Their profile opens once they do.</span>
      <button class="btn ghost small" data-cancel="${C.esc(f.uid)}">Cancel request</button>
    </div>`;
  }
  function peopleArt() {
    return `<svg class="fr-art" viewBox="0 0 160 110"><circle cx="58" cy="40" r="17" class="a1"/><path d="M26 98c3-22 16-34 32-34s29 12 32 34z" class="a1"/><circle cx="104" cy="44" r="15" class="a2"/><path d="M76 98c3-19 14-29 28-29s25 10 28 29z" class="a2"/><path d="M80 18l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z" class="a3"/></svg>`;
  }
  const flameSvg = () => '<svg viewBox="0 0 24 24" class="frflame"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/><path d="M12 13c1 1.5 3 2.5 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 1.5-3 .2 1 .8 1.4 1.5 1.4 0-1.6-.6-2.4 0-3.4z" class="core"/></svg>';

  function wireList(host) {
    const boxes = $$('#fr-boxes input', host), btn = $('#fr-add-btn', host);
    const val = () => boxes.map((b) => b.value).join('').toUpperCase();
    boxes.forEach((b, k) => {
      b.addEventListener('input', () => {
        b.value = b.value.replace(/[^a-z]/gi, '').slice(-1).toUpperCase();
        if (b.value) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); if (boxes[k + 1]) boxes[k + 1].focus(); }
        btn.disabled = val().length !== 4;
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && boxes[k - 1]) { boxes[k - 1].focus(); boxes[k - 1].value = ''; btn.disabled = true; }
        if (e.key === 'Enter' && !btn.disabled) btn.click();
      });
      b.addEventListener('paste', (e) => {
        const t = (e.clipboardData.getData('text') || '').replace(/[^a-z]/gi, '').toUpperCase().slice(0, 4);
        if (!t) return;
        e.preventDefault();
        boxes.forEach((x, j) => { x.value = t[j] || ''; });
        btn.disabled = val().length !== 4;
        (boxes[Math.min(3, t.length)] || boxes[3]).focus();
      });
    });
    btn.addEventListener('click', async () => {
      const code = val(), msg = $('#fr-add-msg', host);
      if (code.length !== 4) return;
      if (code === F.code) { msg.textContent = "That's your own code. Share it with a friend instead"; return shakeBoxes(); }
      btn.disabled = true; msg.textContent = 'Looking…'; msg.className = 'muted fr-add-msg';
      const r = await call('addFriend', { code, name: myName() });
      if (!r.ok) {
        msg.textContent = r.offline ? "You're offline. Try again once you're connected" : r.status === 404 ? 'No one has that code. Check the letters and try again' : r.error;
        msg.className = 'fr-add-msg warn';
        btn.disabled = false;
        return shakeBoxes();
      }
      S().names[r.value.uid] = r.value.name;
      C.save();
      const b = btn.getBoundingClientRect();
      C.burst(b.left + b.width / 2, b.top, { n: 30, up: true, speed: 6, leaf: false, colors: ['#4ade80', '#38bdf8', '#ffffff'] });
      C.toast(`Friend request sent to ${C.esc(shownName(r.value.name))}`);
      await refresh();
    });
    const share = $('#fr-share', host);
    if (share) share.addEventListener('click', () => {
      S().shareGrades = !S().shareGrades;
      share.classList.toggle('on', S().shareGrades);
      C.save();
      C.toast(S().shareGrades ? 'Friends can now see your grade averages' : 'Your grades are private again');
      schedulePublish(500);
    });
    const ns = $('#fr-name-save', host);
    if (ns) {
      const go = () => {
        const v = $('#fr-name-in', host).value.trim();
        if (!v) return;
        if (cleanName(v).censored) { C.toast("That name isn't allowed. Try another"); const inp = $('#fr-name-in', host); inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); return; }
        D().profile.name = v; C.save(); schedulePublish(300); C.toast(`Friends will see you as ${C.esc(v)}`); paint();
      };
      ns.addEventListener('click', go);
      $('#fr-name-in', host).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    }
    const rf = $('#fr-refresh', host);
    if (rf) rf.addEventListener('click', () => refresh({ show: true, notify: true }));
    $$('.fr-req', host).forEach((row) => $$('button', row).forEach((b) => b.addEventListener('click', async () => {
      const item = F.inbox.find((x) => x.id === row.dataset.id);
      if (!item) return;
      $$('button', row).forEach((x) => { x.disabled = true; });
      const yes = b.dataset.a === 'yes';
      if (b.dataset.a === 'block') { S().blocked = Object.assign({}, S().blocked, { [item.from]: Date.now() }); C.save(); }
      const r = yes ? await call('acceptRequest', { from: item.from, id: item.id, name: myName() }) : await call('dismiss', { id: item.id });
      if (!r.ok) { C.toast(r.offline ? "You're offline" : C.esc(r.error)); $$('button', row).forEach((x) => { x.disabled = false; }); return; }
      if (yes) {
        S().names[item.from] = item.name; C.save();
        const bb = b.getBoundingClientRect();
        C.burst(bb.left + bb.width / 2, bb.top, { n: 40, up: true, speed: 7, leaf: false, colors: ['#4ade80', '#f472b6', '#fde047', '#ffffff'] });
        C.toast(`You and ${C.esc(shownName(item.name))} are now friends 🎉`);
      }
      row.style.height = row.offsetHeight + 'px';
      row.classList.add('removing');
      setTimeout(() => refresh(), 350);
    })));
    $$('.fr-gift', host).forEach((g) => g.addEventListener('click', () => openGift(g)));
    $$('.fr-card[data-uid]', host).forEach((c) => c.addEventListener('click', () => openProfile(c.dataset.uid)));
    $$('.fr-board-row[data-uid]', host).forEach((c) => c.addEventListener('click', () => openProfile(c.dataset.uid)));
    $$('.fr-slot', host).forEach((c) => c.addEventListener('click', () => pickBadge(+c.dataset.slot)));
    $$('[data-cancel]', host).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await call('removeFriend', { uid: b.dataset.cancel, name: myName() });
      if (!r.ok) { b.disabled = false; return C.toast(r.offline ? "You're offline" : C.esc(r.error)); }
      refresh();
    }));
  }
  function shakeBoxes() {
    const b = $('#fr-boxes');
    if (!b) return;
    b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
  }
  async function openGift(el) {
    if (el.classList.contains('opening')) return;
    const g = F.inbox.find((x) => x.id === el.dataset.id);
    if (!g) return;
    el.classList.add('opening');
    if (S().gifts[g.id]) { await call('dismiss', { id: g.id }); return refresh(); }
    const r = await call('takeGift', { id: g.id });
    if (!r.ok) {
      el.classList.remove('opening');
      if (r.status === 404) { C.toast('That gift was already opened'); return refresh(); }
      return C.toast(r.offline ? "You're offline. Open it once you're connected" : C.esc(r.error));
    }
    S().gifts[g.id] = new Date().toISOString();
    const reward = g.kind === 'case' ? { box: g.box } : { coins: Math.max(0, Math.min(500, Math.floor(+g.amount || 0))) };
    setTimeout(() => {
      el.classList.add('opened');
      $('.fr-gift-from', el).innerHTML = `<b>${C.esc(C.rewardText(reward))}</b> from ${C.esc(shownName(g.name))}`;
      give(reward, $('.fr-gift-box', el));
      C.toast(`🎁 ${C.esc(shownName(g.name))} gave you ${C.esc(C.rewardText(reward))}${reward.box ? '. Open it on the Trees page' : ''}`, 3800);
      F.inbox = F.inbox.filter((x) => x.id !== g.id);
      C.updateNavDots();
      setTimeout(() => { if (C.currentPage() === 'friends' && !F.view) paint(); }, 2200);
    }, 700);
  }

  // ---------------- friend profile ----------------
  const TABS = [['stats', 'Stats'], ['garden', 'Garden'], ['sessions', 'Sessions'], ['trees', 'Trees'], ['badges', 'Badges'], ['grades', 'Grades'], ['together', 'Together'], ['gift', 'Gift']];
  function openProfile(uid, tab) {
    F.view = uid;
    F.tab = tab || 'stats';
    const host = $('#fr-body');
    host.classList.remove('fr-in-back'); void host.offsetWidth; host.classList.add('fr-in');
    paint(true);
    $('#page-friends').scrollTop = 0;
  }
  function closeProfile() {
    F.view = null;
    const host = $('#fr-body');
    host.classList.remove('fr-in'); void host.offsetWidth; host.classList.add('fr-in-back');
    paint(true);
  }
  function paintProfile(host, fresh) {
    const f = F.friends.find((x) => x.uid === F.view);
    if (!f || !f.mutual) { F.view = null; return paint(); }
    const info = f.info || {};
    const si = streakInfo(f);
    const dots = { together: streakClaimable(f).length + tasksClaimable(f) + (f.streak && f.streak.status === 'pending' && f.streak.by !== F.me ? 1 : 0) };
    host.innerHTML = `
      <div class="fr-prof-head stagger" style="--i:1">
        <button class="icon-btn" id="fr-back" title="Back to friends"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span class="fr-av-wrap big">${avatar(f.name, f.uid, 'big')}${presDot(presence(f))}</span>
        <div class="fr-prof-name"><h2>${C.esc(shownName(f.name))}${showBadges(info.show, info.badges, 'ph', 'big')}</h2><span class="muted">${C.esc(f.code || '')} · ${(() => { const p = presence(f); return p.k === 'studying' ? `${p.t} · ${p.long}` : p.t; })()}</span></div>
        <div class="head-stats">
          <div class="mini-stat"><span class="ms-label">Coins</span><span class="ms-val"><span class="coin sm"></span> ${(info.coins || 0).toLocaleString()}</span></div>
          <div class="mini-stat"><span class="ms-label">Trees</span><span class="ms-val">${info.trees || 0}</span></div>
          <div class="mini-stat"><span class="ms-label">Streak together</span><span class="ms-val">${si ? `${si.n} day${si.n === 1 ? '' : 's'}` : '–'}</span></div>
        </div>
        <button class="icon-btn fr-remove" id="fr-remove" title="Remove friend"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 11h6"/></svg></button>
      </div>
      <div class="seg fr-tabs stagger" style="--i:2" id="fr-tabs"><div class="seg-pill"></div>${TABS.map(([k, l]) => `<button data-t="${k}" class="${F.tab === k ? 'active' : ''}">${l}${dots[k] ? '<i class="tdot"></i>' : ''}</button>`).join('')}</div>
      <div class="fr-tab-body stagger" style="--i:3" id="fr-tab-body"></div>`;
    $('#fr-back', host).addEventListener('click', closeProfile);
    $('#fr-remove', host).addEventListener('click', async () => {
      const ok = await C.modal({ title: `Remove ${C.esc(shownName(f.name))}?`, body: 'You\'ll stop seeing each other\'s profiles, and any streak between you ends.', actions: [{ label: 'Keep', ghost: true, value: false }, { label: 'Remove', danger: true, value: true }] });
      if (!ok) return;
      const r = await call('removeFriend', { uid: f.uid, name: myName() });
      if (!r.ok) return C.toast(r.offline ? "You're offline" : C.esc(r.error));
      C.toast(`${C.esc(shownName(f.name))} removed`);
      F.view = null;
      refresh({ show: true });
    });
    $$('#fr-tabs button', host).forEach((b) => b.addEventListener('click', () => {
      if (F.tab === b.dataset.t) return;
      const order = TABS.map((t) => t[0]);
      const dir = order.indexOf(b.dataset.t) > order.indexOf(F.tab) ? 1 : -1;
      F.tab = b.dataset.t;
      $$('#fr-tabs button', host).forEach((x) => x.classList.toggle('active', x === b));
      C.positionSegs();
      paintTab(f, dir);
    }));
    requestAnimationFrame(C.positionSegs);
    paintTab(f, 0);
  }
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (!(s >= 0)) return 'recently';
    if (s < 120) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  function paintTab(f, dir) {
    const body = $('#fr-tab-body');
    if (!body) return;
    body.classList.remove('slide-l', 'slide-r', 'anim-done');
    void body.offsetWidth;
    if (dir) body.classList.add(dir > 0 ? 'slide-r' : 'slide-l');
    const info = f.info || {};
    const fn = { stats: tabStats, garden: tabGarden, sessions: tabSessions, trees: tabTrees, badges: tabBadges, grades: tabGrades, together: tabTogether, gift: tabGift }[F.tab];
    body.innerHTML = fn(f, info);
    C.paintTrees(body);
    const after = { together: wireTogether, gift: wireGift, stats: wireStats, garden: wireGarden }[F.tab];
    if (after) after(f, body);
  }

  function tabStats(f, info) {
    const days = info.days || {};
    const week = personWeek(days);
    const bars = [];
    for (let i = 6; i >= 0; i--) {
      const d = C.addDays(new Date(), -i), k = C.dayKey(d);
      bars.push({ label: d.toLocaleDateString([], { weekday: 'short' }), sec: days[k] ? days[k][0] : 0, today: i === 0 });
    }
    const max = Math.max(3600, ...bars.map((b) => b.sec));
    const subs = info.subjects || [];
    const smax = subs.length ? subs[0].s : 1;
    return `<div class="stat-cards fr-stat-cards">
        <div class="stat"><span class="s-label">Total time</span><span class="s-val">${C.fmtDur(info.total || 0)}</span></div>
        <div class="stat"><span class="s-label">This week</span><span class="s-val">${C.fmtDur(week.sec)}</span></div>
        <div class="stat"><span class="s-label">Sessions</span><span class="s-val">${info.count || 0}</span></div>
        <div class="stat"><span class="s-label">Their streak</span><span class="s-val">${info.streak || 0} day${info.streak === 1 ? '' : 's'}</span></div>
      </div>
      <div class="fr-two">
        <div class="card"><div class="card-head"><h3>Last 7 days</h3><span class="muted">Longest session ${C.fmtDur(info.longest || 0)}</span></div>
          <div class="fr-bars">${bars.map((b, i) => `<div class="fr-bar${b.today ? ' today' : ''}" style="--i:${i}" data-tip="${C.esc(b.label)}: ${C.esc(C.fmtDur(b.sec))}"><i style="--h:${((b.sec / max) * 100).toFixed(1)}%"></i><span>${C.esc(b.label)}</span></div>`).join('')}</div></div>
        <div class="card"><div class="card-head"><h3>Subjects</h3></div>
          ${subs.length ? `<div class="hbars">${subs.map((s, i) => `<div class="hbar" style="--c:${C.esc(s.c)};--i:${i}"><span class="nm"><i></i>${C.esc(s.n)}</span><div class="track"><div class="fill" style="--w:${((s.s / smax) * 100).toFixed(1)}%"></div></div><span class="v">${C.fmtDur(s.s)}</span></div>`).join('')}</div>` : '<div class="empty">No study time yet.</div>'}</div>
      </div>`;
  }
  function wireStats(f, body) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$('.fill', body).forEach((el, i) => { el.style.transitionDelay = `${i * 50}ms`; el.style.width = el.style.getPropertyValue('--w'); });
    }));
    $$('.fr-bar', body).forEach((b) => {
      b.addEventListener('mouseenter', (e) => C.showTip(`<div class="tt-title">${b.dataset.tip}</div>`, e));
      b.addEventListener('mousemove', C.moveTip);
      b.addEventListener('mouseleave', C.hideTip);
    });
  }
  // their garden, laid out the way they arranged it, with their decorations
  function tabGarden(f, info) {
    const who = C.esc(shownName(f.name));
    if (!info.garden) {
      return `<div class="card fr-locked"><div class="fr-lock-art"><svg viewBox="0 0 24 24"><path d="M12 21v-7M12 14c-4 0-6-3-6-7 4 0 6 3 6 7zM12 12c0-4 2-7 6-7 0 4-2 7-6 7z"/></svg></div><h3>${who}'s garden isn't here yet</h3><p class="muted">Gardens show up once ${who} updates the app to the newest version.</p></div>`;
    }
    return `<div class="card garden-scene fr-garden">
        <div class="sky"><div class="night-sky"></div><div class="stars"></div><div class="sun"></div><div class="moon"></div><div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div></div>
        <div class="plot-host" id="fr-garden-plot"></div>
        <div class="gs-life">${C.butterflies(3, 'fr' + f.uid)}</div>
        <div class="gs-caption" id="fr-garden-cap"></div>
      </div>`;
  }
  function wireGarden(f, body) {
    const host = $('#fr-garden-plot', body);
    if (!host) return;
    const info = f.info || {};
    C.makeStars();
    const r = C.friendGarden(host, info.garden, info.decor);
    const cap = $('#fr-garden-cap', body);
    cap.innerHTML = r.count ? `<b>${r.count}</b> tree${r.count === 1 ? '' : 's'} · ${C.fmtDur(r.total)} of growing` : `${C.esc(shownName(f.name))} hasn't grown any trees yet`;
  }
  function tabSessions(f, info) {
    const list = info.sessions || [];
    if (!list.length) return '<div class="card"><div class="empty">No sessions yet.</div></div>';
    const groups = new Map();
    list.forEach((s) => { const k = C.dayKey(new Date(s.d)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    const today = C.dayKey(new Date()), yest = C.dayKey(C.addDays(new Date(), -1));
    let n = 0;
    return [...groups.entries()].map(([k, ss], gi) => {
      const d = new Date(ss[0].d);
      const name = k === today ? 'Today' : k === yest ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
      return `<div class="day-group" style="--i:${Math.min(gi, 12)}"><div class="day-head"><span>${name}</span><span class="muted">${C.fmtDur(ss.reduce((a, s) => a + s.s, 0))}</span></div><div class="sess-list">${ss.map((s, i) => {
        const st = new Date(s.d), en = new Date(+st + s.s * 1000);
        return `<div class="sess-row with-tree" style="--c:${C.esc(s.c || '#94a3b8')};--i:${i}">
          <span class="thumb">${C.staticTree(C.validTree(s.t), s.s, !!s.w, 'fs' + (n++))}${!s.w && s.x > 1 ? `<b class="tcount">×${s.x}</b>` : ''}</span>
          <span class="nm"><i class="dot"></i>${C.esc(s.n)}${s.w ? '<span class="tag dead">Withered</span>' : ''}${s.k ? `<span class="tag coins"><span class="coin sm"></span>${s.k}</span>` : ''}</span>
          <span class="t">${C.fmtTime(st)} – ${C.fmtTime(en)}</span><span class="d">${C.fmtDur(s.s)}</span></div>`;
      }).join('')}</div></div>`;
    }).join('');
  }
  function tabTrees(f, info) {
    const owned = info.owned || {};
    const all = window.Tree.SPECIES, ord = window.Tree.RARITY_ORDER;
    const got = all.filter((x) => owned[x.id] > 0).length;
    const sorted = all.slice().sort((a, b) => ((owned[b.id] > 0) - (owned[a.id] > 0)) || ord.indexOf(b.rarity) - ord.indexOf(a.rarity));
    return `<div class="card"><div class="card-head"><h3>Collection</h3><span class="muted">${got} of ${all.length} trees${info.opened ? ` · ${info.opened} cases opened` : ''}</span></div>
      <div class="collection">${sorted.map((sp, i) => {
        const r = window.Tree.RARITIES[sp.rarity], n = owned[sp.id] || 0, mine = C.owns(sp.id);
        return `<div class="col-card${n ? '' : ' locked'}" style="--rc:${r.color};--i:${i}">
          <div class="col-img">${C.staticTree(sp.id, 3 * 3600, false, 'fc' + sp.id)}${n ? '' : '<span class="lock">?</span>'}</div>
          <div class="col-name">${C.esc(sp.name)}</div>
          <div class="col-meta"><span class="rar">${r.name}</span>${n > 1 ? `<span class="cnt">×${n}</span>` : ''}${n && !mine ? '<span class="boost">You don\'t have it</span>' : ''}</div></div>`;
      }).join('')}</div></div>`;
  }
  function tabBadges(f, info) {
    const got = info.badges || {};
    const list = C.BADGES;
    const n = list.filter((b) => got[b.id]).length;
    return `<div class="card"><div class="card-head"><h3>Badges</h3><span class="muted">${n} of ${list.length} earned</span></div>
      <div class="badge-grid fr-badges">${list.slice().sort((a, b) => (!!got[b.id] - !!got[a.id])).map((b, i) => `<div class="badge${got[b.id] ? ' earned' : ''} t-${b.tier}" style="--i:${i};--tc:${C.TIERS[b.tier][1]}">
        <div class="badge-art">${C.badgeSvg(b, 'fb' + b.id)}${got[b.id] ? '' : '<span class="badge-lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>'}</div>
        <div class="badge-name">${C.esc(b.name)}</div><div class="badge-desc">${C.esc(b.desc)}</div>
        ${got[b.id] ? `<div class="badge-when">Earned ${new Date(got[b.id]).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</div>` : ''}</div>`).join('')}</div></div>`;
  }
  function tabGrades(f) {
    const g = f.gradeInfo;
    if (!Array.isArray(g)) {
      return `<div class="card fr-locked"><div class="fr-lock-art"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div><h3>${C.esc(shownName(f.name))}'s grades are private</h3><p class="muted">Grades are only shown when someone switches on "Share my grades with friends" on their Friends tab.</p></div>`;
    }
    if (!g.length) return '<div class="card"><div class="empty">They\'re sharing grades, but haven\'t added any yet.</div></div>';
    const cell = (x) => (x && x.p != null ? `<span class="fr-gr"><b>${Math.round(x.p * 10) / 10}%</b>${x.l ? `<span class="gtag" style="--gc:${C.esc(x.c || 'var(--muted)')}">${C.esc(x.l)}</span>` : ''}</span>` : '<span class="muted">–</span>');
    return `<div class="card"><div class="card-head"><h3>Grades</h3><span class="muted">Shared by ${C.esc(shownName(f.name))}</span></div>
      <div class="fr-grades"><div class="fr-gr-row head"><span>Subject</span><span>Sem 1</span><span>Sem 2</span><span>Exams S1</span><span>Exams S2</span></div>
      ${g.map((s, i) => `<div class="fr-gr-row" style="--i:${i};--c:${C.esc(s.c || '#94a3b8')}"><span class="nm"><i class="dot"></i>${C.esc(s.n)}</span>${cell(s.s1)}${cell(s.s2)}${cell(s.e1)}${cell(s.e2)}</div>`).join('')}</div></div>`;
  }

  function tabTogether(f) {
    const st = f.streak, si = streakInfo(f), name = C.esc(shownName(f.name));
    let streakHtml;
    if (!st) {
      const full = activeStreaks().length >= MAX_STREAKS;
      streakHtml = `<div class="fr-streak none"><div class="fr-big-flame off">${flameSvg()}</div><div><h3>Start a streak with ${name}</h3><p class="muted">Each day you <b>both</b> study for at least ${STREAK_MIN / 60} minutes, the streak grows. Keep it going to earn coins and free cases.</p>
        <button class="btn primary" data-s="start"${full ? ' disabled' : ''}>Start a streak</button>${full ? `<p class="muted tiny-note">You can have streaks with up to ${MAX_STREAKS} friends at a time.</p>` : ''}</div></div>`;
    } else if (st.status === 'pending') {
      streakHtml = st.by === F.me
        ? `<div class="fr-streak none"><div class="fr-big-flame off">${flameSvg()}</div><div><h3>Streak invite sent</h3><p class="muted">Waiting for ${name} to accept. It starts the day they do.</p><button class="btn ghost" data-s="end">Cancel invite</button></div></div>`
        : `<div class="fr-streak none invite"><div class="fr-big-flame">${flameSvg()}</div><div><h3>${name} wants to start a streak</h3><p class="muted">Study at least ${STREAK_MIN / 60} minutes each day, both of you, to keep it going.</p><div class="btn-row"><button class="btn ghost" data-s="end">Not now</button><button class="btn primary" data-s="accept"${activeStreaks().filter((x) => x.streak.status === 'active').length >= MAX_STREAKS ? ' disabled' : ''}>Accept</button></div></div></div>`;
    } else {
      const n = si ? si.n : 0;
      const rewards = streakRewardsUpTo(n).filter((r) => r.d <= Math.max(n + 60, 100)).slice(0, 12);
      const next = rewards.find((r) => r.d > n);
      const me = si ? si.todayMe : 0, them = si ? si.todayThem : 0;
      streakHtml = `<div class="fr-streak">
        <div class="fr-big-flame${si && si.todayDone ? ' lit' : n ? '' : ' off'}">${flameSvg()}<b>${n}</b></div>
        <div class="fr-streak-main">
          <h3>${n ? `${n} day streak with ${name}` : `Your streak with ${name} starts today`}</h3>
          <p class="muted">${si && si.todayDone ? 'Today counts! See you tomorrow.' : si && si.atRisk ? 'Study today, both of you, or the streak goes back to 0.' : `Both study ${STREAK_MIN / 60} minutes today to light the flame.`}</p>
          <div class="fr-today-pair">
            <span class="${me >= STREAK_MIN ? 'ok' : ''}">${avatar(D().profile.name, F.me, 'sm')}You · ${C.fmtDur(Math.min(me, 24 * 3600))}${me >= STREAK_MIN ? ' ✓' : ` of ${STREAK_MIN / 60}m`}</span>
            <span class="${them >= STREAK_MIN ? 'ok' : ''}">${avatar(f.name, f.uid, 'sm')}${name} · ${C.fmtDur(them)}${them >= STREAK_MIN ? ' ✓' : ` of ${STREAK_MIN / 60}m`}</span>
          </div>
        </div>
        <button class="btn ghost small fr-end" data-s="end" title="End this streak">End</button>
      </div>
      <div class="fr-milestones">${rewards.map((r, i) => {
        const reached = r.d <= n, claimed = si && si.start && S().claims[streakKey(f, si, r.d)];
        return `<div class="fr-ms${reached ? ' reached' : ''}${claimed ? ' claimed' : ''}" style="--i:${i}"><span class="fr-ms-day">${r.d}d</span><span class="fr-ms-rw">${rewardHtml(r)}</span>${reached && !claimed ? `<button class="btn primary small" data-claim="${r.d}">Claim</button>` : claimed ? '<span class="fr-ms-ok">✓</span>' : ''}</div>`;
      }).join('')}</div>
      ${next ? `<p class="muted tiny-note">${next.d - n} more day${next.d - n === 1 ? '' : 's'} to the next reward.</p>` : ''}`;
    }
    const ts = taskState(f);
    const allowed = teamAllowed(f);
    const days = 7 - ((new Date().getDay() + 6) % 7);
    const tasks = ts ? `<div class="card fr-tasks">
        <div class="card-head"><div><h3>This week's team tasks</h3><span class="muted">New tasks in ${days} day${days === 1 ? '' : 's'}. You each have to do your part.</span></div>
        <div class="fr-bonus${ts.allDone ? ' ready' : ''}${ts.bonusClaimed ? ' claimed' : ''}" title="Finish all three for a bonus">${rewardHtml(TASK_BONUS)}<span>${ts.bonusClaimed ? 'Bonus claimed' : ts.allDone ? '' : 'All 3 bonus'}</span>${ts.allDone && !ts.bonusClaimed && allowed ? '<button class="btn primary small" data-bonus="1">Claim</button>' : ''}</div></div>
        ${!allowed ? `<p class="fr-banner">You've already collected team rewards with ${MAX_TEAMS} friends this week. You can still do these together, but their rewards won't pay out until next week.</p>` : ''}
        ${ts.list.map((x, i) => taskRow(f, x, i, allowed)).join('')}
      </div>` : '';
    return `<div class="card">${streakHtml}</div>${tasks}`;
  }
  function fmtTask(t, v) { return t.kind === 'sec' ? C.fmtDur(v) : String(v); }
  function taskRow(f, x, i, allowed) {
    const t = x.t, name = C.esc(shownName(f.name));
    const pm = t.kind === 'same' ? (x.total / t.goal) * 100 : (Math.min(x.me, t.goal - t.each) / t.goal) * 100;
    const pt = t.kind === 'same' ? 0 : (Math.min(x.them, t.goal - t.each) / t.goal) * 100;
    const eachTxt = t.kind === 'same' ? (t.note || '') : `Each of you: at least ${fmtTask(t, t.each)}${t.note ? `. ${t.note}` : ''}`;
    return `<div class="fr-task${x.done ? ' done' : ''}${x.claimed ? ' claimed' : ''}" style="--i:${i}">
      <div class="fr-task-head"><b>${C.esc(t.title)}</b><span class="fr-task-rw">${rewardHtml(t.reward)}</span></div>
      <div class="fr-task-bar"><i class="me" style="--p:${pm.toFixed(1)}%"></i><i class="them" style="--p:${pt.toFixed(1)}%;--o:${pm.toFixed(1)}%"></i>${t.kind === 'same' ? '' : `<span class="fr-task-mark" style="--m:${((t.each / t.goal) * 100).toFixed(1)}%"></span>`}</div>
      <div class="fr-task-foot">
        ${t.kind === 'same' ? `<span>${x.total} of ${t.goal} days</span>` : `<span class="who me${x.me >= t.each ? ' ok' : ''}"><i></i>You ${fmtTask(t, x.me)}</span><span class="who them${x.them >= t.each ? ' ok' : ''}"><i></i>${name} ${fmtTask(t, x.them)}</span>`}
        <span class="muted">${C.esc(eachTxt)}</span>
        ${x.done && !x.claimed && allowed ? `<button class="btn primary small" data-task="${t.id}">Claim</button>` : x.claimed ? '<span class="fr-ms-ok">✓ Claimed</span>' : ''}
      </div></div>`;
  }
  function wireTogether(f, body) {
    $$('.fr-task-bar i', body).forEach((el) => { el.style.width = '0%'; });
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.fr-task-bar i', body).forEach((el) => { el.style.width = ''; })));
    $$('[data-s]', body).forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.s;
      if (a === 'end' && f.streak && f.streak.status === 'active') {
        const ok = await C.modal({ title: 'End this streak?', body: 'The streak goes back to 0 for both of you. Rewards you already claimed are kept.', actions: [{ label: 'Keep it', ghost: true, value: false }, { label: 'End streak', danger: true, value: true }] });
        if (!ok) return;
      }
      b.disabled = true;
      const pair = f.pair;
      const r = a === 'start' ? await call('startStreak', { friend: f.uid, today: todayKey() })
        : a === 'accept' ? await call('acceptStreak', { pair, today: todayKey() })
          : await call('endStreak', { pair });
      if (!r.ok) { b.disabled = false; return C.toast(r.offline ? "You're offline" : C.esc(r.error)); }
      f.streak = a === 'end' ? null : r.value;
      if (a !== 'end') {
        const bb = b.getBoundingClientRect();
        C.burst(bb.left + bb.width / 2, bb.top, { n: 40, up: true, speed: 7, leaf: false, shape: ['dot', 'star4'], glow: true, colors: ['#fb923c', '#fde047', '#f43f5e', '#ffffff'] });
        C.toast(a === 'start' ? `Streak invite sent to ${C.esc(shownName(f.name))}` : `🔥 Streak started with ${C.esc(shownName(f.name))}`);
      }
      C.updateNavDots();
      paint();
    }));
    $$('[data-claim]', body).forEach((b) => b.addEventListener('click', () => {
      const i = streakInfo(f), d = +b.dataset.claim;
      const r = streakRewardsUpTo(i.n).find((x) => x.d === d);
      if (!r || !i || d > i.n || S().claims[streakKey(f, i, d)]) return;
      S().claims[streakKey(f, i, d)] = new Date().toISOString();
      give(r, b);
      C.checkAchievements();
      setTimeout(() => paintTab(f, 0), 900);
    }));
    $$('[data-task]', body).forEach((b) => b.addEventListener('click', () => {
      const s = taskState(f), x = s && s.list.find((y) => y.t.id === b.dataset.task);
      if (!x || !x.done || x.claimed || !teamAllowed(f)) return;
      S().claims[taskKey(f, x.t)] = new Date().toISOString();
      give(x.t.reward, b);
      C.checkAchievements();
      setTimeout(() => paintTab(f, 0), 900);
    }));
    $$('[data-bonus]', body).forEach((b) => b.addEventListener('click', () => {
      const s = taskState(f);
      if (!s || !s.allDone || s.bonusClaimed || !teamAllowed(f)) return;
      S().claims[bonusKey(f)] = new Date().toISOString();
      give(TASK_BONUS, b);
      C.toast('All three team tasks done this week! Bonus crate added to the Trees page', 3600);
      C.checkAchievements();
      setTimeout(() => paintTab(f, 0), 900);
    }));
  }

  function giftedToday() {
    const g = S().giftLog;
    return g && g.day === todayKey() ? g.spent : 0;
  }
  function tabGift(f) {
    const left = Math.max(0, GIFT_DAY_LIMIT - giftedToday());
    const coins = D().coins;
    const cases = C.CASES.filter((c) => c.price <= 400);
    return `<div class="card fr-gift-tab">
      <div class="card-head"><div><h3>Send ${C.esc(shownName(f.name))} a gift</h3><span class="muted">Gifts come out of your own coins. You can give up to ${GIFT_DAY_LIMIT} coins' worth a day (${left} left today).</span></div></div>
      <h4 class="fr-sub">Coins</h4>
      <div class="fr-gift-opts">${GIFT_COINS.map((n, i) => `<button class="fr-opt" style="--i:${i}" data-coins="${n}"${n > coins || n > left ? ' disabled' : ''}><span class="coin"></span><b>${n}</b></button>`).join('')}</div>
      <h4 class="fr-sub">Cases</h4>
      <div class="fr-gift-opts">${cases.map((c, i) => `<button class="fr-opt case" style="--i:${i + 4};--cc:${c.color}" data-box="${c.id}"${c.price > coins || c.price > left ? ' disabled' : ''}><span class="rw-box"></span><b>${C.esc(c.name)}</b><small><span class="coin sm"></span>${c.price}</small></button>`).join('')}</div>
      <p class="muted tiny-note">You have <span class="coin sm"></span> ${coins.toLocaleString()} coins.</p>
    </div>`;
  }
  function wireGift(f, body) {
    $$('.fr-opt', body).forEach((b) => b.addEventListener('click', async () => {
      const box = b.dataset.box, amount = box ? 0 : +b.dataset.coins;
      const cost = box ? C.CASES.find((c) => c.id === box).price : amount;
      const what = box ? C.caseName(box) : `${amount} coins`;
      if (cost > D().coins) return C.toast('Not enough coins');
      if (cost > GIFT_DAY_LIMIT - giftedToday()) return C.toast(`That's over today's gift limit of ${GIFT_DAY_LIMIT} coins`);
      const ok = await C.modal({ title: `Send ${C.esc(what)}?`, body: `${C.esc(shownName(f.name))} gets ${C.esc(what)}${box ? ` and it costs you ${cost} coins` : ''}. Gifts can't be taken back.`, actions: [{ label: 'Cancel', ghost: true, value: false }, { label: 'Send gift', primary: true, value: true }] });
      if (!ok) return;
      if (cost > D().coins) return;
      // take the coins first; give them back if it doesn't send
      D().coins -= cost;
      S().giftLog = { day: todayKey(), spent: giftedToday() + cost };
      C.save(true); C.renderCoins();
      $$('.fr-opt', body).forEach((x) => { x.disabled = true; });
      const r = await call('sendGift', box ? { to: f.uid, kind: 'case', box, name: myName() } : { to: f.uid, kind: 'coins', amount, name: myName() });
      if (!r.ok) {
        D().coins += cost;
        S().giftLog = { day: todayKey(), spent: Math.max(0, giftedToday() - cost) };
        C.save(true); C.renderCoins();
        C.toast(r.offline ? "You're offline. Your coins weren't spent" : `Couldn't send it: ${C.esc(r.error)}. Your coins weren't spent`, 4000);
        return paintTab(f, 0);
      }
      sendAnim(b);
      C.toast(`🎁 Sent ${C.esc(what)} to ${C.esc(shownName(f.name))}`);
      schedulePublish();
      setTimeout(() => paintTab(f, 0), 1100);
    }));
  }
  function sendAnim(from) {
    const r = from.getBoundingClientRect();
    const g = document.createElement('div');
    g.className = 'flying-gift send';
    g.style.setProperty('--cc', '#f472b6');
    g.style.left = r.left + r.width / 2 - 14 + 'px'; g.style.top = r.top + 'px';
    document.body.appendChild(g);
    requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transform = `translate(${innerWidth * 0.3}px, -${r.top + 80}px) scale(.5) rotate(30deg)`; g.style.opacity = '0'; }));
    C.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 26, up: true, speed: 6, leaf: false, shape: ['star4', 'dot'], glow: true, colors: ['#f472b6', '#fde047', '#ffffff'] });
    setTimeout(() => g.remove(), 1000);
  }

  function copyCode() {
    if (!F.code) return;
    const el = $('#fr-code');
    const done = () => { C.toast(`Copied your code ${F.code}`); el.classList.remove('copied'); void el.offsetWidth; el.classList.add('copied'); };
    try { navigator.clipboard.writeText(F.code).then(done, () => C.toast(`Your code is ${F.code}`)); } catch (e) { C.toast(`Your code is ${F.code}`); }
  }

  window.Friends = {
    init(ctx) { C = ctx; const el = $('#fr-code'); if (el) el.addEventListener('click', copyCode); },
    start, render, free, refresh, cleanName, isBadName, badgeMetrics, pending,
    changed: () => schedulePublish(),
    // the timer started, paused or stopped: tell friends soon, not in 2 minutes
    live: () => schedulePublish(1500),
    get state() { return F; },
  };
})();
