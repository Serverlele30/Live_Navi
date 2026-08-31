// Mehrsprachigkeit: einfaches, erweiterbares Key-Value-Wörterbuch statt einer
// externen i18n-Library (die App ist klein genug, dass sich das nicht lohnt).
// Deutsch ist immer die Fallback-Sprache, falls ein Key in einer anderen
// Sprache fehlt - so kann man neue Sprachen nach und nach vervollständigen,
// ohne dass währenddessen Keys komplett leer/undefined angezeigt werden.
//
// Deckt aktuell ab: die komplette statische Oberfläche (Navigation,
// Überschriften, Buttons, Platzhalter) sowie die am häufigsten sichtbaren
// dynamisch erzeugten Texte (Abfahrtstafel-Beschriftungen, Favoriten-Karten,
// Formular-Rückmeldungen). Tiefer verschachtelte Bereiche (Fahrt-Detail-Modal,
// Fahrtalarm-Overlay, Live-Karten-Popups) sowie Störungstexte direkt von VBB
// bleiben bewusst auf Deutsch, da VBB dafür keine englischen Texte liefert.

const I18N = (() => {
  const STORAGE_KEY = 'oepnv-navi:db-lang';

  const translations = {
    de: {
      'search.placeholder': 'Haltestelle, Ort oder Ziel suchen…',
      'search.clear': 'Suche leeren',
      'nav.favorites': 'Favoriten',
      'nav.departures': 'Abfahrten',
      'nav.route': 'Route',
      'nav.map': 'Karte',
      'nav.more': 'Mehr',
      'common.optional': 'OPTIONAL',
      'common.showAll': 'Alle anzeigen',
      'common.live': 'LIVE',
      'common.current': 'AKTUELL',
      'common.clear': 'Leeren',
      'common.footer': 'ℹ Live-Daten von VBB · Angaben ohne Gewähr',
      'welcome.title': 'Was fährt jetzt?',
      'welcome.text': 'Suche eine Haltestelle oder nutze deinen Standort, um die nächsten Abfahrten zu sehen.',
      'welcome.nearbyTitle': 'In meiner Nähe',
      'welcome.nearbyText': 'Haltestellen im Umkreis finden',
      'welcome.routeTitle': 'Route planen',
      'welcome.routeText': 'Von A nach B mit Bus & Bahn',
      'nearby.homeTitle': 'Haltestellen in der Nähe',
      'nearby.eyebrow': 'STANDORT',
      'nearby.title': 'In der Nähe',
      'nearby.text': 'Finde Haltestellen rund um deinen aktuellen Standort.',
      'nearby.locate': 'Meinen Standort verwenden',
      'nearby.emptyState': 'Nutze deinen Standort, um Haltestellen in deiner Nähe zu finden.',
      'departures.eyebrow': 'LIVE-ABFAHRTEN',
      'departures.noStation': 'Keine Haltestelle ausgewählt',
      'departures.refreshInfo': 'Aktualisierung alle 30 Sekunden',
      'departures.emptyState': 'Suche oben eine Haltestelle, um Live-Abfahrten zu sehen.',
      'departures.line': 'Linie',
      'departures.direction': 'Ziel',
      'departures.platform': 'Gleis',
      'departures.time': 'Abfahrt',
      'departures.cancelled': 'FÄLLT AUS',
      'departures.plannedShort': 'urspr.',
      'departures.platformChanged': 'GLEIS {n}',
      'departures.platformInstead': 'statt {n}',
      'departures.noResultsForModes': 'Keine Abfahrten für die gewählten Verkehrsmittel in den nächsten 30 Minuten.',
      'favorites.favorite': 'Favorit',
      'favorites.eyebrow': 'SCHNELLZUGRIFF',
      'favorites.title': 'Meine Haltestellen',
      'favorites.text': 'Deine gespeicherten Haltestellen mit Live-Abfahrten und Störungshinweisen.',
      'favorites.enableNotify': 'Störungsbenachrichtigungen aktivieren',
      'favorites.notifyActive': 'Benachrichtigungen aktiv',
      'favorites.notifyBlocked': 'Benachrichtigungen blockiert',
      'favorites.emptyHint': 'Noch keine Favoriten - tippe bei einer Haltestelle auf ☆, um sie hier anzupinnen.',
      'favorites.loadingNext': 'Lade nächste Abfahrt…',
      'favorites.noDeparture': 'Keine Abfahrt gefunden',
      'favorites.cancelledShort': 'fällt aus',
      'favorites.minutesShort': 'min',
      'map.title': 'Karte',
      'map.text': 'Fahrzeuge, Routen und deine aktuelle Fahrt live verfolgen.',
      'map.locate': 'Mein Standort',
      'map.following': 'Verfolge Linie',
      'map.live': 'live',
      'map.showAllLines': 'Alle Linien anzeigen',
      'journey.eyebrow': 'VERBINDUNG SUCHEN',
      'journey.title': 'Wohin möchtest du?',
      'journey.text': 'Starte mit deinem Standort oder suche einen Ausgangspunkt.',
      'journey.fromPlaceholder': 'Mein Standort oder Start…',
      'journey.toPlaceholder': 'Wohin?',
      'journey.useLocation': 'Meinen Standort verwenden',
      'journey.now': 'Jetzt',
      'journey.departureAt': 'Abfahrt um',
      'journey.arrivalAt': 'Ankunft um',
      'journey.wheelchair': 'Nur rollstuhlgerechte Verbindungen',
      'journey.transferSlack': 'Umstiegszeit-Puffer',
      'journey.transferSlackDefault': 'Standard',
      'journey.transferSlack0': '0 min (knapp)',
      'journey.transferSlack15': '15 min (sicher)',
      'journey.submit': 'Verbindungen suchen',
      'journey.sourceNote': '🛰 Routenplanung über unsere selbst gehostete, offene Instanz (VBB-Region)',
      'journey.share': 'Route teilen',
      'journey.selectFromResults': 'Bitte Start und Ziel aus der Liste auswählen.',
      'journey.searching': 'Suche Verbindungen…',
      'journey.noResults': 'Keine Verbindungen gefunden.',
      'disruptions.title': 'Störungen',
      'disruptions.text': 'Ortsbezogene und netzweite Hinweise.',
      'disruptions.nearbyTitle': 'In deiner Nähe',
      'disruptions.useLocation': 'Standort verwenden',
      'disruptions.nearbyEmpty': 'Nutze deinen Standort für ortsbezogene Störungen.',
      'disruptions.networkTitle': 'Netzweit',
      'disruptions.loading': 'Störungsmeldungen werden geladen…',
      'fares.eyebrow': 'PREISE',
      'fares.title': 'Tickets',
      'fares.text': 'Übliche VBB-Fahrpreise auf einen Blick.',
      'fares.disclaimer': 'Angaben ohne Gewähr – Preise können sich ändern.',
      'fares.loading': 'Lade Fahrpreise…',
      'fares.buyTitle': 'Tickets kaufen',
      'more.eyebrow': 'WEITERE FUNKTIONEN',
      'more.text': 'Alles, was nicht bei jeder Fahrt gebraucht wird.',
      'more.favoritesText': 'Deine gespeicherten Haltestellen',
      'more.nearbyText': 'Haltestellen in deiner Umgebung',
      'more.disruptionsText': 'Ortsbezogen & netzweit',
      'more.faresText': 'Preise & wo kaufen',
      'more.historyEyebrow': 'VERLAUF',
      'more.historyTitle': 'Zuletzt gesucht',
      'more.langEyebrow': 'SPRACHE / LANGUAGE',
      'more.langTitle': 'Sprache',
      'search.noResults': 'Keine Treffer',
      'search.recentSearches': 'Zuletzt gesucht',
      'recent.empty': 'Noch keine Suchen.',
      'recent.remove': '{name} aus Verlauf entfernen',
    },
    en: {
      'search.placeholder': 'Search for a stop, place or destination…',
      'search.clear': 'Clear search',
      'nav.favorites': 'Favorites',
      'nav.departures': 'Departures',
      'nav.route': 'Route',
      'nav.map': 'Map',
      'nav.more': 'More',
      'common.optional': 'OPTIONAL',
      'common.showAll': 'Show all',
      'common.live': 'LIVE',
      'common.current': 'CURRENT',
      'common.clear': 'Clear',
      'common.footer': 'ℹ Live data from VBB · No guarantee of accuracy',
      'welcome.title': 'What\u2019s leaving now?',
      'welcome.text': 'Search for a stop or use your location to see the next departures.',
      'welcome.nearbyTitle': 'Nearby',
      'welcome.nearbyText': 'Find stops around you',
      'welcome.routeTitle': 'Plan a route',
      'welcome.routeText': 'From A to B by bus & train',
      'nearby.homeTitle': 'Stops nearby',
      'nearby.eyebrow': 'LOCATION',
      'nearby.title': 'Nearby',
      'nearby.text': 'Find stops around your current location.',
      'nearby.locate': 'Use my location',
      'nearby.emptyState': 'Use your location to find stops nearby.',
      'departures.eyebrow': 'LIVE DEPARTURES',
      'departures.noStation': 'No stop selected',
      'departures.refreshInfo': 'Updates every 30 seconds',
      'departures.emptyState': 'Search for a stop above to see live departures.',
      'departures.line': 'Line',
      'departures.direction': 'Towards',
      'departures.platform': 'Platform',
      'departures.time': 'Departure',
      'departures.cancelled': 'CANCELLED',
      'departures.plannedShort': 'orig.',
      'departures.platformChanged': 'PLATFORM {n}',
      'departures.platformInstead': 'instead of {n}',
      'departures.noResultsForModes': 'No departures for the selected transport modes in the next 30 minutes.',
      'favorites.favorite': 'Favorite',
      'favorites.eyebrow': 'QUICK ACCESS',
      'favorites.title': 'My Stops',
      'favorites.text': 'Your saved stops with live departures and disruption notices.',
      'favorites.enableNotify': 'Enable disruption notifications',
      'favorites.notifyActive': 'Notifications active',
      'favorites.notifyBlocked': 'Notifications blocked',
      'favorites.emptyHint': 'No favorites yet - tap ☆ at a stop to pin it here.',
      'favorites.loadingNext': 'Loading next departure…',
      'favorites.noDeparture': 'No departure found',
      'favorites.cancelledShort': 'cancelled',
      'favorites.minutesShort': 'min',
      'map.title': 'Map',
      'map.text': 'Track vehicles, routes and your current trip live.',
      'map.locate': 'My location',
      'map.following': 'Tracking line',
      'map.live': 'live',
      'map.showAllLines': 'Show all lines',
      'journey.eyebrow': 'PLAN A JOURNEY',
      'journey.title': 'Where to?',
      'journey.text': 'Start with your location or search for a starting point.',
      'journey.fromPlaceholder': 'My location or start…',
      'journey.toPlaceholder': 'Where to?',
      'journey.useLocation': 'Use my location',
      'journey.now': 'Now',
      'journey.departureAt': 'Depart at',
      'journey.arrivalAt': 'Arrive by',
      'journey.wheelchair': 'Wheelchair-accessible connections only',
      'journey.transferSlack': 'Transfer buffer',
      'journey.transferSlackDefault': 'Default',
      'journey.transferSlack0': '0 min (tight)',
      'journey.transferSlack15': '15 min (safe)',
      'journey.submit': 'Search connections',
      'journey.sourceNote': '🛰 Journey planning via our self-hosted, open instance (VBB region)',
      'journey.share': 'Share route',
      'journey.selectFromResults': 'Please choose start and destination from the list.',
      'journey.searching': 'Searching for connections…',
      'journey.noResults': 'No connections found.',
      'disruptions.title': 'Disruptions',
      'disruptions.text': 'Location-based and network-wide notices.',
      'disruptions.nearbyTitle': 'Near you',
      'disruptions.useLocation': 'Use location',
      'disruptions.nearbyEmpty': 'Use your location for nearby disruptions.',
      'disruptions.networkTitle': 'Network-wide',
      'disruptions.loading': 'Loading disruption notices…',
      'fares.eyebrow': 'FARES',
      'fares.title': 'Tickets',
      'fares.text': 'Common VBB fares at a glance.',
      'fares.disclaimer': 'No guarantee of accuracy – prices may change.',
      'fares.loading': 'Loading fares…',
      'fares.buyTitle': 'Buy tickets',
      'more.eyebrow': 'MORE FEATURES',
      'more.text': 'Everything you don\u2019t need on every trip.',
      'more.favoritesText': 'Your saved stops',
      'more.nearbyText': 'Stops around you',
      'more.disruptionsText': 'Local & network-wide',
      'more.faresText': 'Prices & where to buy',
      'more.historyEyebrow': 'HISTORY',
      'more.historyTitle': 'Recently searched',
      'more.langEyebrow': 'SPRACHE / LANGUAGE',
      'more.langTitle': 'Language',
      'search.noResults': 'No results',
      'search.recentSearches': 'Recently searched',
      'recent.empty': 'No searches yet.',
      'recent.remove': 'Remove {name} from history',
    },
  };

  let lang = 'de';
  let onLangChange = null;

  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && translations[saved]) return saved;
    } catch (_) { /* localStorage evtl. nicht verfügbar */ }
    const browserLang = (navigator.language || 'de').slice(0, 2).toLowerCase();
    return translations[browserLang] ? browserLang : 'de';
  }

  function t(key, vars) {
    let str = (translations[lang] && translations[lang][key]) || translations.de[key] || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(`{${k}}`, vars[k]);
      });
    }
    return str;
  }

  function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lang === lang);
    });
  }

  function setLang(newLang) {
    if (!translations[newLang] || newLang === lang) return;
    lang = newLang;
    try { localStorage.setItem(STORAGE_KEY, newLang); } catch (_) { /* ignorieren */ }
    document.documentElement.lang = newLang;
    applyStaticTranslations();
    if (typeof onLangChange === 'function') onLangChange(newLang);
  }

  // Wird von app.js gesetzt, um nach einem Sprachwechsel auch dynamisch
  // erzeugte Inhalte (z.B. gerade sichtbare Abfahrtstafel) neu zu rendern -
  // applyStaticTranslations() allein erreicht nur [data-i18n]-Elemente im DOM.
  function setOnLangChange(fn) {
    onLangChange = fn;
  }

  function getLang() {
    return lang;
  }

  function init() {
    lang = detectLang();
    document.documentElement.lang = lang;
    applyStaticTranslations();
  }

  return { t, setLang, getLang, setOnLangChange, init };
})();
