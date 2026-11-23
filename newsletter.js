
/* RK BlogSphere - Newsletter module */
(() => {
  'use strict';

  function initNewsletter() {
    const db = window.rkBlogSphereDB;

    if (!db) return false;

    if (document.getElementById('rkNewsletter')) {
      return true;
    }

    const section = document.createElement('section');
    section.id = 'rkNewsletter';
    section.className = 'newsletter-section';

    section.innerHTML = `
      <div class="newsletter-inner">
        <h2>Join Our Newsletter</h2>
        <p>Get the latest articles and updates from RK BlogSphere.</p>

        <form id="rkNewsletterForm">
          <input
            id="rkNewsletterEmail"
            type="email"
            placeholder="Enter your email address"
            required
          >
          <button type="submit">Subscribe</button>
        </form>

        <p id="rkNewsletterMessage" aria-live="polite"></p>
      </div>
    `;

    const footer = document.querySelector('footer');

    if (footer) {
      footer.parentNode.insertBefore(section, footer);
    } else {
      document.body.appendChild(section);
    }

    document.getElementById('rkNewsletterForm')
      .addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document
          .getElementById('rkNewsletterEmail')
          .value.trim();

        const message = document
          .getElementById('rkNewsletterMessage');

        const button = event.target.querySelector('button');

        message.textContent = 'Please wait...';
        button.disabled = true;

        try {
          const { data, error } = await db.rpc(
            'subscribe_to_newsletter',
            { p_email: email }
          );

          if (error) throw error;

          message.textContent =
            data || 'Subscription successful!';

          event.target.reset();

        } catch (error) {
          console.error('Newsletter error:', error);
          message.textContent =
            error.message || 'Subscription failed. Please try again.';
        } finally {
          button.disabled = false;
        }
      });

    return true;
  }

  function startNewsletter() {
    if (initNewsletter()) return;

    let attempts = 0;

    const wait = setInterval(() => {
      attempts++;

      if (initNewsletter() || attempts >= 50) {
        clearInterval(wait);
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startNewsletter);
  } else {
    startNewsletter();
  }
})();
