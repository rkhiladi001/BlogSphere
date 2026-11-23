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

  const page = location.pathname.split('/').pop() || 'index.html';
  const requiredIds = page === 'index.html'
    ? ['year', 'feedStatus', 'posts', 'authArea', 'modal', 'modalContent', 'closeModal', 'categoryFilter', 'search', 'refreshBtn']
    : page === 'write.html'
    ? ['authArea', 'modal', 'modalContent', 'closeModal', 'writePrompt', 'postForm', 'postTitle', 'postExcerpt', 'postCategory', 'postContent', 'coverFile', 'postMessage']
    : page === 'dashboard.html'
    ? ['authArea', 'modal', 'modalContent', 'closeModal', 'dashboardContent']
    : ['authArea'];

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function withTimeout(promise, label, milliseconds = 15000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds / 1000} seconds. Check your internet connection and Supabase settings.`)), milliseconds);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => window.clearTimeout(timer));
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
    return !!state.profile && ['author', 'editor', 'admin', 'super_admin'].includes(state.profile.role);
  }

  function isAdmin() {
    return !!state.profile && ['editor', 'admin', 'super_admin'].includes(state.profile.role);
  }

  function settingText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'string' ? parsed : String(value);
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
    if (tagline) {
      const brandText = document.querySelector('.rkb-brand-text');
      if (brandText) brandText.textContent = siteName;
      const footer = document.querySelector('footer p');
      if (footer) footer.textContent = `© ${new Date().getFullYear()} ${siteName} · Made for readers and writers`;
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
      const { data, error } = await withTimeout(state.db.from('site_settings').select('key,value'), 'Loading website settings');
      if (error) {
        console.warn('Website settings could not be loaded:', error.message);
        return;
      }
      state.settings = {};
      (data || []).forEach((row) => { state.settings[row.key] = row.value; });
      applySettings();
    } catch (error) {
      console.warn('Website settings error:', error);
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
      const label = state.profile?.username || state.profile?.full_name || state.session.user.email || 'Account';
      area.innerHTML = `<span class="postmeta">${esc(label)}${state.profile?.role ? ` · ${esc(state.profile.role)}` : ''}</span> <button class="smallbtn" id="logoutBtn" type="button">Logout</button>`;
      $('logoutBtn').onclick = async () => {
        const { error } = await state.db.auth.signOut();
        if (error) alert(error.message);
      };
      return;
    }

    area.innerHTML = '<button class="btn" id="loginBtn" type="button">Login / Sign up</button>';
    $('loginBtn').onclick = openAuthModal;
  }

  function openAuthModal() {
    showModal(`
      <h2>Login / Sign up</h2>
      <form id="authForm" class="adminlist">
        <label>Email</label>
        <input id="authEmail" type="email" autocomplete="email" required placeholder="Enter your email">
        <label>Password</label>
        <input id="authPassword" type="password" autocomplete="current-password" minlength="6" required placeholder="At least 6 characters">
        <div class="inlineform">
          <button class="btn" type="submit">Login</button>
          <button class="btn secondary" id="signupBtn" type="button">Create account</button>
        </div>
        <p id="authMsg" class="muted" aria-live="polite"></p>
      </form>
    `);

    $('authForm').onsubmit = async (event) => {
      event.preventDefault();
      const email = $('authEmail').value.trim();
      const password = $('authPassword').value;
      $('authMsg').textContent = 'Signing in…';
      const { error } = await state.db.auth.signInWithPassword({ email, password });
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
        $('authMsg').textContent = 'Enter a valid email and a password with at least 6 characters.';
        return;
      }
      $('authMsg').textContent = 'Creating account…';
      const { error } = await state.db.auth.signUp({ email, password });
      $('authMsg').textContent = error
        ? error.message
        : 'Account request submitted. Check your email if email confirmation is enabled.';
    };
  }

  async function loadProfile() {
    state.profile = null;
    if (state.session?.user) {
      const { data, error } = await withTimeout(state.db
        .from('profiles')
        .select('*')
        .eq('id', state.session.user.id)
        .maybeSingle(), 'Loading your profile');
      if (error) console.warn('Profile load error:', error.message);
      state.profile = data || null;
    }
    renderAuth();
    renderWriteForm();
    await renderDashboard();
  }

  function renderWriteForm() {
    const allowed = isWriter();
    const prompt = $('writePrompt');
    const form = $('postForm');
    if (prompt) prompt.hidden = allowed;
    if (form) form.hidden = !allowed;
        if (!allowed || !form) return;

    const title = $('postTitle');
    const excerpt = $('postExcerpt');
    const category = $('postCategory');
    if (title) title.placeholder = 'Write your article title';
    if (excerpt) excerpt.placeholder = 'Short description of your article';
    if (category) populateCategorySelect(category);
  }

  function populateCategorySelect(select) {
    if (!select) return;
    const selected = select.value;
    select.innerHTML = '<option value="">Select category</option>' +
      state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    if (selected) select.value = selected;
  }

  async function loadCategories() {
    try {
      const { data, error } = await withTimeout(state.db
        .from('categories')
        .select('*')
        .order('name'), 'Loading categories');
      if (error) throw error;
      state.categories = data || [];
      const filter = $('categoryFilter');
      const select = $('postCategory');
      if (filter) {
        filter.innerHTML = '<option value="">All categories</option>' +
          state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      }
      if (select) populateCategorySelect(select);
    } catch (error) {
      console.warn('Category error:', error);
    }
  }

  function getCategoryName(id) {
    return state.categories.find(c => c.id === id)?.name || 'General';
  }

  function getImage(post) {
    return post.cover_image || post.image_url || '';
  }

  function renderPosts(posts) {
    const host = $('posts');
    if (!host) return;
    if (!posts.length) {
      host.innerHTML = '<div class="empty"><h3>No posts found</h3><p>Try another search or category.</p></div>';
      return;
    }

    host.innerHTML = posts.map(post => `
      <article class="postcard">
        ${getImage(post) ? `<img class="postcover" src="${esc(getImage(post))}" alt="${esc(post.title)}" loading="lazy">` : ''}
        <div class="postbody">
          <span class="categorytag">${esc(getCategoryName(post.category_id))}</span>
          <h2>${esc(post.title)}</h2>
          <p>${esc(post.excerpt || '')}</p>
          <div class="postmeta">
            ${esc(post.author_name || 'RK BlogSphere')}
            · ${new Date(post.created_at).toLocaleDateString()}
          </div>
          <div class="inlineform">
            <button class="btn smallbtn readBtn" data-id="${esc(post.id)}" type="button">Read more</button>
            <button class="smallbtn likeBtn" data-id="${esc(post.id)}" type="button">♥ ${Number(post.likes_count || 0)}</button>
          </div>
        </div>
      </article>
    `).join('');

    host.querySelectorAll('.readBtn').forEach(btn => {
      btn.onclick = () => openPost(btn.dataset.id);
    });
    host.querySelectorAll('.likeBtn').forEach(btn => {
      btn.onclick = () => likePost(btn.dataset.id);
    });
  }

  async function loadPosts() {
    const host = $('posts');
    if (!host) return;

    setStatus('Loading articles…');
    try {
      let query = state.db.from('posts').select('*').eq('status', 'published').order('created_at', { ascending: false });
      const search = $('search')?.value?.trim();
      const category = $('categoryFilter')?.value;

      if (category) query = query.eq('category_id', category);
      if (search) query = query.ilike('title', `%${search}%`);

      const { data, error } = await withTimeout(query, 'Loading articles');
      if (error) throw error;

      state.posts = data || [];
      renderPosts(state.posts);
      setStatus(`${state.posts.length} article(s) available`);
    } catch (error) {
      setStatus('Could not load articles: ' + error.message, true);
      host.innerHTML = `<div class="empty"><h3>Unable to load articles</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  async function openPost(id) {
    const post = state.posts.find(p => String(p.id) === String(id));
    if (!post) return;

    showModal(`
      <article class="articleview">
        ${getImage(post) ? `<img class="postcover" src="${esc(getImage(post))}" alt="${esc(post.title)}">` : ''}
        <span class="categorytag">${esc(getCategoryName(post.category_id))}</span>
        <h1>${esc(post.title)}</h1>
        <p class="postmeta">${esc(post.author_name || 'RK BlogSphere')} · ${new Date(post.created_at).toLocaleDateString()}</p>
        <p>${esc(post.excerpt || '')}</p>
        <div class="articlecontent">${esc(post.content || '').replace(/\n/g, '<br>')}</div>
        <div class="inlineform">
          <button class="btn" id="modalLikeBtn" type="button">♥ Like</button>
          <button class="btn secondary" id="bookmarkBtn" type="button">Bookmark</button>
        </div>
        <h3>Comments</h3>
        <div id="commentsList">Loading comments…</div>
        <form id="commentForm" class="adminlist">
          <textarea id="commentText" rows="3" placeholder="Write a comment" required></textarea>
          <button class="btn" type="submit">Submit comment</button>
          <p id="commentMessage" class="muted"></p>
        </form>
      </article>
    `);

    $('modalLikeBtn').onclick = () => likePost(id);
    $('bookmarkBtn').onclick = () => bookmarkPost(id);
    loadComments(id);

    $('commentForm').onsubmit = async (event) => {
      event.preventDefault();
      if (!state.session?.user) {
        $('commentMessage').textContent = 'Please login first.';
        return;
      }
      const content = $('commentText').value.trim();
      if (!content) return;
      const { error } = await state.db.from('comments').insert({
        post_id: id,
        user_id: state.session.user.id,
        content
      });
      $('commentMessage').textContent = error ? error.message : 'Comment submitted.';
      if (!error) {
        $('commentText').value = '';
        loadComments(id);
      }
    };
  }

  async function loadComments(id) {
    const host = $('commentsList');
    if (!host) return;
    try {
      const { data, error } = await state.db.from('comments')
        .select('*')
        .eq('post_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      host.innerHTML = (data || []).map(c => `
        <div class="comment">
          <p>${esc(c.content)}</p>
          <small>${new Date(c.created_at).toLocaleDateString()}</small>
        </div>
      `).join('') || '<p>No comments yet.</p>';
    } catch (error) {
      host.textContent = 'Comments could not be loaded.';
    }
  }

  async function likePost(id) {
    if (!state.session?.user) {
      openAuthModal();
      return;
    }
    try {
      const { error } = await state.db.from('likes').insert({
        post_id: id,
        user_id: state.session.user.id
      });
      if (error && !String(error.message).includes('duplicate')) throw error;
      alert('Liked!');
      loadPosts();
    } catch (error) {
      alert(error.message);
    }
  }

  async function bookmarkPost(id) {
    if (!state.session?.user) {
      openAuthModal();
      return;
    }
    try {
      const { error } = await state.db.from('bookmarks').insert({
        post_id: id,
        user_id: state.session.user.id
      });
      if (error && !String(error.message).includes('duplicate')) throw error;
      alert('Bookmarked!');
    } catch (error) {
      alert(error.message);
    }
  }

  async function uploadCover(file) {
    if (!file) return '';
    const extension = file.name.split('.').pop().toLowerCase();
    const fileName = `${state.session.user.id}/${Date.now()}.${extension}`;
    const { error } = await state.db.storage.from('blog-images').upload(fileName, file, { upsert: true });
    if (error) throw error;
    const { data } = state.db.storage.from('blog-images').getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function submitPost(event) {
    event.preventDefault();
    if (!isWriter()) {
      alert('Author permission is required.');
      return;
    }
    const message = $('postMessage');
    if (message) message.textContent = 'Submitting article…';

    try {
      const file = $('coverFile')?.files?.[0];
      const cover = file ? await uploadCover(file) : '';
      const payload = {
        title: $('postTitle').value.trim(),
        excerpt: $('postExcerpt').value.trim(),
        content: $('postContent').value.trim(),
        category_id: $('postCategory').value || null,
        cover_image: cover,
        author_id: state.session.user.id,
        author_name: state.profile?.username || state.profile?.full_name || state.session.user.email,
        status: isAdmin() ? 'published' : 'pending'
      };

      if (!payload.title || !payload.content) throw new Error('Title and content are required.');

      const { error } = await state.db.from('posts').insert(payload);
      if (error) throw error;

      if (message) message.textContent = isAdmin() ? 'Article published successfully!' : 'Article submitted for approval.';
      $('postForm').reset();
    } catch (error) {
      if (message) message.textContent = error.message;
    }
        }
    async function renderDashboard() {
    const host = $('dashboardContent');
    if (!host) return;

    if (!state.session?.user) {
      host.innerHTML = '<div class="empty"><h3>Please login</h3><p>Login to view your dashboard.</p></div>';
      return;
    }

    if (!state.profile) {
      host.innerHTML = '<div class="empty"><h3>Profile not available</h3></div>';
      return;
    }

    if (!isWriter()) {
      host.innerHTML = '<div class="empty"><h3>Writer access required</h3><p>Your account does not have writer permissions.</p></div>';
      return;
    }

    host.innerHTML = '<p>Loading dashboard…</p>';

    try {
      const { data, error } = await state.db.from('posts')
        .select('*')
        .eq('author_id', state.session.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const posts = data || [];
      host.innerHTML = `
        <div class="dashboardstats">
          <div class="stat"><strong>${posts.length}</strong><span>Total articles</span></div>
          <div class="stat"><strong>${posts.filter(p => p.status === 'published').length}</strong><span>Published</span></div>
          <div class="stat"><strong>${posts.filter(p => p.status === 'pending').length}</strong><span>Pending</span></div>
        </div>
        <h2>My Articles</h2>
        <div class="adminlist">
          ${posts.map(p => `
            <div class="adminitem">
              <strong>${esc(p.title)}</strong>
              <p class="postmeta">${esc(p.status || 'draft')} · ${new Date(p.created_at).toLocaleDateString()}</p>
              <button class="smallbtn deletePostBtn" data-id="${esc(p.id)}" type="button">Delete</button>
            </div>
          `).join('') || '<p>No articles created yet.</p>'}
        </div>
      `;

      host.querySelectorAll('.deletePostBtn').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Delete this article?')) return;
          const { error } = await state.db.from('posts').delete().eq('id', btn.dataset.id);
          if (error) alert(error.message);
          else renderDashboard();
        };
      });

      if (isAdmin()) await renderAdminTools(host);
    } catch (error) {
      host.innerHTML = `<div class="empty"><h3>Dashboard error</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  async function renderAdminTools(host) {
    if (!host || !isAdmin()) return;

    const section = document.createElement('section');
    section.className = 'adminlist';
    section.innerHTML = `
      <h2>Administration</h2>
      <h3>Pending Articles</h3>
      <div id="pendingPosts">Loading pending articles…</div>
      <h3>Categories</h3>
      <div id="adminCategories">Loading categories…</div>
      <form id="categoryForm" class="inlineform">
        <input id="newCategory" placeholder="New category name" required>
        <button class="btn" type="submit">Add category</button>
      </form>
      <h3>Website Branding</h3>
      <form id="brandingForm" class="adminlist">
        <label>Website name</label>
        <input id="siteNameInput" value="${esc(settingText(state.settings.site_name) || 'RK BlogSphere')}">
        <label>Tagline</label>
        <input id="taglineInput" value="${esc(settingText(state.settings.site_tagline))}">
        <label>Hero title</label>
        <input id="heroTitleInput" value="${esc(settingText(state.settings.hero_title))}">
        <label>Hero description</label>
        <textarea id="heroDescriptionInput">${esc(settingText(state.settings.hero_description))}</textarea>
        <button class="btn" type="submit">Save branding</button>
        <p id="brandingMessage"></p>
      </form>
      <h3>Logo Upload</h3>
      <form id="logoForm" class="adminlist">
        <label>Header logo</label><input type="file" id="headerLogoFile" accept="image/*">
        <label>Home logo</label><input type="file" id="homeLogoFile" accept="image/*">
        <label>Login logo</label><input type="file" id="loginLogoFile" accept="image/*">
        <label>Footer logo</label><input type="file" id="footerLogoFile" accept="image/*">
        <button class="btn" type="submit">Upload logos</button>
        <p id="logoMessage"></p>
      </form>
    `;
    host.appendChild(section);

    await loadPendingPosts();
    renderAdminCategories();

    $('categoryForm').onsubmit = async (event) => {
      event.preventDefault();
      const name = $('newCategory').value.trim();
      if (!name) return;
      const { error } = await state.db.from('categories').insert({ name });
      if (error) alert(error.message);
      else {
        $('newCategory').value = '';
        await loadCategories();
        renderAdminCategories();
      }
    };

    $('brandingForm').onsubmit = async (event) => {
      event.preventDefault();
      const msg = $('brandingMessage');
      msg.textContent = 'Saving…';
      try {
        await saveSetting('site_name', $('siteNameInput').value.trim());
        await saveSetting('site_tagline', $('taglineInput').value.trim());
        await saveSetting('hero_title', $('heroTitleInput').value.trim());
        await saveSetting('hero_description', $('heroDescriptionInput').value.trim());
        msg.textContent = 'Branding saved.';
      } catch (error) {
        msg.textContent = error.message;
      }
    };

    $('logoForm').onsubmit = async (event) => {
      event.preventDefault();
      const msg = $('logoMessage');
      msg.textContent = 'Uploading…';
      try {
        const files = [
          ['headerLogoFile', 'logo_header'],
          ['homeLogoFile', 'logo_home'],
          ['loginLogoFile', 'logo_login'],
          ['footerLogoFile', 'logo_footer']
        ];
        for (const [id, key] of files) {
          const file = $(id)?.files?.[0];
          if (file) {
            const url = await uploadCover(file);
            await saveSetting(key, url);
          }
        }
        msg.textContent = 'Logo upload complete.';
      } catch (error) {
        msg.textContent = error.message;
      }
    };
  }

  async function loadPendingPosts() {
    const host = $('pendingPosts');
    if (!host || !isAdmin()) return;
    try {
      const { data, error } = await state.db.from('posts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      host.innerHTML = (data || []).map(p => `
        <div class="adminitem">
          <strong>${esc(p.title)}</strong>
          <p>${esc(p.excerpt || '')}</p>
          <div class="inlineform">
            <button class="btn approveBtn" data-id="${esc(p.id)}" type="button">Approve</button>
            <button class="smallbtn rejectBtn" data-id="${esc(p.id)}" type="button">Reject</button>
          </div>
        </div>
      `).join('') || '<p>No pending articles.</p>';

      host.querySelectorAll('.approveBtn').forEach(btn => {
        btn.onclick = async () => {
          const { error } = await state.db.from('posts').update({ status: 'published' }).eq('id', btn.dataset.id);
          if (error) alert(error.message);
          else {
            await loadPendingPosts();
            renderDashboard();
          }
        };
      });

      host.querySelectorAll('.rejectBtn').forEach(btn => {
        btn.onclick = async () => {
          const { error } = await state.db.from('posts').update({ status: 'rejected' }).eq('id', btn.dataset.id);
          if (error) alert(error.message);
          else {
            await loadPendingPosts();
            renderDashboard();
          }
        };
      });
    } catch (error) {
      host.textContent = error.message;
    }
  }

  function renderAdminCategories() {
    const host = $('adminCategories');
    if (!host || !isAdmin()) return;

    host.innerHTML = state.categories.map(c => `
      <div class="adminitem">
        <span>${esc(c.name)}</span>
        <button class="smallbtn deleteCategoryBtn" data-id="${esc(c.id)}" type="button">Delete</button>
      </div>
    `).join('') || '<p>No categories.</p>';

    host.querySelectorAll('.deleteCategoryBtn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete category?')) return;
        const { error } = await state.db.from('categories').delete().eq('id', btn.dataset.id);
        if (error) alert(error.message);
        else {
          await loadCategories();
          renderAdminCategories();
        }
      };
    });
    }
    function wireEvents() {
    const close = $('closeModal');
    if (close) close.onclick = closeModal;

    const modal = $('modal');
    if (modal) {
      modal.onclick = (event) => {
        if (event.target === modal) closeModal();
      };
    }

    const refresh = $('refreshBtn');
    if (refresh) refresh.onclick = loadPosts;

    const search = $('search');
    if (search) search.oninput = loadPosts;

    const category = $('categoryFilter');
    if (category) category.onchange = loadPosts;

    const form = $('postForm');
    if (form) form.onsubmit = submitPost;

    const year = $('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  async function start() {
    for (const id of requiredIds) {
      if (!$(id)) {
        console.warn('Missing page element:', id);
      }
    }

    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      setStatus('Supabase configuration missing. Please check config.js.', true);
      return;
    }

    if (!window.supabase) {
      setStatus('Supabase library could not load. Check your internet connection.', true);
      return;
    }

    state.db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    wireEvents();

    try {
      const { data, error } = await state.db.auth.getSession();
      if (error) throw error;
      state.session = data.session;
    } catch (error) {
      console.error('Session error:', error);
    }

    state.db.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      setTimeout(async () => {
        await loadProfile();
        if (page === 'index.html') await loadPosts();
        if (page === 'dashboard.html') await renderDashboard();
      }, 0);
    });

    await loadSettings();
    await loadCategories();
    await loadProfile();

    if (page === 'index.html') {
      await loadPosts();
    }

    if (page === 'write.html') {
      renderWriteForm();
    }

    if (page === 'dashboard.html') {
      await renderDashboard();
    }

    renderAuth();
  }

  start().catch(error => {
    console.error('RK BlogSphere startup error:', error);
    setStatus('Website initialization error: ' + error.message, true);
  });

})();

