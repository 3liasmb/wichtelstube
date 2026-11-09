// Automatisierte Tests der Kernlogik. Aufruf im Projektordner: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../core.js');

const mkPs = n => [...Array(n)].map((_, i) => ({ id: 'p' + i, name: 'Kind ' + i }));

test('Auslosung: jede Person verschenkt und erhält genau ein Geschenk, niemand zieht sich selbst (2–40, je 2000 Läufe)', () => {
  for (let n = 2; n <= 40; n++) {
    for (let k = 0; k < 2000; k++) {
      const ps = mkPs(n);
      const a = C.createAssignments(ps);
      assert.equal(Object.keys(a).length, n);
      assert.equal(new Set(Object.values(a)).size, n);
      for (const p of ps) { assert.notEqual(a[p.id], p.id); assert.ok(ps.some(q => q.id === a[p.id])); }
    }
  }
});

test('Auslosung: Empfänger sind gleichmäßig verteilt (n=6, 30000 Läufe)', () => {
  const counts = {};
  for (let k = 0; k < 30000; k++) { const a = C.createAssignments(mkPs(6)); counts[a.p0] = (counts[a.p0] || 0) + 1; }
  const vals = Object.values(counts);
  assert.equal(vals.length, 5);
  for (const v of vals) assert.ok(v > 5400 && v < 6600, 'Verteilung auffällig: ' + JSON.stringify(counts));
});

test('Auslosung: weniger als zwei Teilnehmende wird abgelehnt', () => {
  assert.throws(() => C.createAssignments(mkPs(1)));
});

test('Aufrufreihenfolge hängt nicht von der Auslosung ab', () => {
  const db = { teacher: 'Frau T', classes: [] };
  const c = C.newClass('5a');
  c.students = mkPs(5); c.teacherJoins = true;
  const before = C.participants(db, c).map(p => p.id);
  c.assignments = C.createAssignments(C.participants(db, c));
  assert.deepEqual(C.participants(db, c).map(p => p.id), before);
  assert.equal(before.at(-1), 'teacher');
});

test('Lehrkraft wichtelt optional mit', () => {
  const db = { teacher: 'Frau T', classes: [] };
  const c = C.newClass('5a'); c.students = mkPs(3);
  assert.equal(C.participants(db, c).length, 3);
  c.teacherJoins = true;
  assert.equal(C.participants(db, c).length, 4);
  assert.equal(C.participants(db, c)[3].name, 'Frau T');
});

test('Schülerliste: Namen bereinigen, Doppelte erkennen, Lehrkraft nicht doppelt', () => {
  assert.deepEqual(C.parseNames(' Emma \r\n\nNoah  B.\n  '), ['Emma', 'Noah B.']);
  assert.match(C.checkRoster(['Emma', 'emma'], 'Frau T', false), /doppelt/);
  assert.match(C.checkRoster(['Frau T'], 'Frau T', true), /Lehrkraft/);
  assert.equal(C.checkRoster(['Frau T'], 'Frau T', false), null);
  assert.match(C.checkRoster(['x'.repeat(91)], '', false), /zu lang/);
  assert.equal(C.checkRoster(['<b>Ä</b>', 'O\'Neil', '"Dodo"'], '', false), null);
});

test('Klassenpflege: gleiche Namen behalten ihre Kennung, Abgänge werden gemeldet', () => {
  const c = C.newClass('5a');
  C.updateRoster(c, ['Anna', 'Ben', 'Cem']);
  const idBen = c.students[1].id;
  const removed = C.updateRoster(c, ['Cem', 'Ben', 'Dora']);
  assert.deepEqual(removed.map(s => s.name), ['Anna']);
  assert.equal(c.students.find(s => s.name === 'Ben').id, idBen);
  assert.equal(c.students.length, 3);
});

test('Schuljahreswechsel 5a → 6a: Liste bleibt, laufende Runde wandert getrennt ins Archiv', () => {
  const db = { teacher: 'Frau T', classes: [] };
  const c = C.newClass('5a'); c.year = '2025/2026';
  C.updateRoster(c, ['Anna', 'Ben', 'Cem']);
  c.assignments = C.createAssignments(C.participants(db, c)); c.drawn = [c.students[0].id]; c.delivered = [c.students[0].id];
  C.promoteClass(db, c, '6a', '2026/2027');
  assert.equal(c.name, '6a'); assert.equal(c.year, '2026/2027');
  assert.equal(c.students.length, 3);
  assert.equal(c.assignments, null); assert.deepEqual(c.drawn, []); assert.deepEqual(c.delivered, []);
  assert.equal(c.history.length, 1);
  assert.equal(c.history[0].className, '5a');
  assert.equal(c.history[0].participants.length, 3);
  assert.equal(c.history[0].delivered.length, 1);
  // Änderungen an der neuen Liste verändern das Archiv nicht
  C.updateRoster(c, ['Ben', 'Neu']);
  assert.equal(c.history[0].participants.length, 3);
});

test('Löschfrist: Ende des nächsten Schuljahres', () => {
  const d = C.deletionDate('2025/2026');
  assert.equal(d.getFullYear(), 2027); assert.equal(d.getMonth(), 6); assert.equal(d.getDate(), 31);
  assert.equal(C.deletionDate('kaputt'), null);
});

test('Schuljahr wird ab August umgestellt', () => {
  assert.equal(C.schoolYear(new Date(2026, 6, 31)), '2025/2026');
  assert.equal(C.schoolYear(new Date(2026, 7, 1)), '2026/2027');
});

test('Glücksrad: benachbarte Felder haben nie dieselbe Farbe (1–80 Felder)', () => {
  for (let n = 1; n <= 80; n++) {
    const c = C.wheelColorIndices(n);
    assert.equal(c.length, n);
    for (let i = 0; i < n - 1; i++) assert.notEqual(c[i], c[i + 1]);
    if (n > 1) assert.notEqual(c[n - 1], c[0], 'n=' + n);
  }
});

test('CSV: Excel-kompatibel, Sonderzeichen, Schutz vor Formeln', () => {
  const csv = C.buildCSV([['Name', 'Notiz'], ['Dörte "Dodo"', '=SUMME(A1)'], ['+49', '-x'], ['@a', 'a;b']]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"Dörte ""Dodo"""'));
  assert.ok(csv.includes(`"'=SUMME(A1)"`));
  assert.ok(csv.includes(`"'+49";"'-x"`));
  assert.ok(csv.includes(`"'@a";"a;b"`));
  assert.equal(csv.split('\r\n').length, 4);
});

test('Escape von HTML-Sonderzeichen', () => {
  assert.equal(C.esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});

/* ---------- Sicherungen ---------- */
const fixDir = path.join(__dirname, 'fixtures');
const V1_PASS = 'Tanne-Stern-Kerze';

test('Kompatibilität: bestehende v1-Sicherung (vom Originalcode erzeugt) wird vollständig geöffnet', async () => {
  const text = fs.readFileSync(path.join(fixDir, 'v1-backup.wichtel'), 'utf8');
  const expected = JSON.parse(fs.readFileSync(path.join(fixDir, 'v1-backup.expected.json'), 'utf8'));
  const db = await C.openBackup(text, V1_PASS);
  assert.equal(db.teacher, expected.teacher);
  assert.equal(db.classes.length, 2);
  const c = db.classes[0];
  assert.deepEqual(c.students, expected.classes[0].students);
  assert.deepEqual(c.assignments, expected.classes[0].assignments);
  assert.deepEqual(c.drawn, expected.classes[0].drawn);
  assert.equal(c.history.length, 1);
  assert.deepEqual(c.history[0].assignments, expected.classes[0].history[0].assignments);
  assert.equal(c.budget, '10'); assert.equal(c.extra, 'Bitte keine Nüsse');
  assert.deepEqual(c.delivered, []); assert.equal(c.budgetAlt, false);
});

test('Sicherung: falsches Passwort wird klar gemeldet', async () => {
  const text = fs.readFileSync(path.join(fixDir, 'v1-backup.wichtel'), 'utf8');
  await assert.rejects(C.openBackup(text, 'falsch'), e => e.kind === 'password');
});

test('Sicherung: neue Version 2 – verschlüsseln, öffnen, Inhalt identisch', async () => {
  const text = fs.readFileSync(path.join(fixDir, 'v1-backup.wichtel'), 'utf8');
  const db = await C.openBackup(text, V1_PASS);
  db.classes[0].delivered = ['s1']; db.classes[0].budgetAlt = true;
  const enc = await C.encryptData(db, 'ein langes Passwort');
  assert.equal(enc.version, 2); assert.equal(enc.iterations, 600000);
  assert.ok(!JSON.stringify(enc).includes('Anna'), 'Klartext in Sicherung');
  const back = await C.openBackup(JSON.stringify(enc), 'ein langes Passwort');
  assert.deepEqual(back, db);
});

test('Sicherung: beschädigte, abgeschnittene und fremde Dateien werden abgelehnt', async () => {
  const text = fs.readFileSync(path.join(fixDir, 'v1-backup.wichtel'), 'utf8');
  await assert.rejects(C.openBackup(text.slice(0, text.length / 2), V1_PASS), e => e.kind === 'format');
  await assert.rejects(C.openBackup('{"hallo":1}', V1_PASS), e => e.kind === 'format');
  await assert.rejects(C.openBackup('kein json', V1_PASS), e => e.kind === 'format');
  const obj = JSON.parse(text); obj.data = obj.data.slice(0, -8) + 'AAAAAAA=';
  await assert.rejects(C.openBackup(JSON.stringify(obj), V1_PASS), e => e.kind === 'password');
  const obj2 = JSON.parse(text); obj2.iterations = 1000;
  await assert.rejects(C.openBackup(JSON.stringify(obj2), V1_PASS), e => e.kind === 'format');
});

test('Sicherung: manipulierte Inhalte (Schadcode in Kennungen, kaputte Zuordnungen) werden abgelehnt', async () => {
  const good = JSON.parse(fs.readFileSync(path.join(fixDir, 'v1-backup.expected.json'), 'utf8'));
  const bad = [
    d => { d.classes[0].id = "x');alert(1);('"; },
    d => { d.classes[0].students[0].id = '<img>'; },
    d => { d.classes[0].assignments.s1 = 's1'; },
    d => { d.classes[0].assignments.s1 = 'unbekannt'; },
    d => { delete d.classes[0].assignments.s2; },
    d => { d.classes[0].history[0].participants = 'x'; },
    d => { d.classes[0].history[0].assignments = { s1: 's1', s2: 's3', s3: 's2' }; },
    d => { d.classes[0].students[0].name = 7; },
    d => { d.classes[1].id = d.classes[0].id; },
    d => { d.classes[0].teacherJoins = 'ja'; }
  ];
  for (const mutate of bad) {
    const d = JSON.parse(JSON.stringify(good)); mutate(d);
    const enc = await C.encryptData(d, 'pw-pw-pw-pw');
    await assert.rejects(C.openBackup(JSON.stringify(enc), 'pw-pw-pw-pw'), e => e.kind === 'content', mutate.toString());
  }
});

test('Sicherung: Namen mit Sonderzeichen bleiben unverändert erhalten', () => {
  const d = { teacher: 'Hr. Ö', classes: [{ id: 'a1', name: '5a', students: [{ id: 's1', name: '<script>"x"</script> & ß' }], teacherJoins: false, drawn: [], assignments: null }] };
  const n = C.normalizeBackup(d);
  assert.equal(n.classes[0].students[0].name, '<script>"x"</script> & ß');
});

test('Druckseiten: Vereinbarungen paarweise (1, 5, 15, 30 → 1, 3, 8, 15 Seiten)', () => {
  for (const [n, pages] of [[1, 1], [5, 3], [15, 8], [30, 15], [2, 1]]) {
    const ch = C.chunk(Array(n).fill('x'), 2);
    assert.equal(ch.length, pages, 'n=' + n);
    assert.equal(ch.flat().length, n);
  }
});
