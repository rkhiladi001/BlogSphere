/* RK BlogSphere - Complete Frontend Application */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cfg = window.BLOGSPHERE_CONFIG || {};
  const page = location.pathname.split('/').pop() || 'index.html';

  const state = {
    db: null, session: null, profile: null,
    categories: [], posts: [], settings: {},
    userPosts: [], allUsers: [], initialized: false
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;',
      '"':'&quot;', "'":'&#39;'
    })[c]);
  }

  function isLoggedIn() { return !!state.session?.user; }
  function isSuperAdmin() { return state.profile?.role === 'super_admin'; }
  function isAdmin() { return ['admin','super_admin'].includes(state.profile?.role); }
  function isWriter() {
    return ['author','editor','admin','super_admin'].includes(state.profile?.role);
  }

  function message(id, text, error = false) {
    const el = $(id);
    if (el) {
      el.textContent = text;
      el.style.color = error ? '#dc2626' : '#16a34a';
    }
  }

  function setStatus(text) {
    const el = $('feedStatus');
    if (el) el.textContent = text || '';
  }

  function showModal(content) {
    const modal = $('modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">${content}</div>
      </div>`;

    modal.hidden = false;

    modal.querySelector('.modal-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });
  }

  function formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-IN', {
      day:'numeric', month:'short', year:'numeric'
    });
  }

  function getUserName() {
    return state.profile?.full_name ||
      state.profile?.username ||
      state.session?.user?.email || 'User';
  }

  function getAvatar(profile = state.profile) {
    if (profile?.avatar_url) return esc(profile.avatar_url);
    return 'https://ui-avatars.com/api/?name=' +
      encodeURIComponent(profile?.full_name || 'User') +
      '&background=2563eb&color=ffffff';
  }

  // SUPABASE
  function initializeSupabase() {
    try {
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY)
        throw new Error('Supabase URL or Anon Key is missing in config.js.');

      if (!window.supabase?.createClient)
        throw new Error('Supabase library could not load.');

      state.db = window.supabase.createClient(
        cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY
      );

      return true;
    } catch (error) {
      console.error('Supabase initialization failed:', error);
      state.db = null;
      return false;
    }
  }

  // AUTH DISPLAY
  function renderAuth() {
    const area = $('authArea');
    if (!area) return;

    if (!isLoggedIn()) {
      area.innerHTML = `
        <button type="button" data-action="login">Sign In</button>
        <button type="button" data-action="signup">Sign Up</button>`;
      return;
    }

    area.innerHTML = `
      <div class="auth-user">
        <img src="${getAvatar()}" alt="Profile"
          width="36" height="36"
          style="border-radius:50%;object-fit:cover">
        <span>${esc(getUserName())}</span>
        <button type="button" data-action="profile">My Profile</button>
        <button type="button" data-action="logout">Logout</button>
      </div>`;
  }

  // AUTH MODAL
  function openAuthModal(mode = 'login') {
    if (!state.db) {
      alert('Supabase connection is not ready. Please check config.js.');
      return;
    }

    const signup = mode === 'signup';

    showModal(`
      <div class="auth-modal">
        <button type="button" data-close-modal class="modal-close">×</button>
        <h2>${signup ? 'Create Account' : 'Welcome Back'}</h2>

        <form id="authForm">
          ${signup ? `
            <label>Full Name</label>
            <input type="text" id="authName"
              placeholder="Enter your full name"
              required minlength="2">
          ` : ''}

          <label>Email Address</label>
          <input type="email" id="authEmail"
            placeholder="Enter your email" required>

          <label>Password</label>
          <input type="password" id="authPassword"
            placeholder="Enter password" required minlength="6">

          <p id="authMessage"></p>
          <button type="submit" id="authSubmit">
            ${signup ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p>
          ${signup ? 'Already have an account?' : 'New user?'}
          <button type="button" data-action="${signup ? 'login' : 'signup'}">
            ${signup ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>`);

    $('authForm')?.addEventListener('submit', async event => {
      event.preventDefault();

      const button = $('authSubmit');
      const email = $('authEmail')?.value.trim();
      const password = $('authPassword')?.value;
      const fullName = $('authName')?.value.trim();

      if (signup && !fullName) {
        message('authMessage', 'Please enter your full name.', true);
        return;
      }

      button.disabled = true;
      button.textContent = 'Please wait...';

      try {
        let result;

        if (signup) {
          result = await state.db.auth.signUp({
            email, password,
            options: { data: { full_name: fullName } }
          });
        } else {
          result = await state.db.auth.signInWithPassword({
            email, password
          });
        }

        if (result.error) throw result.error;

        if (signup && !result.data.session) {
          closeModal();
          alert('Account created. Please verify your email, then sign in.');
          return;
        }

        closeModal();
        await handleAuthState(result.data.session);

      } catch (error) {
        message('authMessage', error.message, true);
      } finally {
        if ($('authSubmit')) {
          $('authSubmit').disabled = false;
          $('authSubmit').textContent =
            signup ? 'Create Account' : 'Sign In';
        }
      }
    });
  }

  // LOGOUT
  async function logout() {
    if (!state.db) return;

    const { error } = await state.db.auth.signOut();
    if (error) {
      alert(error.message);
      return;
    }

    state.session = null;
    state.profile = null;
    renderAuth();
    setupPageAccess();
    location.reload();
  }

  // LOAD PROFILE
  async function loadProfile() {
    if (!state.session?.user || !state.db) return;

    try {
      const { data, error } = await state.db
        .from('profiles')
        .select('*')
        .eq('id', state.session.user.id)
        .maybeSingle();

      if (error) throw error;
      state.profile = data;

      if (!data) {
        const fullName =
          state.session.user.user_metadata?.full_name || 'User';

        const base = fullName.toLowerCase()
          .replace(/[^a-z0-9]+/g, '').slice(0,20) || 'user';

        let username = base;
        let counter = 1;

        // Try unique username; server trigger may also handle this.
        while (true) {
          const { data: found, error: checkError } = await state.db
            .from('profiles')
            .select('username')
            .eq('username', username)
            .limit(1);

          if (checkError) throw checkError;
          if (!found?.length) break;

          username = base + counter++;
        }

        const { data: created, error: insertError } = await state.db
          .from('profiles')
          .insert({
            id: state.session.user.id,
            full_name: fullName,
            username,
            role: 'user'
          })
          .select()
          .single();

        if (insertError) throw insertError;
        state.profile = created;
      }
    } catch (error) {
      console.error('Profile load error:', error);
    }
  }

  // PROFILE MODAL
  function openProfile() {
    if (!isLoggedIn() || !state.profile) {
      alert('Please sign in first.');
      return;
    }

    showModal(`
      <div class="profile-modal">
        <button type="button" data-close-modal class="modal-close">×</button>
        <h2>My Profile</h2>

        <div class="profile-avatar">
          <img src="${getAvatar()}" alt="Profile Photo"
            width="100" height="100"
            style="border-radius:50%;object-fit:cover">
        </div>

        <label>Profile Photo</label>
        <input type="file" id="profilePhoto" accept="image/*">

        <form id="profileForm">
          <label>Full Name</label>
          <input type="text" id="profileName"
            value="${esc(state.profile.full_name || '')}" required>

          <label>Username</label>
          <input type="text"
            value="${esc(state.profile.username || '')}" disabled>

          <label>Email</label>
          <input type="email"
            value="${esc(state.session.user.email || '')}" disabled>

          <label>Mobile Number (Optional)</label>
          <input type="tel" id="profilePhone"
            value="${esc(state.profile.phone || '')}"
            placeholder="Enter mobile number">

          <label>Bio</label>
          <textarea id="profileBio" rows="4"
            placeholder="Tell us about yourself">${esc(state.profile.bio || '')}</textarea>

          <p id="profileMessage"></p>
          <button type="submit" id="saveProfileButton">Save Profile</button>
        </form>
      </div>`);

    $('profileForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      await saveProfile();
    });

    $('profilePhoto')?.addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (file) await uploadProfilePhoto(file);
    });
  }

  // PROFILE PHOTO UPLOAD
  async function uploadProfilePhoto(file) {
    if (!state.db || !isLoggedIn()) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5 MB.');
      return;
    }

    try {
      const extension = file.name.split('.').pop().toLowerCase();
      const path = `${state.session.user.id}/profile-${Date.now()}.${extension}`;

      const { error: uploadError } = await state.db.storage
        .from('blog-images')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = state.db.storage
        .from('blog-images').getPublicUrl(path);

      const { data: updatedProfile, error } = await state.db
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', state.session.user.id)
        .select().single();

      if (error) throw error;

      state.profile = updatedProfile;
      alert('Profile photo uploaded successfully.');
      openProfile();
      renderAuth();

    } catch (error) {
      alert('Photo upload failed: ' + error.message);
    }
  }

  // SAVE PROFILE
  async function saveProfile() {
    if (!state.db || !isLoggedIn()) return;

    const button = $('saveProfileButton');
    const fullName = $('profileName')?.value.trim();
    const phone = $('profilePhone')?.value.trim() || null;
    const bio = $('profileBio')?.value.trim() || null;

    if (!fullName) {
      message('profileMessage', 'Full Name is required.', true);
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }

    try {
      const { data, error } = await state.db
        .from('profiles')
        .update({ full_name: fullName, phone, bio })
        .eq('id', state.session.user.id)
        .select().single();

      if (error) throw error;

      state.profile = data;
      message('profileMessage', 'Profile saved successfully.');
      renderAuth();

    } catch (error) {
      message('profileMessage', error.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Save Profile';
      }
    }
  }

  // WEBSITE SETTINGS
  async function loadSettings() {
    if (!state.db) return;

    try {
      const { data, error } = await state.db
        .from('site_settings')
        .select('key,value');

      if (error) throw error;

      state.settings = {};
      (data || []).forEach(item => {
        state.settings[item.key] = item.value;
      });

      applySettings();
    } catch (error) {
      console.warn('Settings loading error:', error);
    }
  }

  // GLOBAL LOGO DISPLAY
  function applySiteLogoEverywhere() {
    const logoUrl = String(state.settings.logo_url || '').trim();
    if (!logoUrl) return;

    document.querySelectorAll(
      '#siteLogo, [data-site-logo], .site-logo, ' +
      '.rkb-header-logo, .rkb-auth-logo, .rkb-footer-logo, ' +
      '.rkb-admin-logo'
    ).forEach(img => {
      img.src = logoUrl;
      img.hidden = false;
    });

    // Header logo: add only if no logo image exists
    const header = document.querySelector('header');

    if (header && !header.querySelector(
      '#siteLogo, [data-site-logo], .site-logo, ' +
      '.rkb-header-logo, [data-rkb-header-logo]'
    )) {
      const img = document.createElement('img');
      img.src = logoUrl;
      img.alt = 'RK BlogSphere';
      img.dataset.rkbHeaderLogo = 'true';
      img.className = 'rkb-global-header-logo';

      const brand = header.querySelector('#siteName, .site-name');

      if (brand?.parentNode) brand.parentNode.insertBefore(img, brand);
      else header.prepend(img);
    }

    // Footer logo
    const footer = document.querySelector('footer');

    if (footer && !footer.querySelector(
      '[data-rkb-footer-logo], .rkb-footer-logo'
    )) {
      const img = document.createElement('img');
      img.src = logoUrl;
      img.alt = 'RK BlogSphere';
      img.dataset.rkbFooterLogo = 'true';
      img.className = 'rkb-global-footer-logo';
      footer.prepend(img);
    }

    // Browser favicon
    let favicon = document.querySelector('link[rel="icon"]');

    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }

    favicon.href = logoUrl;
  }

  // APPLY SETTINGS
  function applySettings() {
    const settings = state.settings;

    if (settings.site_title) document.title = settings.site_title;

    const brand = $('siteName');
    if (brand && settings.site_title)
      brand.textContent = settings.site_title;

    const footer = $('footerText');
    if (footer && settings.footer_text)
      footer.textContent = settings.footer_text;

    const heroTitle = $('heroTitle');
    if (heroTitle && settings.hero_title)
      heroTitle.textContent = settings.hero_title;

    const heroDescription = $('heroDescription');
    if (heroDescription && settings.hero_description)
      heroDescription.textContent = settings.hero_description;

    const logo = $('siteLogo');

    if (logo && settings.logo_url) {
      logo.src = settings.logo_url;
      logo.hidden = false;
    }

    applySiteLogoEverywhere();
  }

  // LOAD CATEGORIES
  async function loadCategories() {
    if (!state.db) return;

    try {
      const { data, error } = await state.db
        .from('categories')
        .select('*')
        .order('name', { ascending:true });

      if (error) throw error;

      state.categories = data || [];

      const filter = $('categoryFilter');
      const postCategory = $('postCategory');

      if (filter) {
        filter.innerHTML = `
          <option value="">All Categories</option>
          ${state.categories.map(c => `
            <option value="${esc(c.id)}">${esc(c.name)}</option>
          `).join('')}`;
      }

      if (postCategory) {
        postCategory.innerHTML = `
          <option value="">Select Category</option>
          ${state.categories.map(c => `
            <option value="${esc(c.id)}">${esc(c.name)}</option>
          `).join('')}`;
      }
    } catch (error) {
      console.error('Categories loading error:', error);
    }
  }

  function categoryName(id) {
    return state.categories.find(c => String(c.id) === String(id))?.name
      || 'Uncategorized';
  }

  // LOAD POSTS
  async function loadPosts() {
    if (!state.db) return;

    const host = $('posts');
    if (!host) return;

    setStatus('Loading articles...');

    try {
      let query = state.db.from('posts')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending:false });

      const search = $('searchInput')?.value.trim();
      const category = $('categoryFilter')?.value;

      if (search) query = query.ilike('title', `%${search}%`);
      if (category) query = query.eq('category_id', category);

      const { data, error } = await query;
      if (error) throw error;

      state.posts = data || [];
      renderPosts();

      setStatus(state.posts.length
        ? `${state.posts.length} articles found.`
        : 'No articles found.');

    } catch (error) {
      console.error('Posts loading error:', error);

      host.innerHTML = `
        <div class="empty">
          <h3>Unable to load articles</h3>
          <p>${esc(error.message)}</p>
        </div>`;

      setStatus('Unable to load articles.');
    }
  }

  // RENDER ARTICLE CARDS
  function renderPosts() {
    const host = $('posts');
    if (!host) return;

    if (!state.posts.length) {
      host.innerHTML = `
        <div class="empty">
          <h3>No Articles Yet</h3>
          <p>New articles will appear here.</p>
        </div>`;
      return;
    }

    host.innerHTML = state.posts.map(post => `
      <article class="post-card">
        ${(post.cover_image || post.image_url) ? `
          <img class="post-cover"
            src="${esc(post.cover_image || post.image_url)}"
            alt="${esc(post.title)}" loading="lazy">
        ` : ''}

        <div class="post-card-content">
          <span class="post-category">
            ${esc(categoryName(post.category_id))}
          </span>

          <h2>${esc(post.title)}</h2>
          <p>${esc(post.excerpt || '')}</p>

          <div class="post-meta">
            <span>${esc(post.author_name || 'Author')}</span>
            <span>${formatDate(post.created_at)}</span>
          </div>

          <div class="post-card-actions">
            <button type="button" data-post-id="${esc(post.id)}">
              Read More
            </button>
            <button type="button" data-like-post="${esc(post.id)}">
              Like
            </button>
            <button type="button" data-bookmark-post="${esc(post.id)}">
              Bookmark
            </button>
          </div>
        </div>
      </article>`).join('');
  }

  // OPEN ARTICLE
  async function openPost(postId) {
    if (!state.db) return;

    try {
      const { data: post, error } = await state.db
        .from('posts').select('*').eq('id', postId).single();

      if (error) throw error;

      showModal(`
        <article class="single-post">
          <button type="button" data-close-modal class="modal-close">×</button>

          ${(post.cover_image || post.image_url) ? `
            <img src="${esc(post.cover_image || post.image_url)}"
              alt="${esc(post.title)}" class="single-post-cover">
          ` : ''}

          <span class="post-category">
            ${esc(categoryName(post.category_id))}
          </span>

          <h1>${esc(post.title)}</h1>

          <p class="post-meta">
            By ${esc(post.author_name || 'Author')}
            · ${formatDate(post.created_at)}
          </p>

          <div class="post-content">
            ${esc(post.content || '').replace(/\n/g, '<br>')}
          </div>

          <hr>
          <h3>Comments</h3>
          <div id="commentsArea">Loading comments...</div>

          ${isLoggedIn() ? `
            <form id="commentForm">
              <textarea id="comm
                // UPLOAD ARTICLE IMAGE
  async function uploadImage(file) {
    if (!state.db || !isLoggedIn()) return null;

    if (!file.type.startsWith('image/'))
      throw new Error('Please select an image file.');

    if (file.size > 5 * 1024 * 1024)
      throw new Error('Image size must be less than 5 MB.');

    const extension = file.name.split('.').pop().toLowerCase();
    const path = `${state.session.user.id}/post-${Date.now()}.${extension}`;

    const { error } = await state.db.storage
      .from('blog-images').upload(path, file);

    if (error) throw error;

    const { data } = state.db.storage.from('blog-images').getPublicUrl(path);
    return data.publicUrl;
  }

  // WRITE FORM
  function renderWriteForm() {
    const prompt = $('writePrompt');
    const form = $('writeForm');

    if (!isWriter()) {
      if (prompt) {
        prompt.hidden = false;
        prompt.textContent =
          'Please sign in with an Author account to write articles.';
      }
      if (form) form.hidden = true;
      return;
    }

    if (prompt) prompt.hidden = true;

    if (form) {
      form.hidden = false;

      if (!form.querySelector('#articleForm')) {
        form.innerHTML = `
          <form id="articleForm">
            <label>Article Title</label>
            <input id="postTitle" required maxlength="200"
              placeholder="Article title">

            <label>Short Description</label>
            <textarea id="postExcerpt" rows="3"
              placeholder="Short summary"></textarea>

            <label>Article Content</label>
            <textarea id="postContent" rows="10" required
              placeholder="Write your article..."></textarea>

            <label>Category</label>
            <select id="postCategory">
              <option value="">Select Category</option>
            </select>

            <label>Cover Image (Optional)</label>
            <input type="file" id="postImage" accept="image/*">

            <label>Status</label>
            <select id="postStatus">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>

            <button type="submit">Submit Article</button>
          </form>`;

        const select = $('postCategory');

        if (select) {
          select.innerHTML = `
            <option value="">Select Category</option>
            ${state.categories.map(c => `
              <option value="${esc(c.id)}">${esc(c.name)}</option>
            `).join('')}`;
        }
      }
    }
  }

  // SUBMIT / UPDATE ARTICLE
  async function submitPost() {
    if (!isWriter()) {
      alert('You do not have permission to publish posts.');
      return;
    }

    const form = $('writeForm');
    const title = $('postTitle')?.value.trim();
    const excerpt = $('postExcerpt')?.value.trim();
    const content = $('postContent')?.value.trim();
    const categoryId = $('postCategory')?.value || null;
    const status = $('postStatus')?.value || 'draft';
    const coverFile = $('postImage')?.files?.[0];

    if (!title || !content) {
      alert('Please enter post title and content.');
      return;
    }

    const articleForm = $('articleForm');
    const button = articleForm?.querySelector('[type="submit"]');

    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }

    try {
      let coverImage = null;
      if (coverFile) coverImage = await uploadImage(coverFile);

      const postData = {
        title, excerpt, content,
        category_id:categoryId,
        status,
        author_id:state.session.user.id,
        author_name:getUserName()
      };

      if (coverImage) postData.cover_image = coverImage;

      const editingId = form?.dataset.editingId;
      let result;

      if (editingId) {
        result = await state.db.from('posts')
          .update(postData)
          .eq('id', editingId)
          .eq('author_id', state.session.user.id);
      } else {
        result = await state.db.from('posts').insert(postData);
      }

      if (result.error) throw result.error;

      articleForm?.reset();
      if (form) delete form.dataset.editingId;

      alert(editingId ? 'Article updated successfully.' :
        'Article submitted successfully.');

      await loadPosts();
      await loadUserPosts();

    } catch (error) {
      alert('Article save failed: ' + error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Submit Article';
      }
    }
  }

  // LOAD MY POSTS
  async function loadUserPosts() {
    if (!isWriter() || !state.db) return;

    try {
      const { data, error } = await state.db.from('posts')
        .select('*')
        .eq('author_id', state.session.user.id)
        .order('created_at', { ascending:false });

      if (error) throw error;

      state.userPosts = data || [];
      renderUserPosts();
    } catch (error) {
      console.error('My articles loading error:', error);
    }
  }

  // RENDER MY POSTS
  function renderUserPosts() {
    const host = $('myPosts');
    if (!host) return;

    if (!state.userPosts.length) {
      host.innerHTML = `<div class="empty">
        <p>You have not written any articles yet.</p>
      </div>`;
      return;
    }

    host.innerHTML = state.userPosts.map(post => `
      <div class="my-post-item">
        <h3>${esc(post.title)}</h3>
        <p>Status: <strong>${esc(post.status)}</strong></p>
        <p>${formatDate(post.created_at)}</p>

        <button type="button" data-edit-post="${esc(post.id)}">Edit</button>
        <button type="button" data-delete-post="${esc(post.id)}">Delete</button>
      </div>`).join('');
  }

  // EDIT POST
  function editPost(postId) {
    const post = state.userPosts.find(p => String(p.id) === String(postId));

    if (!post) {
      alert('Article not found.');
      return;
    }

    if (!isWriter()) return;

    const form = $('writeForm');
    if (!form) {
      alert('Write form not found.');
      return;
    }

    if ($('postTitle')) $('postTitle').value = post.title || '';
    if ($('postExcerpt')) $('postExcerpt').value = post.excerpt || '';
    if ($('postContent')) $('postContent').value = post.content || '';
    if ($('postCategory')) $('postCategory').value = post.category_id || '';
    if ($('postStatus')) $('postStatus').value = post.status || 'draft';

    form.dataset.editingId = post.id;

    const button = $('articleForm')?.querySelector('[type="submit"]');
    if (button) button.textContent = 'Update Article';

    form.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  // DELETE POST
  async function deletePost(postId) {
    if (!isWriter()) return;
    if (!confirm('Are you sure you want to delete this article?')) return;

    try {
      const { error } = await state.db.from('posts')
        .delete()
        .eq('id', postId)
        .eq('author_id', state.session.user.id);

      if (error) throw error;

      alert('Article deleted successfully.');
      await loadUserPosts();
      await loadPosts();
    } catch (error) {
      alert('Article deletion failed: ' + error.message);
    }
  }

  // ADMIN PANEL
  function setupAdminPanel() {
    const adminArea = $('adminArea');
    const superAdminArea = $('superAdminArea');

    if (adminArea) adminArea.hidden = !isAdmin();
    if (superAdminArea) superAdminArea.hidden = !isSuperAdmin();

    if (!isAdmin()) return;

    renderAdminPanel();

    if (isSuperAdmin()) loadUsers();
  }

  // ADMIN CONTROLS
  function renderAdminPanel() {
    const host = $('adminArea');
    if (!host || !isAdmin()) return;

    host.innerHTML = `
      <div class="admin-panel">
        <h2>Administration</h2>

        <section class="dashboard-section">
          <h3>Category Management</h3>

          <form id="categoryForm">
            <input type="text" id="newCategory"
              placeholder="Enter category name" required>
            <button type="submit">Add Category</button>
          </form>

          <div id="adminCategories"></div>
        </section>

        <section class="dashboard-section">
          <h3>Website Settings</h3>

          <form id="settingsForm">
            <label>Website Title</label>
            <input type="text" id="settingTitle">

            <label>Footer Text</label>
            <input type="text" id="settingFooter">

            <label>Hero Title</label>
            <input type="text" id="settingHeroTitle">

            <label>Hero Description</label>
            <textarea id="settingHeroDescription"></textarea>

            <button type="submit">Save Settings</button>
          </form>
        </section>
      </div>`;

    renderAdminCategories();
    populateSettingsForm();
  }

  // ADMIN CATEGORIES
  function renderAdminCategories() {
    const host = $('adminCategories');
    if (!host) return;

    host.innerHTML = state.categories.map(category => `
      <div class="category-admin-item">
        <span>${esc(category.name)}</span>
        <button type="button"
          data-delete-category="${esc(category.id)}">Delete</button>
      </div>`).join('');
  }

  // ADD CATEGORY
  async function addCategory() {
    if (!isAdmin()) return;

    const input = $('newCategory');
    const name = input?.value.trim();
    if (!name) return;

    try {
      const { error } = await state.db.from('categories').insert({ name });
      if (error) throw error;

      if (input) input.value = '';
      alert('Category added successfully.');

      await loadCategories();
      renderAdminCategories();
    } catch (error) {
      alert('Category addition failed: ' + error.message);
    }
  }

  // DELETE CATEGORY
  async function deleteCategory(categoryId) {
    if (!isAdmin()) return;
    if (!confirm('Delete this category?')) return;

    try {
      const { error } = await state.db.from('categories')
        .delete().eq('id', categoryId);

      if (error) throw error;

      alert('Category deleted successfully.');
      await loadCategories();
      renderAdminCategories();
    } catch (error) {
      alert('Category deletion failed: ' + error.message);
    }
  }

  // SETTINGS FORM
  function populateSettingsForm() {
    if (!isAdmin()) return;

    if ($('settingTitle')) $('settingTitle').value = state.settings.site_title || '';
    if ($('settingFooter')) $('settingFooter').value = state.settings.footer_text || '';
    if ($('settingHeroTitle')) $('settingHeroTitle').value = state.settings.hero_title || '';
    if ($('settingHeroDescription')) {
      $('settingHeroDescription').value = state.settings.hero_description || '';
    }
  }

  // SAVE SETTINGS (LOGO RESTRICTED TO SUPER ADMIN)
  async function saveSettings() {
    if (!isAdmin()) return;

    const settings = [
      { key:'site_title', value:$('settingTitle')?.value.trim() || '' },
      { key:'footer_text', value:$('settingFooter')?.value.trim() || '' },
      { key:'hero_title', value:$('settingHeroTitle')?.value.trim() || '' },
      { key:'hero_description', value:$('settingHeroDescription')?.value.trim() || '' }
    ];

    try {
      for (const item of settings) {
        const { error } = await state.db.from('site_settings')
          .upsert(item, { onConflict:'key' });

        if (error) throw error;
      }

      alert('Website settings saved successfully.');
      await loadSettings();
    } catch (error) {
      alert('Settings save failed: ' + error.message);
    }
  }

  // SUPER ADMIN: LOAD USERS
  async function loadUsers() {
    if (!isSuperAdmin() || !state.db) return;

    const host = $('superAdminArea');
    if (!host) return;

    try {
      const { data, error } = await state.db.from('profiles')
        .select('*')
        .order('created_at', { ascending:false });

      if (error) throw error;

      state.allUsers = data || [];
      renderUsers();
    } catch (error) {
      host.innerHTML = `
        <div class="empty">
          <h3>User Management</h3>
          <p>${esc(error.message)}</p>
        </div>`;
    }
  }

  // SUPER ADMIN: RENDER USERS + LOGO MANAGER
  function renderUsers() {
    if (!isSuperAdmin()) return;

    const host = $('superAdminArea');
    if (!host) return;

    host.hidden = false;

    host.innerHTML = `
      <div class="super-admin-panel">
        <h2>Super Admin - User Management</h2>
        <p>Manage user accounts and assign roles.</p>

        <div id="usersList">
          ${state.allUsers.map(user => `
            <div class="user-admin-card">
              <h3>${esc(user.full_name || user.username || 'User')}</h3>

              <p>Username: ${esc(user.username || 'Not available')}</p>
              <p>Role: <strong>${esc(user.role || 'user')}</strong></p>
              <p>Bio: ${esc(user.bio || '')}</p>
              <p>Mobile: ${esc(user.phone || 'Not provided')}</p>

              <div class="role-control">
                <label>Change Role</label>

                <select id="role-${esc(user.id)}">
                  <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                  <option value="author" ${user.role === 'author' ? 'selected' : ''}>Author</option>
                  <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editor</option>
                  <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                  ${user.role === 'super_admin' ? `
                    <option value="super_admin" selected>Super Admin</option>
                  ` : ''}
                </select>

                <button type="button" data-change-role="${esc(user.id)}">
                  Save Role
                </button>
              </div>

              <button type="button" data-view-user="${esc(user.id)}">
                View Details
              </button>
            </div>
          `).join('')}
        </div>
      </div>

      <section id="brandingManager" class="rkb-branding-manager">
        <h2>Website Logo Management</h2>
        <p>Only Super Admin can upload or change the website logo.</p>

        <div class="rkb-logo-preview-box">
          <img id="brandingLogoPreview"
            src="${esc(state.settings.logo_url || '')}"
            alt="Website logo preview"
            ${state.settings.logo_url ? '' : 'hidden'}>

          <p id="brandingLogoPlaceholder"
            ${state.settings.logo_url ? 'hidden' : ''}>
            No logo uploaded yet.
          </p>
        </div>

        <label for="siteLogoFile">Upload / Change Logo</label>
        <input id="siteLogoFile" type="file"
          accept="image/png,image/jpeg,image/webp">

        <p class="rkb-logo-help">
          PNG, JPG or WEBP. Maximum file size 5 MB.
        </p>

        <p id="brandingLogoMessage" role="status"></p>
      </section>
    `;

    $('siteLogoFile')?.addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (file) await uploadSiteLogo(file);
    });
  }

  // UPLOAD LOGO (SUPER ADMIN ONLY)
  async function uploadSiteLogo(file) {
    if (!isSuperAdmin() || !state.db) {
      alert('Only Super Admin can change the website logo.');
      return;
    }

    const status = $('brandingLogoMessage');
    const input = $('siteLogoFile');

    if (!file) return;

    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
      message('brandingLogoMessage',
        'Please select PNG, JPG or WEBP image.', true);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      message('brandingLogoMessage',
        'Logo must be 5 MB or smaller.', true);
      return;
    }

    if (status) status.textContent = 'Uploading logo...';
    if (input) input.disabled = true;

    try {
      const extension = file.type === 'image/jpeg' ? 'jpg' :
        file.type.split('/')[1];

      const path = `site-logos/logo-${Date.now()}.${extension}`;

      const { error: uploadError } = await state.db.storage
        .from('blog-images')
        .upload(path, file, {
          upsert:false,
          contentType:file.type
        });

      if (uploadError) throw uploadError;

      const { data } = state.db.storage
        .from('blog-images').getPublicUrl(path);

      if (!data?.publicUrl) throw new Error('Unable to get logo URL.');

      // Save using existing site_settings table
      const { error: saveError } = await state.db.from('site_settings')
        .upsert({ key:'logo_url', value:data.publicUrl }, {
          onConflict:'key'
        });

      if (saveError) throw saveError;

      state.settings.logo_url = data.publicUrl;
      applySettings();

      const preview = $('brandingLogoPreview');
      if (preview) {
        preview.src = data.publicUrl;
        preview.hidden = false;
      }

      const placeholder = $('brandingLogoPlaceholder');
      if (placeholder) placeholder.hidden = true;

      message('brandingLogoMessage',
        'Logo updated successfully across logo locations.');

    } catch (error) {
      message('brandingLogoMessage',
        'Upload failed: ' + error.message, true);
    } finally {
      if (input) input.disabled = false;
    }
  }

  // CHANGE USER ROLE
  async function changeUserRole(userId) {
    if (!isSuperAdmin()) {
      alert('Only Super Admin can change user roles.');
      return;
    }

    const select = $(`role-${userId}`);
    if (!select) return;

    const newRole = select.value;

    if (!['user','author','editor','admin','super_admin'].includes(newRole)) {
      alert('Invalid role.');
      return;
    }

    if (userId === state.session.user.id && newRole !== 'super_admin') {
      alert('You cannot remove your own Super Admin role here.');
      return;
    }

    if (!confirm(`Change this user's role to ${newRole}?`)) return;

    try {
      const { error } = await state.db.from('profiles')
        .update({ role:newRole }).eq('id', userId);

      if (error) throw error;

      alert('User role updated successfully.');
      await loadUsers();
    } catch (error) {
      alert('Role update failed: ' + error.message);
    }
  }

  // SUPER ADMIN: VIEW USER
  function openUserDetails(userId) {
    if (!isSuperAdmin()) return;

    const user = state.allUsers.find(u => String(u.id) === String(userId));
    if (!user) return;

    showModal(`
      <div class="user-details-modal">
        <button type="button" class="modal-close" data-close-modal>×</button>
        <h2>User Details</h2>

        ${user.avatar_url ? `
          <img src="${esc(user.avatar_url)}" alt="User Photo"
            width="100" height="100"
            style="border-radius:50%;object-fit:cover">
        ` : ''}

        <p><strong>Name:</strong> ${esc(user.full_name || '')}</p>
        <p><strong>Username:</strong> ${esc(user.username || '')}</p>
        <p><strong>Role:</strong> ${esc(user.role || 'user')}</p>
        <p><strong>Mobile:</strong> ${esc(user.phone || 'Not provided')}</p>
        <p><strong>Bio:</strong> ${esc(user.bio || 'Not provided')}</p>
      </div>`);
      }
      // HANDLE AUTH STATE
  async function handleAuthState(session) {
    state.session = session;

    if (session?.user) {
      await loadProfile();
    } else {
      state.profile = null;
    }

    renderAuth();
    setupPageAccess();
  }

  // DASHBOARD ACCESS
  function setupPageAccess() {
    const dashboard = $('dashboardContent');
    const welcome = $('dashboardWelcome');
    const writerArea = $('writerArea');
    const adminArea = $('adminArea');
    const superAdminArea = $('superAdminArea');

    if (!dashboard) return;

    if (!isLoggedIn()) {
      if (welcome) welcome.hidden = false;
      if (writerArea) writerArea.hidden = true;
      if (adminArea) adminArea.hidden = true;
      if (superAdminArea) superAdminArea.hidden = true;
      return;
    }

    if (welcome) welcome.hidden = true;
    if (writerArea) writerArea.hidden = !isWriter();
    if (adminArea) adminArea.hidden = !isAdmin();
    if (superAdminArea) superAdminArea.hidden = !isSuperAdmin();

    if (isWriter()) {
      renderWriteForm();
      loadUserPosts();
    }

    if (isAdmin()) {
      setupAdminPanel();
    }
  }

  // DASHBOARD INITIALIZATION
  async function initializeDashboard() {
    if (!isLoggedIn()) {
      setupPageAccess();
      return;
    }

    setupPageAccess();
  }

  // EVENT HANDLERS
  function setupEvents() {
    document.addEventListener('click', async event => {
      const target = event.target.closest('button, [data-action]');
      if (!target) return;

      if (target.hasAttribute('data-close-modal')) {
        closeModal();
        return;
      }

      if (target.hasAttribute('data-post-id')) {
        await openPost(target.getAttribute('data-post-id'));
        return;
      }

      if (target.hasAttribute('data-like-post')) {
        await likePost(target.getAttribute('data-like-post'));
        return;
      }

      if (target.hasAttribute('data-bookmark-post')) {
        await bookmarkPost(target.getAttribute('data-bookmark-post'));
        return;
      }

      if (target.hasAttribute('data-edit-post')) {
        editPost(target.getAttribute('data-edit-post'));
        return;
      }

      if (target.hasAttribute('data-delete-post')) {
        await deletePost(target.getAttribute('data-delete-post'));
        return;
      }

      if (target.hasAttribute('data-delete-category')) {
        await deleteCategory(target.getAttribute('data-delete-category'));
        return;
      }

      if (target.hasAttribute('data-change-role')) {
        await changeUserRole(target.getAttribute('data-change-role'));
        return;
      }

      if (target.hasAttribute('data-view-user')) {
        openUserDetails(target.getAttribute('data-view-user'));
        return;
      }

      if (target.dataset.action === 'login') {
        openAuthModal('login');
        return;
      }

      if (target.dataset.action === 'signup') {
        openAuthModal('signup');
        return;
      }

      if (target.dataset.action === 'logout') {
        await logout();
        return;
      }

      if (target.dataset.action === 'profile') {
        openProfile();
        return;
      }

      if (target.dataset.action === 'dashboard') {
        location.href = 'dashboard.html';
        return;
      }

      if (target.dataset.action === 'close-modal') {
        closeModal();
      }
    });

    $('categoryFilter')?.addEventListener('change', loadPosts);
    $('searchInput')?.addEventListener('input', loadPosts);

    document.addEventListener('submit', async event => {
      if (event.target.id === 'articleForm') {
        event.preventDefault();
        await submitPost();
        return;
      }

      if (event.target.id === 'categoryForm') {
        event.preventDefault();
        await addCategory();
        return;
      }

      if (event.target.id === 'settingsForm') {
        event.preventDefault();
        await saveSettings();
      }
    });

    $('dashboardWelcome')?.querySelector('button')?.addEventListener(
      'click', () => openAuthModal('login')
    );
  }

  // CLOSE MODAL
  function closeModal() {
    const modal = $('modal');
    if (!modal) return;

    modal.innerHTML = '';
    modal.hidden = true;
  }

  // INITIALIZATION
  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    setupEvents();

    if (!initializeSupabase()) {
      setStatus('Configuration missing.');
      return;
    }

    try {
      const { data, error } = await state.db.auth.getSession();
      if (error) throw error;

      state.session = data.session;

      if (state.session?.user) {
        await loadProfile();
      }

      renderAuth();

      await loadSettings();
      await loadCategories();
      await loadPosts();

      setupPageAccess();

      if ($('dashboardContent')) {
        await initializeDashboard();
      }

    } catch (error) {
      console.error('Initialization error:', error);
      setStatus('Website initialization failed.');
    }

    state.db.auth.onAuthStateChange(async (event, session) => {
      state.session = session;

      if (session?.user) {
        await loadProfile();
      } else {
        state.profile = null;
      }

      renderAuth();
      setupPageAccess();

      if (state.db) {
        await loadPosts();
      }
    });

    const year = $('year');
    if (year) year.textContent = new Date().getFullYear();
  }

  // PUBLIC API
  window.BLOGSPHERE = {
    openLogin: () => openAuthModal('login'),
    openSignup: () => openAuthModal('signup'),
    openProfile,
    logout,
    closeModal,
    loadPosts,
    openPost,
    init
  };

  // START
  document.addEventListener('DOMContentLoaded', init);

  if (document.readyState !== 'loading') {
    init();
  }

})();
