/* RK BlogSphere - frontend application */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const cfg = window.BLOGSPHERE_CONFIG || {};

  const state = {
    db: null,
    session: null,
    profile: null,
    categories: [],
    posts: [],
    settings: {}
  };

  const requiredIds = [
    'year', 'feedStatus', 'posts', 'authArea', 'modal',
    'modalContent', 'closeModal', 'categoryFilter',
    'postCategory', 'search', 'refreshBtn', 'writePrompt',
    'postForm', 'postTitle', 'postExcerpt', 'postContent',
    'coverFile', 'postMessage', 'dashboardContent'
  ];

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

  function withTimeout(promise, label, milliseconds = 15000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(
        new Error(`${label} timed out. Check internet and Supabase settings.`)
      ), milliseconds);
    });
    return Promise.race([Promise.resolve(promise), timeout])
      .finally(() => window.clearTimeout(timer));
  }

  function setStatus(message, isError = false) {
    const el = $('feedStatus');
    if (el) {
      el.textContent = message;
      el.style.color = isError ? '#b42318' : '';
    }
  }

  function showModal(html) {
    $('modalContent').innerHTML = html;
    $('modal').hidden = false;
  }

  function closeModal() {
    $('modal').hidden = true;
  }

  function isWriter() {
    return !!state.profile &&
      ['author', 'editor', 'admin', 'super_admin'].includes(state.profile.role);
  }

  function isAdmin() {
    return !!state.profile &&
      ['editor', 'admin', 'super_admin'].includes(state.profile.role);
  }

  function settingText(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'string' ? parsed : value;
      } catch (_) {
        return value;
      }
    }
    return String(value);
  }

  function applySettings() {
    const s = state.settings;
    const siteName = settingText(s.site_name) || 'RK BlogSphere';
    document.title = siteName;

    const tagline = settingText(s.site_tagline);
    const brandText = document.querySelector('.rkb-brand-text');
    if (brandText) brandText.textContent = siteName;

    const footer = document.querySelector('footer p');
    if (footer) {
      footer.textContent = `© ${new Date().getFullYear()} ${siteName} · Made for readers and writers`;
    }

    const heroTitle = settingText(s.hero_title);
    const heroDescription = settingText(s.hero_description);
    const h1 = document.querySelector('.hero h1');
    const heroParagraph = document.querySelector('.hero > div > p:not(.eyebrow)');

    if (heroTitle && h1) h1.textContent = heroTitle;
    if (heroDescription && heroParagraph) heroParagraph.textContent = heroDescription;

    if (tagline) {
      const eyebrow = document.querySelector('.hero .eyebrow');
      if (eyebrow) eyebrow.textContent = tagline;
    }

    const logoMap = {
      logo_header: '.rkb-header-logo',
      logo_home: '.rkb-hero-logo',
      logo_login: '.rkb-auth-logo',
      logo_footer: '.rkb-footer-logo'
    };

    Object.entries(logoMap).forEach(([key, selector]) => {
      const image = document.querySelector(selector);
      const url = settingText(s[key]);
      if (image && url) image.src = url;
    });
  }

  async function loadSettings() {
    try {
      const { data, error } = await withTimeout(
        state.db.from('site_settings').select('key,value'),
        'Loading website settings'
      );

      if (error) {
        console.warn('Settings error:', error.message);
        return;
      }

      state.settings = {};
      (data || []).forEach((row) => {
        state.settings[row.key] = row.value;
      });

      applySettings();
    } catch (error) {
      console.warn('Settings loading error:', error);
    }
  }

  async function saveSetting(key, value) {
    const { error } = await state.db.rpc('admin_set_site_setting', {
      p_key: key,
      p_value: String(value)
    });

    if (error) throw error;

    state.settings[key] = value;
    applySettings();
  }

  function renderAuth() {
    const area = $('authArea');
    if (!area) return;

    if (state.session?.user) {
      const label = state.profile?.username ||
        state.profile?.full_name ||
        state.session.user.email ||
        'Account';

      area.innerHTML = `
        <span class="postmeta">${esc(label)}
        ${state.profile?.role ? ' · ' + esc(state.profile.role) : ''}</span>
        <button class="smallbtn" id="logoutBtn" type="button">Logout</button>
      `;

      $('logoutBtn').onclick = async () => {
        const { error } = await state.db.auth.signOut();
        if (error) alert(error.message);
      };
      return;
    }

    area.innerHTML = `
      <button class="btn" id="loginBtn" type="button">
        Login / Sign up
      </button>
    `;

    $('loginBtn').onclick = openAuthModal;
  }

  function openAuthModal() {
    showModal(`
      <h2>Login / Sign up</h2>
      <form id="authForm" class="adminlist">
        <label>Email</label>
        <input id="authEmail" type="email"
          autocomplete="email" required
          placeholder="Enter your email">

        <label>Password</label>
        <input id="authPassword" type="password"
          autocomplete="current-password"
          minlength="6" required
          placeholder="At least 6 characters">

        <div class="inlineform">
          <button class="btn" type="submit">Login</button>
          <button class="btn secondary" id="signupBtn" type="button">
            Create account
          </button>
        </div>

        <p id="authMsg" class="muted" aria-live="polite"></p>
      </form>
    `);

    $('authForm').onsubmit = async (event) => {
      event.preventDefault();

      const email = $('authEmail').value.trim();
      const password = $('authPassword').value;
      $('authMsg').textContent = 'Signing in…';

      const { error } = await state.db.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        $('authMsg').textContent = error.message;
      } else {
        $('authMsg').textContent = 'Login successful.';
        closeModal();
      }
    };

    $('signupBtn').onclick = async () => {
      const email = $('authEmail').value.trim();
      const password = $('authPassword').value;

      if (!email || password.length < 6) {
        $('authMsg').textContent =
          'Enter a valid email and password of at least 6 characters.';
        return;
      }

      $('authMsg').textContent = 'Creating account…';

      const { error } = await state.db.auth.signUp({
        email,
        password
      });

      $('authMsg').textContent = error
        ? error.message
        : 'Account request submitted. Check email if confirmation is enabled.';
    };
  }

  async function loadProfile() {
    state.profile = null;

    if (state.session?.user) {
      const { data, error } = await withTimeout(
        state.db.from('profiles')
          .select('*')
          .eq('id', state.session.user.id)
          .maybeSingle(),
        'Loading your profile'
      );

      if (error) console.warn('Profile error:', error.message);
      state.profile = data || null;
    }

    renderAuth();
    renderWriteForm();
    await renderDashboard();
  }

  function renderWriteForm() {
    const allowed = isWriter();
    $('writePrompt').hidden = allowed;
    $('postForm').hidden = !allowed;

    if (allowed) $('writePrompt').textContent = '';
  }

  async function loadCategories() {
    const { data, error } = await withTimeout(
      state.db.from('categories')
        .select('id,name,slug')
        .order('name'),
      'Loading categories'
    );

    if (error) {
      console.warn('Categories error:', error.message);
      return;
    }

    state.categories = data || [];

    const options = state.categories.map((category) =>
      `<option value="${esc(category.id)}">${esc(category.name)}</option>`
    ).join('');

    $('categoryFilter').innerHTML =
      '<option value="">All categories</option>' + options;

    $('postCategory').innerHTML =
      '<option value="">Choose category</option>' + options;
  }

  function categoryName(id) {
    return state.categories.find((item) => item.id === id)?.name || 'Article';
  }

  async function loadPosts() {
    setStatus('Loading articles…');
    $('posts').innerHTML =
      '<div class="message">Connecting to RK BlogSphere…</div>';

    try {
      const { data, error } = await withTimeout(
        state.db.from('posts')
          .select('id,title,slug,excerpt,content,cover_image,category_id,status,featured,views,created_at,published_at,author_id')
          .eq('status', 'published')
          .order('featured', { ascending: false })
          .order('published_at', { ascending: false }),
        'Loading published articles'
      );

      if (error) throw error;

      state.posts = data || [];
      renderPostList();
    } catch (error) {
      console.error('Post feed error:', error);
      setStatus(`Could not load articles: ${error.message}`, true);
      $('posts').innerHTML = `
        <div class="message">
          Articles could not be loaded.
          Check Supabase connection and permissions.
        </div>
      `;
    }
  }

  function renderPostList() {
    const searchTerm = $('search').value.trim().toLowerCase();
    const selectedCategory = $('categoryFilter').value;

    const filtered = state.posts.filter((post) => {
      const text = `${post.title || ''} ${post.excerpt || ''} ${post.content || ''}`.toLowerCase();

      return (!selectedCategory || post.category_id === selectedCategory) &&
        (!searchTerm || text.includes(searchTerm));
    });

    setStatus(`${filtered.length} article(s)`);

    $('posts').innerHTML = filtered.length
      ? filtered.map((post) => `
        <article class="postcard">
          ${post.cover_image
            ? `<img src="${esc(post.cover_image)}" alt="${esc(post.title)}" loading="lazy">`
            : '<div style="height:190px;background:#dce5e1;display:grid;place-items:center;font-size:2rem;color:#146c60">✦</div>'}

          <div class="postbody">
            <span class="tag">${esc(categoryName(post.category_id))}${post.featured ? ' · FEATURED' : ''}</span>
            <h3>${esc(post.title)}</h3>
            <p>${esc(post.excerpt || '')}</p>
            <span class="postmeta">
              ${new Date(post.published_at || post.created_at).toLocaleDateString()}
              · ${Number(post.views || 0)} views
            </span>

            <div class="postactions">
              <button type="button" data-read="${esc(post.id)}">Read article</button>
              ${state.session
                ? `<button type="button" data-save="${esc(post.id)}">Bookmark</button>
                   <button type="button" data-like="${esc(post.id)}">Like</button>`
                : ''}
            </div>
          </div>
        </article>
      `).join('')
      : '<div class="message">No published articles found yet.</div>';

    $('posts').querySelectorAll('[data-read]').forEach((button) => {
      button.onclick = () => openPost(button.dataset.read);
    });

    $('posts').querySelectorAll('[data-save]').forEach((button) => {
      button.onclick = () => saveBookmark(button.dataset.save);
    });

    $('posts').querySelectorAll('[data-like]').forEach((button) => {
      button.onclick = () => likePost(button.dataset.like);
    });
  }

  async function openPost(id, suppliedPost = null) {
    const post = suppliedPost || state.posts.find((item) => item.id === id);

    if (!post) {
      alert('This article is not available.');
      return;
    }

    try {
      await state.db.rpc('increment_post_view', {
        post_id_input: id
      });
    } catch (_) {}

    const { data: comments, error } = await state.db.from('comments')
      .select('content,author_id,created_at')
      .eq('post_id', id)
      .eq('status', 'approved')
      .order('created_at');

    showModal(`
      <h2>${esc(post.title)}</h2>

      ${post.cover_image
        ? `<img style="width:100%;border-radius:12px"
           src="${esc(post.cover_image)}" alt="">`
        : ''}

      <p class="postmeta">
        ${new Date(post.published_at || post.created_at).toLocaleDateString()}
      </p>

      <div class="articlecontent" style="white-space:pre-wrap">
        ${esc(post.content)}
      </div>

      <hr>
      <h3>Comments</h3>

      <div>
        ${error
          ? `<p class="muted">${esc(error.message)}</p>`
          : (comments || []).map((comment) => `
              <p>${esc(comment.content)}
                <small class="postmeta">
                  ${new Date(comment.created_at).toLocaleDateString()}
                </small>
              </p>
            `).join('') || 'No comments yet.'}
      </div>

      ${state.session
        ? `
          <form id="commentForm">
            <textarea id="commentText" rows="3"
              placeholder="Add a comment…" required></textarea>
            <button class="btn" type="submit">Submit comment</button>
            <p class="postmeta">Comments may require moderation.</p>
            <p id="commentMessage" class="muted"></p>
          </form>
        `
        : '<p class="postmeta">Sign in to comment.</p>'}
    `);

    if ($('commentForm')) {
      $('commentForm').onsubmit = async (event) => {
        event.preventDefault();

        const content = $('commentText').value.trim();

        const { error: insertError } = await state.db.from('comments').insert({
          post_id: id,
          author_id: state.session.user.id,
          content,
          status: 'pending'
        });

        $('commentMessage').textContent = insertError
          ? insertError.message
          : 'Comment submitted for review.';

        if (!insertError) $('commentForm').reset();
      };
    }
      }
    async function saveBookmark(postId) {
    const { error } = await state.db.from('bookmarks').insert({
      post_id: postId,
      user_id: state.session.user.id
    });

    alert(error ? error.message : 'Article bookmarked.');
  }

  async function likePost(postId) {
    const { error } = await state.db.from('likes').insert({
      post_id: postId,
      user_id: state.session.user.id
    });

    alert(error ? error.message : 'Article liked.');
  }

  async function moderatePost(postId, status) {
    const { data, error } = await state.db.rpc('admin_moderate_post', {
      p_post_id: postId,
      p_status: status
    });

    if (error) {
      alert(`Moderation failed: ${error.message}`);
      return;
    }

    alert(data || 'Article status updated.');
    await loadPosts();
    await renderDashboard();
  }

  async function deletePost(postId) {
    if (!confirm('Are you sure you want to permanently delete this article?')) {
      return;
    }

    const { data, error } = await state.db.rpc('admin_delete_post', {
      p_post_id: postId
    });

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    alert(data || 'Article deleted.');
    await loadPosts();
    await renderDashboard();
  }

  async function renderDashboard() {
    const host = $('dashboardContent');

    if (!state.session?.user) {
      host.textContent = 'Sign in to view your dashboard.';
      return;
    }

    const role = state.profile?.role || 'user';

    host.innerHTML = `
      <p>
        Signed in as <b>${esc(state.session.user.email)}</b>
        · Role: <b>${esc(role)}</b>
      </p>

      ${isAdmin() ? `
        <img class="rkb-admin-logo"
          src="${esc(settingText(state.settings.logo_admin) || 'rk-blogspheere-logo.png')}"
          alt="RK BlogSphere Admin"
          style="display:block;max-width:220px;max-height:90px;object-fit:contain;margin:12px auto">
      ` : ''}

      <h3>Your articles</h3>
      <div id="myPosts" class="adminlist">Loading…</div>

      ${isAdmin() ? `
        <hr>
        <h3>Moderation queue</h3>
        <div id="moderation" class="adminlist">Loading…</div>

        <hr>
        <h3>Manage categories</h3>
        <form id="catForm" class="inlineform">
          <input id="catName" placeholder="New category" required>
          <button class="btn" type="submit">Add</button>
        </form>
        <p id="catMsg" class="muted"></p>

        <hr>
        <h3>Manage users</h3>
        <div id="usersList" class="adminlist">Loading…</div>

        <hr>
        <h3>Website branding settings</h3>
        <form id="brandingForm" class="adminlist">
          <label>Website name</label>
          <input id="settingSiteName" maxlength="100"
            placeholder="RK BlogSphere">

          <label>Website tagline</label>
          <input id="settingTagline" maxlength="180"
            placeholder="STORIES · IDEAS · KNOWLEDGE">

          <label>Home page heading</label>
          <input id="settingHeroTitle" maxlength="180"
            placeholder="Ideas worth sharing.">

          <label>Home page description</label>
          <textarea id="settingHeroDescription" rows="3"
            maxlength="500" placeholder="Describe your website"></textarea>

          <button class="btn" type="submit">Save website text</button>
          <p id="brandingMsg" class="muted"></p>
        </form>

        <div id="logoSettings" class="adminlist"></div>
      ` : `
        <p class="muted">
          Your account can read articles. An administrator
          can grant author or admin permissions.
        </p>
      `}
    `;

    await loadMyPosts();

    if (isAdmin()) {
      await loadAdminSections();
    }
  }

  async function loadMyPosts() {
    const host = $('myPosts');
    if (!host) return;

    const { data, error } = await withTimeout(
      state.db.from('posts')
        .select('id,title,status,created_at,content,excerpt,cover_image,published_at')
        .eq('author_id', state.session.user.id)
        .order('created_at', { ascending: false }),
      'Loading your articles'
    );

    if (error) {
      host.textContent = error.message;
      return;
    }

    host.innerHTML = (data || []).length
      ? data.map((post) => `
        <div class="adminrow">
          <div>
            <b>${esc(post.title)}</b>
            <div class="postmeta">
              ${esc(post.status)} ·
              ${new Date(post.created_at).toLocaleDateString()}
            </div>
          </div>
          <button type="button" class="smallbtn"
            data-own="${esc(post.id)}">View</button>
        </div>
      `).join('')
      : 'No articles yet.';

    host.querySelectorAll('[data-own]').forEach((button) => {
      button.onclick = () => {
        const post = (data || []).find(
          (item) => item.id === button.dataset.own
        );

        if (post) openPost(post.id, post);
      };
    });
  }

  async function loadAdminSections() {
    await Promise.all([
      loadModerationQueue(),
      loadUsers(),
      renderBrandingSettings()
    ]);

    const form = $('catForm');

    if (form) {
      form.onsubmit = async (event) => {
        event.preventDefault();

        const name = $('catName').value.trim();

        const slug = name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') ||
          `category-${Date.now()}`;

        const { error } = await state.db.from('categories')
          .insert({ name, slug });

        $('catMsg').textContent = error
          ? error.message
          : 'Category added successfully.';

        if (!error) {
          form.reset();
          await loadCategories();
        }
      };
    }
  }

  async function loadModerationQueue() {
    const host = $('moderation');

    const { data, error } = await withTimeout(
      state.db.from('posts')
        .select('id,title,status,author_id,created_at')
        .neq('status', 'published')
        .order('created_at', { ascending: false }),
      'Loading moderation queue'
    );

    if (error) {
      host.textContent = error.message;
      return;
    }

    host.innerHTML = (data || []).length
      ? data.map((post) => `
        <div class="adminrow">
          <div>
            <b>${esc(post.title)}</b>
            <div class="postmeta">
              ${esc(post.status)} · ${esc(post.author_id)}
            </div>
          </div>

          <div class="inlineform">
            <button class="smallbtn" type="button"
              data-publish="${esc(post.id)}">Publish</button>

            <button class="smallbtn" type="button"
              data-reject="${esc(post.id)}">Reject</button>

            <button class="smallbtn" type="button"
              data-delete="${esc(post.id)}">Delete</button>
          </div>
        </div>
      `).join('')
      : 'No pending or unpublished articles.';

    host.querySelectorAll('[data-publish]').forEach((button) => {
      button.onclick = () =>
        moderatePost(button.dataset.publish, 'published');
    });

    host.querySelectorAll('[data-reject]').forEach((button) => {
      button.onclick = () =>
        moderatePost(button.dataset.reject, 'rejected');
    });

    host.querySelectorAll('[data-delete]').forEach((button) => {
      button.onclick = () =>
        deletePost(button.dataset.delete);
    });
  }

  async function loadUsers() {
    const host = $('usersList');

    const { data, error } = await withTimeout(
      state.db.from('profiles')
        .select('id,username,full_name,role'),
      'Loading user accounts'
    );

    if (error) {
      host.textContent = error.message;
      return;
    }

    const allowedRoles = state.profile?.role === 'super_admin'
      ? ['user', 'author', 'editor', 'admin', 'super_admin']
      : state.profile?.role === 'admin'
        ? ['user', 'author', 'editor', 'admin']
        : ['user', 'author'];

    host.innerHTML = (data || []).length
      ? data.map((user) => `
        <div class="adminrow">
          <div>
            <b>${esc(user.username || user.full_name || user.id)}</b>
            <div class="postmeta">${esc(user.role || 'user')}</div>
          </div>

          <select data-role-user="${esc(user.id)}"
            aria-label="Change user role">
            ${allowedRoles.map((role) => `
              <option value="${role}"
                ${role === user.role ? 'selected' : ''}>
                ${role}
              </option>
            `).join('')}
          </select>
        </div>
      `).join('')
      : 'No user profiles found.';

    host.querySelectorAll('[data-role-user]').forEach((select) => {
      select.onchange = async () => {
        const { error: roleError } = await state.db.rpc(
          'admin_set_user_role',
          {
            p_user_id: select.dataset.roleUser,
            p_role: select.value
          }
        );

        if (roleError) {
          alert(`Role update failed: ${roleError.message}`);
          await loadUsers();
        } else {
          alert('User role updated.');
          await loadUsers();
        }
      };
    });
  }

  function renderBrandingSettings() {
    const fields = {
      settingSiteName: 'site_name',
      settingTagline: 'site_tagline',
      settingHeroTitle: 'hero_title',
      settingHeroDescription: 'hero_description'
    };

    Object.entries(fields).forEach(([id, key]) => {
      const input = $(id);
      if (input) {
        input.value = settingText(state.settings[key]);
      }
    });

    const logoLabels = [
      ['logo_header', 'Header logo'],
      ['logo_home', 'Home page logo'],
      ['logo_login', 'Login logo'],
      ['logo_admin', 'Admin dashboard logo'],
      ['logo_footer', 'Footer logo']
    ];

    $('logoSettings').innerHTML = logoLabels.map(([key, label]) => `
      <label>
        <b>${label}</b>
        <input type="file" accept="image/png,image/jpeg,image/webp"
          data-logo-upload="${key}">
      </label>

      ${settingText(state.settings[key])
        ? `<img src="${esc(settingText(state.settings[key]))}"
          alt="${label}"
          style="max-width:180px;max-height:70px;object-fit:contain">`
        : ''}
    `).join('');

    $('brandingForm').onsubmit = async (event) => {
      event.preventDefault();

      const message = $('brandingMsg');
      message.textContent = 'Saving…';

      try {
        for (const [id, key] of Object.entries(fields)) {
          await saveSetting(key, $(id).value.trim());
        }

        message.textContent = 'Website text settings saved.';
      } catch (error) {
        message.textContent =
          error.message || 'Could not save settings.';
      }
    };

    $('logoSettings')
      .querySelectorAll('[data-logo-upload]')
      .forEach((input) => {
        input.onchange = () => uploadLogo(
          input.dataset.logoUpload,
          input.files?.[0]
        );
      });
  }
    // -------------------------------
  // LOGO UPLOAD
  // -------------------------------

  async function uploadLogo(key, file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Logo must be 5 MB or smaller.');
      return;
    }

    const extension = (
      file.name.split('.').pop() || 'png'
    ).toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';

    const path = `site-logos/${key}-${Date.now()}.${extension}`;

    const { error: uploadError } = await state.db.storage
      .from('blog-images')
      .upload(path, file, {
        upsert: false,
        contentType: file.type
      });

    if (uploadError) {
      alert(
        `Logo upload failed: ${uploadError.message}. ` +
        'Check the blog-images bucket and its upload policy.'
      );
      return;
    }

    const { data } = state.db.storage
      .from('blog-images')
      .getPublicUrl(path);

    try {
      await saveSetting(key, data.publicUrl);

      alert('Logo uploaded and saved.');

      await loadSettings();
      await renderDashboard();
    } catch (error) {
      alert(
        `Logo uploaded, but setting could not be saved: ${error.message}`
      );
    }
  }

  // -------------------------------
  // CREATE NEW ARTICLE
  // -------------------------------

  async function submitPost(event) {
    event.preventDefault();

    if (!isWriter() || !state.session?.user) {
      $('postMessage').textContent =
        'Author permission is required.';
      return;
    }

    const title = $('postTitle').value.trim();
    const content = $('postContent').value.trim();

    if (!title || !content) {
      $('postMessage').textContent =
        'Enter an article title and content.';
      return;
    }

    $('postMessage').textContent = 'Submitting article…';

    let coverImage = null;
    const file = $('coverFile').files?.[0];

    if (file) {
      if (
        !file.type.startsWith('image/') ||
        file.size > 5 * 1024 * 1024
      ) {
        $('postMessage').textContent =
          'Choose an image smaller than 5 MB.';
        return;
      }

      const safeName = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );

      const path =
        `${state.session.user.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await state.db.storage
        .from('blog-images')
        .upload(path, file, {
          upsert: false
        });

      if (uploadError) {
        $('postMessage').textContent = uploadError.message;
        return;
      }

      coverImage = state.db.storage
        .from('blog-images')
        .getPublicUrl(path).data.publicUrl;
    }

    const baseSlug = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'article';

    const { error } = await state.db.from('posts').insert({
      author_id: state.session.user.id,
      title,
      slug: `${baseSlug}-${Date.now().toString().slice(-6)}`,
      excerpt: $('postExcerpt').value.trim(),
      content,
      cover_image: coverImage,
      category_id: $('postCategory').value || null,
      status: 'pending'
    });

    $('postMessage').textContent = error
      ? error.message
      : 'Article submitted and is waiting for admin approval.';

    if (!error) {
      $('postForm').reset();
      await renderDashboard();
    }
  }

  // -------------------------------
  // PAGE CONTROLS
  // -------------------------------

  function wirePageControls() {
    $('closeModal').onclick = closeModal;

    $('modal').addEventListener('click', (event) => {
      if (event.target === $('modal')) {
        closeModal();
      }
    });

    $('postForm').onsubmit = submitPost;

    $('search').oninput = renderPostList;
    $('categoryFilter').onchange = renderPostList;

    $('refreshBtn').onclick = async () => {
      setStatus('Refreshing website…');

      try {
        await loadCategories();
        await loadPosts();
      } catch (error) {
        setStatus(error.message, true);
      }
    };
  }

  // -------------------------------
  // START WEBSITE
  // -------------------------------

  async function start() {
    $('year').textContent = new Date().getFullYear();

    const missing =
      !cfg.SUPABASE_URL ||
      !cfg.SUPABASE_ANON_KEY ||
      String(cfg.SUPABASE_URL).includes('PASTE_') ||
      String(cfg.SUPABASE_ANON_KEY).includes('PASTE_');

    if (missing) {
      setStatus('Supabase setup is missing.', true);

      $('posts').innerHTML = `
        <div class="message">
          Add your Supabase Project URL and anon/public key in config.js.
        </div>
      `;

      $('authArea').innerHTML = '';
      return;
    }

    if (!window.supabase?.createClient) {
      setStatus(
        'Supabase library did not load. Check your internet connection.',
        true
      );

      $('posts').innerHTML = `
        <div class="message">
          The Supabase client library could not load.
          Refresh the page and try again.
        </div>
      `;

      return;
    }

    state.db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    // Share the initialized Supabase client with optional frontend modules.
    window.rkBlogSphereDB = state.db;

    wirePageControls();
    renderAuth();

    setStatus('Connecting to Supabase…');

    try {
      const { data, error } = await withTimeout(
        state.db.auth.getSession(),
        'Connecting to Supabase'
      );

      if (error) throw error;

      state.session = data.session;

      await Promise.allSettled([
        loadSettings(),
        loadCategories()
      ]);

      await loadProfile();
      await loadPosts();

    } catch (error) {
      console.error('Website startup error:', error);

      setStatus(
        `Startup error: ${error.message || 'Could not connect to Supabase.'}`,
        true
      );

      $('posts').innerHTML = `
        <div class="message">
          ${esc(error.message || 'Unable to connect to Supabase.')}
        </div>
      `;
    }

    state.db.auth.onAuthStateChange((_event, session) => {
      state.session = session;

      window.setTimeout(async () => {
        try {
          await loadProfile();
          await loadPosts();
        } catch (error) {
          console.error('Login state update failed:', error);

          setStatus(
            error.message || 'Could not update login state.',
            true
          );
        }
      }, 0);
    });
  }

  // -------------------------------
  // CHECK HTML AND INITIALIZE
  // -------------------------------

  document.addEventListener('DOMContentLoaded', () => {
    const missingElements = requiredIds.filter(
      (id) => !$(id)
    );

    if (missingElements.length) {
      console.error(
        'RK BlogSphere: missing HTML elements:',
        missingElements
      );

      return;
    }

    start();
  });

})();
  
  
