
/* RK BlogSphere - Floating Social Share */
(() => {
  'use strict';

  function initSocialShare() {
    if (document.getElementById('rkSocialShare')) return;

    const box = document.createElement('div');
    box.id = 'rkSocialShare';

    Object.assign(box.style, {
      position: 'fixed',
      left: '12px',
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      zIndex: '99990'
    });

    const style = document.createElement('style');
    style.textContent = `
      #rkSocialShare a {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        color: #ffffff;
        font-size: 17px;
        font-weight: 800;
        box-shadow: 0 3px 12px #0003;
        transition: transform 0.2s ease;
      }

      #rkSocialShare a:hover {
        transform: scale(1.12);
      }

      @media(max-width:600px) {
        #rkSocialShare {
          left: 6px !important;
          gap: 7px !important;
        }

        #rkSocialShare a {
          width: 36px !important;
          height: 36px !important;
          font-size: 14px !important;
        }
      }
    `;

    document.head.appendChild(style);

    const pageURL = encodeURIComponent(window.location.href);
    const pageTitle = encodeURIComponent(document.title);

    const links = [
      {
        text: 'W',
        title: 'WhatsApp',
        url: `https://wa.me/?text=${pageTitle}%20${pageURL}`,
        color: '#25D366'
      },
      {
        text: 'f',
        title: 'Facebook',
        url: `https://www.facebook.com/sharer/sharer.php?u=${pageURL}`,
        color: '#1877F2'
      },
      {
        text: 'T',
        title: 'Telegram',
        url: `https://t.me/share/url?url=${pageURL}&text=${pageTitle}`,
        color: '#229ED9'
      }
    ];

    links.forEach(item => {
      const a = document.createElement('a');
      a.href = item.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = item.title;
      a.setAttribute('aria-label', item.title);
      a.textContent = item.text;
      a.style.background = item.color;

      box.appendChild(a);
    });

    const copy = document.createElement('a');
    copy.href = '#';
    copy.title = 'Copy Link';
    copy.setAttribute('aria-label', 'Copy Link');
    copy.textContent = '🔗';
    copy.style.background = '#6b35bd';

    copy.addEventListener('click', async (e) => {
      e.preventDefault();

      try {
        await navigator.clipboard.writeText(window.location.href);
        copy.textContent = '✓';
        copy.title = 'Copied!';

        setTimeout(() => {
          copy.textContent = '🔗';
          copy.title = 'Copy Link';
        }, 1500);
      } catch {
        window.prompt('Copy this link:', window.location.href);
      }
    });

    box.appendChild(copy);
    document.body.appendChild(box);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocialShare);
  } else {
    initSocialShare();
  }
})();
