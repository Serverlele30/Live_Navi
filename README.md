# ÖPNV Navi – Frontend

Vanilla-JS-Webapp für Live-Abfahrten, Routenplanung und eine Live-Karte im
VBB-Verbund (Berlin/Brandenburg) mit Anbindung an echte DB-Bahnhöfe. Kein
Build-Schritt, kein Framework – reines HTML/CSS/JS, läuft direkt als
statische Website.

## Tech-Stack

- Reines HTML5, CSS3, ES2020+ JavaScript (keine Frameworks, kein Bundler)
- [Leaflet](https://leafletjs.com/) für die Live-Karte (per CDN eingebunden)
- Google Fonts: IBM Plex Mono / Sans / Sans Condensed
- Service Worker für Web-Push-Benachrichtigungen

## Ordnerstruktur

```
frontend/
├── index.html          Einzige HTML-Seite (Single Page App über Tabs)
├── styles.css           Komplettes Stylesheet ("Solari-Anzeigetafel bei Nacht"-Theme)
├── sw.js                 Service Worker (Web-Push) - MUSS im Root liegen, nicht unter js/
├── manifest.json         PWA-Manifest
└── js/
    ├── config.js         Zentrale Konfiguration (API_BASE-URL des Backends)
    ├── api.js            Schlanker fetch()-Wrapper für alle Backend-Endpunkte
    ├── i18n.js           Mehrsprachigkeit (DE/EN), Wörterbuch + Sprachumschaltung
    ├── app.js            Hauptlogik: Tabs, Suche, Abfahrtstafel, Favoriten, Routenplaner
    ├── splitflap.js       Flip-Animation der Abfahrtstafel (+ Screenreader-Textalternative)
    ├── modefilter.js      Wiederverwendbare Verkehrsmittel-Filter-Chips
    ├── livemap.js         Live-Karte (Leaflet): Radar-Modus, Trip-Tracking, Isolations-Modus
    ├── tripmodal.js       Fahrt-Detail-Modal (Zwischenhalte, Mini-Karte, Verspätungsstatistik)
    ├── tripalarm.js       Fahrtalarm ("wecke mich X Stationen vorher")
    └── push.js            Web-Push: Service-Worker-Registrierung, Abo-Verwaltung
```

## Einrichtung / Deployment

Keine Installation nötig – es sind statische Dateien. Einfach den kompletten
Ordnerinhalt auf einen Webserver (nginx, Apache, Vercel, o.ä.) legen.

**Wichtig:**
- `sw.js` muss im **Root** des ausgelieferten Verzeichnisses liegen (dort, wo
  auch `index.html` liegt), nicht unter `js/`. Der Geltungsbereich eines
  Service Workers ist standardmäßig auf sein eigenes Verzeichnis und alles
  darunter beschränkt.
- Web Push (und Service Worker generell) funktionieren nur über **HTTPS**
  (oder `localhost` während der Entwicklung).
- In `js/config.js` die Backend-URL eintragen:
  ```js
  window.APP_CONFIG = {
    API_BASE: 'https://dein-server.example/live_navi',
  };
  ```

## Features im Überblick

- **Abfahrten**: Live-Abfahrtstafel (VBB + echte DB-Bahnhöfe), Verkehrsmittel-Filter,
  Gleiswechsel-Hinweis, Störungen & Aufzugsstatus direkt unter der Tafel
- **Route**: Routenplanung über HAFAS (VBB + Deutsche Bahn, dieselbe Anbindung wie die
  iOS-App), bis zu 3 Zwischenhalte, Verkehrsmittel-Filter, Fahrrad-Option,
  rollstuhlgerechte Verbindungen, Früher/Später-Nachladen, Route teilen (Link)
- **Karte**: Live-Fahrzeugpositionen, Fahrt isolieren/verfolgen, display-breite
  Darstellung auf jeder Bildschirmgröße
- **Favoriten**: eigener Tab, Live-Vorschau der nächsten Abfahrt, Störungs-Badges
- **Fahrtalarm**: weckt X Stationen vor dem Ziel (Ton, Vibration, Vollbild-Overlay)
- **Push-Benachrichtigungen**: funktionieren auch bei geschlossenem Tab/Browser
  (Service Worker + Web Push, siehe `js/push.js`)
- **Verlauf**: zuletzt gesuchte Haltestellen, direkt als Vorschläge im Suchfeld
- **Mehrsprachigkeit**: Deutsch/Englisch, automatische Browsersprache-Erkennung
- **Barrierefreiheit**: Tastaturbedienung überall (inkl. Suche), ARIA-Tab-Pattern,
  Fokus-Fallen in Dialogen, Screenreader-Textalternative zur Flip-Animation,
  `aria-live`-Regionen für Störungen/Ergebnisse

## Browser-Unterstützung

Moderne Evergreen-Browser (Chrome, Firefox, Safari, Edge). Nutzt u. a.
`fetch`, `IntersectionObserver`-freies Vanilla-DOM, Service Worker, Push API,
CSS Custom Properties und `dvh`-Einheiten (mit `vh`-Fallback). Kein IE11-Support.

## Bekannte Grenzen

- Die Live-Karte ist für blinde Nutzer naturgemäß eingeschränkt zugänglich
  (Leaflet-Karten sind visuell) – Abfahrtstafel und Routenplaner liefern
  dieselben Informationen barrierefrei.
- Störungstexte kommen direkt von VBB/HAFAS auf Deutsch – eine Übersetzung
  ins Englische findet nicht statt (nur die App-Oberfläche selbst ist zweisprachig).
- Fahrtalarm-Ton und Vollbild-Overlay funktionieren nur bei offenem Tab; bei
  geschlossenem Browser zeigt ein Push nur die Systembenachrichtigung.
