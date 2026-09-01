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
- **Route**: Routenplanung über eine selbst gehostete OTP2-Instanz, konfigurierbarer
  Umstiegszeit-Puffer, rollstuhlgerechte Verbindungen, Route teilen (Link)
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



# ÖPNV Navi – Backend

Node.js/Express-Backend für die ÖPNV-Navi-App: bündelt VBB-HAFAS,
DB-IRIS (echte Bahnhöfe), eine selbst gehostete OTP2-Instanz für die
Routenplanung sowie Web-Push-Benachrichtigungen hinter einer gemeinsamen API.

## Tech-Stack

- Node.js, Express
- [hafas-client](https://github.com/public-transport/hafas-client) (VBB-Profil)
- DB-IRIS (XML, via `fast-xml-parser`) für echte DB-Bahnhöfe
- OTP2 (GraphQL GTFS API) für die Routenplanung – **eigene, extern laufende
  OTP2-Instanz vorausgesetzt**, wird hier nicht mitgeliefert
- `better-sqlite3` für Favoriten, Verspätungsstatistik und Web-Push-Subscriptions
- `web-push` für Browser-Push-Benachrichtigungen
- `helmet`, `cors`, `express-rate-limit`, `morgan`

## Einrichtung

```bash
npm install
```

### Umgebungsvariablen (`.env`)

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `PORT` | nein | Port, auf dem der Server lauscht (Standard siehe `server.js`) |
| `HAFAS_USER_AGENT` | nein | User-Agent für HAFAS-Anfragen |
| `DB_PATH` | nein | Pfad zur SQLite-Datenbankdatei (Standard: `./data/oepnv-navi.sqlite`) |
| `VAPID_PUBLIC_KEY` | für Web-Push | Öffentlicher VAPID-Schlüssel |
| `VAPID_PRIVATE_KEY` | für Web-Push | **Geheim!** Privater VAPID-Schlüssel |
| `VAPID_SUBJECT` | für Web-Push | `mailto:deine@email.de` |

VAPID-Keys einmalig erzeugen:

```bash
npx web-push generate-vapid-keys
```

Ohne `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` bleibt Web-Push deaktiviert
(Warnung im Log beim Start), der Rest der App läuft normal weiter.

**Wichtig:** `VAPID_PRIVATE_KEY` ist ein echtes Geheimnis – nicht ins
Git-Repo committen, `.env` gehört in die `.gitignore`.

### Start

```bash
npm start        # node src/server.js
npm run dev       # mit --watch (Node 18+)
```

## Ordnerstruktur

```
backend/
├── package.json
└── src/
    ├── server.js                  Express-App, Middleware, Routen-Mounting, Hintergrund-Jobs
    ├── db/
    │   └── database.js            SQLite-Setup + Schema (Favoriten, Verspätungen, Push)
    ├── middleware/
    │   └── apiKey.js               X-API-Key-Schutz (nur für /push/register, APNs)
    ├── routes/
    │   ├── locations.js / stations Haltestellen-/Adress-/POI-Suche
    │   ├── departures.js            VBB-Abfahrten (+ Störungen)
    │   ├── dbTimetables.js          DB-IRIS-Abfahrten für echte Bahnhöfe (+ Störungen)
    │   ├── summary.js               Sammel-Endpunkt für mehrere Haltestellen (Favoriten)
    │   ├── trip.js                  Fahrt-Details (Zwischenhalte, Live-Position)
    │   ├── otpJourneys.js           Routenplanung über die eigene OTP2-Instanz
    │   ├── journeys.js              Ältere HAFAS-basierte Routenplanung (Legacy)
    │   ├── radar.js                 Fahrzeugpositionen im Kartenausschnitt
    │   ├── disruptions.js           Ortsbezogene Störungen
    │   ├── remarks.js               Netzweite Störungsmeldungen
    │   ├── fares.js                 VBB-Tarifzonen + BVG-Preise
    │   ├── favorites.js             Server-seitige Favoriten (Legacy/optional)
    │   ├── delayStats.js            Verspätungsstatistik pro Linie
    │   ├── webPush.js               Web-Push: Subscribe/Unsubscribe/Fahrtalarm
    │   ├── push.js                  APNs-Registrierung für die separate iOS-App
    │   └── health.js                Health-Dashboard (/health/full, /health/dashboard)
    └── utils/
        ├── hafas.js                 Zentraler HAFAS-Client
        ├── vbbDepartures.js          VBB-Abfahrten-Kernlogik + Verspätungs-Aufzeichnung
        ├── dbIris.js / dbDepartureMerge.js / dbDeparturesService.js
        │                             DB-IRIS-Kernlogik (Planwerte + Echtzeit-Änderungen mergen)
        ├── dbStations.js             ~5.400 echte DB-Bahnhöfe (dynamischer Import, ESM)
        ├── otpClient.js              OTP2-GraphQL-Client (Routenplanung, Umstiegszeit, Rollstuhl)
        ├── disruptionFilter.js       "Echte Störung" vs. Rauschen, Gleisänderungs-Anreicherung
        ├── delayStats.js             Aggregation der Verspätungsstatistik
        ├── tripInfo.js               Gemeinsame Fahrt-Detail-Logik (Route + Push-Job)
        ├── webPush.js                web-push-Wrapper (VAPID, Versand, Fehlerbehandlung)
        ├── pushStore.js              DB-Zugriff für Push-Subscriptions/Favoriten/Fahrtalarme
        ├── pushJobs.js               Hintergrund-Jobs: Störungs-Check (60s) & Fahrtalarm-Check (20s)
        ├── lineColors.js             Linienfarben (vbb-line-colors + Fallback-Heuristik)
        ├── products.js               Verkehrsmittel-Filter-Mapping
        ├── vbbFareZones.js / bvgPriceScraper.js
        │                             Tarifzonen + Preise, täglich automatisch aktualisiert
        ├── cache.js                  Einfacher In-Memory-TTL-Cache
        └── hafasErrors.js            Nutzerfreundliche Fehlermeldungen für HAFAS-Fehler
```

## API-Endpunkte (Übersicht)

Alle Pfade relativ zum konfigurierten Basis-Pfad (z. B. `/live_navi`).

| Bereich | Endpunkte |
|---|---|
| Suche | `GET /locations`, `GET /stations` (Alias) |
| Abfahrten | `GET /departures/:stationId`, `GET /db/departures/:evaNo` |
| Sammel-Abfahrten | `POST /summary/departures` |
| Fahrt-Details | `GET /trip/:id` |
| Routenplanung | `GET /otp/journeys` (OTP2), `GET /journeys` (Legacy/HAFAS) |
| Live-Karte | `GET /radar` |
| Störungen | `GET /disruptions/nearby`, `GET /remarks` |
| Tarife | `GET /fares` |
| Favoriten | `GET/POST/DELETE /favorites` |
| Verspätungsstatistik | `GET /stats/delays/:line` |
| Web-Push | `GET /webpush/public-key`, `POST /webpush/subscribe`, `POST /webpush/unsubscribe`, `POST/DELETE /webpush/trip-alarm` |
| APNs (iOS-App) | `POST /push/register` |
| Health | `GET /health/full`, `GET /health/dashboard` |

## Datenbank (SQLite)

Automatisch angelegt beim ersten Start (`db/database.js`):

- `favorites` – server-seitige Favoriten (optional, Client nutzt primär `localStorage`)
- `push_tokens` – APNs-Geräte-Tokens (iOS-App)
- `delay_samples` – Verspätungs-Rohdaten pro Fahrt, passiv befüllt bei jeder
  normalen Abfahrten-Abfrage; alte Einträge (>90 Tage) werden täglich automatisch gelöscht
- `push_subscriptions` – Web-Push-Abos (ein Datensatz pro Browser/Gerät)
- `push_favorite_stations` – Kopie der Favoriten-Haltestellen je Abo (für den Störungs-Job)
- `push_trip_alarms` – höchstens ein aktiver Fahrtalarm je Abo

## Hintergrund-Jobs

Beim Start (`server.js`) registriert:

- Vorwärmen des DB-Bahnhofs-Caches
- Tägliches Neuladen der VBB-Tarifzonen und BVG-Preise
- Tägliches Aufräumen alter Verspätungs-Samples
- **Störungs-Check** (alle 60s): prüft für jede Web-Push-Subscription die
  verknüpften Favoriten-Haltestellen auf neue Störungen, verschickt bei Bedarf Push
- **Fahrtalarm-Check** (alle 20s): prüft aktive, per Push gespiegelte Fahrtalarme
  und löst bei Erreichen der Zielhaltestelle aus

## Abhängigkeiten außerhalb dieses Repos

- Eine laufende **OTP2-Instanz** (VBB-GTFS + Berlin/Brandenburg-OSM) für die
  Routenplanung – Adresse in `utils/otpClient.js` konfigurieren
- Ein Reverse Proxy (z. B. NPM/nginx), der den gewünschten Pfad (z. B.
  `/live_navi`) auf diesen Node-Prozess weiterleitet
