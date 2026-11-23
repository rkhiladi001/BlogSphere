/* RK BlogSphere - Complete Frontend Application */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const cfg = window.BLOGSPHERE_CONFIG || {};

  const page = location.pathname.split('/').pop() || 'index.html';

  const state = {
    db: null,
    session: null,
    profile: null,
    categories: [],
    posts: [],
    settings: {},
    userPosts: [],
    allUsers: []
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

  const isLoggedIn = () => !!state.session?.user;

  const isSuperAdmin = () =>
    state.profile?.role === 'super_admin';

  const isAdmin = () =>
    ['admin', 'super_admin'].includes(state.profile?.role);

  const isWriter = () =>
    ['author', 'editor', 'admin', 'super_admin'].includes(state.profile?.role);

  function message(id, text, error = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = error ? '#dc2626' : '#15803d';
  }

  function setStatus(text, error = false) {
    message('feedStatus', text, error);
  }

  function showModal(html) {
    const modal = $('modal');
    const content = $('modalContent');

    if (!modal || !content) {
      alert('Modal element is missing from this page.');
      return;
    }

    content.innerHTML = html;
    modal.hidden = false;
  }

  function closeModal() {
    const modal = $('modal');
    if (modal) modal.hidden = true;
  }

  function formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
  }

  function getUserName() {
    return state.profile?.full_name ||
      state.session?.user?.email ||
      'User';
  }

  function getAvatar() {
    return state.profile?.avatar_url || '';
  }

  // ==========================================
  // SUPABASE INITIALIZATION
  // ==========================================

  function initializeSupabase() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('Supabase URL or Anon Key is missing in config.js.');
    }

    if (!window.supabase) {
      throw new Error('Supabase library could not load.');
    }

    state.db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  function renderAuth() {
    const area = $('authArea');
    if (!area) return;

    if (isLoggedIn()) {
      area.innerHTML = `
        <div class="inlineform">
          <span class="postmeta">${esc(getUserName())}</span>
          <button class="smallbtn" id="profileBtn" type="button">
            My Profile
          </button>
          <button class="smallbtn" id="logoutBtn" type="button">
            Logout
          </button>
        </div>
      `;

      $('profileBtn').onclick = openProfile;
      $('logoutBtn').onclick = logout;
    } else {
      area.innerHTML = `
        <button class="btn" id="loginBtn" type="button">
          Login / Sign up
        </button>
      `;

      $('loginBtn').onclick = openAuthModal;
    }
  }

  function openAuthModal() {
    showModal(`
      <h2>Welcome to RK BlogSphere</h2>

      <form id="loginForm" class="adminlist">
        <h3>Login</h3>

        <label>Email Address</label>
        <input id="loginEmail"
          type="email"
          autocomplete="email"
          required
          placeholder="Enter your email">

        <label>Password</label>
        <input id="loginPassword"
          type="password"
          autocomplete="current-password"
          required
          placeholder="Enter password">

        <button class="btn" type="submit">Login</button>
        <p id="loginMessage" aria-live="polite"></p>
      </form>

      <hr>

      <form id="signupForm" class="adminlist">
        <h3>Create Account</h3>

        <label>Full Name</label>
        <input id="signupName"
          type="text"
          maxlength="80"
          autocomplete="name"
          required
          placeholder="Enter your full name">

        <label>Email Address</label>
        <input id="signupEmail"
          type="email"
          autocomplete="email"
          required
          placeholder="Enter your email">

        <label>Password</label>
        <input id="signupPassword"
          type="password"
          autocomplete="new-password"
          minlength="6"
          required
          placeholder="Minimum 6 characters">

        <button class="btn" type="submit">
          Create Account
        </button>

        <p id="signupMessage" aria-live="polite"></p>
      </form>
    `);

    $('loginForm').onsubmit = async (event) => {
      event.preventDefault();

      const email = $('loginEmail').value.trim();
      const password = $('loginPassword').value;

      message('loginMessage', 'Logging in...');

      try {
        const { error } = await state.db.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        message('loginMessage', 'Login successful!');
        closeModal();
      } catch (error) {
        message('loginMessage', error.message, true);
      }
    };

    $('signupForm').onsubmit = async (event) => {
      event.preventDefault();

      const fullName = $('signupName').value.trim();
      const email = $('signupEmail').value.trim();
      const password = $('signupPassword').value;

      if (!fullName || !email || password.length < 6) {
        message(
          'signupMessage',
          'Enter your name, valid email and password of at least 6 characters.',
          true
        );
        return;
      }

      message('signupMessage', 'Creating your account...');

      try {
        const { data, error } = await state.db.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        });

        if (error) throw error;

        $('signupForm').reset();

        message(
          'signupMessage',
          data.session
            ? 'Account created! Your username has been generated automatically.'
            : 'Account created! Please confirm your email. Your username will be generated automatically.'
        );

      } catch (error) {
        message('signupMessage', error.message, true);
      }
    };
  }

  async function logout() {
    try {
      const { error } = await state.db.auth.signOut();
      if (error) throw error;
      closeModal();
    } catch (error) {
      alert(error.message);
    }
  }

  // ==========================================
  // USER PROFILE
  // ==========================================

  async function loadProfile() {
    state.profile = null;

    if (!isLoggedIn()) {
      renderAuth();
      return;
    }

    try {
      const { data, error } = await state.db
        .from('profiles')
        .select('*')
        .eq('id', state.session.user.id)
        .maybeSingle();

      if (error) throw error;

      state.profile = data || null;

      if (!state.profile) {
        console.warn('Profile not found. Check the Supabase signup trigger.');
      }

    } catch (error) {
      console.error('Profile loading error:', error);
    }

    renderAuth();
  }

  function openProfile() {
    if (!isLoggedIn()) {
      openAuthModal();
      return;
    }

    const profile = state.profile || {};

    showModal(`
      <h2>My Profile</h2>

      <div class="adminlist">

        <div style="text-align:center">
          ${profile.avatar_url
            ? `<img src="${esc(profile.avatar_url)}"
                alt="Profile photo"
                style="width:110px;height:110px;object-fit:cover;border-radius:50%">`
            : `<div style="width:110px;height:110px;border-radius:50%;background:#e5e7eb;display:inline-flex;align-items:center;justify-content:center;font-size:35px">👤</div>`
          }
        </div>

        <label>Upload Profile Photo</label>
        <input id="profilePhoto"
          type="file"
          accept="image/jpeg,image/png,image/webp">

        <label>Full Name</label>
        <input id="profileFullName"
          maxlength="80"
          value="${esc(profile.full_name || '')}">

        <label>Username</label>
        <input value="${esc(profile.username || '')}" disabled>

        <label>Email</label>
        <input value="${esc(state.session.user.email || '')}" disabled>

        <label>Mobile Number (Optional)</label>
        <input id="profilePhone"
          type="tel"
          maxlength="20"
          value="${esc(profile.phone || '')}"
          placeholder="Enter mobile number">

        <label>About Me / Bio</label>
        <textarea id="profileBio"
          rows="5"
          maxlength="1000"
          placeholder="Tell readers about yourself">${esc(profile.bio || '')}</textarea>

        <button class="btn" id="saveProfileBtn" type="button">
          Save Profile
        </button>

        <p id="profileMessage" aria-live="polite"></p>
      </div>
    `);

    $('saveProfileBtn').onclick = saveProfile;
  }

  async function uploadProfilePhoto(file) {
    if (!file) return state.profile?.avatar_url || '';

    if (!file.type.startsWith('image/')) {
      throw new Error('Please select an image file.');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image size must be less than 5 MB.');
    }

    const extension = file.name.split('.').pop().toLowerCase();
    const path = `${state.session.user.id}/profile-${Date.now()}.${extension}`;

    const { error } = await state.db.storage
      .from('blog-images')
      .upload(path, file, {
        upsert: true
      });

    if (error) throw error;

    const { data } = state.db.storage
      .from('blog-images')
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async function saveProfile() {
    const button = $('saveProfileBtn');
    button.disabled = true;

    message('profileMessage', 'Saving profile...');

    try {
      const fullName = $('profileFullName').value.trim();
      const phone = $('profilePhone').value.trim();
      const bio = $('profileBio').value.trim();
      const file = $('profilePhoto').files[0];

      if (!fullName) {
        throw new Error('Full Name is required.');
      }

      const avatarUrl = file
        ? await uploadProfilePhoto(file)
        : state.profile?.avatar_url || null;

      const { data, error } = await state.db
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone || null,
          bio: bio || null,
          avatar_url: avatarUrl
        })
        .eq('id', state.session.user.id)
        .select()
        .single();

      if (error) throw error;

      state.profile = data;

      message('profileMessage', 'Profile updated successfully!');
      renderAuth();

    } catch (error) {
      message('profileMessage', error.message, true);
    } finally {
      button.disabled = false;
    }
        }
    // ==========================================
  // WEBSITE SETTINGS
  // ==========================================

  async function loadSettings() {
    try {
      const { data, error } = await state.db
        .from('site_settings')
        .select('key,value');

      if (error) throw error;

      state.settings = {};

      (data || []).forEach(row => {
        state.settings[row.key] = row.value;
      });

      applySettings();
    } catch (error) {
      console.warn('Settings:', error.message);
    }
  }

  function applySettings() {
    const settings = state.settings;
    const siteName = settings.site_name || 'RK BlogSphere';

    document.title = siteName;

    const brand = document.querySelector('.rkb-brand-text');
    if (brand) brand.textContent = siteName;

    const footer = document.querySelector('footer p');
    if (footer) {
      footer.textContent =
        `© ${new Date().getFullYear()} ${siteName} · Made for readers and writers`;
    }

    const heroTitle = document.querySelector('.hero h1');
    if (heroTitle && settings.hero_title) {
      heroTitle.textContent = settings.hero_title;
    }

    const heroDescription =
      document.querySelector('.hero > div > p:not(.eyebrow)');

    if (heroDescription && settings.hero_description) {
      heroDescription.textContent = settings.hero_description;
    }

    const logos = {
      logo_header: '.rkb-header-logo',
      logo_home: '.rkb-hero-logo',
      logo_login: '.rkb-auth-logo',
      logo_footer: '.rkb-footer-logo'
    };

    Object.entries(logos).forEach(([key, selector]) => {
      const image = document.querySelector(selector);
      if (image && settings[key]) image.src = settings[key];
    });
  }

  // ==========================================
  // CATEGORIES
  // ==========================================

  async function loadCategories() {
    try {
      const { data, error } = await state.db
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;

      state.categories = data || [];

      const filter = $('categoryFilter');

      if (filter) {
        filter.innerHTML =
          '<option value="">All categories</option>' +
          state.categories.map(category =>
            `<option value="${esc(category.id)}">${esc(category.name)}</option>`
          ).join('');
      }

      const postCategory = $('postCategory');

      if (postCategory) {
        postCategory.innerHTML =
          '<option value="">Select category</option>' +
          state.categories.map(category =>
            `<option value="${esc(category.id)}">${esc(category.name)}</option>`
          ).join('');
      }

    } catch (error) {
      console.error('Categories:', error.message);
    }
  }

  function categoryName(id) {
    return state.categories.find(category =>
      String(category.id) === String(id)
    )?.name || 'General';
  }

  // ==========================================
  // PUBLIC ARTICLES
  // ==========================================

  async function loadPosts() {
    const host = $('posts');
    if (!host) return;

    setStatus('Loading articles...');

    try {
      let query = state.db
        .from('posts')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      const search = $('search')?.value?.trim();
      const category = $('categoryFilter')?.value;

      if (search) {
        query = query.ilike('title', `%${search}%`);
      }

      if (category) {
        query = query.eq('category_id', category);
      }

      const { data, error } = await query;

      if (error) throw error;

      state.posts = data || [];

      renderPosts(state.posts);

      setStatus(`${state.posts.length} articles available`);

    } catch (error) {
      setStatus(error.message, true);

      host.innerHTML = `
        <div class="empty">
          <h3>Unable to load articles</h3>
          <p>${esc(error.message)}</p>
        </div>
      `;
    }
  }

  function renderPosts(posts) {
    const host = $('posts');
    if (!host) return;

    if (!posts.length) {
      host.innerHTML = `
        <div class="empty">
          <h3>No articles found</h3>
          <p>New articles will appear here.</p>
        </div>
      `;
      return;
    }

    host.innerHTML = posts.map(post => `
      <article class="postcard">

        ${(post.cover_image || post.image_url)
          ? `<img class="postcover"
              src="${esc(post.cover_image || post.image_url)}"
              alt="${esc(post.title)}"
              loading="lazy">`
          : ''
        }

        <div class="postbody">

          <span class="categorytag">
            ${esc(categoryName(post.category_id))}
          </span>

          <h2>${esc(post.title)}</h2>

          <p>${esc(post.excerpt || '')}</p>

          <div class="postmeta">
            ${esc(post.author_name || 'RK BlogSphere')}
            · ${formatDate(post.created_at)}
          </div>

          <div class="inlineform">
            <button class="btn smallbtn readPostBtn"
              data-id="${esc(post.id)}">
              Read More
            </button>

            <button class="smallbtn likePostBtn"
              data-id="${esc(post.id)}">
              ♥ ${Number(post.likes_count || 0)}
            </button>
          </div>

        </div>
      </article>
    `).join('');

    host.querySelectorAll('.readPostBtn').forEach(button => {
      button.onclick = () => openPost(button.dataset.id);
    });

    host.querySelectorAll('.likePostBtn').forEach(button => {
      button.onclick = () => likePost(button.dataset.id);
    });
  }

  // ==========================================
  // ARTICLE DETAILS
  // ==========================================

  async function openPost(id) {
    const post = state.posts.find(item =>
      String(item.id) === String(id)
    );

    if (!post) return;

    const image = post.cover_image || post.image_url;

    showModal(`
      <article class="articleview">

        ${image
          ? `<img class="postcover"
              src="${esc(image)}"
              alt="${esc(post.title)}">`
          : ''
        }

        <span class="categorytag">
          ${esc(categoryName(post.category_id))}
        </span>

        <h1>${esc(post.title)}</h1>

        <p class="postmeta">
          ${esc(post.author_name || 'RK BlogSphere')}
          · ${formatDate(post.created_at)}
        </p>

        <p>${esc(post.excerpt || '')}</p>

        <div class="articlecontent">
          ${esc(post.content || '').replace(/\n/g, '<br>')}
        </div>

        <div class="inlineform">
          <button class="btn" id="detailLikeBtn">♥ Like</button>
          <button class="btn secondary" id="detailBookmarkBtn">
            Bookmark
          </button>
        </div>

        <h3>Comments</h3>

        <div id="commentsList">Loading comments...</div>

        <form id="commentForm" class="adminlist">
          <textarea id="commentText"
            rows="3"
            placeholder="Write your comment"
            required></textarea>

          <button class="btn" type="submit">
            Submit Comment
          </button>

          <p id="commentMessage"></p>
        </form>

      </article>
    `);

    $('detailLikeBtn').onclick = () => likePost(id);
    $('detailBookmarkBtn').onclick = () => bookmarkPost(id);

    await loadComments(id);

    $('commentForm').onsubmit = async event => {
      event.preventDefault();

      if (!isLoggedIn()) {
        openAuthModal();
        return;
      }

      const content = $('commentText').value.trim();

      if (!content) return;

      try {
        const { error } = await state.db
          .from('comments')
          .insert({
            post_id: id,
            user_id: state.session.user.id,
            content
          });

        if (error) throw error;

        $('commentText').value = '';

        message('commentMessage', 'Comment submitted successfully.');

        await loadComments(id);

      } catch (error) {
        message('commentMessage', error.message, true);
      }
    };
  }

  async function loadComments(postId) {
    const host = $('commentsList');
    if (!host) return;

    try {
      const { data, error } = await state.db
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      host.innerHTML = (data || []).map(comment => `
        <div class="comment">
          <p>${esc(comment.content)}</p>
          <small>${formatDate(comment.created_at)}</small>
        </div>
      `).join('') || '<p>No comments yet.</p>';

    } catch (error) {
      host.textContent = 'Comments could not be loaded.';
    }
  }

  // ==========================================
  // LIKES AND BOOKMARKS
  // ==========================================

  async function likePost(postId) {
    if (!isLoggedIn()) {
      openAuthModal();
      return;
    }

    try {
      const { error } = await state.db
        .from('likes')
        .insert({
          post_id: postId,
          user_id: state.session.user.id
        });

      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        throw error;
      }

      alert('Article liked successfully!');

      await loadPosts();

    } catch (error) {
      alert(error.message);
    }
  }

  async function bookmarkPost(postId) {
    if (!isLoggedIn()) {
      openAuthModal();
      return;
    }

    try {
      const { error } = await state.db
        .from('bookmarks')
        .insert({
          post_id: postId,
          user_id: state.session.user.id
        });

      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        throw error;
      }

      alert('Article bookmarked successfully!');

    } catch (error) {
      alert(error.message);
    }
  }

  // ==========================================
  // IMAGE UPLOAD
  // ==========================================

  async function uploadImage(file, folder) {
    if (!file) return '';

    if (!file.type.startsWith('image/')) {
      throw new Error('Please select a valid image.');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image size must be below 5 MB.');
    }

    const extension = file.name.split('.').pop().toLowerCase();

    const path =
      `${state.session.user.id}/${folder}-${Date.now()}.${extension}`;

    const { error } = await state.db.storage
      .from('blog-images')
      .upload(path, file, { upsert: true });

    if (error) throw error;

    const { data } = state.db.storage
      .from('blog-images')
      .getPublicUrl(path);

    return data.publicUrl;
  }

  // ==========================================
  // WRITING PERMISSION
  // ==========================================

  function renderWriteForm() {
    const prompt = $('writePrompt');
    const form = $('postForm');

    if (!form) return;

    const allowed = isWriter();

    if (prompt) prompt.hidden = allowed;

    form.hidden = !allowed;

    if (!allowed && prompt) {
      prompt.innerHTML = `
        <h3>Writer Access Required</h3>
        <p>Login with an authorized writer account to publish articles.</p>
      `;
    }
  }

  // ==========================================
  // SUBMIT ARTICLE
  // ==========================================

  async function submitPost(event) {
    event.preventDefault();

    if (!isWriter()) {
      alert('Writer permission is required.');
      return;
    }

    message('postMessage', 'Submitting article...');

    try {
      const file = $('coverFile')?.files?.[0];

      const cover = file
        ? await uploadImage(file, 'cover')
        : '';

      const payload = {
        title: $('postTitle').value.trim(),
        excerpt: $('postExcerpt').value.trim(),
        content: $('postContent').value.trim(),
        category_id: $('postCategory').value || null,
        cover_image: cover || null,
        author_id: state.session.user.id,
        author_name: getUserName(),
        status: isAdmin() ? 'published' : 'pending'
      };

      if (!payload.title || !payload.content) {
        throw new Error('Title and article content are required.');
      }

      const { error } = await state.db
        .from('posts')
        .insert(payload);

      if (error) throw error;

      message(
        'postMessage',
        isAdmin()
          ? 'Article published successfully!'
          : 'Article submitted for approval.'
      );

      $('postForm').reset();

    } catch (error) {
      message('postMessage', error.message, true);
    }
    }
    // USER DASHBOARD
  async function loadUserPosts() {
    if (!state.session) return;

    const { data, error } = await state.db
      .from('posts')
      .select('*')
      .eq('author_id', state.session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('User posts error:', error);
      return;
    }

    state.userPosts = data || [];
    renderUserPosts();
  }

  function renderUserPosts() {
    const container = $('myPosts');
    if (!container) return;

    if (!state.userPosts.length) {
      container.innerHTML = '<p>You have not published any posts yet.</p>';
      return;
    }

    container.innerHTML = state.userPosts.map(post => `
      <article class="user-post-item">
        <h3>${esc(post.title || 'Untitled')}</h3>
        <p>Status: ${esc(post.status || 'draft')}</p>
        <p>${formatDate(post.created_at)}</p>
        <button type="button" data-edit-post="${esc(post.id)}">
          Edit
        </button>
        <button type="button" data-delete-post="${esc(post.id)}">
          Delete
        </button>
      </article>
    `).join('');
  }

  async function editPost(postId) {
    const post = state.userPosts.find(item => String(item.id) === String(postId));
    if (!post) return;

    const title = $('postTitle');
    const excerpt = $('postExcerpt');
    const content = $('postContent');
    const category = $('postCategory');
    const status = $('postStatus');

    if (title) title.value = post.title || '';
    if (excerpt) excerpt.value = post.excerpt || '';
    if (content) content.value = post.content || '';
    if (category) category.value = post.category_id || '';
    if (status) status.value = post.status || 'draft';

    const form = $('writeForm');
    if (form) {
      form.dataset.editingId = post.id;
      form.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;

    const { error } = await state.db
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('author_id', state.session.user.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert('Post deleted successfully.');
    await loadUserPosts();
    await loadPosts();
  }

  // ADMIN: CATEGORY MANAGEMENT
  async function addCategory() {
    if (!isAdmin()) {
      alert('You do not have permission.');
      return;
    }

    const input = $('newCategory');
    const name = input?.value.trim();

    if (!name) {
      alert('Please enter category name.');
      return;
    }

    const { error } = await state.db
      .from('categories')
      .insert({ name });

    if (error) {
      alert(error.message);
      return;
    }

    input.value = '';
    alert('Category added.');
    await loadCategories();
  }

  async function deleteCategory(categoryId) {
    if (!isAdmin()) {
      alert('You do not have permission.');
      return;
    }

    if (!confirm('Delete this category?')) return;

    const { error } = await state.db
      .from('categories')
      .delete()
      .eq('id', categoryId);

    if (error) {
      alert(error.message);
      return;
    }

    alert('Category deleted.');
    await loadCategories();
  }

  function renderAdminCategories() {
    const container = $('adminCategories');
    if (!container || !isAdmin()) return;

    container.innerHTML = state.categories.map(category => `
      <div class="admin-category-item">
        <span>${esc(category.name)}</span>
        <button type="button" data-delete-category="${esc(category.id)}">
          Delete
        </button>
      </div>
    `).join('');
  }

  // SUPER ADMIN: USER MANAGEMENT
  async function loadAllUsers() {
    if (!isSuperAdmin()) {
      alert('Only Super Admin can access user management.');
      return;
    }

    const container = $('allUsers');
    if (container) {
      container.innerHTML = '<p>Loading users...</p>';
    }

    const { data, error } = await state.db
      .from('profiles')
      .select('id, full_name, username, phone, bio, avatar_url, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Users loading error:', error);
      if (container) {
        container.innerHTML = '<p>Unable to load users. Check Supabase permissions.</p>';
      }
      return;
    }

    state.allUsers = data || [];
    renderAllUsers();
  }

  function renderAllUsers() {
    if (!isSuperAdmin()) return;

    const container = $('allUsers');
    if (!container) return;

    if (!state.allUsers.length) {
      container.innerHTML = '<p>No users found.</p>';
      return;
    }

    container.innerHTML = state.allUsers.map(user => `
      <article class="admin-user-card">
        <img
          src="${esc(user.avatar_url || 'https://placehold.co/80x80?text=User')}"
          alt="Profile"
          width="65"
          height="65"
          style="border-radius:50%;object-fit:cover;"
        >

        <h3>${esc(user.full_name || 'Unnamed User')}</h3>
        <p>Username: @${esc(user.username || 'not-set')}</p>
        <p>Phone: ${esc(user.phone || 'Not provided')}</p>
        <p>Bio: ${esc(user.bio || 'No bio')}</p>
        <p>Role: ${esc(user.role || 'user')}</p>
        <p>Account created: ${formatDate(user.created_at)}</p>

        <label for="role-${esc(user.id)}">Change role</label>
        <select id="role-${esc(user.id)}">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
          <option value="author" ${user.role === 'author' ? 'selected' : ''}>Author</option>
          <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editor</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>

        <button type="button" data-save-role="${esc(user.id)}">
          Update Role
        </button>
      </article>
    `).join('');
  }

  async function updateUserRole(userId) {
    if (!isSuperAdmin()) {
      alert('Only Super Admin can change user roles.');
      return;
    }

    if (String(userId) === String(state.session.user.id)) {
      alert('You cannot change your own role here.');
      return;
    }

    const select = $(`role-${userId}`);
    if (!select) return;

    const newRole = select.value;

    if (!['user', 'author', 'editor', 'admin'].includes(newRole)) {
      alert('Invalid role.');
      return;
    }

    const { error } = await state.db
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    alert('User role updated.');
    await loadAllUsers();
  }

  // PAGE ACCESS
  function setupPageAccess() {
    const adminArea = $('adminArea');
    const superAdminArea = $('superAdminArea');
    const writerArea = $('writerArea');

    if (adminArea) {
      adminArea.hidden = !isAdmin();
    }

    if (superAdminArea) {
      superAdminArea.hidden = !isSuperAdmin();
    }

    if (writerArea) {
      writerArea.hidden = !isWriter();
    }

    if (isAdmin()) {
      renderAdminCategories();
    }

    if (isSuperAdmin()) {
      loadAllUsers();
    }

    if (isWriter()) {
      loadUserPosts();
    }
  }

  // EVENT HANDLERS
  function setupEvents() {
    document.addEventListener('click', async event => {
      const target = event.target.closest('button, [data-action]');
      if (!target) return;

      if (target.dataset.action === 'login') {
        openAuthModal('login');
      }

      if (target.dataset.action === 'signup') {
        openAuthModal('signup');
      }

      if (target.dataset.action === 'logout') {
        await logout();
      }

      if (target.dataset.action === 'profile') {
        openProfile();
      }

      if (target.dataset.closeModal !== undefined) {
        closeModal();
      }

      if (target.dataset.editPost) {
        editPost(target.dataset.editPost);
      }

      if (target.dataset.deletePost) {
        deletePost(target.dataset.deletePost);
      }

      if (target.dataset.deleteCategory) {
        deleteCategory(target.dataset.deleteCategory);
      }

      if (target.dataset.saveRole) {
        updateUserRole(target.dataset.saveRole);
      }

      if (target.dataset.postId) {
        openPost(target.dataset.postId);
      }

      if (target.dataset.likePost) {
        likePost(target.dataset.likePost);
      }

      if (target.dataset.bookmarkPost) {
        bookmarkPost(target.dataset.bookmarkPost);
      }
    });

    const categoryForm = $('categoryForm');
    if (categoryForm) {
      categoryForm.addEventListener('submit', event => {
        event.preventDefault();
        addCategory();
      });
    }

    const profileForm = $('profileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', event => {
        event.preventDefault();
        saveProfile();
      });
    }

    const writeForm = $('writeForm');
    if (writeForm) {
      writeForm.addEventListener('submit', event => {
        event.preventDefault();
        submitPost();
      });
    }

    const photoInput = $('profilePhoto');
    if (photoInput) {
      photoInput.addEventListener('change', async () => {
        if (photoInput.files?.[0]) {
          await uploadProfilePhoto(photoInput.files[0]);
        }
      });
    }
  }
    // UPDATE POST
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

    if (!title || !content) {
      alert('Please enter post title and content.');
      return;
    }

    const postData = {
      title,
      excerpt,
      content,
      category_id: categoryId,
      status,
      author_id: state.session.user.id,
      author_name: getUserName()
    };

    const editingId = form?.dataset.editingId;
    let result;

    if (editingId) {
      result = await state.db
        .from('posts')
        .update(postData)
        .eq('id', editingId)
        .eq('author_id', state.session.user.id);
    } else {
      result = await state.db
        .from('posts')
        .insert(postData);
    }

    if (result.error) {
      alert(result.error.message);
      return;
    }

    if (form) {
      form.reset();
      delete form.dataset.editingId;
    }

    alert(editingId ? 'Post updated successfully.' : 'Post submitted successfully.');

    await loadPosts();
    await loadUserPosts();
  }

  // AUTH STATE
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

  // INITIALIZE APPLICATION
  async function init() {
    setupEvents();

    const connected = await initializeSupabase();

    if (!connected || !state.db) {
      setStatus('Supabase connection is not configured.');
      return;
    }

    const { data, error } = await state.db.auth.getSession();

    if (error) {
      console.error('Session error:', error);
      setStatus('Unable to check login session.');
      return;
    }

    await handleAuthState(data.session);

    state.db.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;

      setTimeout(async () => {
        await handleAuthState(session);
      }, 0);
    });

    await Promise.all([
      loadSettings(),
      loadCategories(),
      loadPosts()
    ]);

    setupPageAccess();

    const year = $('year');
    if (year) {
      year.textContent = new Date().getFullYear();
    }

    setStatus('');
  }

  // GLOBAL FUNCTIONS FOR HTML BUTTONS
  window.BLOGSPHERE = {
    openLogin: () => openAuthModal('login'),
    openSignup: () => openAuthModal('signup'),
    openProfile,
    logout,
    closeModal,
    loadPosts,
    loadCategories,
    loadAllUsers,
    addCategory,
    deleteCategory,
    submitPost
  };

  // START APP
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
  
