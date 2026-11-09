// Statische Prüfungen: PWA-Versionierung, iOS-Dateiimport, AirPrint-Korrektur, Sicherheitsregeln.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('Service Worker: Version stimmt mit index.html überein, alle Dateien existieren', () => {
  const sw = read('sw.js'), html = read('index.html');
  const version = /const VERSION = '([^']+)'/.exec(sw)[1];
  const refs = [...html.matchAll(/\?v=([\w.-]+)/g)].map(m => m[1]);
  assert.ok(refs.length >= 3);
  for (const r of refs) assert.equal(r, version, 'index.html verweist auf ?v=' + r);
  for (const f of ['index.html', 'manifest.webmanifest', 'app.css', 'core.js', 'app.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'])
    assert.ok(fs.existsSync(path.join(root, f)), f + ' fehlt');
  assert.match(sw, /cache: 'reload'/);
  assert.match(sw, /k !== CACHE/);
});

test('Manifest ist gültiges JSON mit Icons', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.length >= 2);
});

test('iOS-Dateiimport: Dateiauswahl ohne accept-Attribut', () => {
  const html = read('index.html');
  const inputs = [...html.matchAll(/<input[^>]*type="file"[^>]*>/g)].map(m => m[0]);
  assert.equal(inputs.length, 2);
  for (const i of inputs) assert.ok(!/accept=/.test(i), i);
  assert.ok(!/accept=/.test(read('app.js')));
});

test('AirPrint-/Dunkelmodus-Korrektur für den Druck ist unverändert enthalten', () => {
  const css = read('app.css');
  for (const rule of [
    '@page{size:A4;margin:12mm}',
    ':root{color-scheme:light!important}',
    'html,body,#printArea,#printArea .sheet,#printArea .sheet *{background:#fff!important;background-color:#fff!important;color:#111!important;box-shadow:none!important;text-shadow:none!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '#printArea .sheet{padding:0!important;overflow:visible!important}',
    '#printArea .sheet th,#printArea .sheet td{color:#111!important;background:#fff!important;border-bottom:1px solid #777!important;overflow-wrap:anywhere}'
  ]) assert.ok(css.includes(rule), 'fehlt: ' + rule);
});

test('Sicherheit: Content Security Policy, keine Inline-Handler, keine externen Skripte', () => {
  const html = read('index.html'), js = read('app.js');
  assert.match(html, /Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';[^"]*connect-src 'none'/);
  for (const src of [html, js]) {
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(src), 'Inline-Ereignishandler gefunden');
    assert.ok(!/\sstyle="/.test(src), 'style-Attribut gefunden (von CSP blockiert)');
  }
  assert.ok(!/<script[^>]+src="https?:/.test(html));
  assert.ok(!/<link[^>]+href="https?:/.test(html));
  assert.ok(!/<script>/.test(html), 'Inline-Skript gefunden');
});

test('Download-Funktion für iOS unverändert', () => {
  assert.ok(read('app.js').includes("function download(name, data, mime) { let blob = new Blob([data], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }"));
  assert.ok(read('app.js').includes("'application/octet-stream'"));
});
