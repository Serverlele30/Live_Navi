/*
 * Live Navi – Theme-Umschalter
 * Standard: Dark. Auswahl wird lokal im Browser gespeichert.
 * Lädt keine externen Bibliotheken und verändert keine API-Aufrufe.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'oepnv-navi:theme';
  const META_COLOR = '#111821';
  const META_COLOR_LIGHT = '#f3f6fa';
  let theme = 'dark';

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') theme = saved;
  } catch (_) {
    // Wenn localStorage gesperrt ist, bleibt Dark Mode als Standard aktiv.
  }

  function applyTheme(nextTheme) {
    theme = nextTheme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);

    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? META_COLOR : META_COLOR_LIGHT);

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.textContent = theme === 'dark' ? '☀' : '☾';
      toggle.title = theme === 'dark' ? 'Zum hellen Design wechseln' : 'Zum dunklen Design wechseln';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.setAttribute('aria-pressed', String(theme === 'light'));
    }

    const settingsButton = document.getElementById('theme-mode-btn');
    if (settingsButton) settingsButton.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';

    document.dispatchEvent(new CustomEvent('app-theme-change', { detail: { theme } }));
  }

  // Bereits vor dem ersten Rendern setzen, damit kein heller Startbildschirm aufblitzt.
  applyTheme(theme);

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }

  function addThemeControls() {
    const header = document.querySelector('.app-header');
    const settingsAnchor = document.getElementById('header-settings-btn');

    if (header && settingsAnchor && !document.getElementById('theme-toggle')) {
      const button = document.createElement('button');
      button.id = 'theme-toggle';
      button.className = 'header-icon-btn theme-toggle';
      button.type = 'button';
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.title = theme === 'dark' ? 'Zum hellen Design wechseln' : 'Zum dunklen Design wechseln';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(theme === 'light'));
      button.addEventListener('click', toggleTheme);
      header.insertBefore(button, settingsAnchor);
    }

    const settingsPanel = document.querySelector('#panel-settings .settings-section');
    if (settingsPanel && !document.getElementById('theme-mode-btn')) {
      const section = document.createElement('div');
      section.className = 'settings-section theme-settings';
      section.innerHTML = `
        <div class="section-heading"><div><h2>Design</h2></div></div>
        <div class="theme-settings-row">
          <div class="settings-toggle__text">
            <strong>Darstellung</strong>
            <small>Zwischen dunklem und hellem Design wechseln. Die Auswahl bleibt auf diesem Gerät gespeichert.</small>
          </div>
          <button type="button" class="theme-mode-btn" id="theme-mode-btn"></button>
        </div>`;
      settingsPanel.parentNode.insertBefore(section, settingsPanel);
      document.getElementById('theme-mode-btn').addEventListener('click', toggleTheme);
      applyTheme(theme);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addThemeControls, { once: true });
  } else {
    addThemeControls();
  }
})();
