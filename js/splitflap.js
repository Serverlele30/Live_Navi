// Simuliert das Umklappen einer mechanischen Bahnhofs-Anzeigetafel (Solari-Board).
// Jedes Zeichen "rattert" kurz durch ein paar Zufallszeichen, bevor es sich auf
// den Zielwert setzt - versetzt pro Zeichen, damit es wie eine echte Tafel wirkt.

const SplitFlap = (() => {
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 :+-.äöüÄÖÜß';
  const STEPS_PER_CHAR = 6;
  const STEP_DELAY_MS = 28;
  const STAGGER_MS = 18;

  function randomChar() {
    return CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }

  function render(el, text) {
    const chars = text.split('');
    const existing = el.querySelectorAll('.flap-char');

    if (existing.length !== chars.length) {
      el.innerHTML = '';
      chars.forEach(() => {
        const span = document.createElement('span');
        span.className = 'flap-char';
        span.textContent = ' ';
        el.appendChild(span);
      });
    }

    const spans = el.querySelectorAll('.flap-char');

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