/* Die Wichtelstube – Kernlogik ohne Oberfläche.
   Läuft im Browser (window.WichtelCore) und in Node.js (require) für die automatisierten Tests. */
(function (root) {
  'use strict';

  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const MAX_NAME = 90;
  const MAX_CLASSES = 200;
  const MAX_STUDENTS = 300;
  const KDF = { 1: 310000, 2: 600000 }; // Version 1 = bisherige Sicherungen, Version 2 = neue Sicherungen
  const CURRENT_VERSION = 2;

  const cryptoObj = () => root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function uid() {
    const a = new Uint32Array(2);
    cryptoObj().getRandomValues(a);
    return a[0].toString(36) + a[1].toString(36) + Date.now().toString(36);
  }

  function randomInt(max) {
    const a = new Uint32Array(1);
    const lim = Math.floor(4294967296 / max) * max;
    do { cryptoObj().getRandomValues(a); } while (a[0] >= lim);
    return a[0] % max;
  }

  function shuffle(list) {
    const b = list.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  /* Zufälliger Kreis: jede Person beschenkt genau eine andere und wird genau einmal beschenkt.
     Funktioniert für gerade und ungerade Anzahlen ab 2. Die Aufrufreihenfolge bleibt davon unberührt. */
  function createAssignments(ps) {
    if (ps.length < 2) throw Error('Mindestens zwei Teilnehmende erforderlich.');
    const ids = shuffle(ps.map(p => p.id));
    const result = {};
    ids.forEach((id, i) => { result[id] = ids[(i + 1) % ids.length]; });
    return result;
  }

  function participants(db, c) {
    return [
      ...c.students.map(s => ({ id: s.id, name: s.name, teacher: false })),
      ...(c.teacherJoins ? [{ id: 'teacher', name: db.teacher, teacher: true }] : [])
    ];
  }

  function schoolYear(d = new Date()) {
    const y = d.getFullYear();
    return d.getMonth() >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  }

  /* Anlage 1 zur VwV „Datenschutz an öffentlichen Schulen“: Löschung spätestens nach Ende des nächsten Schuljahres.
     Schuljahr „2025/2026“ → Ende des nächsten Schuljahres = 31.07.2027. */
  function deletionDate(year) {
    const m = /^(\d{4})\/(\d{4})$/.exec(String(year || ''));
    if (!m) return null;
    return new Date(Number(m[2]) + 1, 6, 31);
  }

  /* Farben für das Glücksrad: benachbarte Felder (auch letztes/erstes) haben nie dieselbe Farbe. */
  function wheelColorIndices(n, k = 4) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(i % k);
    if (n > 1 && out[n - 1] === out[0]) {
      for (let c = 0; c < k; c++) {
        if (c !== out[0] && c !== out[n - 2]) { out[n - 1] = c; break; }
      }
    }
    return out;
  }

  /* ---------- Schülerliste ---------- */
  function parseNames(text) {
    return String(text || '').split(/\r?\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  function checkRoster(names, teacherName, joins) {
    const seen = new Map();
    for (const n of names) {
      const k = n.toLocaleLowerCase('de');
      if (seen.has(k)) return `„${n}“ steht doppelt in der Liste. Bitte unterscheiden, z. B. mit einem Buchstaben des Nachnamens.`;
      seen.set(k, true);
      if (n.length > MAX_NAME) return `Der Name „${n.slice(0, 20)}…“ ist zu lang (höchstens ${MAX_NAME} Zeichen).`;
    }
    if (names.length > MAX_STUDENTS) return `Höchstens ${MAX_STUDENTS} Namen pro Klasse.`;
    if (joins && teacherName && seen.has(teacherName.toLocaleLowerCase('de'))) return 'Die Lehrkraft steht bereits in der Schülerliste. Bitte dort entfernen oder „Lehrkraft wichtelt mit“ abwählen.';
    return null;
  }

  /* Gleiche Namen behalten ihre Kennung, auch wenn sich die Reihenfolge ändert. */
  function updateRoster(c, names) {
    const existing = new Map(c.students.map(s => [s.name, s]));
    const removed = c.students.filter(s => !names.includes(s.name));
    c.students = names.map(name => existing.get(name) || { id: uid(), name });
    return removed;
  }

  /* ---------- Runden, Archiv, Schuljahr ---------- */
  function archiveRound(db, c) {
    if (!c.assignments) return false;
    c.history = c.history || [];
    const ps = participants(db, c);
    c.history.push({
      year: c.year || schoolYear(), className: c.name, date: new Date().toISOString(),
      participants: ps.map(p => ({ id: p.id, name: p.name })),
      assignments: { ...c.assignments }, drawn: [...c.drawn], delivered: [...(c.delivered || [])],
      budget: c.budget, deadline: c.deadline
    });
    c.assignments = null; c.drawn = []; c.delivered = [];
    return true;
  }

  function promoteClass(db, c, name, year) {
    archiveRound(db, c);
    c.name = name; c.year = year;
  }

  function newClass(name) {
    return { id: uid(), name, year: schoolYear(), history: [], students: [], teacherJoins: false, budget: '10', budgetAlt: true, deadline: '', handover: 'Bei der Lehrkraft abgeben', extra: '', assignments: null, drawn: [], delivered: [] };
  }

  /* ---------- CSV (Excel-kompatibel, Semikolon, UTF-8 mit BOM, Schutz vor Formeln) ---------- */
  function csvCell(x) {
    let s = String(x ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function buildCSV(rows) {
    return '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
  }
  function safeFileName(s) {
    return String(s).replace(/[^a-z0-9äöüß_-]/gi, '_').slice(0, 60) || 'Klasse';
  }
  function roundRows(ps, assignments, drawn, delivered) {
    const name = id => ps.find(p => p.id === id)?.name || '';
    return [['Wichtel', 'Beschenkt', 'Gezogen', 'Geschenk abgegeben'],
      ...ps.map(p => [p.name, name(assignments[p.id]), drawn.includes(p.id) ? 'ja' : 'nein', (delivered || []).includes(p.id) ? 'ja' : 'nein'])];
  }

  /* ---------- Prüfung und Bereinigung geladener Daten ---------- */
  function fail(msg) { throw Error('Die Sicherung enthält ungültige Daten (' + msg + ').'); }
  const isStr = (v, max = 2000) => typeof v === 'string' && v.length <= max;
  const optStr = (v, max = 2000) => (v === undefined || v === null) ? '' : (isStr(v, max) ? v : fail('Textfeld'));

  function checkAssignment(ids, assignments) {
    const keys = Object.keys(assignments);
    if (keys.length !== ids.length) fail('Zuordnung unvollständig');
    const targets = new Set();
    for (const id of ids) {
      const t = assignments[id];
      if (typeof t !== 'string' || !ids.includes(t) || t === id || targets.has(t)) fail('Zuordnung fehlerhaft');
      targets.add(t);
    }
  }

  function normalizeBackup(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail('kein Datensatz');
    if (!isStr(v.teacher, 80)) fail('Lehrkraft');
    if (!Array.isArray(v.classes) || v.classes.length > MAX_CLASSES) fail('Klassenliste');
    const classIds = new Set();
    const out = { teacher: v.teacher, classes: [] };
    for (const c of v.classes) {
      if (!c || typeof c !== 'object') fail('Klasse');
      if (!isStr(c.id, 64) || !ID_RE.test(c.id) || classIds.has(c.id)) fail('Klassenkennung');
      classIds.add(c.id);
      if (!isStr(c.name, 60)) fail('Klassenname');
      if (!Array.isArray(c.students) || c.students.length > MAX_STUDENTS) fail('Schülerliste');
      const sIds = new Set();
      const students = c.students.map(s => {
        if (!s || !isStr(s.id, 64) || !ID_RE.test(s.id) || s.id === 'teacher' || sIds.has(s.id)) fail('Schülerkennung');
        if (!isStr(s.name, MAX_NAME)) fail('Schülername');
        sIds.add(s.id);
        return { id: s.id, name: s.name };
      });
      if (typeof c.teacherJoins !== 'boolean') fail('Mitwichteln');
      if (!Array.isArray(c.drawn)) fail('Ziehungen');
      const nc = {
        id: c.id, name: c.name, year: optStr(c.year, 20), history: [], students, teacherJoins: c.teacherJoins,
        budget: optStr(c.budget, 40), budgetAlt: typeof c.budgetAlt === 'boolean' ? c.budgetAlt : false,
        deadline: optStr(c.deadline, 20), handover: optStr(c.handover, 200), extra: optStr(c.extra, 1000),
        assignments: null, drawn: [], delivered: []
      };
      const pIds = [...sIds, ...(c.teacherJoins ? ['teacher'] : [])];
      if (c.assignments !== null && c.assignments !== undefined) {
        if (typeof c.assignments !== 'object' || Array.isArray(c.assignments)) fail('Zuordnung');
        checkAssignment(pIds, c.assignments);
        nc.assignments = {};
        pIds.forEach(id => { nc.assignments[id] = c.assignments[id]; });
        nc.drawn = c.drawn.filter((id, i, a) => typeof id === 'string' && pIds.includes(id) && a.indexOf(id) === i);
        const del = Array.isArray(c.delivered) ? c.delivered : [];
        nc.delivered = del.filter((id, i, a) => typeof id === 'string' && pIds.includes(id) && a.indexOf(id) === i);
      }
      const hist = c.history === undefined ? [] : c.history;
      if (!Array.isArray(hist) || hist.length > 100) fail('Archiv');
      nc.history = hist.map(h => {
        if (!h || typeof h !== 'object') fail('Archiveintrag');
        if (!Array.isArray(h.participants) || h.participants.length < 2 || h.participants.length > MAX_STUDENTS + 1) fail('Archiv-Teilnehmende');
        const ps = h.participants.map(p => {
          if (!p || !isStr(p.id, 64) || !ID_RE.test(p.id) || !isStr(p.name, MAX_NAME)) fail('Archiv-Teilnehmende');
          return { id: p.id, name: p.name };
        });
        const ids = ps.map(p => p.id);
        if (new Set(ids).size !== ids.length) fail('Archiv-Kennung');
        if (!h.assignments || typeof h.assignments !== 'object') fail('Archiv-Zuordnung');
        checkAssignment(ids, h.assignments);
        const assignments = {}; ids.forEach(id => { assignments[id] = h.assignments[id]; });
        const list = x => (Array.isArray(x) ? x : []).filter((id, i, a) => typeof id === 'string' && ids.includes(id) && a.indexOf(id) === i);
        return {
          year: optStr(h.year, 20), className: optStr(h.className, 60), date: optStr(h.date, 40),
          participants: ps, assignments, drawn: list(h.drawn), delivered: list(h.delivered),
          budget: optStr(h.budget, 40), deadline: optStr(h.deadline, 20)
        };
      });
      out.classes.push(nc);
    }
    return out;
  }

  /* ---------- Verschlüsselung (AES-256-GCM, Schlüssel per PBKDF2-SHA-256) ---------- */
  const bytesTo64 = a => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function derive(pass, salt, iterations) {
    const subtle = cryptoObj().subtle;
    const key = await subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptData(data, pass) {
    const c = cryptoObj();
    const iterations = KDF[CURRENT_VERSION];
    const salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12));
    const key = await derive(pass, salt, iterations);
    const ct = await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    return { format: 'wichtelstube-encrypted', version: CURRENT_VERSION, kdf: 'PBKDF2-SHA256', iterations, cipher: 'AES-256-GCM', salt: bytesTo64(salt), iv: bytesTo64(iv), data: bytesTo64(new Uint8Array(ct)) };
  }

  class BackupError extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }

  function parseBackupText(text) {
    let v;
    try { v = JSON.parse(text); } catch (e) { throw new BackupError('format', 'Diese Datei ist keine Wichtelstube-Sicherung oder sie ist beschädigt.'); }
    if (v?.format !== 'wichtelstube-encrypted' || !KDF[v.version] || v.iterations !== KDF[v.version] || v.cipher !== 'AES-256-GCM' || typeof v.salt !== 'string' || typeof v.iv !== 'string' || typeof v.data !== 'string')
      throw new BackupError('format', 'Diese Datei ist keine Wichtelstube-Sicherung oder stammt aus einer unbekannten Version.');
    return v;
  }

  async function decryptData(v, pass) {
    let salt, iv, data;
    try { salt = b64ToBytes(v.salt); iv = b64ToBytes(v.iv); data = b64ToBytes(v.data); } catch (e) { throw new BackupError('format', 'Die Sicherungsdatei ist beschädigt.'); }
    if (salt.length !== 16 || iv.length !== 12) throw new BackupError('format', 'Die Sicherungsdatei ist beschädigt.');
    const key = await derive(pass, salt, v.iterations);
    let plain;
    try { plain = await cryptoObj().subtle.decrypt({ name: 'AES-GCM', iv }, key, data); }
    catch (e) { throw new BackupError('password', 'Das Passwort passt nicht zu dieser Sicherung – oder die Datei wurde verändert.'); }
    try { return JSON.parse(new TextDecoder().decode(plain)); } catch (e) { throw new BackupError('format', 'Die Sicherungsdatei ist beschädigt.'); }
  }

  async function openBackup(text, pass) {
    const v = parseBackupText(text);
    const raw = await decryptData(v, pass);
    try { return normalizeBackup(raw); } catch (e) { throw new BackupError('content', e.message); }
  }

  const api = {
    ID_RE, MAX_NAME, KDF, CURRENT_VERSION, BackupError,
    esc, uid, randomInt, shuffle, createAssignments, participants, schoolYear, deletionDate, wheelColorIndices,
    parseNames, checkRoster, updateRoster, archiveRound, promoteClass, newClass,
    csvCell, buildCSV, safeFileName, roundRows,
    normalizeBackup, encryptData, decryptData, parseBackupText, openBackup
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WichtelCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
