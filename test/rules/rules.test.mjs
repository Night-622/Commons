// Security rules tests. The game's own public/js/firebase.js runs against the Firestore and Auth emulators,
// so these check the writes the game really makes, plus some the rules must refuse.
// Run with: npm run test:rules   (needs Java 21+)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, serverTimestamp, Timestamp, deleteField, writeBatch } from 'firebase/firestore';
import * as sim from '../../public/js/sim.js';

let env, n = 0;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-commons',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.clearFirestore();
});
after(() => env?.cleanup());

// A player is a separate copy of firebase.js, signed in as a guest.
async function player() {
  const fb = await import(`../../public/js/firebase.js?player=${n++}`);
  const { user } = await fb.signInGuest();
  return { fb, user, uid: user.uid, db: env.authenticatedContext(user.uid).firestore() };
}
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const first = (listen) => new Promise((resolve, reject) => { const off = listen((v) => { off?.(); resolve(v); }, reject); });
const newWorld = async (owner, name = 'Test world') => owner.fb.createWorld(owner.user, name);

// ---------- claiming plots ----------
test('public world: first and second players claim plots in order', async () => {
  const a = await player(), b = await player();
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'Anaville', 'public');
  const pb = await b.fb.claimPlot(b.user, 'Ben', 'Benton', 'public');
  assert.equal(pa.index, 0); assert.equal(pb.index, 1);
  assert.equal(a.fb.usingLegacySaves(), false, 'split saves work, no fallback');
  const again = await a.fb.findPlot(a.user, 'public');
  assert.equal(again.id, pa.id); assert.ok(again.state.length > 100, 'full state comes from plotState');
  await assert.rejects(a.fb.claimPlot(a.user, 'Ana', 'Second', 'public'), /already have a plot/);
});

test('private world: create, invite code, join, list, rename', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a, 'Friends');
  const found = await b.fb.findWorldByCode(w.code.toLowerCase());
  assert.equal(found.id, w.id);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const pb = await b.fb.claimPlot(b.user, 'Ben', 'B', w.id);
  assert.deepEqual([pa.index, pb.index], [0, 1]);
  assert.deepEqual((await b.fb.myWorlds(b.user)).map((x) => x.id), ['main', 'public', w.id]);
  await a.fb.renameWorld(w.id, 'Best friends');
  await assertFails(b.fb.renameWorld(w.id, 'Hijacked'));
  await assertFails(updateDoc(doc(a.db, 'worlds', w.id), { name: '' }));
  await assertFails(getDocs(collection(b.db, 'worldCodes')));
  // Can't point a spare invite code at someone else's world.
  await assertFails(setDoc(doc(b.db, 'worldCodes', 'ZZZZZZ'), { world: w.id }));
});

test('claiming: cannot claim for someone else or twice in a private world', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  await assert.rejects(a.fb.claimPlot(a.user, 'Ana', 'Again', w.id), /already have a plot/);
  await assertFails(setDoc(doc(b.db, 'plots', `${w.id}_5_5`), { owner: a.uid, world: w.id, px: 5, py: 5 }));
});

// ---------- saving ----------
test('save: plotState batch plus plots update, and only by the owner', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  const p = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const st = JSON.parse(p.state);
  sim.migrate(st);
  st.money += 500;
  await a.fb.savePlot(p.id, st, { out: {}, flag: 'teal' });
  assert.equal(a.fb.usingLegacySaves(), false);
  const saved = await a.fb.findPlot(a.user, w.id);
  assert.equal(saved.money, st.money); assert.equal(saved.flag, 'teal'); assert.equal(saved.state, sim.serialize(st));
  await assert.rejects(b.fb.savePlot(p.id, st), /permission/i);
  await assertFails(setDoc(doc(b.db, 'plotState', p.id), { state: '{}' }));
  await assertFails(updateDoc(doc(a.db, 'plots', p.id), { px: 99 }));
});

test('save: the money guard allows normal growth and refuses a big jump', async () => {
  const a = await player();
  const w = await newWorld(a);
  const p = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const st = JSON.parse(p.state); sim.migrate(st);
  await admin((db) => updateDoc(doc(db, 'plots', p.id), { updatedAt: Timestamp.fromMillis(Date.now() - 60_000) }));
  // One minute allows +10,000 + 6,000.
  st.money += 20_000;
  await assert.rejects(a.fb.savePlot(p.id, st), /permission/i);
  assert.equal(a.fb.usingLegacySaves(), false, 'a refused jump must not switch to one-document saves');
  st.money -= 12_000;
  await a.fb.savePlot(p.id, st);
});

test('ruins: anyone may rebuild on ruins, nobody on a live city', async () => {
  const a = await player(), b = await player(), c = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const pc = await c.fb.claimPlot(c.user, 'Cy', 'C', w.id);
  const fresh = (p) => { const s = sim.migrate(JSON.parse(p.state)); sim.rebuild(s, 'Phoenix', 1000); return s; };
  await assert.rejects(b.fb.takeOverRuins(b.user, 'Ben', pc.id, fresh(pc), w.id), /already rebuilt/);
  const st = sim.migrate(JSON.parse(pa.state)); sim.collapse(st, 'test');
  await a.fb.savePlot(pa.id, st);
  const t = await b.fb.takeOverRuins(b.user, 'Ben', pa.id, fresh(pa), w.id);
  assert.equal(t.owner, b.uid);
  assert.equal((await b.fb.findPlot(b.user, w.id)).id, pa.id);
  await assert.rejects(a.fb.savePlot(pa.id, st), /permission/i, 'the old owner can no longer save over it');
});

test('moving: a player with a city moves onto ruins, then saves the old plot as ruins', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const pb = await b.fb.claimPlot(b.user, 'Ben', 'B', w.id);
  const sa = sim.migrate(JSON.parse(pa.state)); sim.collapse(sa, 'test'); await a.fb.savePlot(pa.id, sa);
  const fresh = sim.migrate(JSON.parse(pa.state)); sim.rebuild(fresh, 'New B', 1000);
  await b.fb.takeOverRuins(b.user, 'Ben', pa.id, fresh, w.id);
  const sb = sim.migrate(JSON.parse(pb.state)); const record = sim.collapse(sb, 'moved');
  await b.fb.savePlot(pb.id, sb);
  await b.fb.writeLegacy(b.user, pb.id, 'Ben', record, w.id);
});

// ---------- chat ----------
test('chat: send, slow mode, delete by author or admin only', async () => {
  const a = await player(), b = await player(), mod = await player();
  const w = await newWorld(a);
  await a.fb.sendChat(w.id, a.user, 'Ana', 'A', 'hello');
  await assert.rejects(a.fb.sendChat(w.id, a.user, 'Ana', 'A', 'again'), (e) => e.code === 'slow');
  await new Promise((r) => setTimeout(r, 3200));
  await a.fb.sendChat(w.id, a.user, 'Ana', 'A', 'after the wait');
  const msgs = await first((cb, err) => b.fb.listenChat(w.id, cb, err));
  assert.deepEqual(msgs.map((m) => m.text), ['hello', 'after the wait']);
  await assertFails(deleteDoc(doc(b.db, 'worlds', w.id, 'chat', msgs[0].id)));
  await assertSucceeds(deleteDoc(doc(a.db, 'worlds', w.id, 'chat', msgs[0].id)));
  await admin((db) => setDoc(doc(db, 'admins', mod.uid), { name: 'mod' }));
  await assertSucceeds(deleteDoc(doc(mod.db, 'worlds', w.id, 'chat', msgs[1].id)));
  // Without stamping chatLimits, or pretending to be someone else.
  await assertFails(addDoc(collection(b.db, 'worlds', w.id, 'chat'), { uid: b.uid, name: 'B', city: 'B', text: 'x', createdAt: serverTimestamp() }));
  const fake = writeBatch(b.db);
  fake.set(doc(collection(b.db, 'worlds', w.id, 'chat')), { uid: a.uid, name: 'Ana', city: 'A', text: 'x', createdAt: serverTimestamp() });
  fake.set(doc(b.db, 'chatLimits', b.uid), { at: serverTimestamp() });
  await assertFails(fake.commit());
});

test('reactions: set and clear your own, never someone else’s', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  await a.fb.sendChat(w.id, a.user, 'Ana', 'A', 'react to me');
  const [m] = await first((cb, err) => a.fb.listenChat(w.id, cb, err));
  await b.fb.react(w.id, m.id, b.uid, '🎉');
  await a.fb.react(w.id, m.id, a.uid, '👍');
  await b.fb.react(w.id, m.id, b.uid, null);
  const d = (await getDoc(doc(a.db, 'worlds', w.id, 'chat', m.id))).data();
  assert.deepEqual(d.reactions, { [a.uid]: '👍' });
  await assertFails(updateDoc(doc(b.db, 'worlds', w.id, 'chat', m.id), { [`reactions.${a.uid}`]: deleteField() }));
  await assertFails(b.fb.react(w.id, m.id, b.uid, '💩'));
  await assertFails(updateDoc(doc(b.db, 'worlds', w.id, 'chat', m.id), { text: 'edited' }));
});

// ---------- guestbook, gifts, moves, likes ----------
test('guestbook: one note per visitor per day, deletable by the city owner', async () => {
  const a = await player(), b = await player(), c = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  await b.fb.signGuestbook(w.id, pa.id, b.user, 'Ben', 'B', 'Lovely parks');
  await assertFails(b.fb.signGuestbook(w.id, pa.id, b.user, 'Ben', 'B', 'Second note today'));
  const notes = await a.fb.guestbook(w.id, pa.id);
  assert.equal(notes.length, 1);
  await assertFails(c.fb.deleteNote(w.id, notes[0].id));
  await a.fb.deleteNote(w.id, notes[0].id);
});

test('gifts: sender writes, receiver sees and deletes, capped at $1,000', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id), pb = await b.fb.claimPlot(b.user, 'Ben', 'B', w.id);
  await a.fb.sendGift(w.id, { from: pa.id, fromName: 'A', fromOwner: a.uid, to: pb.id, toOwner: b.uid, amount: 250, note: 'hi' });
  const gifts = await first((cb) => b.fb.listenGifts(w.id, b.uid, cb));
  assert.equal(gifts.length, 1); assert.equal(gifts[0].amount, 250);
  await assertFails(deleteDoc(doc(a.db, 'worlds', w.id, 'gifts', gifts[0].id)));
  await b.fb.finishGift(w.id, gifts[0].id);
  await assertFails(a.fb.sendGift(w.id, { from: pa.id, fromName: 'A', fromOwner: a.uid, to: pb.id, toOwner: b.uid, amount: 5000, note: '' }));
  await assertFails(a.fb.sendGift(w.id, { from: pa.id, fromName: 'A', fromOwner: a.uid, to: pa.id, toOwner: a.uid, amount: 100, note: '' }));
  await assertFails(getDocs(query(collection(a.db, 'worlds', w.id, 'gifts'), where('toOwner', '==', b.uid))));
});

test('moves: families sent to a linked city arrive and are cleared', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id), pb = await b.fb.claimPlot(b.user, 'Ben', 'B', w.id);
  const people = sim.migrate(JSON.parse(pa.state)).people.slice(0, 2).map((p) => ({ f: p.f, l: p.l, a: p.a, e: p.e, sp: p.sp, hp: p.hp, m: p.m }));   // as sim.js sends emigrants
  await a.fb.sendMove(w.id, { from: pa.id, fromName: 'A', fromOwner: a.uid, to: pb.id, toOwner: b.uid, people });
  const moves = await first((cb) => b.fb.listenMoves(w.id, b.uid, cb));
  assert.equal(moves[0].people.length, 2);
  await b.fb.finishMove(w.id, moves[0].id);
});

test('likes: one per player per city', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  await b.fb.setLike(w.id, pa.id, b.uid, true);
  assert.deepEqual(await b.fb.likes(w.id, pa.id, b.uid), { count: 1, mine: true });
  await assertFails(setDoc(doc(a.db, 'worlds', w.id, 'likes', `${pa.id}_${b.uid}`), { plot: pa.id, uid: b.uid, createdAt: serverTimestamp() }));
  await b.fb.setLike(w.id, pa.id, b.uid, false);
});

// ---------- profiles ----------
test('profiles: private to each player', async () => {
  const a = await player(), b = await player();
  await a.fb.saveProfile(a.uid, { name: 'Ana', colour: 'teal', stats: { cities: 1 }, achievements: {}, base: {} });
  assert.equal((await a.fb.getProfile(a.uid)).name, 'Ana');
  await assert.rejects(b.fb.getProfile(a.uid), /permission/i);
  await assertFails(b.fb.saveProfile(a.uid, { name: 'x' }));
  await a.fb.deleteProfile(a.uid);
});

// ---------- region ----------
test('regional projects: start, contribute in a transaction, finish', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  const ref = await a.fb.startProject(w.id, a.user, 'Ana', 'park', 'Big park', 3000);
  assert.deepEqual(await a.fb.contribute(w.id, ref.id, a.uid, 2000), { add: 2000, done: false });
  assert.deepEqual(await b.fb.contribute(w.id, ref.id, b.uid, 2000), { add: 1000, done: true });
  await assert.rejects(a.fb.contribute(w.id, ref.id, a.uid, 100), /already finished/);
  const d = (await getDoc(doc(a.db, 'worlds', w.id, 'projects', ref.id))).data();
  assert.deepEqual(d.members, { [a.uid]: 2000, [b.uid]: 1000 });
  assert.equal(d.raised, 3000);
  await assertFails(deleteDoc(doc(a.db, 'worlds', w.id, 'projects', ref.id)));
  const r2 = await a.fb.startProject(w.id, a.user, 'Ana', 'park', 'Another', 5000);
  await assertFails(a.fb.contribute(w.id, r2.id, a.uid, 2500));
  await assertFails(updateDoc(doc(b.db, 'worlds', w.id, 'projects', r2.id), { [`members.${a.uid}`]: 100, raised: 100 }));
  await assertFails(updateDoc(doc(b.db, 'worlds', w.id, 'projects', r2.id), { [`members.${b.uid}`]: 100, raised: 50 }));
  await assertFails(a.fb.startProject(w.id, a.user, 'Ana', 'park', 'Too big', 50000));
});

test('alliances: join and leave yourself only, members-only chat', async () => {
  const a = await player(), b = await player(), c = await player();
  const w = await newWorld(a);
  const ref = await a.fb.createAlliance(w.id, a.user, 'North', 'NTH');
  await b.fb.joinAlliance(w.id, ref.id, b.uid);
  await assertFails(b.fb.joinAlliance(w.id, ref.id, c.uid));
  await assertFails(b.fb.leaveAlliance(w.id, ref.id, a.uid));
  await b.fb.sendAllianceChat(w.id, ref.id, b.user, 'Ben', 'hi team');
  const msgs = await first((cb) => a.fb.listenAllianceChat(w.id, ref.id, cb));
  assert.equal(msgs[0].text, 'hi team');
  await assertFails(getDocs(collection(c.db, 'worlds', w.id, 'alliances', ref.id, 'chat')));
  await assertFails(c.fb.sendAllianceChat(w.id, ref.id, c.user, 'Cy', 'let me in'));
  await assertFails(a.fb.deleteAlliance(w.id, ref.id));
  await b.fb.leaveAlliance(w.id, ref.id, b.uid);
  await a.fb.deleteAlliance(w.id, ref.id);
  await assertFails(a.fb.createAlliance(w.id, a.user, 'Bad tag', 'toolong'));
});

// ---------- moderation ----------
test('feedback, reports and admins', async () => {
  const a = await player(), mod = await player();
  const w = await newWorld(a);
  await a.fb.sendFeedback({ uid: a.uid, kind: 'bug', text: 'The bus is late', email: '', city: 'A', world: w.id, plot: 'p', day: 3, pop: 10,
    browser: 'node', screen: '1x1', version: '1.8' });
  await a.fb.report(w.id, a.uid, { kind: 'chat', message: 'm1', author: 'someone', text: 'rude' });
  await assertFails(getDocs(collection(a.db, 'feedback')));
  await assertFails(getDoc(doc(a.db, 'admins', mod.uid)));
  await assertFails(setDoc(doc(a.db, 'admins', a.uid), { name: 'me' }));
  await admin((db) => setDoc(doc(db, 'admins', mod.uid), { name: 'mod' }));
  await assertSucceeds(getDoc(doc(mod.db, 'admins', mod.uid)));
  const fbDocs = await getDocs(collection(mod.db, 'feedback'));
  assert.ok(fbDocs.size >= 1);
  await assertSucceeds(updateDoc(fbDocs.docs[0].ref, { status: 'done' }));
  await assertFails(updateDoc(fbDocs.docs[0].ref, { text: 'changed' }));
  const reps = await getDocs(collection(mod.db, 'reports'));
  await assertSucceeds(deleteDoc(reps.docs[0].ref));
});

test('world data: plots, leaderboards and the live listener are readable', async () => {
  const a = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const plots = await a.fb.loadWorld(w.id);
  assert.deepEqual(plots.map((p) => p.id), [pa.id]);
  const boards = await a.fb.loadLeaderboards(w.id, plots);
  assert.equal(boards.peak.length, 1);
  const changed = await first((cb, err) => a.fb.listenWorld(w.id, cb, err));
  assert.equal(changed[0].id, pa.id);
});

// ---------- limits added before 1.8 went live ----------
test('limits: the money guard can no longer be dodged through updatedAt', async () => {
  const a = await player();
  const w = await newWorld(a);
  const p = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const ref = doc(a.db, 'plots', p.id);
  await assertFails(updateDoc(ref, { updatedAt: 'x' }));
  await assertFails(updateDoc(ref, { updatedAt: Timestamp.fromDate(new Date('2000-01-01')) }));
  await assertFails(updateDoc(ref, { money: 10_000_000, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { money: 4000, updatedAt: serverTimestamp() }));
});

test('limits: population, peak and days rise only as fast as a real city', async () => {
  const a = await player();
  const w = await newWorld(a);
  const p = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const ref = doc(a.db, 'plots', p.id);
  await assertFails(updateDoc(ref, { pop: 1e9, peakPop: 1e9, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { peakPop: 5000, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { day: 500, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { pop: 40, peakPop: 40, day: 1, updatedAt: serverTimestamp() }));
  // Twenty city days away (20 real minutes) allows twenty days and plenty of growth in one save.
  await admin((db) => updateDoc(doc(db, 'plots', p.id), { updatedAt: Timestamp.fromMillis(Date.now() - 20 * 60_000) }));
  const st = sim.migrate(JSON.parse(p.state));
  for (let h = 0; h < 20 * 24; h++) sim.tick(st);
  await a.fb.savePlot(p.id, st);
  assert.equal((await getDoc(ref)).data().day, st.day);
});

test('limits: the full save can only be written together with its summary', async () => {
  const a = await player();
  const w = await newWorld(a);
  const p = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  await assertFails(setDoc(doc(a.db, 'plotState', p.id), { state: p.state }));
});

test('limits: new and rebuilt cities start with ordinary money and people', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  const id = `${w.id}_0_0`;
  const rich = writeBatch(a.db);
  rich.set(doc(a.db, 'plots', id), { owner: a.uid, world: w.id, px: 0, py: 0, money: 1e6, pop: 6, peakPop: 6, day: 0, updatedAt: serverTimestamp() });
  rich.set(doc(a.db, 'memberships', `${a.uid}_${w.id}`), { uid: a.uid, world: w.id, plotId: id, createdAt: serverTimestamp() });
  await assertFails(rich.commit());
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  const sa = sim.migrate(JSON.parse(pa.state)); sim.collapse(sa, 'test'); await a.fb.savePlot(pa.id, sa);
  const fresh = sim.migrate(JSON.parse(pa.state)); sim.rebuild(fresh, 'Greedy', 1e6);
  await assertFails(b.fb.takeOverRuins(b.user, 'Ben', pa.id, fresh, w.id));
  sim.rebuild(fresh, 'Honest');
  await b.fb.takeOverRuins(b.user, 'Ben', pa.id, fresh, w.id);
});

test('limits: gifts only from your own plot, fallen records only for your own plot', async () => {
  const a = await player(), b = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id), pb = await b.fb.claimPlot(b.user, 'Ben', 'B', w.id);
  await assertFails(a.fb.sendGift(w.id, { from: pb.id, fromName: 'B', fromOwner: a.uid, to: pb.id, toOwner: b.uid, amount: 100, note: '' }));
  await assertFails(a.fb.writeLegacy(a.user, pa.id, 'Ana', { daysSurvived: 99999, peakPop: 6 }, w.id));
  await assertFails(a.fb.writeLegacy(a.user, pb.id, 'Ana', { daysSurvived: 0, peakPop: 6 }, w.id));
  await assertFails(a.fb.writeLegacy(a.user, pa.id, 'Ana', { daysSurvived: 0, peakPop: 1e6 }, w.id));
  await a.fb.writeLegacy(a.user, pa.id, 'Ana', { name: 'A', cityNo: 1, daysSurvived: 0, peakPop: 6, outcome: 'test' }, w.id);
});

// ---------- the main world (1.11) ----------
test('main world: founding works like the classic world and skips slots already taken', async () => {
  const { spiral } = await import('../../public/js/spiral.js');
  const a = await player(), b = await player(), c = await player();
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', 'main');
  const pb = await b.fb.claimPlot(b.user, 'Ben', 'B', 'main');
  assert.deepEqual([pa.world, pb.world], ['main', 'main']);
  // Someone already holds the next slot (as if bought next to their city).
  const { x, y } = spiral(pb.index + 1);
  await admin((db) => setDoc(doc(db, 'plots', `main_${x}_${y}`), { owner: 'someone', world: 'main', px: x, py: y }));
  const pc = await c.fb.claimPlot(c.user, 'Cy', 'C', 'main');
  assert.equal(pc.index, pb.index + 2);
  assert.deepEqual((await a.fb.myWorlds(a.user)).map((w) => w.id).slice(0, 2), ['main', 'public']);
  // The counter can't be pushed far ahead or backwards.
  await assertFails(updateDoc(doc(a.db, 'worlds', 'main'), { nextIndex: 500 }));
  await assertFails(updateDoc(doc(a.db, 'worlds', 'main'), { nextIndex: 0 }));
});

test('councils: buy the plot next to your city, switch home, and nothing else', async () => {
  const a = await player(), b = await player();
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', 'main');
  // Right next door: allowed. The council's list grows and home can move there.
  // Other tests share the main world, so use whichever side is still free.
  const freeSide = async (p) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let taken;
      await admin(async (db) => { taken = (await getDoc(doc(db, 'plots', `main_${p.px + dx}_${p.py + dy}`))).exists(); });
      if (!taken) return [p.px + dx, p.py + dy];
    }
    throw new Error('no free side');
  };
  const side = await freeSide(pa);
  const east = await a.fb.buyPlot(a.user, 'Ana', pa.id, side[0], side[1], 'A East', 'main');
  assert.equal(east.owner, a.uid);
  const link = (await getDoc(doc(a.db, 'memberships', `${a.uid}_main`))).data();
  assert.deepEqual(link.plotIds, [pa.id, east.id]);
  await a.fb.setHome(a.user, 'main', east.id);
  assert.equal((await a.fb.findPlot(a.user, 'main')).id, east.id);
  await a.fb.setHome(a.user, 'main', pa.id);
  // Not touching any of your cities, or "next to" someone else's city: refused.
  await assert.rejects(a.fb.buyPlot(a.user, 'Ana', pa.id, pa.px + 40, pa.py + 40, 'Far', 'main'), /permission/i);
  const pb = await b.fb.claimPlot(b.user, 'Ben', 'B', 'main');
  const bSide = await freeSide(pb);
  await assert.rejects(a.fb.buyPlot(a.user, 'Ana', pb.id, bSide[0], bSide[1], 'Sneaky', 'main'), /permission/i);
  // A player can't slip a city into someone else's council, or point home at a plot they don't own.
  await assertFails(updateDoc(doc(b.db, 'memberships', `${a.uid}_main`), { plotIds: [pa.id, east.id, pb.id] }));
  await assertFails(a.fb.setHome(a.user, 'main', pb.id));
  // Saving the new city works like any other.
  const st = sim.migrate(JSON.parse(east.state)); st.money += 100;
  await a.fb.savePlot(east.id, st);
});

test('co-mayors: the owner adds friends, who can save and take the desk; others can do neither', async () => {
  const a = await player(), b = await player(), c = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id);
  await a.fb.setCoMayors(pa.id, [b.uid]);
  assert.deepEqual((await b.fb.coCities(b.uid)).map((p) => p.id), [pa.id]);
  // Ben co-runs it: he can save, and sits at the desk.
  const st = sim.migrate(JSON.parse(pa.state)); st.money += 200;
  await b.fb.savePlot(pa.id, st);
  await b.fb.takeDesk(pa.id, b.user, 'Ben');
  await a.fb.takeDesk(pa.id, a.user, 'Ana', true);
  assert.equal((await getDoc(doc(b.db, 'desks', pa.id))).data().uid, a.uid, 'the owner took the desk over');
  assert.ok(await first((cb) => b.fb.listenDesk(pa.id, cb)), 'co-mayors can listen to the desk');
  // Watching: the co-mayor sees the full save as it changes.
  const seen = await first((cb) => b.fb.listenState(pa.id, cb));
  assert.equal(JSON.parse(seen).money, st.money);
  // Cy isn't a co-mayor: no saving, no desk, no peeking at the desk.
  await assert.rejects(c.fb.savePlot(pa.id, st), /permission/i);
  await assertFails(c.fb.takeDesk(pa.id, c.user, 'Cy'));
  await assertFails(getDoc(doc(c.db, 'desks', pa.id)));
  // Co-mayors can't hand the city to themselves or add others; they can step down.
  await assertFails(updateDoc(doc(b.db, 'plots', pa.id), { owner: b.uid, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(b.db, 'plots', pa.id), { co: [b.uid, c.uid], updatedAt: serverTimestamp() }));
  await assertFails(a.fb.setCoMayors(pa.id, [a.uid]));
  await assertFails(a.fb.setCoMayors(pa.id, ['x1', 'x2', 'x3', 'x4']));
  await b.fb.leaveCo(pa.id, b.uid);
  await assert.rejects(b.fb.savePlot(pa.id, st), /permission/i);
});

// ---------- the market (1.13) ----------
test('market: sell, buy and loan offers; deals only between the two sides', async () => {
  const a = await player(), b = await player(), c = await player();
  const w = await newWorld(a);
  const pa = await a.fb.claimPlot(a.user, 'Ana', 'A', w.id), pb = await b.fb.claimPlot(b.user, 'Ben', 'B', w.id);
  await c.fb.claimPlot(c.user, 'Cy', 'C', w.id);
  const offer = (kind, extra) => ({ kind, res: 'fruit', qty: 50, price: 2, total: 100, owner: a.uid, ownerName: 'Ana', plot: pa.id, city: 'A', ...extra });
  // Ana sells 50 fruit; Ben buys it and pays in the same transaction.
  const sellId = a.fb.newOfferId(w.id);
  await a.fb.postOffer(w.id, sellId, offer('sell'));
  const open = await first((cb) => b.fb.listenOffers(w.id, cb));
  assert.ok(open.some((o) => o.id === sellId));
  await assert.rejects(a.fb.takeOffer(w.id, sellId, a.user, pa.id, 'Ana', { kind: 'sell', fromName: 'A', toOwner: a.uid, toPlot: pa.id, money: 100, res: null, qty: 0 }), /permission/i, 'not your own offer');
  await b.fb.takeOffer(w.id, sellId, b.user, pb.id, 'Ben', { kind: 'sell', fromName: 'B', toOwner: a.uid, toPlot: pa.id, money: 100, res: null, qty: 0 });
  await assert.rejects(c.fb.takeOffer(w.id, sellId, c.user, 'x', 'Cy', { kind: 'sell', fromName: 'C', toOwner: a.uid, toPlot: pa.id, money: 100, res: null, qty: 0 }), /got there first/);
  const deals = await first((cb) => a.fb.listenDeals(w.id, a.uid, cb));
  assert.equal(deals[0].money, 100);
  await a.fb.finishDeal(w.id, deals[0].id);
  // Deals must match an offer you're party to, and stay within its total.
  await assertFails(c.fb.sendDeal(w.id, c.user, { offer: sellId, kind: 'sell', fromName: 'C', toOwner: a.uid, toPlot: pa.id, money: 5, res: null, qty: 0 }));
  await assertFails(b.fb.sendDeal(w.id, b.user, { offer: sellId, kind: 'sell', fromName: 'B', toOwner: a.uid, toPlot: pa.id, money: 9999, res: null, qty: 0 }));
  // A loan: Ben lends, Ana repays up to the agreed amount, and nobody else can.
  const loanId = a.fb.newOfferId(w.id);
  await a.fb.postOffer(w.id, loanId, offer('loan', { res: null, qty: 0, price: 0, total: 1000, repay: 1150, days: 5 }));
  await b.fb.takeOffer(w.id, loanId, b.user, pb.id, 'Ben', { kind: 'loan', fromName: 'B', toOwner: a.uid, toPlot: pa.id, money: 1000, res: null, qty: 0 });
  await a.fb.sendDeal(w.id, a.user, { offer: loanId, kind: 'repay', fromName: 'A', toOwner: b.uid, toPlot: pb.id, money: 1150, res: null, qty: 0 });
  await assertFails(a.fb.sendDeal(w.id, a.user, { offer: loanId, kind: 'repay', fromName: 'A', toOwner: b.uid, toPlot: pb.id, money: 5000, res: null, qty: 0 }));
  await assertFails(a.fb.sendDeal(w.id, a.user, { offer: loanId, kind: 'repay', fromName: 'A', toOwner: c.uid, toPlot: 'x', money: 10, res: null, qty: 0 }));
  // Cancelling: only the owner, only while open; a borrower can't ask to repay more than twice the loan.
  const buyId = a.fb.newOfferId(w.id);
  await a.fb.postOffer(w.id, buyId, offer('buy'));
  await assertFails(b.fb.cancelOffer(w.id, buyId));
  await a.fb.cancelOffer(w.id, buyId);
  await a.fb.clearOffer(w.id, buyId);
  await assertFails(a.fb.postOffer(w.id, a.fb.newOfferId(w.id), offer('loan', { total: 1000, repay: 5000 })));
  await assertFails(b.fb.postOffer(w.id, b.fb.newOfferId(w.id), offer('sell', { owner: b.uid })));   // for Ana's city
});
