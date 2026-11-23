
/* RK BlogSphere - Dark and Light Mode */
(() => {
  'use strict';

  function initThemeToggle() {
    if (document.getElementById('rkThemeToggle')) return;

    const savedTheme = localStorage.getItem('rk-theme') || 'light';

    document.documentElement.setAttribute(
      'data-rk-theme',
      savedTheme
    );

    const button = document.createElement('button');
    button.id = 'rkThemeToggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Toggle dark mode');

    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '82px',
      width: '46px',
      height: '46px',
      border: '2px solid white',
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#3020a0,#8b35d1)',
      color: 'white',
      fontSize: '21px',
      cursor: 'pointer',
      zIndex: '99998',
      boxShadow: '0 4px 14px #0004'
    });

    function applyTheme(theme) {
      document.documentElement.setAttribute(
        'data-rk-theme',
        theme
      );

      localStorage.setItem('rk-theme', theme);
      button.textContent = theme === 'dark' ? '☀️' : '🌙';
      button.title = theme === 'dark'
        ? 'Switch to Light Mode'
        : 'Switch to Dark Mode';
    }

    applyTheme(savedTheme);

    button.addEventListener('click', () => {
      const current = document.documentElement
        .getAttribute('data-rk-theme');

      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    document.body.appendChild(button);

    const style = document.createElement('style');
    style.textContent = `
      html[data-rk-theme="dark"] body {
        background: #111827 !important;
        color: #f3f4f6 !important;
      }

      html[data-rk-theme="dark"] main,
      html[data-rk-theme="dark"] .container,
      html[data-rk-theme="dark"] .content,
      html[data-rk-theme="dark"] .card,
      html[data-rk-theme="dark"] article {
        background-color: #1f2937 !important;
        color: #f3f4f6 !important;
      }

      html[data-rk-theme="dark"] h1,
      html[data-rk-theme="dark"] h2,
      html[data-rk-theme="dark"] h3,
      html[data-rk-theme="dark"] p,
      html[data-rk-theme="dark"] label {
        color: #f3f4f6;
      }

      html[data-rk-theme="dark"] input,
      html[data-rk-theme="dark"] textarea,
      html[data-rk-theme="dark"] select {
        background: #374151 !important;
        color: #ffffff !important;
        border-color: #64748b !important;
      }
    `;

    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
