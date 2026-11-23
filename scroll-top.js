
/* RK BlogSphere - Back to Top Feature */
(() => {
  'use strict';

  function initScrollTop() {
    if (document.getElementById('rkBackToTop')) return;

    const button = document.createElement('button');
    button.id = 'rkBackToTop';
    button.type = 'button';
    button.setAttribute('aria-label', 'Back to top');
    button.title = 'Back to top';
    button.innerHTML = '&#8593;';

    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '22px',
      width: '48px',
      height: '48px',
      border: '2px solid #ffffff',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #3020a0, #8b35d1)',
      color: '#ffffff',
      fontSize: '28px',
      fontWeight: 'bold',
      cursor: 'pointer',
      zIndex: '99999',
      display: 'none',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      transition: 'opacity 0.25s ease, transform 0.25s ease'
    });

    document.body.appendChild(button);

    window.addEventListener('scroll', () => {
      button.style.display =
        window.scrollY > 300 ? 'block' : 'none';
    }, { passive: true });

    button.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollTop);
  } else {
    initScrollTop();
  }
})();
