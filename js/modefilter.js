// Wiederverwendbare Verkehrsmittel-Filter-Chips. Wird sowohl für die
// Abfahrtstafel als auch für den Routenplaner genutzt (zwei unabhängige Instanzen).

const ModeFilter = (() => {
  const LABELS = {
    suburban: 'S',
    subway: 'U',
    tram: 'Tram',
    bus: 'Bus',
    ferry: 'Fähre',
    express: 'Fern',
    regional: 'RE/RB',
  };
  // Ausgeschriebene Namen für aria-label - die kurzen Chip-Beschriftungen
  // ("S", "U", "Fern") sind für Screenreader-Nutzer ohne visuellen Kontext
  // zu kryptisch, um zuverlässig zu wissen, welches Verkehrsmittel gemeint ist.
  const ARIA_LABELS = {
    suburban: 'S-Bahn',
    subway: 'U-Bahn',
    tram: 'Tram',
    bus: 'Bus',
    ferry: 'Fähre',
    express: 'Fernverkehr',
    regional: 'Regionalverkehr (RE/RB)',
  };
  const ALL = Object.keys(LABELS);

  function create(container, storageKey, onChange) {
    let selected = loadState();

    function loadState() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (Array.isArray(saved) && saved.length) return new Set(saved);
      } catch (_) {
        // ignorieren, Standard verwenden
      }
      return new Set(ALL);
    }

    function persist() {
      localStorage.setItem(storageKey, JSON.stringify([...selected]));
    }

    function render() {
      container.innerHTML = '';
      ALL.forEach((mode) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-chip' + (selected.has(mode) ? ' is-active' : '');
        btn.textContent = LABELS[mode];
        btn.setAttribute('aria-pressed', selected.has(mode) ? 'true' : 'false');
        // aria-pressed übernimmt schon die Zustandsansage ("gedrückt"/"nicht
        // gedrückt") - hier nur der ausgeschriebene Name, keine Dopplung.
        btn.setAttribute('aria-label', ARIA_LABELS[mode]);
        btn.addEventListener('click', () => {
          if (selected.has(mode)) {
            selected.delete(mode);
          } else {
            selected.add(mode);
          }
          if (selected.size === 0) selected = new Set(ALL);
          persist();
          render();
          onChange(getModesParam());
        });
        container.appendChild(btn);
      });
    }

    function getModesParam() {
      if (selected.size === ALL.length) return null;
      return [...selected].join(',');
    }

    render();
    return { getModesParam };
  }

  return { create };
})();