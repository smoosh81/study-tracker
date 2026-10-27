/* Study Tracker: admin panel (ban people, take entries off the global leaderboard).
   Opened from Settings (or Ctrl+Shift+A). It needs an admin email and password made in the
   Firebase console: the password is checked by Google, not by this app, and nothing about it is
   stored. What an admin can do is enforced by the server rules (isAdmin in firestore.rules), so
   this panel is only a front end. Without a real admin sign-in every button here is refused. */
(function () {
  'use strict';
  let C = null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const call = (op, args) => window.api.social(op, args);
  const A = { open: false, who: null, tab: 'board', busy: false };
  const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
  const txt = (v, n = 40) => (typeof v === 'string' ? v.slice(0, n) : '');
  const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
  const week = () => C.dayKey(C.startOfWeek(new Date()));
  const hrs = (sec) => `${(sec / 3600).toFixed(1)} h`;
  const when = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '–'; };
  const short = (uid) => `${uid.slice(0, 6)}…${uid.slice(-4)}`;

  function host() {
    let el = $('#admin-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'admin-overlay';
      document.body.appendChild(el);
    }
    return el;
  }
  function open() {
    if (A.open) return;
    A.open = true;
    const el = host();
    el.className = 'adm-in';
    paint();
    document.addEventListener('keydown', onKey);
  }
  async function close() {
    if (!A.open) return;
    A.open = false;
    document.removeEventListener('keydown', onKey);
    // signing out when the panel closes means nobody can walk up and use it later
    if (A.who) { A.who = null; call('adminSignOut'); }
    const el = host();
    el.className = 'adm-out';
    setTimeout(() => { if (!A.open) { el.className = 'hidden'; el.replaceChildren(); } }, 320);
  }
  const onKey = (e) => { if (e.key === 'Escape' && !$('.modal-back')) close(); };

  function shell(inner) {
    return `<div class="adm-panel">
      <div class="adm-head">
        <div class="adm-title"><span class="adm-shield"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></span><div><h2>Admin panel</h2><span class="muted">${A.who ? `Signed in as ${C.esc(A.who.email)}` : 'Sign in with your admin account'}</span></div></div>
        <div class="btn-row">${A.who ? '<button class="btn ghost small" id="adm-out">Sign out</button>' : ''}<button class="icon-btn" id="adm-close" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      </div>
      ${inner}
    </div>`;
  }
  function paint() {
    const el = host();
    if (!A.who) {
      el.innerHTML = shell(`<form class="adm-login" id="adm-login" autocomplete="off">
          <p class="muted">Only the admin account from the Firebase console can sign in here. Bans are checked by the server, not by this app.</p>
          <label>Email<input class="input" id="adm-email" type="email" maxlength="200" spellcheck="false" required></label>
          <label>Password<input class="input" id="adm-pass" type="password" maxlength="200" required></label>
          <p class="adm-msg" id="adm-msg"></p>
          <button class="btn primary" id="adm-go" type="submit">Sign in</button>
        </form>`);
      wireShell(el);
      const form = $('#adm-login', el);
      setTimeout(() => $('#adm-email', el).focus(), 60);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (A.busy) return;
        const msg = $('#adm-msg', el), btn = $('#adm-go', el);
        A.busy = true; btn.disabled = true; msg.className = 'adm-msg'; msg.textContent = 'Checking…';
        const r = await call('adminSignIn', { email: $('#adm-email', el).value, password: $('#adm-pass', el).value });
        A.busy = false;
        if (!A.open) return;
        $('#adm-pass', el).value = '';
        if (!r.ok) {
          btn.disabled = false;
          msg.className = 'adm-msg warn';
          msg.textContent = r.offline ? "You're offline" : r.error === 'not-configured' ? "Friends aren't switched on in this version" : r.error;
          const f = $('.adm-login', el); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
          return;
        }
        A.who = { email: txt(r.value.email, 200) };
        A.tab = 'board';
        paint();
      });
      return;
    }
    el.innerHTML = shell(`<div class="seg adm-tabs" id="adm-tabs"><div class="seg-pill"></div>
        <button data-t="board" class="${A.tab === 'board' ? 'active' : ''}">Leaderboard</button>
        <button data-t="find" class="${A.tab === 'find' ? 'active' : ''}">Find someone</button>
        <button data-t="bans" class="${A.tab === 'bans' ? 'active' : ''}">Banned</button></div>
      <div class="adm-body" id="adm-body"></div>`);
    wireShell(el);
    $$('#adm-tabs button', el).forEach((b) => b.addEventListener('click', () => {
      if (A.tab === b.dataset.t) return;
      A.tab = b.dataset.t;
      $$('#adm-tabs button', el).forEach((x) => x.classList.toggle('active', x === b));
      C.positionSegs();
      body();
    }));
    requestAnimationFrame(C.positionSegs);
    body();
  }
  function wireShell(el) {
    $('#adm-close', el).addEventListener('click', close);
    const out = $('#adm-out', el);
    if (out) out.addEventListener('click', () => { A.who = null; call('adminSignOut'); paint(); });
  }
  function fail(r) {
    if (r.status === 401) { A.who = null; paint(); return C.toast('Please sign in again'); }
    C.toast(r.offline ? "You're offline" : C.esc(r.error || 'That didn\'t work'));
  }
  async function body() {
    const b = $('#adm-body');
    if (!b) return;
    b.classList.remove('adm-swap'); void b.offsetWidth; b.classList.add('adm-swap');
    if (A.tab === 'board') {
      b.innerHTML = '<div class="adm-loading">Loading this week\'s leaderboard…</div>';
      const r = await call('adminBoard', { week: week() });
      if (A.tab !== 'board' || !$('#adm-body')) return;
      if (!r.ok) { b.innerHTML = ''; return fail(r); }
      const rows = (Array.isArray(r.value) ? r.value : []).filter((x) => x && SAFE_ID.test(x.uid));
      b.innerHTML = rows.length ? `<div class="adm-list">${rows.map((x, i) => `<div class="adm-row" style="--i:${Math.min(i, 20)}" data-uid="${x.uid}">
          <span class="adm-rank">${i + 1}</span><span class="adm-name"><b>${C.esc(txt(x.name, 40) || '(no name)')}</b><small>${short(x.uid)}</small></span>
          <span class="adm-h">${hrs(int(x.sec))}</span>
          <button class="btn ghost small" data-a="off">Remove from board</button><button class="btn danger small" data-a="ban">Ban</button></div>`).join('')}</div>`
        : '<div class="empty">No one on the leaderboard this week yet.</div>';
      $$('.adm-row', b).forEach((row) => {
        const x = rows.find((y) => y.uid === row.dataset.uid);
        $('[data-a="off"]', row).addEventListener('click', async () => {
          const r2 = await call('adminRemoveBoard', { uid: x.uid, week: week() });
          if (!r2.ok) return fail(r2);
          C.toast(`${C.esc(txt(x.name) || 'They')} taken off this week's leaderboard`);
          gone(row);
        });
        $('[data-a="ban"]', row).addEventListener('click', () => ban(x.uid, txt(x.name), () => gone(row)));
      });
    } else if (A.tab === 'find') {
      b.innerHTML = `<div class="adm-find"><div class="add-row"><input class="input" id="adm-code" maxlength="4" placeholder="Friend code, e.g. KRTM" spellcheck="false"><button class="btn primary" id="adm-look">Look up</button></div><div id="adm-found"></div></div>`;
      const inp = $('#adm-code', b);
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^a-z]/gi, '').toUpperCase(); });
      const go = async () => {
        const code = inp.value;
        if (code.length !== 4) return;
        const out = $('#adm-found', b);
        out.innerHTML = '<div class="adm-loading">Looking…</div>';
        const r = await call('adminFind', { code });
        if (!r.ok) { out.innerHTML = ''; return fail(r); }
        if (!r.value) { out.innerHTML = '<div class="empty">No one has that code.</div>'; return; }
        person(out, r.value);
      };
      $('#adm-look', b).addEventListener('click', go);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      setTimeout(() => inp.focus(), 60);
    } else {
      b.innerHTML = '<div class="adm-loading">Loading bans…</div>';
      const r = await call('adminBans');
      if (A.tab !== 'bans' || !$('#adm-body')) return;
      if (!r.ok) { b.innerHTML = ''; return fail(r); }
      const rows = (Array.isArray(r.value) ? r.value : []).filter((x) => x && SAFE_ID.test(x.uid));
      b.innerHTML = rows.length ? `<div class="adm-list">${rows.map((x, i) => `<div class="adm-row" style="--i:${Math.min(i, 20)}" data-uid="${x.uid}">
          <span class="adm-name"><b>${C.esc(txt(x.name) || '(no name)')}</b><small>${C.esc(txt(x.code, 4) || 'no code')} · ${short(x.uid)} · banned ${C.esc(when(x.at))}</small>${x.reason ? `<small class="adm-reason">${C.esc(txt(x.reason, 200))}</small>` : ''}</span>
          <button class="btn small" data-a="unban">Unban</button></div>`).join('')}</div>`
        : '<div class="empty">No one is banned.</div>';
      $$('.adm-row', b).forEach((row) => $('[data-a="unban"]', row).addEventListener('click', async () => {
        const r2 = await call('adminUnban', { uid: row.dataset.uid });
        if (!r2.ok) return fail(r2);
        C.toast('Unbanned. They get a new friend code the next time they open the app');
        gone(row);
      }));
    }
  }
  function person(out, p) {
    if (!p || !SAFE_ID.test(p.uid)) { out.innerHTML = ''; return; }
    out.innerHTML = `<div class="adm-person">
        <div><b>${C.esc(txt(p.name) || '(no name)')}</b><small>${C.esc(txt(p.code, 4) || '')} · ${short(p.uid)}</small></div>
        <div class="adm-facts"><span>Last online <b>${C.esc(when(p.updated))}</b></span><span>Friends listed <b>${int(p.friends)}</b></span><span>Status <b class="${p.banned ? 'warn' : ''}">${p.banned ? 'Banned' : 'Active'}</b></span></div>
        ${p.banned && p.reason ? `<p class="muted">Reason: ${C.esc(txt(p.reason, 200))}</p>` : ''}
        <div class="btn-row">${p.banned ? '<button class="btn" data-a="unban">Unban</button>' : '<button class="btn danger" data-a="ban">Ban</button>'}</div>
      </div>`;
    const btn = $('[data-a]', out);
    btn.addEventListener('click', async () => {
      if (btn.dataset.a === 'ban') return ban(p.uid, txt(p.name), () => person(out, Object.assign({}, p, { banned: true })));
      const r = await call('adminUnban', { uid: p.uid });
      if (!r.ok) return fail(r);
      C.toast('Unbanned');
      person(out, Object.assign({}, p, { banned: false, reason: '' }));
    });
  }
  async function ban(uid, name, done) {
    A.lastReason = '';
    const r = await C.modal({
      title: `Ban ${C.esc(name || 'this person')}?`,
      body: "They're taken off the leaderboard, their profile and friend code are deleted, and the server stops their account from writing anything. You can unban them later.",
      extra: '<input class="input adm-reason-in" maxlength="200" placeholder="Reason (only admins see this)">',
      actions: [{ label: 'Cancel', ghost: true, value: false }, { label: 'Ban', danger: true, value: true }],
    });
    const reason = A.lastReason || '';
    if (!r || !r.v) return;
    const res = await call('adminBan', { uid, reason, week: week() });
    if (!res.ok) return fail(res);
    C.toast(`${C.esc(name || 'They')} banned`);
    if (done) done();
  }
  function gone(row) {
    row.style.height = row.offsetHeight + 'px';
    row.classList.add('removing');
    setTimeout(() => row.remove(), 420);
  }
  // the reason box is read as it's typed, since the modal removes itself when it closes
  document.addEventListener('input', (e) => { if (e.target && e.target.classList && e.target.classList.contains('adm-reason-in')) A.lastReason = e.target.value.slice(0, 200); });

  window.Admin = {
    init(ctx) {
      C = ctx;
      document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); open(); } });
    },
    open,
    close,
  };
})();
