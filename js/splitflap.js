// Simuliert das Umklappen einer mechanischen Bahnhofs-Anzeigetafel (Solari-Board).
// Jedes Zeichen "rattert" kurz durch ein paar Zufallszeichen, bevor es sich auf
// den Zielwert setzt - versetzt pro Zeichen, damit es wie eine echte Tafel wirkt.
//
// Für Screenreader ist dieses Zeichensalat-Geflacker während der Animation
// nutzlos bis irreführend. Deshalb wird der sichtbare, animierte Teil in einen
// eigenen Container mit aria-hidden="true" verschoben, und daneben liegt ein
// unsichtbarer (.sr-only), aber für Screenreader normal lesbarer Textknoten
// mit dem fertigen Zielwert - der aktualisiert sich sofort, ohne die
// Ratter-Zwischenschritte mitzumachen.

const SplitFlap = (() => {
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 :+-.äöüÄÖÜß';
  const STEPS_PER_CHAR = 6;
  const STEP_DELAY_MS = 28;
  const STAGGER_MS = 18;

  function randomChar() {
    return CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }

  function render(el, text) {
    let srText = el.querySelector(':scope > .flap-cell__sr');
    if (!srText) {
      srText = document.createElement('span');
      srText.className = 'flap-cell__sr sr-only';
      el.appendChild(srText);
    }
    srText.textContent = text;

    let visual = el.querySelector(':scope > .flap-cell__visual');
    if (!visual) {
      visual = document.createElement('span');
      visual.className = 'flap-cell__visual';
      visual.setAttribute('aria-hidden', 'true');
      el.appendChild(visual);
    }

    const chars = text.split('');
    const existing = visual.querySelectorAll('.flap-char');

    if (existing.length !== chars.length) {
      visual.innerHTML = '';
      chars.forEach(() => {
        const span = document.createElement('span');
        span.className = 'flap-char';
        span.textContent = ' ';
        visual.appendChild(span);
      });
    }

    const spans = visual.querySelectorAll('.flap-char');

    chars.forEach((targetChar, i) => {
      const span = spans[i];
      if (span.dataset.value === targetChar) return;
      span.dataset.value = targetChar;

      let step = 0;
      const delay = i * STAGGER_MS;
      setTimeout(() => {
        const interval = setInterval(() => {
          step += 1;
          span.textContent = step >= STEPS_PER_CHAR ? targetChar : randomChar();
          span.classList.add('flap-char--flipping');
          if (step >= STEPS_PER_CHAR) {
            clearInterval(interval);
            span.classList.remove('flap-char--flipping');
          }
        }, STEP_DELAY_MS);
      }, delay);
    });
  }

  return { render };
})();
