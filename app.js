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
    allUsers: [],
    initialized: false
  };

  // SECURITY: Escape HTML output
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  // USER PERMISSIONS
  function isLoggedIn() {
    return !!state.session?.user;
  }

  function isSuperAdmin() {
    return state.profile?.role === 'super_admin';
  }

  function isAdmin() {
    return ['admin', 'super_admin'].includes(state.profile?.role);
  }

  function isWriter() {
    return ['author', 'editor', 'admin', 'super_admin']
      .includes(state.profile?.role);
  }

  // MESSAGES
  function message(id, text, error = false) {
    const element = $(id);
    if (!element) return;

    element.textContent = text;
    element.style.color = error ? '#dc2626' : '#16a34a';
  }

  function setStatus(text) {
    const element = $('feedStatus');
    if (element) element.textContent = text || '';
  }

  // MODAL
  function showModal(content) {
    const modal = $('modal');
    const modalContent = $('modalContent');
    if (!modal || !modalContent) return;

    // Keep the original modal HTML from index.html/dashboard.html/write.html.
    modalContent.innerHTML = content;
    modal.hidden = false;
    modal.style.display = 'flex';
  }

  function closeModal() {
    const modal = $('modal');
    const modalContent = $('modalContent');
    if (!modal || !modalContent) return;
    modalContent.innerHTML = '';
    modal.hidden = true;
    modal.style.display = 'none';
  }

  // DATE FORMAT
  function formatDate(date) {
    if (!date) return '';

    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  // USER NAME
  function getUserName() {
    return state.profile?.full_name ||
      state.profile?.username ||
      state.session?.user?.email ||
      'User';
  }

  // USER AVATAR
  function getAvatar(profile = state.profile) {
    if (profile?.avatar_url) {
      return esc(profile.avatar_url);
    }

    return 'https://ui-avatars.com/api/?name=' +
      encodeURIComponent(profile?.full_name || 'User') +
      '&background=2563eb&color=ffffff';
  }

  // SUPABASE INITIALIZATION
  function initializeSupabase() {
    try {
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
        throw new Error('Supabase URL or Anon Key is missing in config.js.');
      }

      if (!window.supabase?.createClient) {
        throw new Error('Supabase library could not load.');
      }

      state.db = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      );

      console.log('RK BlogSphere: Supabase connected.');

      return true;

    } catch (error) {
      console.error('Supabase initialization failed:', error);

      state.db = null;

      return false;
    }
  }

  // AUTH BUTTONS
  function renderAuth() {
    const area = $('authArea');
    if (!area) return;

    if (!isLoggedIn()) {
      area.innerHTML = `
        <button type="button" data-action="login">
          Sign In
        </button>

        <button type="button" data-action="signup">
          Sign Up
        </button>
      `;

      return;
    }

    area.innerHTML = `
      <div class="auth-user">
        <img
          src="${getAvatar()}"
          alt="Profile"
          width="36"
          height="36"
          style="border-radius:50%;object-fit:cover"
        >

        <span>${esc(getUserName())}</span>

        <button type="button" data-action="profile">
          My Profile
        </button>

        <button type="button" data-action="logout">
          Logout
        </button>
      </div>
    `;
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

        <h2>${signup ? 'Create Account' : 'Welcome Back'}</h2>

        <form id="authForm">

          ${signup ? `
            <label>Full Name</label>
            <input
              type="text"
              id="authName"
              placeholder="Enter your full name"
              required
              minlength="2"
            >
          ` : ''}

          <label>Email Address</label>
          <input
            type="email"
            id="authEmail"
            placeholder="Enter your email"
            required
          >

          <label>Password</label>
          <input
            type="password"
            id="authPassword"
            placeholder="Enter password"
            required
            minlength="6"
          >

          <p id="authMessage"></p>

          <button type="submit" id="authSubmit">
            ${signup ? 'Create Account' : 'Sign In'}
          </button>

        </form>

        <p>
          ${signup ? 'Already have an account?' : 'New user?'}
          <button type="button"
            data-action="${signup ? 'login' : 'signup'}">
            ${signup ? 'Sign In' : 'Sign Up'}
          </button>
        </p>

      </div>
    `);

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
            email,
            password,
            options: {
              data: {
                full_name: fullName
              }
            }
          });
        } else {
          result = await state.db.auth.signInWithPassword({
            email,
            password
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

    alert('Logged out successfully.');
    location.reload();
  }

  // LOAD USER PROFILE
  async function loadProfile() {
    if (!state.session?.user || !state.db) return;

    try {
      const { data, error } = await state.db
        .from('profiles')
        .select('*')
        .eq('id', state.session.user.id)
        .maybeSingle();

      if (error) throw error;

      state.profile = data || null;

      if (!state.profile) {
        console.warn('User profile not found.');
      }

    } catch (error) {
      console.error('Profile loading error:', error);
      state.profile = null;
    }

    renderAuth();
  }

  // OPEN PROFILE
  function openProfile() {
    if (!isLoggedIn() || !state.profile) {
      alert('Please sign in first.');
      return;
    }

    showModal(`
      <div class="profile-modal">

        <h2>My Profile</h2>

        <div class="profile-avatar">
          <img
            src="${getAvatar()}"
            alt="Profile Photo"
            width="100"
            height="100"
            style="border-radius:50%;object-fit:cover"
          >
        </div>

        <label>Profile Photo</label>
        <input type="file"
          id="profilePhoto"
          accept="image/*">

        <form id="profileForm">

          <label>Full Name</label>
          <input
            type="text"
            id="profileName"
            value="${esc(state.profile.full_name || '')}"
            required
          >

          <label>Username</label>
          <input
            type="text"
            value="${esc(state.profile.username || '')}"
            disabled
          >

          <label>Email</label>
          <input
            type="email"
            value="${esc(state.session.user.email || '')}"
            disabled
          >

          <label>Mobile Number (Optional)</label>
          <input
            type="tel"
            id="profilePhone"
            value="${esc(state.profile.phone || '')}"
            placeholder="Enter mobile number"
          >

          <label>Bio</label>
          <textarea
            id="profileBio"
            rows="4"
            placeholder="Tell us about yourself"
          >${esc(state.profile.bio || '')}</textarea>

          <p id="profileMessage"></p>

          <button type="submit" id="saveProfileButton">
            Save Profile
          </button>

        </form>
      </div>
    `);

    $('profileForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      await saveProfile();
    });

    $('profilePhoto')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];

      if (file) {
        await uploadProfilePhoto(file);
      }
    });
  }

  // UPLOAD PROFILE PHOTO
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

      const path =
        `${state.session.user.id}/profile-${Date.now()}.${extension}`;

      const { error: uploadError } = await state.db.storage
        .from('blog-images')
        .upload(path, file, {
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data } = state.db.storage
        .from('blog-images')
        .getPublicUrl(path);

      const { data: updatedProfile, error } = await state.db
        .from('profiles')
        .update({
          avatar_url: data.publicUrl
        })
        .eq('id', state.session.user.id)
        .select()
        .single();

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
        .update({
          full_name: fullName,
          phone,
          bio
        })
        .eq('id', state.session.user.id)
        .select()
        .single();

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

  // LOAD WEBSITE SETTINGS
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

  // APPLY WEBSITE SETTINGS
  function applySettings() {
    const settings = state.settings;

    if (settings.site_title) {
      document.title = settings.site_title;
    }

    const brand = $('siteName');

    if (brand && settings.site_title) {
      brand.textContent = settings.site_title;
    }

    const footer = $('footerText');

    if (footer && settings.footer_text) {
      footer.textContent = settings.footer_text;
    }

    const heroTitle = $('heroTitle');

    if (heroTitle && settings.hero_title) {
      heroTitle.textContent = settings.hero_title;
    }

    const heroDescription = $('heroDescription');

    if (heroDescription && settings.hero_description) {
      heroDescription.textContent = settings.hero_description;
    }

    const logo = $('siteLogo');

    if (logo && settings.logo_url) {
      logo.src = settings.logo_url;
      logo.hidden = false;
    }
  }

  // LOAD CATEGORIES
  async function loadCategories() {
    if (!state.db) return;

    try {
      const { data, error } = await state.db
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      state.categories = data || [];

      const filter = $('categoryFilter');
      const postCategory = $('postCategory');

      if (filter) {
        filter.innerHTML = `
          <option value="">All Categories</option>
          ${state.categories.map(category => `
            <option value="${esc(category.id)}">
              ${esc(category.name)}
            </option>
          `).join('')}
        `;
      }

      if (postCategory) {
        postCategory.innerHTML = `
          <option value="">Select Category</option>
          ${state.categories.map(category => `
            <option value="${esc(category.id)}">
              ${esc(category.name)}
            </option>
          `).join('')}
        `;
      }

    } catch (error) {
      console.error('Categories loading error:', error);
    }
  }

  // CATEGORY NAME
  function categoryName(id) {
    const category = state.categories.find(
      item => String(item.id) === String(id)
    );

    return category?.name || 'Uncategorized';
  }

  // LOAD POSTS
  async function loadPosts() {
    if (!state.db) return;

    const host = $('posts');
    if (!host) return;

    setStatus('Loading articles...');

    try {
      let query = state.db
        .from('posts')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      const search = $('searchInput')?.value.trim();
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

      renderPosts();

      setStatus(
        state.posts.length
          ? `${state.posts.length} articles found.`
          : 'No articles found.'
      );

    } catch (error) {
      console.error('Posts loading errors:', error);

      host.innerHTML = `
        <div class="empty">
          <h3>Unable to load articles</h3>
          <p>${esc(error.message)}</p>
        </div>
      `;

      setStatus('Unable to load articles.');
    }
  }

  // RENDER POSTS
  function renderPosts() {
    const host = $('posts');
    if (!host) return;

    if (!state.posts.length) {
      host.innerHTML = `
        <div class="empty">
          <h3>No Articles Yet</h3>
          <p>New articles will appear here.</p>
        </div>
      `;
      return;
    }

    host.innerHTML = state.posts.map(post => `
      <article class="post-card">

        ${(post.cover_image || post.image_url) ? `
          <img
            class="post-cover"
            src="${esc(post.cover_image || post.image_url)}"
            alt="${esc(post.title)}"
            loading="lazy"
          >
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

          <button
            type="button"
            data-post-id="${esc(post.id)}">
            Read More
          </button>

          <button
            type="button"
            data-like-post="${esc(post.id)}">
            Like
          </button>

          <button
            type="button"
            data-bookmark-post="${esc(post.id)}">
            Bookmark
          </button>

        </div>
      </article>
    `).join('');
  }

  // OPEN POST
  async function openPost(postId) {
    if (!state.db) return;

    try {
      const { data: post, error } = await state.db
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (error) throw error;

      showModal(`
        <article class="single-post">

          ${(post.cover_image || post.image_url) ? `
            <img
              src="${esc(post.cover_image || post.image_url)}"
              alt="${esc(post.title)}"
              class="single-post-cover"
            >
          ` : ''}

          <span>${esc(categoryName(post.category_id))}</span>

          <h1>${esc(post.title)}</h1>

          <p>
            By ${esc(post.author_name || 'Author')}
            · ${formatDate(post.created_at)}
          </p>

          <div class="post-content">
            ${esc(post.content).replace(/\n/g, '<br>')}
          </div>

          <hr>

          <h3>Comments</h3>

          <div id="commentsArea">
            Loading comments...
          </div>

          ${isLoggedIn() ? `
            <form id="commentForm">
              <textarea
                id="commentText"
                placeholder="Write your comment..."
                required
                rows="3"
              ></textarea>

              <button type="submit">
                Submit Comment
              </button>
            </form>
          ` : `
            <p>Please sign in to comment.</p>
          `}

        </article>
      `);

      await loadComments(postId);

      $('commentForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        await addComment(postId);
      });

    } catch (error) {
      alert('Unable to open article: ' + error.message);
    }
  }

  // LOAD COMMENTS
  async function loadComments(postId) {
    const host = $('commentsArea');
    if (!host || !state.db) return;

    try {
      const { data, error } = await state.db
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data?.length) {
        host.innerHTML = '<p>No co
            async function addComment(postId) {
    if (!isLoggedIn()) {
      alert('Please sign in first.');
      return;
    }

    const content = $('commentText')?.value.trim();

    if (!content) return;

    try {
      const { error } = await state.db
        .from('comments')
        .insert({
          post_id: postId,
          user_id: state.session.user.id,
          author_name: getUserName(),
          content
        });

      if (error) throw error;

      await loadComments(postId);

    } catch (error) {
      alert('Comment failed: ' + error.message);
    }
  }

  // LIKE POST
  async function likePost(postId) {
    if (!isLoggedIn()) {
      alert('Please sign in to like articles.');
      return;
    }

    try {
      const { error } = await state.db
        .from('likes')
        .insert({
          post_id: postId,
          user_id: state.session.user.id
        });

      if (error) {
        if (error.code === '23505') {
          alert('You have already liked this article.');
          return;
        }

        throw error;
      }

      alert('Article liked successfully.');

    } catch (error) {
      alert('Like failed: ' + error.message);
    }
  }

  // BOOKMARK POST
  async function bookmarkPost(postId) {
    if (!isLoggedIn()) {
      alert('Please sign in to bookmark articles.');
      return;
    }

    try {
      const { error } = await state.db
        .from('bookmarks')
        .insert({
          post_id: postId,
          user_id: state.session.user.id
        });

      if (error) {
        if (error.code === '23505') {
          alert('Article is already bookmarked.');
          return;
        }

        throw error;
      }

      alert('Article bookmarked successfully.');

    } catch (error) {
      alert('Bookmark failed: ' + error.message);
    }
  }

  // UPLOAD POST IMAGE
  async function uploadImage(file) {
    if (!state.db || !isLoggedIn()) return null;

    if (!file.type.startsWith('image/')) {
      throw new Error('Please select an image file.');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image size must be less than 5 MB.');
    }

    const extension = file.name.split('.').pop().toLowerCase();

    const path =
      `${state.session.user.id}/post-${Date.now()}.${extension}`;

    const { error } = await state.db.storage
      .from('blog-images')
      .upload(path, file);

    if (error) throw error;

    const { data } = state.db.storage
      .from('blog-images')
      .getPublicUrl(path);

    return data.publicUrl;
  }

  // WRITE FORM ACCESS - supports dashboard and standalone write.html
  function renderWriteForm() {
    const prompt = $('writePrompt');
    let form = $('writeForm') || $('postForm');

    // Dashboard contains an empty #writeForm host; build the same fields
    // used by write.html so both pages share submit/edit logic.
    if (form && form.id === 'writeForm' && !form.querySelector('#postTitle')) {
      form.innerHTML = `
        <form id="dashboardPostForm" class="post-editor-form">
          <label for="postTitle">Article Title</label>
          <input id="postTitle" type="text" placeholder="Article title" required>
          <label for="postExcerpt">Short Description</label>
          <input id="postExcerpt" type="text" placeholder="Short description">
          <label for="postCategory">Category</label>
          <select id="postCategory"><option value="">Choose category</option></select>
          <label for="postContent">Article Content</label>
          <textarea id="postContent" rows="12" placeholder="Write your article here..." required></textarea>
          <label for="postImage">Cover Image (optional)</label>
          <input id="postImage" type="file" accept="image/*">
          <label for="postStatus">Article Status</label>
          <select id="postStatus"><option value="draft">Draft</option><option value="pending">Pending Review</option></select>
          <button class="btn" type="submit">Submit Article</button>
        </form>
      `;
      form = $('dashboardPostForm');
    }

    form = $('dashboardPostForm') || $('writeForm') || $('postForm');

    if (!isWriter()) {
      if (prompt) {
        prompt.hidden = false;
        prompt.textContent = 'Please sign in with an Author account to write articles.';
      }
      if (form) form.hidden = true;
      return;
    }

    if (prompt) prompt.hidden = true;
    if (form) form.hidden = false;

    // Keep category options current after asynchronous category loading.
    const category = $('postCategory');
    if (category && state.categories.length) {
      const selected = category.value;
      category.innerHTML = `<option value="">Choose category</option>${state.categories.map(item =>
        `<option value="${esc(item.id)}">${esc(item.name)}</option>`
      ).join('')}`;
      category.value = selected;
    }
  }

  // SUBMIT OR UPDATE POST
  async function submitPost() {
    if (!isWriter()) {
      alert('You do not have permission to publish posts.');
      return;
    }

    const form = $('dashboardPostForm') || $('writeForm') || $('postForm');

    const title = $('postTitle')?.value.trim();
    const excerpt = $('postExcerpt')?.value.trim();
    const content = $('postContent')?.value.trim();
    const categoryId = $('postCategory')?.value || null;
    const status = $('postStatus')?.value || 'draft';
    const coverFile = $('postImage')?.files?.[0] || $('coverFile')?.files?.[0];

    if (!title || !content) {
      alert('Please enter post title and content.');
      return;
    }

    const button = form?.querySelector('[type="submit"]');

    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }

    try {
      let coverImage = null;

      if (coverFile) {
        coverImage = await uploadImage(coverFile);
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

      if (coverImage) {
        postData.cover_image = coverImage;
      }

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

      if (result.error) throw result.error;

      if (form) {
        form.reset();
        delete form.dataset.editingId;
      }

      alert(editingId
        ? 'Post updated successfully.'
        : 'Post submitted successfully.');

      await loadPosts();
      await loadUserPosts();

    } catch (error) {
      alert('Post save failed: ' + error.message);

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Submit Article';
      }
    }
  }

  // LOAD USER POSTS
  async function loadUserPosts() {
    if (!isWriter() || !state.db) return;

    try {
      const { data, error } = await state.db
        .from('posts')
        .select('*')
        .eq('author_id', state.session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      state.userPosts = data || [];

      renderUserPosts();

    } catch (error) {
      console.error('User posts error:', error);
    }
  }

  // RENDER USER POSTS
  function renderUserPosts() {
    const host = $('myPosts');
    if (!host) return;

    if (!state.userPosts.length) {
      host.innerHTML = '<p>You have not written any articles yet.</p>';
      return;
    }

    host.innerHTML = state.userPosts.map(post => `
      <div class="my-post-item">

        <h3>${esc(post.title)}</h3>

        <p>
          Status:
          <strong>${esc(post.status)}</strong>
        </p>

        <button
          type="button"
          data-edit-post="${esc(post.id)}">
          Edit
        </button>

        <button
          type="button"
          data-delete-post="${esc(post.id)}">
          Delete
        </button>

      </div>
    `).join('');
  }

  // EDIT POST
  function editPost(postId) {
    const post = state.userPosts.find(
      item => String(item.id) === String(postId)
    );

    if (!post) {
      alert('Post not found.');
      return;
    }

    if (!isWriter()) return;

    const form = $('dashboardPostForm') || $('writeForm') || $('postForm');

    if (!form) {
      alert('Write form not found.');
      return;
    }

    $('postTitle').value = post.title || '';
    $('postExcerpt').value = post.excerpt || '';
    $('postContent').value = post.content || '';
    $('postCategory').value = post.category_id || '';

    if ($('postStatus')) {
      $('postStatus').value = post.status || 'draft';
    }

    form.dataset.editingId = post.id;

    const button = form.querySelector('[type="submit"]');

    if (button) {
      button.textContent = 'Update Article';
    }

    form.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  // DELETE POST
  async function deletePost(postId) {
    if (!isWriter()) return;

    if (!confirm('Are you sure you want to delete this article?')) {
      return;
    }

    try {
      const { error } = await state.db
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('author_id', state.session.user.id);

      if (error) throw error;

      alert('Article deleted successfully.');

      await loadUserPosts();
      await loadPosts();

    } catch (error) {
      alert('Delete failed: ' + error.message);
    }
  }

  // ADD CATEGORY
  async function addCategory() {
    if (!isAdmin()) {
      alert('Admin permission required.');
      return;
    }

    const input = $('categoryName');
    const name = input?.value.trim();

    if (!name) {
      alert('Please enter category name.');
      return;
    }

    try {
      const { error } = await state.db
        .from('categories')
        .insert({ name });

      if (error) throw error;

      input.value = '';

      await loadCategories();
      renderAdminCategories();

      alert('Category added successfully.');

    } catch (error) {
      alert('Category error: ' + error.message);
    }
  }

  // DELETE CATEGORY
  async function deleteCategory(categoryId) {
    if (!isAdmin()) return;

    if (!confirm('Delete this category?')) return;

    try {
      const { error } = await state.db
        .from('categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      await loadCategories();
      renderAdminCategories();

      alert('Category deleted successfully.');

    } catch (error) {
      alert('Category delete failed: ' + error.message);
    }
  }

  // RENDER ADMIN CATEGORIES
  function renderAdminCategories() {
    const host = $('adminCategories');
    if (!host) return;

    if (!isAdmin()) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = state.categories.map(category => `
      <div class="admin-category-item">

        <span>${esc(category.name)}</span>

        <button
          type="button"
          data-delete-category="${esc(category.id)}">
          Delete
        </button>

      </div>
    `).join('');
  }

  // LOAD ALL USERS - SUPER ADMIN ONLY
  async function loadAllUsers() {
    if (!isSuperAdmin() || !state.db) return;

    const host = $('allUsers');
    if (!host) return;

    host.innerHTML = '<p>Loading users...</p>';

    try {
      const { data, error } = await state.db
        .from('profiles')
        .select(`
          id,
          full_name,
          username,
          phone,
          bio,
          avatar_url,
          role,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      state.allUsers = data || [];

      renderAllUsers();

    } catch (error) {
      console.error('User loading error:', error);

      host.innerHTML = `
        <p>Unable to load users: ${esc(error.message)}</p>
      `;
    }
  }

  // RENDER ALL USERS
  function renderAllUsers() {
    const host = $('allUsers');
    if (!host || !isSuperAdmin()) return;

    if (!state.allUsers.length) {
      host.innerHTML = '<p>No users found.</p>';
      return;
    }

    host.innerHTML = state.allUsers.map(user => `
      <div class="admin-user-card">

        <div class="admin-user-info">

          <img
            src="${esc(user.avatar_url || 'https://ui-avatars.com/api/?name=User')}"
            alt="User"
            width="55"
            height="55"
            style="border-radius:50%;object-fit:cover"
          >

          <h3>${esc(user.full_name || 'Unnamed User')}</h3>

          <p>Username: ${esc(user.username || 'Not generated')}</p>

          <p>Mobile: ${esc(user.phone || 'Not provided')}</p>

          <p>Bio: ${esc(user.bio || 'No bio')}</p>

          <p>Joined: ${formatDate(user.created_at)}</p>

        </div>

        <label>User Role</label>

        <select id="role-${esc(user.id)}">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>
            User
          </option>

          <option value="author" ${user.role === 'author' ? 'selected' : ''}>
            Author
          </option>

          <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>
            Editor
          </option>

          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>
            Admin
          </option>
        </select>

        <button
          type="button"
          data-save-role="${esc(user.id)}">
          Update Role
        </button>

      </div>
    `).join('');
  }

  // UPDATE USER ROLE
  async function updateUserRole(userId) {
    if (!isSuperAdmin()) {
      alert('Only Super Admin can update user roles.');
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

    try {
      const { error } = await state.db
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      alert('User role updated.');

      await loadAllUsers();

    } catch (error) {
      alert('Role update failed: ' + error.message);
    }
  }

  // PAGE ACCESS
  function setupPageAccess() {
    const adminArea = $('adminArea');
    const superAdminArea = $('superAdminArea');
    const writerArea = $('writerArea');
    const dashboardWelcome = $('dashboardWelcome');

    if (dashboardWelcome) {
      dashboardWelcome.hidden = isLoggedIn();
    }

    if (adminArea) {
      adminArea.hidden = !isAdmin();
    }

    if (superAdminArea) {
      superAdminArea.hidden = !isSuperAdmin();
    }

    if (writerArea) {
      writerArea.hidden = !isWriter();
    }

    renderWriteForm();

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

      if (event.target === $('modal')) {
        closeModal();
        return;
      }

      const target = event.target.closest('button, [data-action]');
      if (!target) return;

      if (target.hasAttribute('data-close-modal')) {
        closeModal();
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

      if (target.dataset.editPost) {
        editPost(target.dataset.editPost);
        return;
      }

      if (target.dataset.deletePost) {
        await deletePost(target.dataset.deletePost);
        return;
      }

      if (target.dataset.deleteCategory) {
        await deleteCategory(target.dataset.deleteCategory);
        return;
      }

      if (target.dataset.saveRole) {
        await updateUserRole(target.dataset.saveRole);
        return;
      }

      if (target.dataset.postId) {
        openPost(target.dataset.postId);
        return;
      }

      if (target.dataset.likePost) {
        await likePost(target.dataset.likePost);
        return;
      }

      if (target.dataset.bookmarkPost) {
        await bookmarkPost(target.dataset.bookmarkPost);
        return;
      }
    });

    // CATEGORY FORM
    const categoryForm = $('categoryForm');

    if (categoryForm) {
      categoryForm.addEventListener('submit', event => {
        event.preventDefault();
        addCategory();
      });
    }

    // WRITE FORMS - dashboard and standalone write.html
    document.addEventListener('submit', event => {
      const form = event.target;
      if (['writeForm', 'postForm', 'dashboardPostForm'].includes(form.id)) {
        event.preventDefault();
        submitPost(event);
      }
    });

    // The single close button belongs to the original modal shell.
    $('closeModal')?.addEventListener('click', closeModal);

    // SEARCH
    const searchInput = $('searchInput');

    if (searchInput) {
      let searchTimeout;

      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);

        searchTimeout = setTimeout(() => {
          loadPosts();
        }, 350);
      });
    }

    // CATEGORY FILTER
    const categoryFilter = $('categoryFilter');

    if (categoryFilter) {
      categoryFilter.addEventListener('change', loadPosts);
    }
  }

  // AUTH STATE
  async function handleAuthState(session) {
    state.session = session;

    if (session?.user) {
      await loadProfile();
    } else {
      state.profile = null;
      state.userPosts = [];
      state.allUsers = [];
    }

    renderAuth();
    setupPageAccess();
  }

  // INITIALIZE APPLICATION
  async function init() {
    if (state.initialized) return;

    state.initialized = true;

    setupEvents();

    // Show login/signup buttons immediately
    renderAuth();

    const connected = await initializeSupabase();

    if (!connected || !state.db) {
      setStatus('Supabase connection is not configured. Check config.js.');
      console.error('Please verify SUPABASE_URL and SUPABASE_ANON_KEY.');
      return;
    }

    try {
      const { data, error } = await state.db.auth.getSession();

      if (error) throw error;

      await handleAuthState(data.session);

      state.db.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => {
          handleAuthState(session).catch(error => {
            console.error('Authentication state error:', error);
          });
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

      console.log('RK BlogSphere initialized successfully.');

    } catch (error) {
      console.error('Application initialization error:', error);

      setStatus('Unable to initialize application: ' + error.message);
    }
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
    
