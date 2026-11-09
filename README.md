# Die Wichtelstube

Kleine Web-App (PWA) für das Klassenwichteln mit Glücksrad – ohne Konto, ohne Server, mit verschlüsselter Sicherungsdatei.
Live: https://3liasmb.github.io/wichtelstube/

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst, Icons, Sicherheitsrichtlinie (CSP), Dateiauswahl (bewusst ohne `accept`, wegen iOS) |
| `app.css` | Gestaltung „Scherenschnitt & Papier“, Druck-CSS inkl. AirPrint-/Dunkelmodus-Korrektur |
| `core.js` | Kernlogik ohne Oberfläche: Auslosung, Klassenpflege, Archiv, CSV, Prüfung und Verschlüsselung der Sicherungen |
| `app.js` | Oberfläche: Klassen, Klassenmodus mit Glücksrad, Protokoll mit Abgabe-Check, Druck, Sicherung |
| `sw.js` | Service Worker (Offline-Betrieb, Aktualisierung) |
| `tests/` | Automatisierte Tests (Node.js, ohne zusätzliche Pakete) |

## Lokal ansehen

```
python -m http.server 8137 --bind 127.0.0.1
```
Dann im Browser `http://127.0.0.1:8137/` öffnen. Verschlüsselung und Offline-Modus funktionieren nur über `https://` oder `localhost`/`127.0.0.1`.

## Tests

```
node --test tests/*.test.cjs
```
Prüft u. a. die Auslosung (2–40 Teilnehmende), Klassenweiterführung, Archiv, CSV, Öffnen alter Sicherungen (Format v1, mit dem Originalcode erzeugt: `tests/fixtures/`), neue Sicherungen (v2), beschädigte und manipulierte Dateien sowie PWA-Versionierung, iOS-Dateiauswahl und AirPrint-Regeln.

## Neue Version veröffentlichen

1. `VERSION` in `sw.js` erhöhen und in `index.html` alle `?v=` auf denselben Wert setzen (der Test prüft das).
2. Tests ausführen.
3. Nach `main` übertragen – GitHub Pages veröffentlicht automatisch. Installierte Apps laden die neue Fassung beim nächsten Öffnen und zeigen einen Hinweis „Neu laden“.

## Sicherungsformat

`.wichtel` = JSON mit AES-256-GCM-verschlüsselten Daten, Schlüssel per PBKDF2-SHA-256.
Version 1: 310.000 Durchläufe (bisherige Dateien, weiterhin lesbar). Version 2: 600.000 Durchläufe (neue Dateien).
Hinweis: Sicherungen im Format v2 kann die alte App-Version (vor 2.0.0) nicht öffnen.

Keine Schülerlisten, Sicherungen oder Exporte in dieses Repository hochladen.
