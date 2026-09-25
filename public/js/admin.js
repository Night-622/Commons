// A small moderation page: read feedback and chat reports, mark them handled, delete chat messages.
// Access comes from an admins/{uid} document you create by hand in the Firebase console.
const V = '12.17.1';
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
const { getFirestore, collection, query, orderBy, limit, getDocs, getDoc, doc, updateDoc, deleteDoc } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const when = (t) => (t?.toDate ? t.toDate().toLocaleString() : '');
let tab = 'feedback', items = [];

$('signin').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => { $('msg').textContent = e.message; });
document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b)); $('chatrow').hidden = tab !== 'chat'; load(); }; });
$('showdone').onchange = draw;
$('loadchat').onclick = load;

onAuthStateChanged(auth, async (u) => {
  if (!u) { $('who').textContent = 'Sign in with the account you made an admin.'; return; }
  const ok = (await getDoc(doc(db, 'admins', u.uid)).catch(() => null))?.exists();
  $('signin').hidden = true;
  $('who').innerHTML = ok ? `Signed in as ${esc(u.email || u.uid)}.`
    : `Signed in as ${esc(u.email || u.uid)}, but this account isn't an admin. In the Firebase console, create a document <b>admins/${esc(u.uid)}</b> (any field, e.g. name), then reload.`;
  if (ok) load();
});

async function load() {
  $('msg').textContent = '';
  try {
    const col = tab === 'chat' ? collection(db, 'worlds', $('world').value.trim() || 'public', 'chat') : collection(db, tab);
    const snap = await getDocs(query(col, orderBy('createdAt', 'desc'), limit(200)));
    items = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
    draw();
  } catch (e) { $('msg').textContent = `Couldn’t load: ${e.message}. Are the latest firestore.rules deployed?`; }
}

function draw() {
  const all = $('showdone').checked;
  const list = items.filter((x) => all || x.status !== 'done');
  $('list').innerHTML = list.length ? list.map((x) => `
    <div class="item ${x.status === 'done' ? 'done' : ''}">
      <div class="meta">${esc(when(x.createdAt))} · ${esc(x.kind || tab)} · ${esc(x.name || x.email || x.uid || '')} ${x.city ? `· ${esc(x.city)}` : ''} ${x.world ? `· ${esc(x.world)}` : ''}</div>
      <pre>${esc(x.text || '')}</pre>
      ${x.author ? `<div class="meta">Reported author: ${esc(x.author)}</div>` : ''}
      ${x.browser ? `<div class="meta">${esc(x.browser)} · ${esc(x.screen || '')} · day ${esc(x.day)} · ${esc(x.version || '')}</div>` : ''}
      <div class="row">
        ${tab !== 'chat' && x.status !== 'done' ? `<button class="btn" data-done="${x.id}">Mark handled</button>` : ''}
        <button class="btn danger" data-del="${x.id}">Delete</button>
      </div>
    </div>`).join('') : '<p class="soft">Nothing here.</p>';
  $('list').querySelectorAll('[data-done]').forEach((b) => { b.onclick = async () => { const x = items.find((i) => i.id === b.dataset.done); await updateDoc(x.ref, { status: 'done' }); x.status = 'done'; draw(); }; });
  $('list').querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this for good?')) return; const x = items.find((i) => i.id === b.dataset.del); await deleteDoc(x.ref); items = items.filter((i) => i !== x); draw(); }; });
}
