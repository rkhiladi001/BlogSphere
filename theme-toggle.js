
/* RK BlogSphere - Fixed Theme Toggle */
(() => {
  'use strict';

  function startTheme() {
    if (document.getElementById('rkThemeToggle')) return;

    const button = document.createElement('button');
    button.id = 'rkThemeToggle';
    button.type = 'button';
    button.textContent = '🌙';
    button.title = 'Dark / Light Mode';

    button.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 85px;
      width: 48px;
      height: 48px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: linear-gradient(135deg,#3020a0,#8b35d1);
      color: white;
      font-size: 23px;
      cursor: pointer;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 15px #0005;
    `;

    const saved = localStorage.getItem('rk-theme') || 'light';

    function setTheme(theme) {
      document.documentElement.setAttribute('data-rk-theme', theme);
      localStorage.setItem('rk-theme', theme);

      button.textContent = theme === 'dark' ? '☀️' : '🌙';

      document.body.style.backgroundColor =
        theme === 'dark' ? '#111827' : '';

      document.body.style.color =
        theme === 'dark' ? '#f3f4f6' : '';
    }

    button.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-rk-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });

    document.body.appendChild(button);
    setTheme(saved);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTheme);
  } else {
    startTheme();
  }
})();
