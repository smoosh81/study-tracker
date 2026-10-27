// Friends: talks to the shared online server (Google Firebase: anonymous sign-in + Firestore over REST).
// Runs in the main process. Nothing here touches the save file: the app works the same offline,
// and friends simply load when there's a connection.
//
// Server layout (rules in firestore.rules):
//   codes/{CODE}                 { uid, name }                 4-letter friend code -> account
//   profiles/{uid}               { name, code, friends[], data, grades?, updated }   readable by friends only
//   inbox/{uid}/items/{id}       friend requests and gifts sent to uid
//   streaks/{uidA_uidB}          { members[], by, status, since, updated }
//   boards/{week}/people/{uid}   { name, pic, sec, at }         global leaderboard, public
//   bans/{uid}                   { name, code, reason, at }     written by admins only
const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Codes use consonants only, so they can never spell a word.
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

let cfg = null;
function config() {
  if (cfg) return cfg;
  let c = {};
  try { c = JSON.parse(fs.readFileSync(path.join(__dirname, 'social-config.json'), 'utf8')); } catch (e) {}
  // for local testing against the Firebase emulator
  if (process.env.STUDY_SOCIAL_EMULATOR) c = { apiKey: 'test-key', projectId: process.env.STUDY_SOCIAL_PROJECT || 'demo-study', emulator: process.env.STUDY_SOCIAL_EMULATOR };
  cfg = c;
  return cfg;
}
const configured = () => !!(config().apiKey && config().projectId);

const ACCOUNT_NAME = process.env.STUDY_SOCIAL_ACCOUNT_FILE || 'friends-account.json';
const ACCOUNT_FILE = () => path.join(app.getPath('userData'), ACCOUNT_NAME);
let account = null; // { uid, refreshToken, code }
let token = null, tokenExp = 0;
function loadAccount() {
  if (account) return account;
  try { account = JSON.parse(fs.readFileSync(ACCOUNT_FILE(), 'utf8')); } catch (e) { account = {}; }
  return account;
}
function saveAccount() {
  try { fs.mkdirSync(path.dirname(ACCOUNT_FILE()), { recursive: true }); fs.writeFileSync(ACCOUNT_FILE(), JSON.stringify(account)); } catch (e) {}
}

// ---------- http ----------
function urls() {
  const c = config();
  if (c.emulator) {
    const [fs_, auth] = c.emulator.split(',');
    return {
      auth: `http://${auth}/identitytoolkit.googleapis.com/v1`,
      token: `http://${auth}/securetoken.googleapis.com/v1/token`,
      db: `http://${fs_}/v1/projects/${c.projectId}/databases/(default)/documents`,
    };
  }
  return {
    auth: 'https://identitytoolkit.googleapis.com/v1',
    token: 'https://securetoken.googleapis.com/v1/token',
    db: `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/(default)/documents`,
  };
}
class SocialError extends Error {
  constructor(msg, status, offline) { super(msg); this.status = status; this.offline = !!offline; }
}
async function http(method, url, body, headers = {}) {
  let res;
  try {
    const opts = { method, headers: Object.assign({}, headers), cache: 'no-store' };
    if (body !== undefined) {
      if (typeof body === 'string') opts.body = body;
      else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    }
    const f = net && net.fetch ? net.fetch : fetch;
    res = await Promise.race([
      f(url, opts),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ]);
  } catch (e) {
    throw new SocialError('No connection', 0, true);
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) {
    const msg = (json && json.error && (json.error.message || json.error.status)) || `HTTP ${res.status}`;
    throw new SocialError(msg, res.status, res.status >= 500);
  }
  return json;
}

// ---------- auth (anonymous accounts) ----------
let tokening = null;
function idToken() {
  if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
  if (!tokening) tokening = idTokenNow().finally(() => { tokening = null; });
  return tokening;
}
async function idTokenNow() {
  const c = config(), u = urls();
  loadAccount();
  if (account.refreshToken) {
    try {
      const r = await http('POST', `${u.token}?key=${c.apiKey}`, `grant_type=refresh_token&refresh_token=${encodeURIComponent(account.refreshToken)}`, { 'Content-Type': 'application/x-www-form-urlencoded' });
      token = r.id_token; tokenExp = Date.now() + (+r.expires_in || 3600) * 1000;
      if (r.refresh_token && r.refresh_token !== account.refreshToken) { account.refreshToken = r.refresh_token; saveAccount(); }
      return token;
    } catch (e) {
      if (e.offline) throw e;
      // the account is gone (deleted from the console?): make a fresh one below
      account = {};
    }
  }
  const r = await http('POST', `${u.auth}/accounts:signUp?key=${c.apiKey}`, { returnSecureToken: true });
  account = { uid: r.localId, refreshToken: r.refreshToken };
  saveAccount();
  token = r.idToken; tokenExp = Date.now() + (+r.expiresIn || 3600) * 1000;
  return token;
}

// ---------- firestore values ----------
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) f[k] = toValue(v);
  return f;
}
function fromValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return +v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f || {})) o[k] = fromValue(v);
  return o;
}
const docName = (p) => `projects/${config().projectId}/databases/(default)/documents/${p}`;

async function authed(method, url, body) {
  const t = await idToken();
  return http(method, url, body, { Authorization: `Bearer ${t}` });
}
async function getDoc(p) {
  try {
    const r = await authed('GET', `${urls().db}/${p}`);
    return fromFields(r.fields);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}
// The server's clock, learned from each write, so time limits don't depend on this PC's clock.
let clockSkew = 0;
const serverNow = () => Date.now() + clockSkew;
function learnClock(r) {
  const t = r && r.commitTime ? Date.parse(r.commitTime) : NaN;
  if (Number.isFinite(t)) clockSkew = t - Date.now();
  return t;
}
async function commit(writes) {
  const r = await authed('POST', `${urls().db}:commit`, { writes });
  learnClock(r);
  return r;
}
// several documents in one request (each still counts as one read)
async function batchGet(paths, auth = authed, fields) {
  const out = {};
  if (!paths.length) return out;
  const body = { documents: paths.map(docName) };
  if (fields) body.mask = { fieldPaths: fields };
  const r = await auth('POST', `${urls().db}:batchGet`, body);
  // keyed by the path asked for, e.g. out['profiles/abc']
  const rel = (name) => String(name).split('/documents/').slice(1).join('/documents/');
  (Array.isArray(r) ? r : []).forEach((x) => {
    if (x.found) out[rel(x.found.name)] = fromFields(x.found.fields);
    else if (x.missing) out[rel(x.missing)] = null;
  });
  return out;
}
// the top of a collection, biggest `field` first
async function topOf(parent, collection, field, limit, auth = authed) {
  const r = await auth('POST', `${urls().db}/${parent}:runQuery`, {
    structuredQuery: { from: [{ collectionId: collection }], orderBy: [{ field: { fieldPath: field }, direction: 'DESCENDING' }], limit },
  });
  return (Array.isArray(r) ? r : []).filter((x) => x && x.document).map((x) => Object.assign({ id: x.document.name.split('/').pop() }, fromFields(x.document.fields)));
}
const serverTime = (field) => ({ fieldPath: field, setToServerValue: 'REQUEST_TIME' });
const updateWrite = (p, obj, opts = {}) => {
  const w = { update: { name: docName(p), fields: toFields(obj) } };
  if (opts.merge) w.updateMask = { fieldPaths: Object.keys(obj).map((k) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ? k : '`' + k + '`')) };
  if (opts.exists !== undefined) w.currentDocument = { exists: opts.exists };
  return w;
};
async function listDocs(p, auth = authed) {
  const out = [];
  let pageToken = '';
  do {
    const r = await auth('GET', `${urls().db}/${p}?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    (r && r.documents || []).forEach((d) => out.push(Object.assign({ id: d.name.split('/').pop() }, fromFields(d.fields))));
    pageToken = r && r.nextPageToken;
  } while (pageToken);
  return out;
}

// ---------- admin sign-in (memory only) ----------
let admin = null; // { uid, email, token, refresh, exp }
const adminLock = { fails: 0, until: 0 };
async function adminAuthed(method, url, body) {
  if (!admin) throw new SocialError('Sign in to the admin panel again', 401);
  if (Date.now() > admin.exp - 60000) {
    const c = config(), u = urls();
    const r = await http('POST', `${u.token}?key=${c.apiKey}`, `grant_type=refresh_token&refresh_token=${encodeURIComponent(admin.refresh)}`, { 'Content-Type': 'application/x-www-form-urlencoded' });
    admin.token = r.id_token; admin.refresh = r.refresh_token || admin.refresh; admin.exp = Date.now() + (+r.expires_in || 3600) * 1000;
  }
  return http(method, url, body, { Authorization: `Bearer ${admin.token}` });
}

// ---------- operations ----------
let oldRules = false; // the server rules are older than 1.18 (no live/wk fields yet)
let boardLast = null; // my last leaderboard entry: { week, sec, name, pic, at } (server time)
let myProfile = null; // last copy of profiles/{me}
function randomCode() {
  const b = crypto.randomBytes(4);
  return Array.from(b, (x) => CODE_LETTERS[x % CODE_LETTERS.length]).join('');
}
// one at a time, so two calls at startup can't both try to create the profile and claim codes
let ensuring = null;
function ensureProfile(name) {
  if (!ensuring) ensuring = ensureProfileNow(name).finally(() => { ensuring = null; });
  return ensuring;
}
async function ensureProfileNow(name) {
  await idToken();
  const uid = account.uid;
  if (!myProfile) myProfile = await getDoc(`profiles/${uid}`);
  if (!myProfile) {
    myProfile = { name: name || '', friends: [], updated: new Date().toISOString() };
    await commit([updateWrite(`profiles/${uid}`, myProfile, { exists: false })]).catch(async (e) => {
      if (e.status === 409 || /exist/i.test(e.message)) myProfile = await getDoc(`profiles/${uid}`);
      else throw e;
    });
  }
  if (!myProfile.code) {
    // claim a free code: the code doc and the profile are written together, so two people can't share one
    for (let tries = 0; tries < 12 && !myProfile.code; tries++) {
      const code = randomCode();
      try {
        await commit([
          updateWrite(`codes/${code}`, { uid, name: name || myProfile.name || '' }, { exists: false }),
          updateWrite(`profiles/${uid}`, { code }, { merge: true }),
        ]);
        myProfile.code = code;
      } catch (e) {
        if (e.offline) throw e;
        if (!(e.status === 409 || e.status === 400 || e.status === 403 || /exist/i.test(e.message))) throw e;
      }
    }
    if (!myProfile.code) throw new SocialError("Couldn't get a friend code. Try again later", 500);
  }
  account.code = myProfile.code;
  saveAccount();
  return myProfile;
}

const ops = {
  async status() {
    loadAccount();
    return { configured: configured(), uid: account.uid || null, code: account.code || null };
  },
  // sign in (creating the account the first time), make sure there's a code, and publish this profile
  // `live` (what I'm studying right now) and `wk` (this week's and today's hours) are small copies
  // kept outside `data`, so friends can check them every 30 seconds without downloading everything
  async publish({ name, data, grades, live, wk }) {
    const p = await ensureProfile(name);
    const uid = account.uid;
    const fields = { name: name || '', data: data || '', live: live || '', wk: wk || '', updated: new Date().toISOString() };
    const writes = [];
    // grades are only on the server while sharing is switched on
    if (grades) fields.grades = grades;
    const w = updateWrite(`profiles/${uid}`, fields, { merge: true });
    if (!grades) w.updateMask.fieldPaths.push('grades'); // in the mask but not in the fields = deleted
    writes.push(w);
    if (p.name !== (name || '')) writes.push(updateWrite(`codes/${p.code}`, { uid, name: name || '' }, { merge: true }));
    if (oldRules) { delete fields.live; delete fields.wk; w.update.fields = toFields(fields); w.updateMask.fieldPaths = w.updateMask.fieldPaths.filter((f) => f !== 'live' && f !== 'wk'); }
    try { await commit(writes); } catch (e) {
      // server rules from before 1.18 don't know the small live/week fields: send without them
      if (e.status !== 403 || oldRules) throw e;
      oldRules = true;
      return ops.publish({ name, data, grades, live, wk });
    }
    Object.assign(myProfile, fields);
    if (!grades) delete myProfile.grades;
    return { uid, code: p.code, friends: p.friends || [] };
  },
  // "I'm online": only bumps the profile's updated time (one small write every couple of minutes)
  async ping() {
    loadAccount();
    if (!account.uid || !account.code) return false;
    await commit([updateWrite(`profiles/${account.uid}`, { updated: new Date().toISOString() }, { merge: true, exists: true })]);
    return true;
  },
  // everything the Friends page needs in one go
  async refresh({ name }) {
    const p = await ensureProfile(name);
    const uid = account.uid;
    const fresh = await getDoc(`profiles/${uid}`);
    if (fresh) myProfile = fresh;
    const friendIds = (myProfile.friends || []).slice(0, 200);
    const inbox = await listDocs(`inbox/${uid}/items`);
    const friends = await Promise.all(friendIds.map(async (fid) => {
      const pair = [uid, fid].sort().join('_');
      let prof = null, mutual = false, gone = false;
      try {
        prof = await getDoc(`profiles/${fid}`);
        gone = prof === null; // the account was deleted or banned
        mutual = !!(prof && (prof.friends || []).includes(uid));
      } catch (e) {
        if (e.offline) throw e;
        // they haven't added us back yet: their profile stays private
      }
      let streak = null;
      if (mutual) {
        try { streak = await getDoc(`streaks/${pair}`); } catch (e) { if (e.offline) throw e; }
      }
      return { uid: fid, pair, mutual, gone, name: prof ? prof.name : null, code: prof ? prof.code : null, data: prof ? prof.data : null, grades: prof ? prof.grades || null : null, updated: prof ? prof.updated : null, live: prof ? prof.live : null, wk: prof ? prof.wk : null, streak };
    }));
    return { uid, code: p.code, friends, inbox };
  },
  async lookup({ code }) {
    code = String(code || '').toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) return null;
    await idToken();
    const c = await getDoc(`codes/${code}`);
    return c ? { uid: c.uid, name: c.name, code } : null;
  },
  // add someone by their code: they go on my list, and they get a request to add me back
  async addFriend({ code, name }) {
    const p = await ensureProfile(name);
    const uid = account.uid;
    code = String(code || '').toUpperCase();
    if (code === p.code) throw new SocialError("That's your own code", 400);
    const c = await getDoc(`codes/${code}`);
    if (!c) throw new SocialError('No one has that code', 404);
    const friends = Array.from(new Set((myProfile.friends || []).concat(c.uid)));
    const writes = [updateWrite(`profiles/${uid}`, { friends }, { merge: true })];
    await commit(writes);
    myProfile.friends = friends;
    // the request may already be waiting from earlier; that's fine
    try {
      await commit([updateWrite(`inbox/${c.uid}/items/req_${uid}`, { type: 'request', from: uid, name: name || '', code: p.code, at: new Date().toISOString() }, { exists: false })]);
    } catch (e) { if (e.offline) throw e; }
    return { uid: c.uid, name: c.name, code };
  },
  async acceptRequest({ from, id, name }) {
    await ensureProfile(name);
    const uid = account.uid;
    const friends = Array.from(new Set((myProfile.friends || []).concat(from)));
    await commit([
      updateWrite(`profiles/${uid}`, { friends }, { merge: true }),
      { delete: docName(`inbox/${uid}/items/${id}`) },
    ]);
    myProfile.friends = friends;
    return true;
  },
  async dismiss({ id }) {
    await idToken();
    await commit([{ delete: docName(`inbox/${account.uid}/items/${id}`) }]);
    return true;
  },
  async removeFriend({ uid: fid, name }) {
    await ensureProfile(name);
    const uid = account.uid;
    const friends = (myProfile.friends || []).filter((x) => x !== fid);
    const pair = [uid, fid].sort().join('_');
    await commit([updateWrite(`profiles/${uid}`, { friends }, { merge: true })]);
    myProfile.friends = friends;
    try { await commit([{ delete: docName(`streaks/${pair}`) }]); } catch (e) { /* no streak, or not allowed */ }
    return true;
  },
  // Gifts. Taking the gift deletes it first (only one delete can succeed), so it can't be claimed twice.
  async sendGift({ to, kind, amount, box, name }) {
    await ensureProfile(name);
    const uid = account.uid;
    const id = 'gift_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const doc = { type: 'gift', from: uid, name: name || '', kind, at: new Date().toISOString() };
    if (kind === 'coins') doc.amount = Math.floor(amount); else doc.box = box;
    await commit([updateWrite(`inbox/${to}/items/${id}`, doc, { exists: false })]);
    return { id };
  },
  async takeGift({ id }) {
    await idToken();
    await commit([{ delete: docName(`inbox/${account.uid}/items/${id}`), currentDocument: { exists: true } }]);
    return true;
  },
  // Streaks: one shared doc per pair. Whoever starts it invites, the other accepts.
  async startStreak({ friend, today }) {
    await idToken();
    const uid = account.uid;
    const members = [uid, friend].sort();
    const pair = members.join('_');
    await commit([updateWrite(`streaks/${pair}`, { members, by: uid, status: 'pending', since: today, updated: new Date().toISOString() }, { exists: false })]);
    return getDoc(`streaks/${pair}`);
  },
  async acceptStreak({ pair, today }) {
    await idToken();
    await commit([updateWrite(`streaks/${pair}`, { status: 'active', since: today, updated: new Date().toISOString() }, { merge: true, exists: true })]);
    return getDoc(`streaks/${pair}`);
  },
  // a broken streak starts again from today
  async restartStreak({ pair, today }) {
    await idToken();
    await commit([updateWrite(`streaks/${pair}`, { since: today, updated: new Date().toISOString() }, { merge: true, exists: true })]);
    return getDoc(`streaks/${pair}`);
  },
  async endStreak({ pair }) {
    await idToken();
    await commit([{ delete: docName(`streaks/${pair}`) }]);
    return true;
  },
  // Friends' profiles only, in one request: keeps online dots, live study time and the
  // leaderboard fresh while the Friends tab is open. Only for friends who added me back
  // (anyone else's profile is private, and one refusal fails the whole request).
  async pulse({ uids }) {
    await idToken();
    const me = account.uid;
    const got = await batchGet(uids.map((u) => `profiles/${u}`), authed, ['name', 'friends', 'updated', 'live', 'wk']);
    return uids.map((u) => {
      const p = got[`profiles/${u}`];
      return { uid: u, gone: p === null, mutual: !!(p && (p.friends || []).includes(me)), name: p ? p.name : null, updated: p ? p.updated : null, live: p ? p.live : null, wk: p ? p.wk : null };
    });
  },
  // ---- global leaderboard ----
  // My entry for this week. The rules only let hours grow as fast as real time passes, so this
  // sends no more than that (anything left over goes up with the next update).
  async board({ week, sec, name, pic, hide }) {
    loadAccount();
    if (!account.uid || !account.code) return false;
    await idToken();
    const p = `boards/${week}/people/${account.uid}`;
    if (hide) {
      if (boardLast && boardLast.week === week && boardLast.hidden) return true;
      await commit([{ delete: docName(p) }]);
      boardLast = { week, hidden: true };
      return true;
    }
    if (!boardLast || boardLast.week !== week || boardLast.hidden) {
      const cur = await getDoc(p);
      boardLast = cur && Number.isFinite(Date.parse(cur.at)) ? { week, sec: Math.floor(+cur.sec || 0), name: cur.name, pic: cur.pic, at: Date.parse(cur.at) } : { week, sec: null };
    }
    const now = serverNow();
    const cap = boardLast.sec == null
      ? Math.floor((now - Date.parse(`${week}T00:00:00Z`)) / 1000) + 12 * 3600
      : boardLast.sec + Math.floor((now - boardLast.at) / 1000) + 300;
    const send = Math.max(0, Math.min(sec, cap, 604800));
    if (boardLast.sec === send && boardLast.name === name && boardLast.pic === pic) return { sent: send };
    const w = updateWrite(p, { name, pic, sec: send });
    w.updateTransforms = [serverTime('at')];
    let t;
    try { t = learnClock(await authed('POST', `${urls().db}:commit`, { writes: [w] })); } catch (e) {
      boardLast = null; // read it again next time
      throw e;
    }
    boardLast = { week, sec: send, name, pic, at: Number.isFinite(t) ? t : serverNow() };
    return { sent: send };
  },
  async boardTop({ week }) {
    await idToken();
    const rows = await topOf(`boards/${week}`, 'people', 'sec', 50);
    return rows.map((r) => ({ uid: r.id, name: r.name, pic: r.pic, sec: r.sec }));
  },
  // is this account banned? (only asked after the server turns a write down)
  async banned() {
    loadAccount();
    if (!account.uid) return false;
    await idToken();
    try { return !!(await getDoc(`bans/${account.uid}`)); } catch (e) { if (e.offline) throw e; return false; }
  },

  // ---- admin ----
  // Admins sign in with an email and password made in the Firebase console. The password is
  // checked by Google, never stored here, and the sign-in only lives in memory until the panel
  // closes. What an admin may do is decided by the server rules (isAdmin), not by this app.
  async adminSignIn({ email, password }) {
    if (Date.now() < adminLock.until) throw new SocialError(`Too many tries. Wait ${Math.ceil((adminLock.until - Date.now()) / 1000)} seconds`, 429);
    const c = config(), u = urls();
    let r;
    try {
      r = await http('POST', `${u.auth}/accounts:signInWithPassword?key=${c.apiKey}`, { email, password, returnSecureToken: true });
    } catch (e) {
      if (e.offline) throw e;
      adminLock.fails++;
      if (adminLock.fails >= 5) { adminLock.until = Date.now() + 60000 * Math.min(10, adminLock.fails - 4); }
      const m = String(e.message || '');
      throw new SocialError(/OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED/.test(m) ? 'Email sign-in is switched off in the Firebase console'
        : /TOO_MANY/.test(m) ? 'Too many tries. Try again later' : 'Wrong email or password', 401);
    }
    admin = { uid: r.localId, email: r.email, token: r.idToken, refresh: r.refreshToken, exp: Date.now() + (+r.expiresIn || 3600) * 1000 };
    // the rules decide: only an admin may list bans
    try { await adminAuthed('GET', `${u.db}/bans?pageSize=1`); } catch (e) {
      const uid = admin.uid;
      admin = null;
      if (e.status === 403) throw new SocialError(`Signed in, but this account isn't an admin yet. Put its UID (${uid}) in the Firestore rules`, 403);
      throw e;
    }
    adminLock.fails = 0;
    return { email: admin.email, uid: admin.uid };
  },
  async adminSignOut() { admin = null; return true; },
  async adminBoard({ week }) {
    const rows = await topOf(`boards/${week}`, 'people', 'sec', 100, adminAuthed);
    return rows.map((r) => ({ uid: r.id, name: r.name, pic: r.pic, sec: r.sec }));
  },
  async adminFind({ code, uid }) {
    if (code) {
      const c = await batchGet([`codes/${code}`], adminAuthed);
      if (!c[`codes/${code}`]) return null;
      uid = c[`codes/${code}`].uid;
      if (typeof uid !== 'string' || !SAFE.test(uid)) return null;
    }
    const got = await batchGet([`profiles/${uid}`, `bans/${uid}`], adminAuthed);
    const p = got[`profiles/${uid}`] || null, b = got[`bans/${uid}`] || null;
    return { uid, name: p ? p.name : (b ? b.name : null), code: p ? p.code : (b ? b.code : code || null), updated: p ? p.updated : null, friends: p ? (p.friends || []).length : 0, banned: !!b, reason: b ? b.reason : '' };
  },
  async adminBans() {
    const list = await listDocs('bans', adminAuthed);
    return list.map((b) => ({ uid: b.id, name: b.name, code: b.code, reason: b.reason, at: b.at }));
  },
  // a ban takes the person off the leaderboard, removes their profile and friend code, and the
  // rules stop the account from writing anything again
  async adminBan({ uid, reason, week }) {
    const got = await batchGet([`profiles/${uid}`], adminAuthed);
    const p = got[`profiles/${uid}`] || {};
    const code = typeof p.code === 'string' && /^[A-Z]{4}$/.test(p.code) ? p.code : '';
    const w = updateWrite(`bans/${uid}`, { name: String(p.name || '').slice(0, 40), code, reason: reason || '' });
    w.updateTransforms = [serverTime('at')];
    const writes = [w, { delete: docName(`profiles/${uid}`) }, { delete: docName(`boards/${week}/people/${uid}`) }];
    if (code) {
      const c = await batchGet([`codes/${code}`], adminAuthed);
      if (c[`codes/${code}`] && c[`codes/${code}`].uid === uid) writes.push({ delete: docName(`codes/${code}`) });
    }
    await adminAuthed('POST', `${urls().db}:commit`, { writes });
    return true;
  },
  async adminUnban({ uid }) {
    await adminAuthed('POST', `${urls().db}:commit`, { writes: [{ delete: docName(`bans/${uid}`) }] });
    return true;
  },
  async adminRemoveBoard({ uid, week }) {
    await adminAuthed('POST', `${urls().db}:commit`, { writes: [{ delete: docName(`boards/${week}/people/${uid}`) }] });
    return true;
  },
};

// Everything from the app window is checked before it goes into a server path.
const SAFE = /^[A-Za-z0-9_-]{1,128}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TREE = /^[a-z]{2,20}$/;
function checkArgs(op, a) {
  const id = (v) => { if (typeof v !== 'string' || !SAFE.test(v)) throw new SocialError('bad request', 400); return v; };
  const day = (v) => { if (typeof v !== 'string' || !DAY.test(v)) throw new SocialError('bad request', 400); return v; };
  if ('name' in a) a.name = typeof a.name === 'string' ? a.name.slice(0, 40) : '';
  switch (op) {
    case 'acceptRequest': id(a.from); id(a.id); break;
    case 'dismiss': case 'takeGift': id(a.id); break;
    case 'removeFriend': id(a.uid); break;
    case 'sendGift':
      id(a.to);
      if (a.kind === 'coins') { a.amount = Math.floor(Number(a.amount)); if (!(a.amount >= 1 && a.amount <= 500)) throw new SocialError('bad request', 400); }
      else if (!(a.kind === 'case' && ['seed', 'sapling', 'grove'].includes(a.box))) throw new SocialError('bad request', 400);
      break;
    case 'startStreak': id(a.friend); day(a.today); break;
    case 'acceptStreak': case 'restartStreak': id(a.pair); day(a.today); break;
    case 'endStreak': id(a.pair); break;
    case 'pulse':
      if (!Array.isArray(a.uids)) throw new SocialError('bad request', 400);
      a.uids = Array.from(new Set(a.uids)).slice(0, 100).map(id);
      break;
    case 'board':
      day(a.week);
      a.sec = Math.floor(Number(a.sec));
      if (!(a.sec >= 0)) a.sec = 0;
      a.name = typeof a.name === 'string' ? a.name.slice(0, 24) : '';
      if (typeof a.pic !== 'string' || !TREE.test(a.pic)) a.pic = '';
      a.hide = a.hide === true;
      break;
    case 'boardTop': case 'adminBoard': day(a.week); break;
    case 'adminSignIn':
      if (typeof a.email !== 'string' || typeof a.password !== 'string' || !a.email || !a.password || a.email.length > 200 || a.password.length > 200) throw new SocialError('Type your email and password', 400);
      a.email = a.email.trim();
      break;
    case 'adminFind':
      if (a.code != null && a.code !== '') { a.code = String(a.code).toUpperCase(); if (!/^[A-Z]{4}$/.test(a.code)) throw new SocialError('A friend code is 4 letters', 400); delete a.uid; }
      else { id(a.uid); a.code = ''; }
      break;
    case 'adminBan': id(a.uid); day(a.week); a.reason = typeof a.reason === 'string' ? a.reason.slice(0, 200) : ''; break;
    case 'adminUnban': id(a.uid); break;
    case 'adminRemoveBoard': id(a.uid); day(a.week); break;
    case 'publish':
      if (typeof a.data !== 'string' || a.data.length >= 400000) a.data = '';
      if (a.grades != null && (typeof a.grades !== 'string' || a.grades.length >= 60000)) a.grades = '';
      if (typeof a.live !== 'string' || a.live.length >= 1000) a.live = '';
      if (typeof a.wk !== 'string' || a.wk.length >= 500) a.wk = '';
      break;
    default: break;
  }
  return a;
}

async function call(op, args) {
  if (!configured()) return { ok: false, error: 'not-configured' };
  if (typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(ops, op)) return { ok: false, error: 'unknown' };
  try {
    const a = args && typeof args === 'object' && !Array.isArray(args) ? { ...args } : {};
    return { ok: true, value: await ops[op](checkArgs(op, a)) };
  } catch (e) {
    return { ok: false, error: e.message || String(e), status: e.status || 0, offline: !!e.offline };
  }
}

module.exports = { call, configured, _test: { commit, getDoc, updateWrite, listDocs, docName } };
