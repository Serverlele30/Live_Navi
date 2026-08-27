# ÖPNV Navi – Backend

Backend für die geplante "ÖPNV Navi" iOS-App (Nachfolger der VBB-Status-Web-App).
Stellt VBB-Echtzeitdaten (Abfahrten, Routenplaner, Live-Map) sowie eigene Features
(Favoriten, Push-Token-Registrierung) über eine REST-API bereit.

## 1. Installation

```bash
cd oepnv-navi-backend
npm install
cp .env.example .env
```

Öffne `.env` und passe mindestens `API_KEY` an (z.B. mit `openssl rand -hex 32` erzeugen).

## 2. Lokal starten

```bash
npm start
```

Test:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/live_navi/stations/search?query=Alexanderplatz"
```

## 3. Als Dienst laufen lassen (systemd)

1. Projekt auf den Server kopieren, z.B. nach `/home/pi/oepnv-navi-backend`
2. `oepnv-navi-backend.service.example` nach `/etc/systemd/system/oepnv-navi-backend.service`
   kopieren und die Platzhalter (`DEIN_USER`, Pfade) anpassen
3. Aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oepnv-navi-backend
sudo systemctl status oepnv-navi-backend
```

## 4. Einrichtung in Nginx Proxy Manager (NPM)

Da Backend-Server und NPM auf unterschiedlichen Hosts im selben LAN laufen, brauchst du
die **lokale IP** des Backend-Servers (z.B. `192.168.1.50`) und den Port aus `.env` (Standard `3000`).

**Falls `serverlele.ddns.net` schon einen Proxy Host für deine Web-App hat:**

1. In NPM → *Proxy Hosts* → bestehenden Eintrag für `serverlele.ddns.net` öffnen
2. Tab *Custom Locations* → *Add location*
   - **Location**: `/live_navi`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: die LAN-IP deines Backend-Servers, z.B. `192.168.1.50`
   - **Forward Port**: `3000`
3. Speichern

**Falls es noch keinen Proxy Host für die Domain gibt:**

1. *Proxy Hosts* → *Add Proxy Host*
2. Domain: `serverlele.ddns.net`
3. Scheme/Forward: kann auf deine bestehende Web-App zeigen (Root `/`)
4. SSL-Tab: Let's Encrypt Zertifikat aktivieren (Force SSL empfehlenswert)
5. Danach wie oben die Custom Location `/live_navi` hinzufügen

Wichtig: Das Backend selbst lauscht (via `BASE_PATH` in `.env`) bereits unter `/live_navi/...`,
weil NPM den vollen Pfad inkl. Präfix an das Backend weiterreicht. Du musst also **keine**
zusätzliche Rewrite-Regel in NPM konfigurieren – einfach die Custom Location wie oben anlegen.

Test von außen, sobald DNS/Portfreigabe für `serverlele.ddns.net` stehen:

```bash
curl https://serverlele.ddns.net/live_navi/health
```

## 5. API-Übersicht

| Methode | Pfad                              | Auth      | Beschreibung                                  |
|---------|------------------------------------|-----------|------------------------------------------------|
| GET     | `/live_navi/health`               | –         | Health-Check                                   |
| GET     | `/live_navi/stations/search`      | –         | Haltestellensuche (`?query=`)                  |
| GET     | `/live_navi/stations/:id`         | –         | Details einer Haltestelle                      |
| GET     | `/live_navi/departures/:stationId`| –         | Live-Abfahrten (`?duration=&results=`)         |
| GET     | `/live_navi/journeys`             | –         | Routenplaner (`?from=&to=&when=`)              |
| GET     | `/live_navi/radar`                | –         | Live-Fahrzeugpositionen (`?north=&west=&south=&east=`) |
| GET     | `/live_navi/favorites`            | –         | Liste der Favoriten                            |
| POST    | `/live_navi/favorites`            | API-Key   | Favorit anlegen                                |
| DELETE  | `/live_navi/favorites/:id`        | API-Key   | Favorit löschen                                |
| POST    | `/live_navi/push/register`        | API-Key   | Push-Token registrieren                        |

Für geschützte Endpunkte den Header `X-API-Key: <dein-key-aus-.env>` mitschicken.

## 6. Nächste Schritte

- Rate-Limit-Werte in `src/server.js` an echten Bedarf anpassen
- Später: Push-Notifications (APNs) auf Basis der `push_tokens`-Tabelle bauen
- Später: iOS-App (Swift/SwiftUI) als Client gegen dieses Backend entwickeln
