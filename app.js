/* Die Wichtelstube – Oberfläche. Alle Ereignisse zentral über data-action (keine Inline-Handler, CSP-tauglich). */
(function () {
  'use strict';
  const W = window.WichtelCore;
  const { esc } = W;
  const $ = id => document.getElementById(id);
  const icon = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let db = { teacher: '', classes: [] };
  const st = { screen: 'home', classId: null, turnId: null, spinning: false, showResult: false, reveal: false, changed: false, exported: false, verified: false, angle: 0, rosterError: null, allowUnload: false };
  let printJobAt = 0;

  const hasData = () => !!(db.teacher || db.classes.length);
  const cur = () => db.classes.find(c => c.id === st.classId) || null;
  const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? '' : d.toLocaleDateString('de-DE'); };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const budgetValue = c => String(c.budget || '').replace(/\s*(€|eur|euro)\s*$/i, '').trim();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ---------- Sicherungsstatus ---------- */
  function markChanged() { st.changed = true; st.verified = false; updateSaveState(); }
  function updateSaveState() {
    const pill = $('saveState');
    if (!hasData()) { pill.hidden = true; } else {
      pill.hidden = false;
      pill.className = 'save-state ' + (st.changed || !st.exported ? 'unsaved' : 'saved');
      pill.textContent = st.changed || !st.exported ? 'Nicht gesichert' : (st.verified ? 'Gesichert & geprüft' : 'Gesichert');
      pill.setAttribute('aria-label', pill.textContent + ' – zur Sicherung');
    }
    const bs = $('backupStatus');
    if (bs) bs.innerHTML = (st.changed || !st.exported)
      ? `<span class="chip red">Nicht gesichert</span> Es gibt Änderungen, die noch in keiner Sicherungsdatei stehen.`
      : (st.verified ? `<span class="chip done">${icon('check')} Gesichert & geprüft</span> Du kannst die Sitzung beenden.` : `<span class="chip gold">Gesichert</span> Prüfe die Datei am besten einmal mit „Sicherung prüfen“.`);
  }

  /* ---------- Meldungen ---------- */
  let toastTimer;
  function toast(msg, kind = 'info') {
    const t = $('toast');
    $('toastText').textContent = msg;
    t.classList.toggle('error', kind === 'error');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, Math.min(12000, 4000 + msg.length * 55));
  }
  function hideToast() { $('toast').hidden = true; clearTimeout(toastTimer); }

  /* ---------- Dialog (Tastatur: Esc, Enter, Fokusfalle, Fokus zurück) ---------- */
  let dialogOpen = false;
  function dialog({ title, message = '', fields = [], ok = 'OK', cancel = 'Abbrechen', danger = false }) {
    return new Promise(resolve => {
      const bg = $('modalBackdrop'), box = $('modalBox'), okB = $('modalOK'), cB = $('modalCancel'), fw = $('modalFields');
      const prevFocus = document.activeElement;
      $('modalTitle').textContent = title;
      $('modalMessage').textContent = message;
      fw.innerHTML = fields.map((f, i) => {
        const id = 'mf' + i;
        const attrs = `id="${id}" autocomplete="${f.autocomplete || 'off'}" ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}`;
        const input = f.type === 'password'
          ? `<div class="pw-row"><input type="password" ${attrs} autocapitalize="off" spellcheck="false"><button type="button" class="btn ghost small" data-peek="${id}" aria-pressed="false" aria-label="Passwort anzeigen">Anzeigen</button></div>`
          : `<input type="text" ${attrs} value="${esc(f.value || '')}">`;
        return `<div class="field"><label for="${id}">${esc(f.label)}</label>${input}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
      }).join('');
      okB.textContent = ok;
      okB.className = 'btn' + (danger ? ' danger-solid' : '');
      cB.textContent = cancel || '';
      cB.hidden = cancel === null;
      bg.hidden = false;
      dialogOpen = true;
      const inputs = [...fw.querySelectorAll('input')];
      function close(v) {
        bg.hidden = true; dialogOpen = false;
        okB.onclick = cB.onclick = fw.onclick = box.onkeydown = null;
        inputs.forEach(i => { i.value = ''; });
        fw.innerHTML = '';
        if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
        resolve(v);
      }
      okB.onclick = () => close(fields.length ? Object.fromEntries(fields.map((f, i) => [f.name, inputs[i].value])) : true);
      cB.onclick = () => close(fields.length ? null : false);
      fw.onclick = e => {
        const b = e.target.closest('[data-peek]'); if (!b) return;
        const inp = $(b.dataset.peek), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.textContent = show ? 'Verbergen' : 'Anzeigen';
        b.setAttribute('aria-pressed', String(show));
        b.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
        inp.focus();
      };
      box.onkeydown = e => {
        if (e.key === 'Escape') { e.preventDefault(); (cB.hidden ? okB : cB).click(); }
        else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); okB.click(); }
        else if (e.key === 'Tab') {
          const f = [...box.querySelectorAll('button,input')].filter(x => !x.hidden && x.offsetParent !== null);
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      setTimeout(() => (inputs[0] || okB).focus(), 30);
    });
  }
  const confirmDlg = (title, message, ok = 'Ja, fortfahren', danger = false) => dialog({ title, message, ok, danger });
  const info = (title, message) => dialog({ title, message, ok: 'Verstanden', cancel: null });

  /* ---------- Automatisches Übernehmen von Eingaben ---------- */
  const pending = new Map();
  function debounce(key, fn, ms) {
    const old = pending.get(key); if (old) clearTimeout(old.t);
    pending.set(key, { fn, t: setTimeout(() => { pending.delete(key); fn(); }, ms) });
  }
  function flushPending() {
    for (const [k, e] of [...pending]) { clearTimeout(e.t); pending.delete(k); e.fn(); }
  }
  let savedTimers = {};
  function savedNote(id) {
    const el = $(id); if (!el) return;
    el.innerHTML = `${icon('check')} Gespeichert`;
    clearTimeout(savedTimers[id]);
    savedTimers[id] = setTimeout(() => { if ($(id)) $(id).textContent = ''; }, 2500);
  }

  /* ---------- Navigation ---------- */
  function go(screen, opts = {}) {
    if (st.spinning) return;
    flushPending();
    st.screen = screen; st.showResult = false; st.reveal = false;
    clearPrint();
    if (!opts.fromHistory) history.pushState({ screen, classId: st.classId }, '');
    render();
    window.scrollTo(0, 0);
    if (!opts.noFocus) focusHeading();
  }
  function focusHeading() {
    const h = $('app').querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  window.addEventListener('popstate', e => {
    if (st.spinning || st.screen === 'wheel' || dialogOpen) {
      history.pushState({ screen: st.screen, classId: st.classId }, '');
      if (st.screen === 'wheel' && !dialogOpen) toast('Zum Verlassen bitte „Klassenmodus beenden“ verwenden.');
      return;
    }
    const s = e.state || { screen: 'home' };
    if (s.classId && db.classes.some(c => c.id === s.classId)) st.classId = s.classId;
    const needsClass = ['class', 'protocol', 'archive', 'wheel'].includes(s.screen);
    go(needsClass && !cur() ? 'home' : (s.screen || 'home'), { fromHistory: true });
  });

  function render() {
    const c = cur();
    if (['class', 'protocol', 'archive', 'wheel'].includes(st.screen) && !c) st.screen = 'home';
    document.body.classList.toggle('classroom', st.screen === 'wheel');
    document.body.classList.toggle('on-home', st.screen === 'home');
    let html;
    switch (st.screen) {
      case 'class': html = classPage(c); break;
      case 'wheel': html = wheelPage(c); break;
      case 'protocol': html = protocolPage(c); break;
      case 'archive': html = archivePage(c); break;
      case 'info': html = infoPage(); break;
      default: st.screen = 'home'; html = db.teacher ? homePage() : welcomePage();
    }
    $('app').innerHTML = html;
    updateSaveState();
    if (st.screen !== 'home') $('sleigh')?.classList.remove('fly');
    if (st.screen === 'wheel') setupWheel(c);
  }

  /* ---------- Dekoration (nur Startseite, rein visuell, aria-hidden) ---------- */
  function elf(cls) {
    return `<g class="elf ${cls}">
      <path d="M-9-3Q-10-13 0-14Q10-13 9-3Z" fill="#245442"/>
      <path d="M-7.5-19L-13-22.5L-7.5-14.5ZM7.5-19L13-22.5L7.5-14.5Z" fill="#f6dcc0"/>
      <circle cx="0" cy="-17" r="8" fill="#f6dcc0"/>
      <circle cx="-3" cy="-18" r="1.15" fill="#1d3128"/><circle cx="3" cy="-18" r="1.15" fill="#1d3128"/>
      <circle cx="-5.2" cy="-14.6" r="1.6" fill="#eba79b"/><circle cx="5.2" cy="-14.6" r="1.6" fill="#eba79b"/>
      <path d="M-2.4-13.3Q0-11 2.4-13.3" stroke="#1d3128" stroke-width="1" fill="none" stroke-linecap="round"/>
      <path d="M-9-22Q-2-42 12-36Q4-33 8-24Z" fill="#a3372f"/><circle cx="12" cy="-36" r="2.8" fill="#fffaf0"/>
      <rect x="-10" y="-25" width="20" height="4.6" rx="2.3" fill="#fffaf0"/>
      <g class="elf-hand"><path d="M8.5-6L14.5-13.5" stroke="#245442" stroke-width="3.4" stroke-linecap="round"/><circle cx="15.6" cy="-15" r="2.8" fill="#f6dcc0"/></g>
    </g>`;
  }
  function fir(x, base, h, color) {
    const r = n => Math.round(n * 10) / 10, w = h * 0.62;
    let d = '';
    for (let t = 0; t < 3; t++) {
      const top = base - h + t * h * 0.24, bot = base - h * 0.12 - (2 - t) * h * 0.2, hw = w * (0.32 + t * 0.18);
      d += `M${r(x)} ${r(top)}L${r(x + hw)} ${r(bot)}L${r(x - hw)} ${r(bot)}Z`;
    }
    d += `M${r(x - h * 0.05)} ${r(base - h * 0.14)}h${r(h * 0.1)}V${base}h${r(-h * 0.1)}Z`;
    return `<path d="${d}" fill="${color}"/>`;
  }
  const twinkle = (x, y, z, i) => `<path class="tw tw${i}" d="M${x} ${y - z}L${x + z * 0.28} ${y - z * 0.28}L${x + z} ${y}L${x + z * 0.28} ${y + z * 0.28}L${x} ${y + z}L${x - z * 0.28} ${y + z * 0.28}L${x - z} ${y}L${x - z * 0.28} ${y - z * 0.28}Z" fill="#c49a4f"/>`;
  function headScene() {
    return `<svg class="scene deco" viewBox="0 0 260 120" aria-hidden="true" focusable="false">
      ${twinkle(28, 24, 4, 0)}${twinkle(96, 12, 3, 1)}${twinkle(214, 16, 3.5, 2)}${twinkle(246, 46, 2.6, 3)}
      <g transform="translate(72 109)">${elf('b')}</g>
      <rect x="55" y="88" width="34" height="22" rx="2" fill="#ddb86c"/><rect x="69" y="88" width="6" height="22" fill="#a3372f"/>
      <path d="M72 88q-9-9-12-2t12 2q9-9 12-2t-12 2z" fill="#a3372f"/>
      <g transform="translate(163 110) scale(-1 1)">${elf('a')}</g>
      ${fir(163, 112, 88, '#173e32')}<ellipse cx="163" cy="107" rx="26" ry="8" fill="#fffaf0"/><path d="M163 18l2.4 5 5.4.6-4 3.7 1.1 5.4-4.9-2.7-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" fill="#ddb86c"/>
      ${fir(222, 112, 56, '#245442')}${fir(24, 112, 48, '#245442')}
      <path d="M0 112Q60 101 130 107T260 105V120H0Z" fill="#fffaf0" stroke="#e0d3b8"/>
    </svg>`;
  }
  function footScene() {
    return `<svg class="foot-scene deco" viewBox="0 0 400 64" aria-hidden="true" focusable="false">
      ${fir(40, 60, 40, '#245442')}${fir(78, 60, 30, '#173e32')}
      <path d="M150 60V40l18-14 18 14v20z" fill="#173e32"/><rect x="163" y="44" width="10" height="9" fill="#ddb86c"/>
      ${fir(232, 60, 34, '#245442')}
      <g transform="translate(318 60)">${elf('c')}</g>
      ${fir(318, 60, 52, '#173e32')}${fir(360, 60, 38, '#245442')}
      <path d="M0 60H400V64H0Z" fill="#e0d3b8"/>
    </svg>`;
  }

  let sleighTimer;
  function scheduleSleigh(delay) {
    clearTimeout(sleighTimer);
    if (reduceMotion()) return;
    sleighTimer = setTimeout(flySleigh, delay ?? (30000 + Math.random() * 25000));
  }
  function flySleigh() {
    const s = $('sleigh');
    if (!s || document.hidden || st.screen !== 'home' || reduceMotion()) return scheduleSleigh();
    s.classList.remove('fly'); void s.getBoundingClientRect(); s.classList.add('fly');
    scheduleSleigh();
  }
  $('sleigh')?.addEventListener('animationend', e => { if (e.target.id === 'sleigh') e.target.classList.remove('fly'); });

  /* ---------- Start ---------- */
  function welcomePage() {
    return `<div class="page-head home-head"><div><span class="eyebrow">Willkommen</span><h1>Willkommen in der Wichtelstube</h1>
      <p class="lead">Geheimes Klassenwichteln mit Glücksrad – ohne Konto und ohne Cloud. Alles bleibt auf diesem Gerät.</p></div>${headScene()}</div>
      <div class="layout-2">
        <section class="card" aria-labelledby="hWho"><h2 id="hWho"><span class="num">1</span>Wie heißt du?</h2>
          <form data-form="teacher" novalidate><div class="field"><label for="teacherName">Name der Lehrkraft</label>
          <input id="teacherName" maxlength="80" placeholder="z. B. Frau Schmidt" autocomplete="off"><span class="hint">Steht auf den Wichtelvereinbarungen und im Lehrerprotokoll.</span></div>
          <button class="btn" type="submit">Los geht’s</button></form></section>
        <section class="card quiet" aria-labelledby="hAgain"><h2 id="hAgain">Schon einmal gewichtelt?</h2>
          <p class="muted">Öffne deine verschlüsselte Sicherungsdatei (.wichtel), um mit deinen Klassen weiterzumachen.</p>
          <button class="btn secondary" type="button" data-action="backup-import">${icon('up')} Sicherung öffnen</button></section>
      </div>
      <section class="card quiet" aria-labelledby="hHow"><h2 id="hHow">So funktioniert’s</h2>${howToSteps()}
        <p class="mt"><button class="btn ghost small" type="button" data-action="info">${icon('info')} Hilfe &amp; Datenschutz</button></p></section>
      ${footScene()}`;
  }
  function howToSteps() {
    return `<ol class="info-steps">
      <li>Klasse anlegen und die Namen der Kinder eintragen, die mitwichteln.</li>
      <li>Budget, Abgabetermin und Abgabeort festlegen, Vereinbarungen und Elternbrief drucken.</li>
      <li>Auslosung starten: Im Klassenmodus kommt jedes Kind nach vorne und dreht das Glücksrad.</li>
      <li>Im Lehrerprotokoll abhaken, wer sein Geschenk abgegeben hat.</li>
      <li>Vor dem Schließen verschlüsselt sichern – die Wichtelstube speichert nichts automatisch.</li></ol>`;
  }

  function homePage() {
    const tiles = db.classes.map(c => {
      const ps = W.participants(db, c);
      let chip;
      if (!c.assignments) chip = `<span class="chip">In Vorbereitung</span>`;
      else if (c.drawn.length < ps.length) chip = `<span class="chip gold">Auslosung läuft · ${c.drawn.length}/${ps.length}</span>`;
      else chip = `<span class="chip done">${icon('check')} Alle haben gezogen</span>`;
      return `<button type="button" class="class-tile" data-action="open-class" data-id="${esc(c.id)}">${icon('star', 't-star')}
        <span class="t-name">${esc(c.name)}</span><span class="t-meta">${c.year ? 'Schuljahr ' + esc(c.year) + ' · ' : ''}${plural(ps.length, 'Teilnehmer/in', 'Teilnehmende')}</span>${chip}</button>`;
    }).join('');
    return `<div class="page-head home-head"><div><span class="eyebrow">Hallo, ${esc(db.teacher)}</span><h1>Meine Klassen</h1></div>${headScene()}</div>
      ${db.classes.length ? `<div class="class-list">${tiles}</div>` : `<div class="card empty">${icon('tree', '')}<p>Noch keine Klasse angelegt.<br>Lege unten deine erste Klasse an.</p></div>`}
      <div class="card quiet"><form class="add-class" data-form="add-class" novalidate>
        <div class="field"><label for="newClass">Neue Klasse anlegen</label><input id="newClass" maxlength="60" placeholder="z. B. 5a" autocomplete="off"></div>
        <button class="btn" type="submit">+ Klasse anlegen</button></form></div>
      <section class="card" id="sicherung" aria-labelledby="hBackup"><h2 id="hBackup">${icon('lock')} Sicherung</h2>
        <p class="backup-status" id="backupStatus"></p>
        <p class="muted">Die Wichtelstube speichert nichts automatisch. Beim Schließen oder Neuladen sind die Daten weg – sichere deshalb verschlüsselt als Datei. Ohne Passwort ist keine Wiederherstellung möglich.</p>
        <div class="backup-actions">
          <button class="btn" type="button" data-action="backup-export">${icon('down')} Sichern</button>
          <button class="btn secondary" type="button" data-action="backup-import">${icon('up')} Sicherung öffnen</button>
          <button class="btn secondary" type="button" data-action="backup-verify">${icon('check')} Sicherung prüfen</button>
          <button class="btn danger" type="button" data-action="session-end">${icon('exit')} Sitzung beenden</button>
        </div></section>
      <div class="card quiet row"><span>Lehrkraft: <strong>${esc(db.teacher)}</strong></span><button class="btn ghost small" type="button" data-action="rename-teacher">Namen ändern</button></div>
      ${footScene()}`;
  }

  /* ---------- Klasse ---------- */
  function nextStep(c) {
    const ps = W.participants(db, c);
    const box = (text, btn = '') => `<div class="next-step"><p><span class="eyebrow">Nächster Schritt</span><strong>${text}</strong></p>${btn}</div>`;
    if (ps.length < 2) return box('Trage die Namen der Kinder ein, die mitwichteln.');
    if (!c.assignments) return box(`${ps.length} Teilnehmende sind bereit. Vereinbarungen drucken, dann die Auslosung starten.`, `<button class="btn gold" type="button" data-action="start-round">${icon('wheel')} Auslosung starten</button>`);
    if (c.drawn.length < ps.length) return box(`Die Auslosung läuft: ${c.drawn.length} von ${ps.length} haben gezogen.`, `<button class="btn gold" type="button" data-action="classroom">${icon('wheel')} Klassenmodus öffnen</button>`);
    const missing = ps.length - c.delivered.length;
    if (missing) return box(`Alle haben gezogen. ${missing === 1 ? 'Ein Geschenk fehlt' : missing + ' Geschenke fehlen'} noch – im Abgabe-Check abhaken.`, `<button class="btn" type="button" data-action="protocol">${icon('gift')} Abgabe-Check</button>`);
    return box('Alle Geschenke sind da. Frohe Weihnachten!', `<button class="btn ghost" type="button" data-action="protocol">${icon('lock')} Protokoll</button>`);
  }

  function drawCard(c) {
    const ps = W.participants(db, c);
    const h = `<h2><span class="num">4</span>Auslosung</h2>`;
    if (!c.assignments) return h + `<p class="muted">Das Glücksrad öffnet sich im <strong>Klassenmodus</strong>: ohne Protokoll und Menüs – ideal für Beamer, Whiteboard oder Tablet.</p>
      <button class="btn gold big full" type="button" data-action="start-round" ${ps.length < 2 ? 'disabled' : ''}>${icon('wheel')} Auslosung starten</button>
      ${ps.length < 2 ? '<p class="small muted mt">Dafür mindestens zwei Teilnehmende eintragen.</p>' : ''}`;
    const done = c.drawn.length >= ps.length;
    return h + `<p><span class="chip ${done ? 'done' : 'gold'}">${c.drawn.length} von ${ps.length} gezogen</span></p><div class="stack">
      ${done ? '' : `<button class="btn gold big full" type="button" data-action="classroom">${icon('wheel')} Klassenmodus öffnen</button>`}
      <button class="btn ${done ? '' : 'secondary'}" type="button" data-action="protocol">${icon('lock')} Lehrerprotokoll &amp; Abgabe-Check</button>
      <button class="btn ghost" type="button" data-action="archive-round">${icon('archive')} Runde abschließen &amp; archivieren</button>
      <button class="btn danger" type="button" data-action="reset-round">Neu auslosen</button></div>`;
  }

  function classPage(c) {
    const ps = W.participants(db, c), locked = !!c.assignments;
    return `<button class="crumb" type="button" data-action="home">${icon('back')} Alle Klassen</button>
      <div class="page-head"><span class="eyebrow">${c.year ? 'Schuljahr ' + esc(c.year) : 'Klasse'}</span><h1>Klasse ${esc(c.name)}</h1></div>
      <div id="nextStep">${nextStep(c)}</div>
      <div class="layout-2"><div>
        <section class="card" aria-labelledby="hP"><h2 id="hP"><span class="num">1</span>Wer wichtelt mit?</h2>
          <label for="names">Namen – ein Name pro Zeile<span class="hint">Vornamen genügen. Die Reihenfolge bestimmt nur, wer beim Glücksrad nach vorne kommt – nicht, wen jemand zieht.</span></label>
          <textarea id="names" class="names" data-roster ${locked ? 'disabled' : ''} placeholder="Emma&#10;Noah&#10;Lina" spellcheck="false" autocomplete="off">${esc(c.students.map(s => s.name).join('\n'))}</textarea>
          <div id="rosterError" class="inline-error" role="alert" ${st.rosterError ? '' : 'hidden'}>${esc(st.rosterError || '')}</div>
          <label class="check"><input type="checkbox" id="joins" data-joins ${c.teacherJoins ? 'checked' : ''} ${locked ? 'disabled' : ''}>
            <span>Ich wichtle selbst mit (${esc(db.teacher)})<small>Freiwillig. Die Auslosung funktioniert mit und ohne Lehrkraft.</small></span></label>
          <div class="row"><span class="chip" id="countChip">${plural(ps.length, 'Teilnehmer/in', 'Teilnehmende')}</span><span class="saved-note" id="rosterSaved" aria-live="polite"></span></div>
          ${locked ? `<p class="note mt">Die Auslosung läuft – die Liste ist gesperrt. Änderungen sind nach „Runde abschließen“ oder „Neu auslosen“ möglich.</p>` : ''}
        </section>
        <section class="card" aria-labelledby="hR"><h2 id="hR"><span class="num">2</span>Regeln &amp; Abgabe</h2>
          <div class="grid2">
            <div class="field"><label for="budget">Geschenkbudget in Euro</label><input id="budget" data-field="budget" inputmode="decimal" maxlength="12" value="${esc(c.budget)}" placeholder="z. B. 5"></div>
            <div class="field"><label for="deadline">Abgabe bis</label><input id="deadline" type="date" data-field="deadline" value="${esc(c.deadline)}"></div>
          </div>
          <label class="check"><input type="checkbox" data-field-check="budgetAlt" ${c.budgetAlt ? 'checked' : ''}><span>Selbstgemachtes ist genauso willkommen<small>Steht auf Vereinbarung und Elternbrief – so muss niemand Geld ausgeben.</small></span></label>
          <div class="field"><label for="handover">Wo wird das Geschenk abgegeben?</label><input id="handover" data-field="handover" maxlength="200" value="${esc(c.handover)}" placeholder="z. B. im Klassenzimmer bei Frau Schmidt"></div>
          <div class="field"><label for="extra">Weitere Hinweise (optional)</label><textarea id="extra" data-field="extra" maxlength="1000" placeholder="z. B. Bitte keine Lebensmittel mit Nüssen">${esc(c.extra)}</textarea></div>
          <span class="saved-note" id="rulesSaved" aria-live="polite"></span>
        </section>
      </div><div>
        <section class="card" aria-labelledby="hD"><h2 id="hD"><span class="num">3</span>Drucken</h2>
          <p class="muted">Vor der Auslosung austeilen. Namen tragen die Kinder von Hand ein.</p>
          <div class="stack">
            <button class="btn secondary" type="button" data-action="print-contracts">${icon('print')} <span>Wichtelvereinbarungen (<span id="printCount">${ps.length || '–'}</span> Stück)</span></button>
            <button class="btn secondary" type="button" data-action="print-letter">${icon('letter')} Elternbrief</button>
          </div>
          <details class="preview"><summary>Vorschau der Vereinbarung</summary><div class="contract-preview" id="contractPreview">${rulesHTML(c)}</div></details>
        </section>
        <section class="card" id="drawCard" aria-label="Auslosung">${drawCard(c)}</section>
        <section class="card quiet" aria-labelledby="hM"><h2 id="hM">${icon('calendar')} Klasse verwalten</h2><div class="stack">
          <button class="btn ghost" type="button" data-action="promote">Ins nächste Schuljahr übernehmen</button>
          <button class="btn ghost" type="button" data-action="archive">${icon('archive')} Frühere Runden (${(c.history || []).length})</button>
          <button class="btn danger" type="button" data-action="delete-class">${icon('trash')} Klasse löschen</button></div></section>
      </div></div>`;
  }

  function refreshClassBits(c) {
    const ps = W.participants(db, c);
    if ($('countChip')) $('countChip').textContent = plural(ps.length, 'Teilnehmer/in', 'Teilnehmende');
    if ($('printCount')) $('printCount').textContent = ps.length || '–';
    if ($('nextStep')) $('nextStep').innerHTML = nextStep(c);
    if ($('drawCard')) $('drawCard').innerHTML = drawCard(c);
    if ($('contractPreview')) $('contractPreview').innerHTML = rulesHTML(c);
  }
  function showRosterError(msg) {
    st.rosterError = msg;
    const el = $('rosterError'); if (!el) return;
    el.textContent = msg || ''; el.hidden = !msg;
  }

  function saveRoster(c, text) {
    if (c.assignments) return;
    const names = W.parseNames(text);
    const err = W.checkRoster(names, db.teacher, c.teacherJoins);
    showRosterError(err);
    if (err) return;
    if (JSON.stringify(names) === JSON.stringify(c.students.map(s => s.name))) return;
    W.updateRoster(c, names);
    markChanged(); refreshClassBits(c); savedNote('rosterSaved');
  }
  function saveField(c, field, value) {
    const v = field === 'deadline' ? value : value.trim();
    if (c[field] === v) return;
    c[field] = v;
    markChanged(); refreshClassBits(c); savedNote('rulesSaved');
  }
  function setJoins(c, el) {
    flushPending();
    if (c.assignments) { el.checked = c.teacherJoins; return; }
    if (el.checked) {
      const err = W.checkRoster(c.students.map(s => s.name), db.teacher, true);
      if (err) { el.checked = false; showRosterError(err); return; }
    }
    c.teacherJoins = el.checked;
    showRosterError(W.checkRoster(c.students.map(s => s.name), db.teacher, c.teacherJoins));
    markChanged(); refreshClassBits(c); savedNote('rosterSaved');
  }

  /* ---------- Regeln, Druck ---------- */
  function rulesHTML(c) {
    const b = budgetValue(c);
    return `<p><strong>Freiwillig:</strong> Die Teilnahme ist freiwillig. Wer nicht mitmachen möchte oder kein Geschenk besorgen kann, spricht vertraulich mit der Lehrkraft. Niemand wird dadurch benachteiligt.</p>
      <ul>
        <li>Wenn ich mitmache, besorge oder bastle ich ein Geschenk für mein Wichtelkind${b ? ` und gebe höchstens <strong>${esc(b)} €</strong> aus` : ''}.</li>
        ${c.budgetAlt ? '<li>Selbstgemachtes ist genauso willkommen wie Gekauftes.</li>' : ''}
        <li>Das Geschenk ist sauber, unbeschädigt, angemessen und liebevoll verpackt.</li>
        <li>Ich gebe es rechtzeitig ab${c.deadline ? ` – spätestens am <strong>${esc(fmtDate(c.deadline))}</strong>` : ''}.</li>
        <li>Abgabeort: <strong>${esc(c.handover || 'wird noch bekanntgegeben')}</strong>.</li>
        <li>Ich verrate niemandem, wen ich gezogen habe.</li>
        ${c.extra ? `<li>${esc(c.extra)}</li>` : ''}
      </ul>`;
  }
  function sheetHead(c, title) {
    return `<svg class="horizon-print" aria-hidden="true"><use href="#horizon"/></svg><h1>${esc(title)}</h1>
      <p class="meta"><strong>Klasse:</strong> ${esc(c.name)} &nbsp;·&nbsp; <strong>Lehrkraft:</strong> ${esc(db.teacher)}</p>`;
  }
  // pages: HTML-Text (eine Seite) oder { html, cls } für besondere Bögen (z. B. zwei Vereinbarungen pro Seite)
  function printSheets(pages) {
    $('printArea').innerHTML = pages.map(x => typeof x === 'string' ? `<article class="sheet">${x}</article>` : `<article class="sheet ${x.cls}">${x.html}</article>`).join('');
    printJobAt = Date.now();
    setTimeout(() => window.print(), 80);
  }
  // Misst unsichtbar, ob ein Bogeninhalt in die angegebene Höhe (mm) passt – dieselbe Typografie wie im Druck.
  function fitsHeight(html, cls, maxMm) {
    const box = document.createElement('div');
    box.className = 'print-measure'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = `<article class="sheet ${cls}">${html}</article>`;
    document.body.appendChild(box);
    const h = box.firstElementChild.scrollHeight;
    box.remove();
    return h <= maxMm * 96 / 25.4;
  }
  function clearPrint() { $('printArea').innerHTML = ''; printJobAt = 0; }
  // Schutz: Wer später über das Browsermenü druckt, bekommt nie einen alten (geheimen) Ausdruck.
  window.addEventListener('beforeprint', () => {
    if (!printJobAt || Date.now() - printJobAt > 20000) {
      $('printArea').innerHTML = `<article class="sheet"><h1>Die Wichtelstube</h1><p>Bitte die Druckknöpfe in der Wichtelstube verwenden: Wichtelvereinbarungen, Elternbrief oder Lehrerprotokoll.</p></article>`;
    }
  });

  function printContracts() {
    const c = cur(); flushPending();
    const n = W.participants(db, c).length;
    if (!n) return toast('Bitte zuerst die Teilnehmenden eintragen.');
    const page = `<svg class="horizon-print" aria-hidden="true"><use href="#horizon"/></svg>
      <div class="c-head"><h1>Unsere Wichtelvereinbarung</h1><p class="meta"><strong>Klasse:</strong> ${esc(c.name)} &nbsp;·&nbsp; <strong>Lehrkraft:</strong> ${esc(db.teacher)}</p></div>
      ${rulesHTML(c)}
      <div class="fill"><strong>Mein Name:</strong><span class="line"></span></div>
      <div class="secret"><div class="fill"><strong>Mein geheimes Wichtelkind:</strong><span class="line"></span></div><p class="psst"><em>Pssst! Bitte nicht weitererzählen.</em></p></div>
      <p class="agree">Ich habe die Regeln verstanden und mache mit.</p>
      <div class="fill"><strong>Datum, Unterschrift:</strong><span class="line"></span></div>`;
    // Papier sparen: zwei Vereinbarungen pro A4-Seite, wenn eine sicher auf eine halbe Seite passt (129 mm von 131 mm).
    if (fitsHeight(`<div class="half">${page}</div>`, '', 129)) {
      printSheets(W.chunk(Array(n).fill(page), 2).map(pair => ({ cls: 'two-up', html: pair.map(p => `<section class="half">${p}</section>`).join('') })));
    } else {
      const cls = fitsHeight(page, '', 268) ? '' : 'compact';
      printSheets(Array(n).fill({ cls, html: page }));
    }
  }
  function printLetter() {
    const c = cur(); flushPending();
    const b = budgetValue(c);
    const page = `${sheetHead(c, 'Wichteln in der Klasse ' + c.name)}
      <p>Liebe Eltern und Erziehungsberechtigte,</p>
      <p>in der Adventszeit möchten wir in der Klasse ${esc(c.name)} wichteln: Jedes Kind, das mitmacht, zieht geheim ein anderes Kind und überrascht es mit einem kleinen Geschenk.</p>
      <ul>
        <li><strong>Freiwillig:</strong> Die Teilnahme ist freiwillig. Wenn Ihr Kind nicht mitmachen möchte oder ein Geschenk gerade nicht möglich ist, sprechen Sie mich bitte vertraulich an. Es entstehen keine Nachteile.</li>
        <li><strong>Budget:</strong> ${b ? `höchstens ${esc(b)} €` : 'wird in der Klasse vereinbart'}.${c.budgetAlt ? ' Selbstgemachtes ist ausdrücklich willkommen.' : ''}</li>
        <li><strong>Abgabe:</strong> ${c.deadline ? `bis ${esc(fmtDate(c.deadline))}` : 'Termin folgt'}${c.handover ? ' · ' + esc(c.handover) : ''}</li>
        ${c.extra ? `<li>${esc(c.extra)}</li>` : ''}
      </ul>
      <p><strong>Zur Auslosung:</strong> Ich lose mit einer Anwendung aus, die ohne Benutzerkonto arbeitet. Die Vornamen werden nur auf meinem Gerät verarbeitet und nicht an einen Server übertragen.</p>
      <p>Herzliche Grüße<br>${esc(db.teacher)}</p>
      <div class="slip"><p><strong>Rückmeldung (freiwillig)</strong></p>
        <p><span class="box"></span>Mein Kind macht mit. &nbsp; <span class="box"></span>Mein Kind macht nicht mit. &nbsp; <span class="box"></span>Bitte sprechen Sie mich an.</p>
        <p>Name des Kindes: ______________________ &nbsp; Unterschrift: ______________________</p></div>`;
    printSheets([{ cls: fitsHeight(page, '', 268) ? '' : 'compact', html: page }]);
  }
  function printProtocol() {
    const c = cur(), ps = W.participants(db, c);
    if (!c.assignments) return;
    const name = id => ps.find(p => p.id === id)?.name || '—';
    printSheets([`${sheetHead(c, 'Vertrauliches Lehrerprotokoll')}
      <table><thead><tr><th>Wichtel</th><th>beschenkt</th><th>gezogen</th><th>Geschenk abgegeben</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(name(c.assignments[p.id]))}</td><td>${c.drawn.includes(p.id) ? 'ja' : 'offen'}</td><td>${c.delivered.includes(p.id) ? 'ja' : ''}</td></tr>`).join('')}</tbody></table>
      <p class="foot">Vertraulich – nur für die Lehrkraft. Nach Abschluss der Aktion sicher vernichten. Erstellt am ${esc(new Date().toLocaleDateString('de-DE'))}.</p>`]);
  }

  /* ---------- Dateien ---------- */
  // Unverändert aus der bisherigen Version (funktioniert auf iOS als Home-Bildschirm-App).
  function download(name, data, mime) { let blob = new Blob([data], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
  function exportCSV() {
    const c = cur(), ps = W.participants(db, c);
    if (!c.assignments) return;
    download('Wichtelprotokoll_' + W.safeFileName(c.name) + '.csv', W.buildCSV(W.roundRows(ps, c.assignments, c.drawn, c.delivered)), 'text/csv;charset=utf-8');
  }

  /* ---------- Klassenmodus und Glücksrad ---------- */
  const POINTER = `<svg class="pointer" id="pointer" viewBox="0 0 40 60" aria-hidden="true" focusable="false"><path d="M20 58L6.5 21A14 14 0 1 1 33.5 21Z" fill="#a3372f" stroke="#7a241e" stroke-width="1.5" stroke-linejoin="round"/><circle cx="20" cy="15.5" r="6" fill="#ddb86c" stroke="#94712f" stroke-width="1.5"/></svg>`;
  const SEG = [{ bg: '#245442', fg: '#fdf6e6' }, { bg: '#f6ead0', fg: '#173e32' }, { bg: '#a3372f', fg: '#fff6ee' }, { bg: '#ddb86c', fg: '#1d2a20' }];
  const SERIF = getComputedStyle(document.documentElement).getPropertyValue('--serif') || 'Georgia, serif';

  function wheelPage(c) {
    if (!c.assignments) return `<h1>Noch keine Auslosung</h1><p>Bitte zuerst die Klasse vorbereiten.</p><button class="btn" type="button" data-action="leave-classroom-done">Zur Klasse</button>`;
    const ps = W.participants(db, c), remaining = ps.filter(p => !c.drawn.includes(p.id));
    const pick = remaining.length ? `<div class="pick"><label for="turnSelect">Jemand fehlt?</label>
            <select id="turnSelect">${remaining.map(q => `<option value="${esc(q.id)}" ${q.id === st.turnId || (!st.turnId && q === remaining[0]) ? 'selected' : ''}>${esc(q.name)}</option>`).join('')}</select></div>` : '';
    const bar = `<div class="classroom-bar"><span class="cls" title="Klasse ${esc(c.name)}">Klasse ${esc(c.name)}</span>
      <div class="progress"><div class="progress-track" role="progressbar" aria-label="Fortschritt der Ziehung" aria-valuemin="0" aria-valuemax="${ps.length}" aria-valuenow="${c.drawn.length}"><div class="progress-fill" id="progFill"></div></div>
      <small id="progText">${c.drawn.length} von ${ps.length} haben gezogen</small></div>
      ${pick}<button class="btn ghost small" type="button" id="leaveBtn" data-action="leave-classroom" aria-label="Klassenmodus beenden">${icon('exit')} <span class="lbl-long">Klassenmodus beenden</span><span class="lbl-short">Beenden</span></button></div>`;
    if (!remaining.length) return `<h1 class="visually-hidden">Glücksrad – Klasse ${esc(c.name)}</h1>${bar}
      <div class="card done-card">${icon('star', '')}<h2>Alle haben gezogen!</h2><p class="lead">Jetzt heißt es: Geschenke besorgen – und das Geheimnis gut bewahren.</p>
      <button class="btn" type="button" data-action="leave-classroom-done">Zur Lehrkraft-Ansicht</button></div>`;
    if (!st.turnId || !remaining.some(p => p.id === st.turnId)) st.turnId = remaining[0].id;
    const p = ps.find(x => x.id === st.turnId);
    const n = ps.length - 1;
    return `<h1 class="visually-hidden">Glücksrad – Klasse ${esc(c.name)}</h1>${bar}
      <div class="stage" id="stage">
        <div class="turn-head">
          <p class="now">Jetzt ist dran</p>
          <p class="who" id="turnName">${esc(p.name)}</p>
          <p class="instr" id="turnInstr">Komm nach vorne und dreh das Glücksrad.<span class="instr-extra"> Dein eigener Name ist nicht dabei.</span></p>
        </div>
        <div class="wheel-wrap" id="wheelWrap">${POINTER}
          <canvas id="wheel" role="img" aria-label="Glücksrad mit ${plural(n, 'Name', 'Namen')}"></canvas>
          <div class="reveal" id="reveal" hidden></div>
        </div>
        <div class="spin-row" id="spinRow"><button class="btn gold big" type="button" id="spinBtn" data-action="spin">${icon('wheel')} Glücksrad drehen</button></div>
      </div>`;
  }

  function setupWheel(c) {
    const fill = $('progFill');
    if (fill && c?.assignments) { const ps = W.participants(db, c); fill.style.width = Math.round(c.drawn.length / ps.length * 100) + '%'; }
    if (!$('wheel')) return;
    sizeWheel();
    drawWheel(c, st.angle, 0);
  }
  /* Rad so groß wie möglich: Breite der Bühne und verfügbare Bildschirmhöhe ausnutzen. */
  // Desktop (Maus, breites Fenster): Rad bewusst auf 420–480 px begrenzt, damit Name, Rad und Taste eine Einheit bilden.
  // Smartphones und Tablets (Touch) behalten die volle, am Platz orientierte Größe.
  const DESKTOP_MQ = '(hover: hover) and (pointer: fine) and (min-width: 900px)';
  const desktopWheelMax = () => Math.round(Math.min(480, Math.max(420, window.innerWidth * 0.25)));
  function sizeWheel() {
    const wrap = $('wheelWrap'), stage = $('stage');
    if (!wrap || !stage) return;
    const side = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
    const desktop = window.matchMedia(DESKTOP_MQ).matches;
    const vh = window.innerHeight, docTop = el => el.getBoundingClientRect().top + window.scrollY;
    let maxW, avail;
    if (side) {
      maxW = stage.clientWidth * 0.6;
      avail = vh - docTop(stage) - 12;
    } else {
      // Höhe unabhängig von der aktuellen Radposition berechnen (Bühne kann auf dem Desktop vertikal zentriert sein).
      maxW = stage.clientWidth;
      const row = $('spinRow'), head = stage.querySelector('.turn-head');
      avail = vh - docTop(stage) - (head ? head.offsetHeight : 120) - (row ? row.offsetHeight : 60) - 28;
    }
    let size = Math.round(Math.max(200, Math.min(maxW, avail / 1.04, 1000)));
    if (desktop && !side) size = Math.min(size, desktopWheelMax());
    wrap.style.width = size + 'px';
    wrap.style.marginTop = Math.round(size * (side ? 0.04 : 0.035)) + 'px';
    sizeCanvas();
  }
  function sizeCanvas() {
    const cv = $('wheel'); if (!cv) return;
    const w = cv.getBoundingClientRect().width || 400;
    const px = Math.max(240, Math.round(w * Math.min(window.devicePixelRatio || 1, 2.5)));
    if (cv.width !== px) { cv.width = px; cv.height = px; }
  }
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (st.screen === 'wheel' && $('wheel')) { sizeWheel(); const c = cur(); if (c) drawWheel(c, st.angle, 0); } }, 80);
  });
  const wheelNames = c => W.participants(db, c).filter(p => p.id !== st.turnId);
  const segAt = (rot, n) => Math.floor(((((-rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI / n)) % n;

  function drawWheel(c, rot, phase) {
    const cv = $('wheel'); if (!cv) return;
    const ctx = cv.getContext('2d'), S = cv.width, cx = S / 2, cy = S / 2;
    const ps = wheelNames(c), n = ps.length;
    const R = S / 2 * 0.985, goldR = R * 0.93, segR = R * 0.905;
    ctx.clearRect(0, 0, S, S);
    // Rahmen: Tannengrün mit Lichterkette, darin ein Goldring
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = '#173e32'; ctx.fill();
    const B = 28;
    for (let k = 0; k < B; k++) {
      const a = k * 2 * Math.PI / B, br = R * 0.965;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * br, cy + Math.sin(a) * br, R * 0.016, 0, 2 * Math.PI);
      ctx.fillStyle = (phase && (k + phase) % 2) ? '#8f7a45' : '#fff1c2'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, goldR, 0, 2 * Math.PI); ctx.fillStyle = '#c49a4f'; ctx.fill();
    if (!n) return;
    const step = 2 * Math.PI / n, cols = W.wheelColorIndices(n);
    for (let i = 0; i < n; i++) {
      const start = rot + i * step - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, segR, start, start + step); ctx.closePath();
      ctx.fillStyle = SEG[cols[i]].bg; ctx.fill();
    }
    if (n > 1) {
      ctx.strokeStyle = '#c49a4f'; ctx.lineWidth = Math.max(1.5, S * 0.004);
      for (let i = 0; i < n; i++) {
        const a = rot + i * step - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * segR, cy + Math.sin(a) * segR); ctx.stroke();
      }
    }
    // Namen
    const textR = segR * 0.93, maxW = segR * 0.7;
    const chord = n > 1 ? 2 * segR * 0.72 * Math.sin(step / 2) : S;
    const fs = Math.max(S * 0.022, Math.min(S * 0.052, chord * 0.62));
    ctx.font = `700 ${fs}px ${SERIF}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (let i = 0; i < n; i++) {
      const mid = rot + i * step - Math.PI / 2 + step / 2;
      let label = ps[i].name, size = fs;
      ctx.font = `700 ${size}px ${SERIF}`;
      while (size > fs * 0.72 && ctx.measureText(label).width > maxW) { size *= 0.94; ctx.font = `700 ${size}px ${SERIF}`; }
      while (label.length > 3 && ctx.measureText(label).width > maxW) label = label.slice(0, -2) + '…';
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(n > 1 ? mid : 0);
      ctx.fillStyle = SEG[cols[i]].fg;
      if (n > 1) ctx.fillText(label, textR, 0); else { ctx.textAlign = 'center'; ctx.fillText(label, 0, -segR * 0.5); }
      ctx.restore();
    }
    // Nabe mit Scherenschnitt-Stern
    const hubR = R * 0.13;
    ctx.beginPath(); ctx.arc(cx, cy, hubR, 0, 2 * Math.PI); ctx.fillStyle = '#fffaf0'; ctx.fill();
    ctx.lineWidth = R * 0.02; ctx.strokeStyle = '#c49a4f'; ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 8 + rot, rr = k % 2 ? hubR * 0.36 : hubR * 0.78;
      ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fillStyle = '#a3372f'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, hubR * 0.16, 0, 2 * Math.PI); ctx.fillStyle = '#ddb86c'; ctx.fill();
  }

  function tickPointer() {
    const p = $('pointer'); if (!p || reduceMotion()) return;
    p.classList.remove('tick'); void p.getBoundingClientRect(); p.classList.add('tick');
  }

  function spin() {
    const c = cur();
    if (!c || st.spinning || !st.turnId || st.showResult) return;
    const giver = W.participants(db, c).find(p => p.id === st.turnId);
    const ps = wheelNames(c), winner = c.assignments[st.turnId], idx = ps.findIndex(p => p.id === winner);
    if (idx < 0) return toast('Fehler in der Auslosung. Bitte im Lehrerprotokoll prüfen.', 'error');
    st.spinning = true;
    ['spinBtn', 'turnSelect', 'leaveBtn'].forEach(id => { if ($(id)) $(id).disabled = true; });
    const n = ps.length, step = 2 * Math.PI / n;
    const frac = n === 1 ? 0.5 : 0.2 + Math.random() * 0.6; // natürlich wirkender Haltepunkt im Feld (rein optisch)
    const target = -((idx + frac) * step);
    const base = st.angle;
    const delta = ((target - base) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const rm = reduceMotion();
    const final = base + (rm ? 0 : 6) * 2 * Math.PI + delta;
    const duration = rm ? 700 : 5200;
    const begin = performance.now();
    let last = segAt(base, n), phase = 0;
    function frame(now) {
      const t = Math.min(1, (now - begin) / duration), e = 1 - Math.pow(1 - t, 4);
      st.angle = base + (final - base) * e;
      const s = segAt(st.angle, n);
      if (s !== last) { last = s; phase++; tickPointer(); }
      drawWheel(c, st.angle, phase);
      if (t < 1) requestAnimationFrame(frame); else done();
    }
    function done() {
      st.angle = final;
      drawWheel(c, st.angle, 0);
      if (!c.drawn.includes(st.turnId)) c.drawn.push(st.turnId);
      markChanged();
      const all = W.participants(db, c).length;
      if ($('progFill')) $('progFill').style.width = Math.round(c.drawn.length / all * 100) + '%';
      if ($('progText')) $('progText').textContent = `${c.drawn.length} von ${all} haben gezogen`;
      st.spinning = false; st.showResult = true;
      showReveal(giver.name, ps[idx].name);
    }
    requestAnimationFrame(frame);
  }

  function showReveal(giverName, name) {
    const r = $('reveal');
    if (!r) return;
    r.innerHTML = `<div class="tag-card" role="group" aria-labelledby="revealFor">
      <p class="for" id="revealFor" tabindex="-1">${esc(giverName)}, du beschenkst</p>
      <p class="name">${esc(name)}</p>
      <p class="psst">Pssst – das bleibt dein Geheimnis.</p>
      <button class="btn" type="button" data-action="hide-result">${icon('eye')} Verbergen &amp; weiter</button></div>`;
    r.hidden = false;
    if ($('spinBtn')) $('spinBtn').hidden = true;
    if ($('turnInstr')) $('turnInstr').textContent = 'Lies dein Ergebnis leise – dann auf „Verbergen & weiter“ tippen.';
    if ($('leaveBtn')) $('leaveBtn').disabled = false;
    $('revealFor').focus({ preventScroll: true });
    r.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }
  function hideResult() {
    st.turnId = null; st.showResult = false; st.angle = 0;
    render(); window.scrollTo(0, 0);
    ($('spinBtn') || $('app').querySelector('[data-action="leave-classroom-done"]'))?.focus({ preventScroll: true });
  }
  function changeTurn(id) {
    if (st.spinning || st.showResult) return;
    st.turnId = id; st.angle = 0;
    render();
    $('turnSelect')?.focus({ preventScroll: true });
  }
  async function leaveClassroom() {
    if (st.spinning) return;
    if (!await confirmDlg('Klassenmodus beenden?', 'Danach erscheint wieder die Lehrkraft-Ansicht mit dem Zugang zum Protokoll. Bitte erst beenden, wenn kein Kind mehr auf den Bildschirm schaut.', 'Beenden')) return;
    st.turnId = null; st.angle = 0;
    go('class');
  }

  /* ---------- Protokoll mit Abgabe-Check ---------- */
  function protocolPage(c) {
    const crumb = `<button class="crumb" type="button" data-action="open-class" data-id="${esc(c.id)}">${icon('back')} Klasse ${esc(c.name)}</button>`;
    const head = `<div class="page-head"><span class="eyebrow">Nur für die Lehrkraft</span><h1>Lehrerprotokoll · ${esc(c.name)}</h1></div>`;
    if (!c.assignments) return crumb + head + `<div class="card"><p>Für diese Klasse wurde noch nicht ausgelost.</p></div>`;
    const ps = W.participants(db, c), rev = st.reveal;
    const name = id => ps.find(p => p.id === id)?.name || '—';
    const missing = ps.filter(p => !c.delivered.includes(p.id));
    const rows = ps.map(p => `<tr><td>${esc(p.name)}</td>
      <td class="${rev ? 'secret-cell' : 'masked'}">${rev ? esc(name(c.assignments[p.id])) : '<span aria-hidden="true">••••••</span><span class="visually-hidden">verborgen</span>'}</td>
      <td>${c.drawn.includes(p.id) ? `<span class="chip done">${icon('check')} gezogen</span>` : '<span class="chip">offen</span>'}</td>
      <td><label class="check"><input type="checkbox" data-deliver="${esc(p.id)}" ${c.delivered.includes(p.id) ? 'checked' : ''}><span class="visually-hidden">Geschenk von ${esc(p.name)} abgegeben</span></label></td></tr>`).join('');
    const missingText = !missing.length
      ? `<p><span class="chip done">${icon('check')} Alle Geschenke sind abgegeben.</span></p>`
      : `<p>Noch kein Geschenk abgegeben: <strong>${missing.map(p => esc(p.name) + (rev ? ` <span class="muted">(für ${esc(name(c.assignments[p.id]))})</span>` : '')).join(', ')}</strong></p>
         <p class="muted">Tipp: Diskret nachfragen oder ein kleines Ersatzgeschenk bereithalten – so geht niemand leer aus.</p>`;
    return crumb + head + `
      <section class="card" aria-labelledby="hOv"><div class="row"><h2 id="hOv">${icon('lock')} Übersicht</h2></div>
        <div class="row"><span class="chip ${c.drawn.length === ps.length ? 'done' : 'gold'}">${c.drawn.length} von ${ps.length} gezogen</span>
          <span class="chip ${missing.length ? 'gold' : 'done'}">${ps.length - missing.length} von ${ps.length} Geschenken da</span>
          <button class="btn ${rev ? 'ghost' : 'secondary'} small" type="button" data-action="toggle-reveal" aria-pressed="${rev}">${icon('eye')} ${rev ? 'Zuordnungen verbergen' : 'Zuordnungen anzeigen'}</button></div>
        <div class="table-wrap mt"><table><thead><tr><th scope="col">Wichtel</th><th scope="col">beschenkt</th><th scope="col">Ziehung</th><th scope="col">Geschenk abgegeben</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>
      <section class="card" aria-labelledby="hGift"><h2 id="hGift">${icon('gift')} Abgabe-Check</h2><p class="muted">Hake in der Tabelle ab, wer sein Geschenk abgegeben hat.</p>${missingText}</section>
      <section class="card quiet" aria-labelledby="hEx"><h2 id="hEx">Drucken &amp; exportieren</h2>
        <div class="row"><button class="btn" type="button" data-action="print-protocol">${icon('print')} Protokoll drucken</button>
        <button class="btn ghost" type="button" data-action="export-csv">${icon('file')} Excel-Tabelle (CSV)</button></div>
        <p class="small muted mt">CSV-Dateien sind nicht verschlüsselt. Auf privaten Geräten lieber drucken.</p></section>`;
  }
  function toggleDelivered(c, id, on) {
    c.delivered = c.delivered.filter(x => x !== id);
    if (on) c.delivered.push(id);
    markChanged();
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    $('app').querySelector(`[data-deliver="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }

  /* ---------- Archiv ---------- */
  function archivePage(c) {
    const hist = (c.history || []).map((h, i) => ({ h, i })).reverse();
    const now = new Date();
    const items = hist.map(({ h, i }) => {
      const del = W.deletionDate(h.year);
      const chip = del ? (del < now ? `<span class="chip red">Löschfrist überschritten (${del.toLocaleDateString('de-DE')})</span>` : `<span class="chip gold">Löschen bis spätestens ${del.toLocaleDateString('de-DE')}</span>`) : '';
      return `<div class="card"><h3>${esc(h.className || 'Klasse')} · ${esc(h.year || 'ohne Schuljahr')}</h3>
        <p class="muted">${plural(h.participants.length, 'Teilnehmer/in', 'Teilnehmende')}${fmtDate(h.date) ? ' · archiviert am ' + esc(fmtDate(h.date)) : ''}</p>
        <div class="row">${chip}</div>
        <div class="row mt"><button class="btn ghost small" type="button" data-action="archive-csv" data-index="${i}">${icon('file')} CSV</button>
        <button class="btn danger small" type="button" data-action="archive-delete" data-index="${i}">${icon('trash')} Diese Runde löschen</button></div></div>`;
    }).join('');
    return `<button class="crumb" type="button" data-action="open-class" data-id="${esc(c.id)}">${icon('back')} Klasse ${esc(c.name)}</button>
      <div class="page-head"><span class="eyebrow">Archiv</span><h1>Frühere Runden · ${esc(c.name)}</h1>
      <p class="lead">Abgeschlossene Wichtelrunden werden getrennt von der aktuellen Klassenliste aufbewahrt. Nur so lange behalten, wie sie gebraucht werden.</p></div>
      ${items || '<div class="card empty"><p>Noch keine archivierten Runden.</p></div>'}
      ${hist.length ? `<p class="small muted">Die Löschfrist folgt Anlage 1 zur VwV „Datenschutz an öffentlichen Schulen“ (private Geräte): spätestens nach Ende des nächsten Schuljahres. Mehr unter „Hilfe &amp; Datenschutz“.</p>
        <button class="btn danger" type="button" data-action="archive-clear">${icon('trash')} Gesamtes Archiv dieser Klasse löschen</button>` : ''}`;
  }

  /* ---------- Hilfe & Datenschutz (einziger Informationsbereich) ---------- */
  function infoPage() {
    return `<button class="crumb" type="button" data-action="home">${icon('back')} Zurück</button>
      <div class="page-head"><span class="eyebrow">Hilfe &amp; Datenschutz</span><h1>Gut zu wissen</h1>
      <p class="lead">Kurze Orientierung für Lehrkräfte in Baden-Württemberg. Diese Seite ist keine Rechtsberatung und ersetzt nicht die Abstimmung mit deiner Schule. Die Wichtelstube sichert keine „DSGVO-Konformität“ zu.</p></div>
      <section class="card info" aria-labelledby="iHow"><h2 id="iHow">So funktioniert’s</h2>${howToSteps()}
        <p class="mt muted">Wer am Tag der Auslosung fehlt, zieht später: Im Klassenmodus lässt sich die Person auswählen, die gerade nach vorne kommt.</p></section>
      <section class="card info" aria-labelledby="iData"><span class="kind tech">So arbeitet die Wichtelstube</span><h2 id="iData">Was mit den Daten passiert</h2><ul>
        <li>Die Namen werden nur im Browser dieses Geräts verarbeitet. Es gibt kein Konto, keinen Server und keine automatische Speicherung. Beim Schließen oder Neuladen sind die Daten weg, wenn sie nicht gesichert wurden.</li>
        <li>Die Anwendung wird über GitHub Pages (GitHub Inc., ein Unternehmen von Microsoft) ausgeliefert. Beim Laden erhält GitHub technisch bedingt die IP-Adresse des Geräts. Eingegebene Namen werden dabei nicht übertragen; eine Sicherheitsrichtlinie der Seite (Content Security Policy) blockiert Datenverbindungen der Anwendung.</li>
        <li>Die Sicherungsdatei (.wichtel) ist mit AES-256-GCM verschlüsselt, der Schlüssel wird mit PBKDF2-SHA-256 (600.000 Durchläufe) aus dem Passwort abgeleitet. <strong>Wer das Passwort vergisst, kann die Sicherung nicht mehr öffnen – auch nicht mit Hilfe.</strong></li>
        <li>Ausdrucke und CSV-Dateien sind <strong>nicht verschlüsselt</strong>.</li></ul></section>
      <section class="card info" aria-labelledby="iLaw"><span class="kind law">Vorgaben</span><h2 id="iLaw">Was rechtlich vorgegeben ist</h2><ul>
        <li>Namen von Schülerinnen und Schülern sind personenbezogene Daten; es gilt die Datenschutz-Grundverordnung (DSGVO) zusammen mit dem Landesdatenschutzgesetz. <span class="src">[1]</span></li>
        <li>Verantwortlich für den Datenschutz an der Schule ist die Schulleitung. <span class="src">[3]</span></li>
        <li><strong>Private Geräte:</strong> Die Schulleitung muss der Verarbeitung personenbezogener Schülerdaten auf privaten Geräten schriftlich zustimmen; dafür gibt es ein Formular des Kultusministeriums. <span class="src">[2] [4]</span></li>
        <li>Auf privaten Geräten dürfen nur Daten der Schülerinnen und Schüler verarbeitet werden, die die Lehrkraft selbst unterrichtet. Die Daten müssen <strong>durchgängig verschlüsselt</strong> gespeichert und <strong>spätestens nach Ende des nächsten Schuljahres gelöscht</strong> werden. Ein Verlust ist sofort der Schulleitung zu melden. <span class="src">[2]</span></li>
        <li>Passwörter dürfen nicht im Browser gespeichert werden; zulässig sind Passwort-Manager mit verschlüsselter Ablage. <span class="src">[4]</span></li></ul></section>
      <section class="card info" aria-labelledby="iSchool"><span class="kind school">Entscheidet deine Schule</span><h2 id="iSchool">Was mit der Schule zu klären ist</h2><ul>
        <li>Ob die Wichtelaktion mit Namen im Rahmen des schulischen Erziehungsauftrags stattfindet oder ob dafür Einwilligungen eingeholt werden – mit Schulleitung und schulischer bzw. schulischem Datenschutzbeauftragten klären.</li>
        <li>Wie die Eltern informiert werden. Der Elternbrief der Wichtelstube kann dafür eine Vorlage sein.</li>
        <li>Ob ein privates Gerät genehmigt ist, wo Sicherungsdateien liegen (z. B. verschlüsselter USB-Stick) und wie mit einem vergessenen Passwort umgegangen wird.</li>
        <li>Wie lange Ausdrucke und Protokolle aufbewahrt und wie sie vernichtet werden.</li></ul></section>
      <section class="card info" aria-labelledby="iTips"><span class="kind tech">Empfehlungen</span><h2 id="iTips">Praktische Empfehlungen</h2><ul>
        <li>Nur Vornamen eingeben; bei gleichen Vornamen einen Buchstaben ergänzen (z. B. „Lena M.“). Keine Gesundheits- oder Familiendaten in die Hinweise schreiben.</li>
        <li>Teilnahme wirklich freiwillig gestalten und ein kleines Budget wählen. Die Option „Selbstgemachtes ist genauso willkommen“ nimmt finanziellen Druck.</li>
        <li>Das Lehrerprotokoll nie auf einem Bildschirm zeigen, den die Klasse sieht. Für die Ziehung den Klassenmodus nutzen.</li>
        <li>Lange Passphrase verwenden (mindestens 10 Zeichen, besser drei bis vier Wörter). Nach dem Sichern „Sicherung prüfen“ nutzen, dann die Sitzung beenden.</li>
        <li>CSV-Dateien nur auf Schulgeräten oder in verschlüsseltem Speicher ablegen; auf privaten Geräten lieber drucken. Archivierte Runden rechtzeitig löschen.</li></ul></section>
      <section class="card info" aria-labelledby="iSrc"><h2 id="iSrc">Quellen</h2><ol class="sources">
        <li>Verordnung (EU) 2016/679 (DSGVO), insbesondere Art. 4 und Art. 32 – <a href="https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679" target="_blank" rel="noopener noreferrer">EUR-Lex</a></li>
        <li>Anlage 1 zur Verwaltungsvorschrift „Datenschutz an öffentlichen Schulen“: Hinweise für private Datenverarbeitungsgeräte – <a href="https://www.lehrer-online-bw.de/site/pbs-bw-new/get/documents/KULTUS.Dachmandant/KULTUS/Dienststellen/it.kultus-bw/Datenschutz%20an%20Schulen%20nach%20neuer%20EU%20DSGVO/dl-rechtsgrundlagen/VwV-Datenschutz-Anlage-1-Hinweis-private-Datenverarbeitungsgeraete.pdf?attachment=true" target="_blank" rel="noopener noreferrer">PDF (Kultusministerium)</a>. Maßgeblich ist die jeweils geltende Fassung.</li>
        <li>Kultusministerium BW: FAQ Datenschutz an Schulen, Stand 05/2024 – <a href="https://it.kultus-bw.de/site/pbs-bw-km-root/get/documents_E962825080/KULTUS.Dachmandant/KULTUS/Dienststellen/it.kultus-bw/Datenschutz%20an%20Schulen%20nach%20neuer%20EU%20DSGVO/dl-service/FAQ%20Datenschutz%20an%20Schulen%20EUDSGVO.pdf" target="_blank" rel="noopener noreferrer">PDF</a></li>
        <li>Kultusministerium BW (IT.KULTUS-BW): Private Datenverarbeitungsgeräte – <a href="https://it.kultus-bw.de/%2CLde/Startseite/IT-Sicherheit/private%2BDatenverarbeitungsgeraete" target="_blank" rel="noopener noreferrer">Webseite</a></li>
        <li>Landesbeauftragter für den Datenschutz und die Informationsfreiheit BW (Fortbildungen für Schulen) – <a href="https://www.baden-wuerttemberg.datenschutz.de/" target="_blank" rel="noopener noreferrer">Webseite</a></li></ol>
        <p class="small muted">Die Links öffnen externe Seiten und benötigen Internet; die Wichtelstube selbst funktioniert offline. Stand der Hinweise: 9. November 2026.</p></section>`;
  }

  /* ---------- Aktionen ---------- */
  function setTeacherFirst(raw) {
    const n = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!n) { toast('Bitte deinen Namen eingeben.'); $('teacherName')?.focus(); return; }
    db.teacher = n.slice(0, 80);
    markChanged(); go('home');
  }
  function addClass(raw) {
    const name = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!name) { toast('Bitte einen Klassennamen eingeben, z. B. 5a.'); $('newClass')?.focus(); return; }
    if (db.classes.some(c => c.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) { toast('Diese Klasse gibt es schon.'); return; }
    const c = W.newClass(name.slice(0, 60));
    db.classes.push(c);
    markChanged();
    st.classId = c.id; st.rosterError = null;
    go('class');
  }
  async function renameTeacher() {
    if (db.classes.some(c => c.assignments && c.teacherJoins)) return info('Name gerade gesperrt', 'Während einer Auslosung, bei der du mitwichtelst, kann der Name nicht geändert werden.');
    const r = await dialog({ title: 'Name der Lehrkraft', fields: [{ name: 'n', label: 'Name', value: db.teacher, maxlength: 80 }], ok: 'Speichern' });
    if (!r) return;
    const n = r.n.replace(/\s+/g, ' ').trim();
    if (!n || n === db.teacher) return;
    if (db.classes.some(c => c.teacherJoins && c.students.some(s => s.name.toLocaleLowerCase('de') === n.toLocaleLowerCase('de')))) return info('Name kommt schon vor', 'Dieser Name steht bereits in einer Schülerliste, in der du mitwichtelst.');
    db.teacher = n; markChanged(); render();
  }
  async function deleteClass() {
    const c = cur();
    if (!await confirmDlg('Klasse löschen?', `Klasse „${c.name}“ mit der aktuellen Runde und dem Archiv endgültig löschen?`, 'Endgültig löschen', true)) return;
    db.classes = db.classes.filter(x => x.id !== c.id);
    st.classId = null; markChanged(); go('home');
    toast(`Klasse „${c.name}“ gelöscht.`);
  }
  async function startRound() {
    flushPending();
    const c = cur();
    if (st.rosterError) { toast(st.rosterError, 'error'); $('names')?.focus(); return; }
    const ps = W.participants(db, c);
    if (ps.length < 2) return toast('Mindestens zwei Teilnehmende erforderlich.');
    if (!await confirmDlg('Auslosung starten?', `${ps.length} Teilnehmende. Danach ist die Teilnehmerliste gesperrt.\n\nEs öffnet sich der Klassenmodus: Die Kinder kommen nacheinander nach vorne und drehen selbst.`, 'Auslosung starten')) return;
    c.assignments = W.createAssignments(ps); c.drawn = []; c.delivered = [];
    markChanged();
    st.turnId = null; st.angle = 0;
    go('wheel');
  }
  async function resetRound() {
    const c = cur();
    if (!await confirmDlg('Neu auslosen?', 'Alle Zuordnungen und Ziehungen dieser Runde werden gelöscht (nicht archiviert). Wer schon gezogen hat, muss noch einmal ziehen.', 'Neu auslosen', true)) return;
    c.assignments = null; c.drawn = []; c.delivered = [];
    markChanged(); render(); toast('Die Runde wurde zurückgesetzt. Die Teilnehmerliste ist wieder frei.');
  }
  async function archiveCurrentRound() {
    const c = cur();
    if (!await confirmDlg('Runde abschließen?', 'Die Zuordnungen wandern ins Archiv dieser Klasse. Danach kannst du die Liste ändern und neu auslosen.', 'Abschließen & archivieren')) return;
    W.archiveRound(db, c); markChanged(); render(); toast('Runde archiviert.');
  }
  async function promote() {
    flushPending();
    const c = cur();
    const m = /^(\d{4})\/(\d{4})$/.exec(c.year || '');
    const nextYear = m ? `${+m[1] + 1}/${+m[2] + 1}` : W.schoolYear();
    const nextName = c.name.replace(/^(\d{1,2})/, d => String(+d + 1));
    const r = await dialog({ title: 'Ins nächste Schuljahr übernehmen', message: 'Die Schülerliste bleibt erhalten. Eine laufende Runde wird archiviert.', fields: [{ name: 'name', label: 'Neuer Klassenname', value: nextName, maxlength: 60 }, { name: 'year', label: 'Schuljahr', value: nextYear, maxlength: 9, hint: 'Format: 2026/2027' }], ok: 'Übernehmen' });
    if (!r) return;
    const name = r.name.replace(/\s+/g, ' ').trim(), year = r.year.trim();
    if (!name) return info('Name fehlt', 'Bitte einen Klassennamen eingeben.');
    if (db.classes.some(x => x.id !== c.id && x.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) return info('Name vergeben', 'Eine andere Klasse heißt bereits so.');
    if (!/^\d{4}\/\d{4}$/.test(year)) return info('Schuljahr prüfen', 'Bitte im Format 2026/2027 eingeben.');
    W.promoteClass(db, c, name, year);
    markChanged(); go('class');
    toast('Klasse übernommen. Bitte die Liste prüfen: Abgänge löschen, neue Kinder ergänzen.');
  }
  function archiveCSV(i) {
    const c = cur(), h = c.history?.[i]; if (!h) return;
    download(`Wichtelarchiv_${W.safeFileName(h.className)}_${String(h.year || '').replace('/', '-')}.csv`, W.buildCSV(W.roundRows(h.participants, h.assignments, h.drawn, h.delivered)), 'text/csv;charset=utf-8');
  }
  async function archiveDelete(i) {
    const c = cur(), h = c.history?.[i]; if (!h) return;
    if (!await confirmDlg('Runde löschen?', `Archivierte Runde „${h.className} · ${h.year}“ endgültig löschen?`, 'Löschen', true)) return;
    c.history.splice(i, 1); markChanged(); render();
  }
  async function archiveClear() {
    const c = cur();
    if (!await confirmDlg('Archiv löschen?', 'Alle archivierten Runden dieser Klasse endgültig löschen?', 'Alles löschen', true)) return;
    c.history = []; markChanged(); render();
  }

  /* ---------- Sicherung ---------- */
  const cryptoOK = () => !!(window.crypto && crypto.subtle);
  async function exportBackup() {
    if (!cryptoOK()) return info('Verschlüsselung nicht verfügbar', 'Bitte die Wichtelstube in einem aktuellen Browser über die https-Adresse öffnen.');
    if (!hasData()) return toast('Es gibt noch nichts zu sichern.');
    flushPending();
    const r = await dialog({ title: 'Verschlüsselt sichern', message: 'Wähle ein Passwort mit mindestens 10 Zeichen, z. B. drei Wörter wie „Tanne-Stern-Kerze“. Ohne dieses Passwort kann niemand die Sicherung öffnen – auch du nicht.', fields: [{ name: 'p1', label: 'Passwort', type: 'password' }, { name: 'p2', label: 'Passwort wiederholen', type: 'password' }], ok: 'Sicherung herunterladen' });
    if (!r) return;
    if (r.p1.length < 10) { await info('Passwort zu kurz', 'Bitte mindestens 10 Zeichen verwenden.'); return exportBackup(); }
    if (r.p1 !== r.p2) { await info('Passwörter verschieden', 'Die beiden Eingaben stimmen nicht überein. Bitte noch einmal.'); return exportBackup(); }
    try {
      toast('Sicherung wird verschlüsselt …');
      const enc = await W.encryptData(db, r.p1);
      download(`Wichtelstube_${today()}.wichtel`, JSON.stringify(enc), 'application/octet-stream');
      hideToast();
      st.changed = false; st.verified = false; st.exported = true; updateSaveState();
      await info('Sicherung heruntergeladen', 'Lege die Datei an einem sicheren Ort ab, z. B. auf einem verschlüsselten USB-Stick.\n\nEmpfehlung: Jetzt mit „Sicherung prüfen“ kontrollieren, ob sich die Datei öffnen lässt.');
    } catch (e) { toast('Sicherung fehlgeschlagen: ' + e.message, 'error'); }
  }
  function pickFile(id) { const inp = $(id); inp.value = ''; inp.click(); }
  async function readChosenFile(input) {
    const f = input.files?.[0]; input.value = '';
    if (!f) return null;
    if (!cryptoOK()) { info('Verschlüsselung nicht verfügbar', 'Bitte die Wichtelstube in einem aktuellen Browser über die https-Adresse öffnen.'); return null; }
    if (f.size > 10 * 1024 * 1024) { info('Datei zu groß', 'Das ist keine Wichtelstube-Sicherung.'); return null; }
    const text = await f.text();
    try { W.parseBackupText(text); } catch (e) { info('Datei nicht lesbar', e.message + '\n\nBitte die .wichtel-Datei wählen, die beim Sichern heruntergeladen wurde.'); return null; }
    return { f, text };
  }
  async function askAndOpen(file, title) {
    const r = await dialog({ title, message: 'Datei: ' + file.f.name, fields: [{ name: 'p', label: 'Passwort der Sicherung', type: 'password' }], ok: 'Öffnen' });
    if (!r) return null;
    try { toast('Sicherung wird geöffnet …'); const v = await W.openBackup(file.text, r.p); hideToast(); return v; }
    catch (e) { hideToast(); await info(e.kind === 'password' ? 'Passwort passt nicht' : 'Sicherung nicht lesbar', e.message); return null; }
  }
  async function importBackup(input) {
    const file = await readChosenFile(input); if (!file) return;
    const v = await askAndOpen(file, 'Sicherung öffnen'); if (!v) return;
    if (hasData() && !await confirmDlg('Aktuelle Daten ersetzen?', 'Die geöffnete Sicherung ersetzt alles, was gerade in der Wichtelstube ist. Nicht gesicherte Änderungen gehen verloren.', 'Ersetzen', true)) return;
    db = v; st.classId = null; st.turnId = null; st.rosterError = null;
    st.changed = false; st.verified = false; st.exported = true;
    go('home');
    toast(`Sicherung geöffnet: ${plural(db.classes.length, 'Klasse', 'Klassen')}.`);
  }
  async function verifyBackup(input) {
    const file = await readChosenFile(input); if (!file) return;
    const v = await askAndOpen(file, 'Sicherung prüfen'); if (!v) return;
    let same = false;
    try { same = JSON.stringify(v) === JSON.stringify(W.normalizeBackup(db)); } catch (e) { same = false; }
    if (!same) return info('Sicherung ist nicht aktuell', 'Die Datei lässt sich öffnen, enthält aber nicht den aktuellen Stand. Bitte erneut sichern.');
    st.verified = true; st.changed = false; st.exported = true; updateSaveState();
    info('Sicherung geprüft', 'Die Datei lässt sich öffnen und enthält alle aktuellen Daten. Du kannst die Sitzung jetzt beenden.');
  }
  async function endSession() {
    if (!hasData()) return toast('Es sind keine Daten geöffnet.');
    const ok = st.verified
      ? await confirmDlg('Sitzung beenden?', 'Alle Daten werden aus der Wichtelstube entfernt. Deine Sicherungsdatei bleibt erhalten.', 'Sitzung beenden')
      : await confirmDlg('Ohne geprüfte Sicherung beenden?', 'Es gibt keine geprüfte Sicherung des aktuellen Stands. Nach dem Beenden sind diese Daten verloren.\n\nEmpfehlung: Erst „Sichern“, dann „Sicherung prüfen“.', 'Trotzdem beenden', true);
    if (!ok) return;
    db = { teacher: '', classes: [] };
    Object.assign(st, { classId: null, turnId: null, changed: false, exported: false, verified: false, rosterError: null, angle: 0 });
    go('home');
    toast('Sitzung beendet. Die Daten wurden aus der Wichtelstube entfernt. Heruntergeladene Dateien bleiben davon unberührt.');
  }
  function goBackup() {
    go('home', { noFocus: true });
    const s = $('sicherung');
    if (s) { s.scrollIntoView({ block: 'start' }); const h = $('hBackup'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  async function reloadApp() {
    if (hasData() && (st.changed || !st.exported)) {
      if (!await confirmDlg('Jetzt neu laden?', 'Beim Neuladen werden alle Daten aus der Wichtelstube entfernt. Bitte vorher sichern.', 'Trotzdem neu laden', true)) return;
    }
    st.allowUnload = true; location.reload();
  }

  const ACTIONS = {
    'home': () => (st.screen === 'wheel' ? leaveClassroom() : go('home')),
    'info': () => go('info'),
    'open-class': b => { st.classId = b.dataset.id; st.turnId = null; st.rosterError = null; go('class'); },
    'start-round': startRound,
    'classroom': () => { st.turnId = null; st.angle = 0; go('wheel'); },
    'leave-classroom': leaveClassroom,
    'leave-classroom-done': () => { st.turnId = null; go('class'); },
    'spin': spin,
    'hide-result': hideResult,
    'protocol': () => go('protocol'),
    'toggle-reveal': () => { st.reveal = !st.reveal; const y = window.scrollY; render(); window.scrollTo(0, y); $('app').querySelector('[data-action="toggle-reveal"]')?.focus({ preventScroll: true }); },
    'archive': () => go('archive'),
    'archive-round': archiveCurrentRound,
    'reset-round': resetRound,
    'promote': promote,
    'delete-class': deleteClass,
    'archive-csv': b => archiveCSV(+b.dataset.index),
    'archive-delete': b => archiveDelete(+b.dataset.index),
    'archive-clear': archiveClear,
    'print-contracts': printContracts,
    'print-letter': printLetter,
    'print-protocol': printProtocol,
    'export-csv': exportCSV,
    'rename-teacher': renameTeacher,
    'backup-export': exportBackup,
    'backup-import': () => pickFile('importFile'),
    'backup-verify': () => pickFile('verifyFile'),
    'session-end': endSession,
    'go-backup': goBackup,
    'reload-app': reloadApp,
    'toast-close': hideToast
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    if (dialogOpen && !b.closest('#modalBox')) return;
    const fn = ACTIONS[b.dataset.action];
    if (fn) { e.preventDefault(); fn(b); }
  });
  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.dataset.form;
    if (f === 'add-class') addClass($('newClass').value);
    if (f === 'teacher') setTeacherFirst($('teacherName').value);
  });
  const app = $('app');
  app.addEventListener('input', e => {
    const el = e.target, c = cur(); if (!c) return;
    if (el.dataset.field) { const f = el.dataset.field, v = el.value; debounce('f:' + f, () => saveField(c, f, v), 400); }
    else if (el.hasAttribute('data-roster')) { const v = el.value; debounce('roster', () => saveRoster(c, v), 500); }
  });
  app.addEventListener('change', e => {
    const el = e.target, c = cur(); if (!c) return;
    if (el.dataset.field || el.hasAttribute('data-roster')) flushPending();
    else if (el.dataset.fieldCheck) { c[el.dataset.fieldCheck] = el.checked; markChanged(); refreshClassBits(c); savedNote('rulesSaved'); }
    else if (el.hasAttribute('data-joins')) setJoins(c, el);
    else if (el.dataset.deliver) toggleDelivered(c, el.dataset.deliver, el.checked);
    else if (el.id === 'turnSelect') changeTurn(el.value);
  });
  app.addEventListener('focusout', e => { if (e.target.matches?.('[data-field],[data-roster]')) flushPending(); });
  $('importFile').addEventListener('change', e => importBackup(e.target));
  $('verifyFile').addEventListener('change', e => verifyBackup(e.target));

  window.addEventListener('beforeunload', e => { if (hasData() && !st.allowUnload) { e.preventDefault(); e.returnValue = ''; } });
  // Beim Wechsel in den Hintergrund offene Eingaben sofort übernehmen.
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('bg-hidden', document.hidden);
    if (document.hidden) flushPending();
  });

  /* ---------- Aktualisierung der installierten App ---------- */
  const swAllowed = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && swAllowed) {
    window.addEventListener('load', () => {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('./sw.js').then(reg => {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      }).catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) $('updateBanner').hidden = false; });
    });
  }

  history.replaceState({ screen: 'home', classId: null }, '');
  render();
  scheduleSleigh(3500);
  window.WichtelApp = { get db() { return db; }, state: st }; // für automatisierte Oberflächentests
})();
