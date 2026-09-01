# Changelog – ÖPNV Navi

Alle Änderungen aus den letzten Entwicklungs-Runden, chronologisch. Format
angelehnt an [Keep a Changelog](https://keepachangelog.com/de/).

## Fahrtalarm, Störungs-Push & Live-Karte (Grundlagen)

### Fixed
- **Live-Karte**: Fahrzeuginfo im Isolations-Modus aktualisierte sich nach
  dem ersten Klick nie wieder (Marker wurde bei jedem Poll komplett neu
  erzeugt statt aktualisiert, wodurch ein offenes Popup sofort wieder
  schloss). Gleicher Fix auch für den Trip-Tracking-Modus.

### Added
- **Störungs-Push für Favoriten**: Favoriten-Karten zeigen jetzt Störungen an,
  pollen im Hintergrund alle 30s, Toast + optionale Browser-Notification bei
  neuen Störungen.
- **Fahrtalarm**: weckt X Stationen vor einer gewählten Zielhaltestelle
  (Ton, Vibration, Vollbild-Overlay, persistenter Hinweis-Banner). Setzbar
  direkt im Fahrt-Detail-Modal an jeder kommenden Haltestelle.

## Layout & Übersichtlichkeit

### Changed
- **Live-Karte**: nutzt jetzt auf jeder Displaygröße die volle Breite
  ("Full-Bleed"-Technik, mobile-first, ohne breakpoint-spezifische Werte).
- **Favoriten**: aus dem Abfahrten-Home-Screen entfernt (Desktop wie Mobile
  wurden unübersichtlich), jetzt eigenes Tab-Panel – erreichbar über "Mehr"
  und einen Icon-Button im Header.

### Added
- **Störungen unterhalb der Abfahrten**: `/departures` und `/db/departures`
  liefern jetzt zusätzlich `disruptions[]`, im Frontend direkt unter der
  Abfahrtstafel sichtbar.

### Fixed
- Störungstexte mit eingebetteten Links (z. B. `[MEHR/MORE]` von VBB) wurden
  komplett als Text escaped statt den Link klickbar zu lassen. Jetzt werden
  gezielt nur `<a href="http(s)://...">`-Muster als sichere Links erlaubt,
  alles andere bleibt escaped.

## Verlauf, Gleiswechsel, Umstiegszeit, Barrierefreiheit, Teilen, Sprache, Statistik

### Added
- **Verlauf**: zuletzt gesuchte Haltestellen erscheinen jetzt direkt als
  Vorschläge beim Antippen des leeren Suchfelds; einzelne Einträge einzeln
  entfernbar.
- **Gleiswechsel-Hinweis**: Abfahrtstafel hebt geänderte Gleise deutlich
  hervor ("GLEIS 3 statt 5") statt den neuen Wert kommentarlos anzuzeigen.
- **Umstiegszeit-Puffer**: konfigurierbare Mindest-Umstiegszeit für die
  OTP2-Routenplanung (Standard/0/3/5/10/15 Min).
- **Barrierefreiheit**: Toggle "Nur rollstuhlgerechte Verbindungen" im
  Routenplaner (OTP2-Wheelchair-Preference); Aufzugsstatus wird getrennt von
  echten Störungen angezeigt (eigener, ruhigerer Ton).
- **Route teilen**: Link zu einer Suche (nicht einer eingefrorenen
  Verbindung) über die Web-Share-API oder Zwischenablage.
- **Mehrsprachigkeit**: Deutsch/Englisch, automatische Spracherkennung,
  Umschalter unter "Mehr".
- **Verspätungsstatistik pro Linie**: passiv gesammelt aus ganz normalen
  Abfahrten-Abfragen (keine zusätzliche Last auf HAFAS/IRIS), sichtbar im
  Fahrt-Detail-Modal ab 10 gesammelten Datenpunkten.

### Fixed
- Gleisänderungs-Störungsmeldungen von HAFAS waren teils inhaltsleer
  ("Gleisänderung" ohne weitere Angaben). Werden jetzt durch eine aus den
  echten Ist-Daten gebaute, präzise Meldung ersetzt (Linie, Ziel, Uhrzeit,
  altes/neues Gleis).
- Mobile Bottom-Navigation wurde von der (jetzt display-breiten) Live-Karte
  überdeckt (z-index-Konflikt mit Leaflets eigenen Steuerelementen) – behoben.
- Fahrtalarm-Banner konnte sich mit dem Header überlappen (unterschiedliche
  Header-Höhen auf Mobile/Desktop) – Position wird jetzt zur Laufzeit anhand
  der tatsächlichen Header-Höhe berechnet, nicht mehr geraten.

## Push-Benachrichtigungen & Hintergrundaktualisierung

### Added
- **Web-Push**: funktioniert jetzt auch bei geschlossenem Tab/Browser.
  Neuer Service Worker, VAPID-basierte Subscriptions, serverseitige
  Hintergrund-Jobs (Störungs-Check alle 60s, Fahrtalarm-Check alle 20s).
  Favoriten bleiben primär im `localStorage`; bei aktiviertem Push wird eine
  Kopie ans Backend gespiegelt, damit der Server weiß, wonach er schauen soll.
- Neue Backend-Tabellen `push_subscriptions`, `push_favorite_stations`,
  `push_trip_alarms`; neue Route `/webpush/*`.

## Barrierefreiheit (gründlicher Durchgang)

### Fixed
- **Suchergebnisse waren nur mit der Maus bedienbar** – größter gefundener
  Bug: Tastatur-/Screenreader-Nutzer konnten keine Haltestelle auswählen.
  Jetzt per Pfeiltasten/Enter/Escape bedienbar (Hauptsuche + beide
  Routenplaner-Felder).
- Abfahrtstafel-Flip-Animation zeigte Screenreadern Zeichensalat während des
  Umklappens – jetzt unsichtbare, sofort korrekt lesbare Textalternative.
- Kaputte `role="table"` (ohne Zeilen-/Zellen-Rollen) durch korrektes
  `role="list"` ersetzt.
- `aria-pressed` wurde bei "Jetzt/Abfahrt um/Ankunft um" und dem
  Sprachumschalter nie aktualisiert (nur die Optik änderte sich) – behoben.
- Fahrtalarm-Banner war keine Live-Region – Änderungen wurden nicht
  automatisch vorgelesen.
- Glocken-Buttons im Fahrt-Detail-Modal hatten nur ein `title`-Attribut als
  Label (funktioniert auf Touch nicht, uneinheitlich bei Screenreadern) –
  jetzt echtes `aria-label`.

### Added
- Skip-Link ("Zum Inhalt springen").
- Echte ARIA-Tab-Semantik (`tablist`/`tab`/`tabpanel`, `aria-selected`,
  Pfeiltasten-Navigation) für Desktop- und Mobile-Navigation.
- Fokus-Falle + Fokus-Rückgabe für Fahrt-Detail-Modal und Fahrtalarm-Overlay.
- Formular-Labels für Start/Ziel-Felder im Routenplaner.
- `aria-live`-Regionen für Störungen, Aufzugsstatus, Routenergebnisse.
- Dekorative Emojis systematisch mit `aria-hidden` versehen.
- Farbkontrast geprüft (gedämpfter Text: 5.8–6.6:1, deutlich über WCAG-AA-Minimum).

## Allgemeine Verbesserungen

### Fixed
- "In der Nähe"-Vorschau blieb nach Auswahl einer Haltestelle über der
  Abfahrtstafel stehen.
- Beim Wechsel zwischen Haltestellen waren kurz noch die Abfahrten der
  vorherigen Station sichtbar (Stale-Data-Flash) – jetzt sofortiger
  Ladezustand mit Spinner.
- Wettlauf-Bedingung bei schnellem Tippen in der Suche: eine ältere, aber
  langsamer beantwortete Anfrage konnte neuere Ergebnisse überschreiben.

### Added
- "Erneut versuchen"-Buttons bei Netzwerkfehlern (Abfahrtstafel, Routenplaner).
- Browser-Tab-Titel zeigt die gewählte Haltestelle.
- Toast-Bestätigung beim Favorisieren/Entfavorisieren; neue "Erfolg"-Toast-Variante.
- "Störungsbenachrichtigungen aktivieren" ist jetzt eine eigenständige,
  farblich zustandsabhängige Karte statt eines unauffälligen Text-Links.

## Visuelles Redesign

### Changed
- Zentrale Design-Tokens für Schatten (`--shadow-sm/md/lg`), Radien und
  Glow-Effekte eingeführt statt verstreuter Einzelwerte.
- Hintergrund: mehrschichtige Glow-Gradients, feines Scanline-Muster,
  dezente Film-Korn-Textur (SVG-Turbulenz) für einen analogeren statt
  sterilen Look.
- Header: Blur/Transparenz-Effekt (Frosted Glass) statt Vollton.
- Abfahrtstafel-Zeilen: farbiger Rand links in der jeweiligen Linienfarbe,
  Verlaufs-Hintergrund, Tiefen-Schatten; Split-Flap-Zeichen haben jetzt eine
  sichtbare Naht in der Mitte (wie eine echte mechanische Klapp-Anzeige).
- Linienbadges strahlen in ihrer eigenen Farbe (Neon-Effekt), Uhrzeit mit
  grünem LED-Glühen.
- Logo und aktiver Tab pulsieren dezent in Amber; LIVE-Statuspunkt mit
  echtem Leucht-Ring-Puls.
- Karten (Favoriten, "Mehr"-Kacheln, Aktionen) heben sich beim Hover an
  (Schatten + Lift statt nur Farbwechsel), gestaffelte Eintritts-Animation
  beim (Neu-)Aufbau von Listen.
- Button-Übergänge mit leichter Feder/Überschwung-Kurve statt linear.
- Alle neuen Animationen respektieren `prefers-reduced-motion` (bereits
  global vorhandene Regel greift automatisch).

---

*Nicht umgesetzt / bewusst zurückgestellt:* GTFS-RT-Live-Anbindung für
Fahrzeugpositionen/Störungsmeldungen sowie GTFS-`routes.txt` als
autoritative Quelle für Linienfarben (aktuell: `vbb-line-colors`-Paket +
Fallback-Heuristik nach Verkehrsmittel).

## Repo-Aufräumung (Server-seitig)

Auf dem Produktivserver hatten sich zwei parallele Code-Bäume angesammelt:
eine alte, seit Ende August unangetastete Root-Ebene (`routes/`, `utils/`,
`db/`, `middleware/`, `server.js` direkt im Projektordner) und der tatsächlich
laufende, aktuelle Code unter `src/` (per `package.json` als Einstiegspunkt
konfiguriert). Zusätzlich gab es doppelte `fares.js`-Dateien und eine
verwaiste Editor-Backup-Datei (`disruptionFilter.js+`).

### Changed
- Aktueller Code aus `src/` eine Ebene hoch ins Projekt-Root verschoben,
  `src/` entfernt – keine verschachtelte Struktur mehr.
- Datenordner von `data/` zu `db-data/` umbenannt (eindeutiger Name, da
  `db/` bereits für Code – `database.js` – reserviert ist), `DB_PATH` in
  `.env` entsprechend angepasst.
- `package.json` (`main`/`start`/`dev`) und der echte systemd-Service
  (`ExecStart`) zeigen jetzt auf `server.js` statt `src/server.js`.
- `.env.example` und `oepnv-navi-backend.service.example` aktualisiert
  (fehlende `OTP_BASE_URL`/`VAPID_*`-Platzhalter ergänzt, `DB_PATH`
  korrigiert, `ExecStart`-Pfad korrigiert).
- **Auslieferungsstruktur ab jetzt**: neue Code-Übergaben verwenden dieselbe
  flache Struktur (kein `src/`-Präfix mehr), um erneute Divergenz zwischen
  gelieferten und tatsächlich laufenden Dateien zu vermeiden.

### Removed
- Toter Root-Ebene-Code (`routes/`, `utils/`, `db/`, `middleware/`,
  `server.js` von vor der gemeinsamen Entwicklung), doppelte `fares.js` im
  alten `data/`-Ordner, verwaister `src/data/data/`-Unterordner,
  `.env.old`, `disruptionFilter.js+` (veraltete Editor-Backup-Datei ohne die
  Gleisänderungs-Anreicherung).

## Backend-Härtung & letzte Politur

### Added
- **Sauberes Herunterfahren** (`SIGTERM`/`SIGINT`): schließt den HTTP-Server
  und die SQLite-Verbindung geordnet, statt bei jedem Neustart/Deploy hart
  abgewürgt zu werden (relevant v. a. bei systemd-Neustarts). Erzwingt nach
  10s Timeout einen harten Abbruch, falls hängende Requests das saubere
  Beenden blockieren.
- Größenlimit für JSON-Request-Bodies (200kb) als einfacher Missbrauchsschutz.

### Changed
- Verkehrsmittel-Filter-Chips (S/U/Tram/Bus/…) haben jetzt ausgeschriebene
  `aria-label` ("S-Bahn", "Regionalverkehr (RE/RB)" usw.) statt nur der
  kryptischen Kurz-Beschriftung für Screenreader-Nutzer.

## Visuelles Feintuning nach Nutzer-Feedback

### Changed
- Die Redesign-Effekte aus der "übertreiben"-Runde (Scanlines, Film-Korn-
  Textur, dauerhaft pulsierendes Logo/LIVE-Punkt, wandernder Lichtschein auf
  der Willkommens-Karte, Neon-Überglühen der Linienbadges, LED-Leuchten der
  Uhrzeit, federnde Button-Übergänge) auf Wunsch wieder zurückgenommen -
  zurück zu einem ruhigeren, professionelleren Look. Struktur-Substanz
  (Schatten-Skala, Glass-Header, Karten-Hover, farbiger Linien-Rand pro
  Abfahrtszeile) blieb erhalten.
- Naht-Linie in der Mitte jedes Split-Flap-Zeichens (rein kosmetisches Detail
  aus derselben Runde) auf Wunsch wieder entfernt.
- Toast-Benachrichtigungen überarbeitet: Icon-Kreis pro Typ (✓/⚠/ℹ),
  Schließen-Button, dezente Fortschrittsleiste synchron zur Anzeigedauer.
- Dieselbe Icon-Kreis-Formsprache auf Störungen, Aufzugsstatus und beide
  Störungslisten ("In deiner Nähe", netzweit) übertragen - einheitliche
  `.notice-item`-Struktur statt vier verschiedener Ad-hoc-Layouts.

### Fixed
- **Lange Zugbezeichnungen** (z.B. "ICE 940") sprengten ihre feste
  Spaltenbreite und liefen optisch in die Ziel-Spalte über. Erst testweise
  auf variable Spaltenbreite umgestellt, dann auf Nutzerwunsch wieder auf
  feste Breite zurückgesetzt (Trennlinien sollen über alle Zeilen fluchten) -
  stattdessen läuft der Text jetzt bei Bedarf automatisch wie ein Ticker
  durch seine Box (kein manuelles Scrollen nötig), inkl. mehrerer
  Nachbesserungen: falsche Lauflänge durch nicht mitgerechnetes Padding
  behoben (letztes Zeichen war nie sichtbar), Ausblende-Verlauf entfernt
  (verschluckte genau das Textende), Wartezeit am Anfang entfernt, Tempo
  spürbar verlangsamt, kein Neustart der Animation mehr bei jedem 30s-Poll.
- Zweite Trennlinie zwischen Ziel und Abfahrtszeit ergänzt (gab es bisher nur
  zwischen Linie und Ziel).

## Backend: weitere Störungs-Filter-Verbesserung

### Fixed
- Generische HAFAS-Meldung ("Abfahrt heute von Gleis X") wird jetzt ebenso
  herausgefiltert wie die bereits vorher gefilterte generische
  "Gleisänderung"-Meldung - beide sind durch die präzise, aus Ist-Daten
  gebaute Gleisänderungs-Meldung (Linie/Ziel/Uhrzeit/altes+neues Gleis)
  vollständig abgedeckt und wären sonst redundant doppelt angezeigt worden.

## Autonomer Start am aktuellen Standort

### Added
- **App startet jetzt immer am aktuellen Standort** statt an der zuletzt
  besuchten Haltestelle: beim Öffnen wird automatisch der Standort abgefragt,
  die nächstgelegene Haltestelle ausgewählt und ihre Abfahrten direkt gezeigt
  - ohne Klick. Weitere nahe Haltestellen erscheinen zusätzlich als Vorschau.
  Schlägt das fehl (Berechtigung verweigert, kein Standort, keine Treffer),
  fällt die App sauber auf die zuletzt besuchte Haltestelle zurück.
- **Störungen "In deiner Nähe"** laden jetzt automatisch beim ersten Öffnen
  des Störungen-Tabs, statt einen Klick auf "Standort verwenden" zu
  erfordern - nutzt dafür den beim Start bereits ermittelten Standort weiter.
  Störungsprüfung deckt damit durchgängig sowohl Favoriten (bestehendes
  Störungs-Push-Feature) als auch den aktuellen Standort ab.

### Removed
- Tote, nie aufgerufene Funktion `loadNearbyPreview()` - durch die neue,
  vollständige Autostart-Logik ersetzt.

