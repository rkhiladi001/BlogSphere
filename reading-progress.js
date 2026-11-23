/* RK BlogSphere - Article Reading Progress */
(() => {
  'use strict';

  function initReadingProgress() {
    if (document.getElementById('rkReadingProgress')) return;

    const bar = document.createElement('div');
    bar.id = 'rkReadingProgress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Article reading progress');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', '0');

    const fill = document.createElement('div');
    fill.id = 'rkReadingProgressFill';

    bar.appendChild(fill);
    document.body.appendChild(bar);

    const style = document.createElement('style');
    style.textContent = `
      #rkReadingProgress {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 4px;
        background: rgba(120, 120, 160, 0.18);
        z-index: 999999;
        pointer-events: none;
      }

      #rkReadingProgressFill {
        width: 0%;
        height: 100%;
        background: linear-gradient(
          90deg,
          #00d4ff,
          #693bff,
          #ff45aa,
          #ffc83d
        );
        box-shadow: 0 0 8px rgba(105, 59, 255, 0.45);
        transition: width 0.08s linear;
      }
    `;

    document.head.appendChild(style);

    let ticking = false;

    function updateProgress() {
      const scrollTop =
        window.scrollY || document.documentElement.scrollTop;

      const scrollHeight =
        document.documentElement.scrollHeight -
        window.innerHeight;

      const progress = scrollHeight > 0
        ? Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100))
        : 0;

      fill.style.width = progress + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(progress)));

      ticking = false;
    }

    function requestUpdate() {
      if (!ticking) {
        window.requestAnimationFrame(updateProgress);
        ticking = true;
      }
    }

    window.addEventListener('scroll', requestUpdate, {
      passive: true
    });

    window.addEventListener('resize', requestUpdate);

    updateProgress();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReadingProgress);
  } else {
    initReadingProgress();
  }
})();
