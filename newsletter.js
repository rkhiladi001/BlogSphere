
/* RK BlogSphere - Newsletter Feature */
(() => {
  'use strict';

  const adminRoles = ['editor', 'admin', 'super_admin'];
  let adminLoading = false;

  const styles = `
    .rk-newsletter-section {
      padding: 42px 5%;
      margin: 24px 5%;
      border-radius: 22px;
      background: linear-gradient(135deg, #e7eee9, #eeeaff);
    }

    .rk-newsletter-box {
      max-width: 720px;
      margin: auto;
      text-align: center;
    }

    .rk-newsletter-box h2 {
      margin: 0 0 12px;
      font-size: clamp(1.6rem, 4vw, 2.3rem);
    }

    .rk-newsletter-box p {
      color: #65727b;
      line-height: 1.6;
    }

    .rk-newsletter-form {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }

    .rk-newsletter-form input {
      flex: 1;
      min-width: 0;
    }

    .rk-newsletter-form button {
      border: 0;
      border-radius: 10px;
      padding: 12px 20px;
      background: #146c60;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    .rk-newsletter-form button:disabled {
      opacity: .6;
      cursor: wait;
    }

    .rk-newsletter-message {
      min-height: 24px;
      font-weight: 600;
      margin-top: 12px;
    }

    #rkNewsletterAdminPanel {
      margin-top: 25px;
      padding: 18px;
      border: 1px solid #e1e5e3;
      border-radius: 14px;
      background: #fff;
    }

    #rkNewsletterAdminList {
      display: grid;
      gap: 9px;
      margin-top: 12px;
    }

    .rk-newsletter-email {
      padding: 12px;
      background: #f4f7f5;
      border-radius: 9px;
      overflow-wrap: anywhere;
    }

    @media(max-width: 540px) {
      .rk-newsletter-section {
        margin: 18px 4%;
        padding: 28px 16px;
      }

      .rk-newsletter-form {
        flex-direction: column;
      }

      .rk-newsletter-form button {
        width: 100%;
      }
    }
  `;

  const escapeHTML = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  function mountNewsletter() {
    if (document.getElementById('rkNewsletterSection')) return;

    const footer = document.querySelector('footer');
    if (!footer) return;

    const style = document.createElement('style');
    style.id = 'rkNewsletterStyles';
    style.textContent = styles;
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.id = 'rkNewsletterSection';
    section.className = 'rk-newsletter-section';

    section.innerHTML = `
      <div class="rk-newsletter-box">
        <h2>Subscribe to RK BlogSphere</h2>

        <p>
          Get the latest stories, articles and updates
          directly in your inbox.
        </p>

        <form id="rkNewsletterForm" class="rk-newsletter-form">
          <input
            type="email"
            id="rkNewsletterEmail"
            placeholder="Enter your email address"
            autocomplete="email"
            required
          >

          <button type="submit">
            Subscribe
          </button>
        </form>

        <p
          id="rkNewsletterMessage"
          class="rk-newsletter-message"
          role="status"
          aria-live="polite"
        ></p>
      </div>
    `;

    footer.parentNode.insertBefore(section, footer);

    const form = document.getElementById('rkNewsletterForm');
    const message = document.getElementById('rkNewsletterMessage');
    const submitButton = form.querySelector('button');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const db = window.rkBlogSphereDB;
      const email = document
        .getElementById('rkNewsletterEmail')
        .value.trim();

      if (!db) {
        message.textContent =
          'Website connection is not ready. Refresh the page.';
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';
      message.textContent = '';

      try {
        const { data, error } = await db.rpc(
          'subscribe_to_newsletter',
          { p_email: email }
        );

        if (error) throw error;

        message.textContent = data || 'Subscription successful!';
        form.reset();

      } catch (error) {
        message.textContent =
          error.message || 'Subscription failed. Please try again.';

      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Subscribe';
      }
    });
  }

  async function loadAdminSubscribers() {
    const host = document.getElementById('dashboardContent');

    if (
      !host ||
      host.querySelector('#rkNewsletterAdminPanel') ||
      adminLoading
    ) {
      return;
    }

    const db = window.rkBlogSphereDB;
    if (!db) return;

    adminLoading = true;

    try {
      const { data: userData, error: userError } =
        await db.auth.getUser();

      if (userError || !userData?.user) return;

      const { data: profile, error: profileError } =
        await db
          .from('profiles')
          .select('role')
          .eq('id', userData.user.id)
          .maybeSingle();

      if (profileError || !profile) return;

      if (!adminRoles.includes(profile.role)) return;

      const panel = document.createElement('div');
      panel.id = 'rkNewsletterAdminPanel';

      panel.innerHTML = `
        <h3>Newsletter Subscribers</h3>

        <p id="rkNewsletterCount">
          Loading subscribers...
        </p>

        <button
          type="button"
          class="btn secondary"
          id="rkNewsletterRefresh"
        >
          Refresh Subscribers
        </button>

        <div id="rkNewsletterAdminList"></div>
      `;

      host.appendChild(panel);

      async function refreshSubscribers() {
        const list = document.getElementById(
          'rkNewsletterAdminList'
        );

        const count = document.getElementById(
          'rkNewsletterCount'
        );

        if (!list || !count) return;

        count.textContent = 'Loading...';
        list.innerHTML = '';

        const { data, error } = await db
          .from('newsletter_subscribers')
          .select('email')
          .order('email', { ascending: true })
          .limit(500);

        if (error) {
          count.textContent = 'Could not load subscribers.';
          list.textContent = error.message;
          return;
        }

        count.textContent =
          `Total subscribers: ${(data || []).length}`;

        list.innerHTML = (data || []).length
          ? data.map((item) => `
              <div class="rk-newsletter-email">
                ${escapeHTML(item.email)}
              </div>
            `).join('')
          : 'No newsletter subscribers yet.';
      }

      document.getElementById(
        'rkNewsletterRefresh'
      ).onclick = refreshSubscribers;

      await refreshSubscribers();

    } catch (error) {
      console.warn('Newsletter admin error:', error);

    } finally {
      adminLoading = false;
    }
  }

  function initNewsletter() {
    mountNewsletter();

    const host = document.getElementById('dashboardContent');

    if (host) {
      const observer = new MutationObserver(() => {
        if (!host.querySelector('#rkNewsletterAdminPanel')) {
          loadAdminSubscribers();
        }
      });

      observer.observe(host, {
        childList: true,
        subtree: true
      });

      loadAdminSubscribers();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initNewsletter,
      { once: true }
    );
  } else {
    initNewsletter();
  }

})();
              
