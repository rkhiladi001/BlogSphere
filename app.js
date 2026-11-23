
(() => {
  const cfg = window.BLOGSPHERE_CONFIG || {};
  const $ = id => document.getElementById(id);

  if ($('year')) $('year').textContent = new Date().getFullYear();

  const missing =
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_URL.includes('PASTE_') ||
    cfg.SUPABASE_ANON_KEY.includes('PASTE_');

  if (missing || !window.supabase) {
    if ($('feedStatus')) $('feedStatus').textContent = 'Setup required';
    if ($('posts')) $('posts').innerHTML =
      '<div class="message">Supabase setup required in config.js.</div>';
    return;
  }

  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  let session = null;
  let profile = null;
  let categories = [];
  let posts = [];
  let settings = {};

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));

  const canWrite = () =>
    profile && ['author','editor','admin','super_admin'].includes(profile.role);

  const isAdmin = () =>
    profile && ['editor','admin','super_admin'].includes(profile.role);

  const isSuperAdmin = () =>
    profile && profile.role === 'super_admin';

  function setting(key, fallback='') {
    const v = settings[key];
    if (v === undefined || v === null || v === '') return fallback;
    return String(v);
  }

  function modal(html) {
    $('modalContent').innerHTML = html;
    $('modal').hidden = false;
  }

  $('closeModal').onclick = () => $('modal').hidden = true;

  $('modal').addEventListener('click', e => {
    if (e.target === $('modal')) $('modal').hidden = true;
  });

  // =========================
  // SITE SETTINGS
  // =========================

  async function loadSettings() {
    const {data,error} = await db
      .from('site_settings')
      .select('key,value');

    if (error) {
      console.warn('Settings:',error.message);
      return;
    }

    settings = {};

    (data || []).forEach(row => {
      let v = row.value;

      if (typeof v === 'string') {
        try {
          const parsed = JSON.parse(v);
          if (typeof parsed === 'string') v = parsed;
        } catch (_) {}
      }

      settings[row.key] = v;
    });

    applySettings();
  }

  function applySettings() {
    const siteName = setting('site_name','RK BlogSphere');
    const tagline = setting('site_tagline','CREATE · SHARE · INSPIRE');
    const heroTitle = setting('hero_title','Ideas worth sharing.');
    const heroDescription = setting(
      'hero_description',
      'Discover stories and perspectives from the BlogSphere community.'
    );

    document.title = siteName;

    const header = document.querySelector('.topbar .brand');
    if (header) {
      const img = header.querySelector('img');
      if (img && setting('logo_header')) {
        img.src = setting('logo_header');
        img.style.display = 'block';
        if (img.nextElementSibling) img.nextElementSibling.style.display='none';
      } else if (img) {
        img.src = 'rk-blogspheere-logo.png';
      }
    }

    const heroLogo = document.querySelector('.rkb-hero-logo');
    if (heroLogo) {
      heroLogo.src = setting('logo_home','rk-blogspheere-logo.png');
      heroLogo.style.display = 'block';
    }

    const footerLogo = document.querySelector('.rkb-footer-logo');
    if (footerLogo) {
      footerLogo.src = setting('logo_footer','rk-blogspheere-logo.png');
      footerLogo.style.display = 'block';
    }

    const authLogo = document.querySelector('.rkb-auth-logo');
    if (authLogo) {
      authLogo.src = setting('logo_login','rk-blogspheere-logo.png');
    }

    const adminLogo = document.querySelector('.rkb-admin-logo');
    if (adminLogo) {
      adminLogo.src = setting('logo_admin','rk-blogspheere-logo.png');
    }

    const hero = document.querySelector('.hero h1');
    if (hero) {
      const parts = heroTitle.split(' ');
      hero.innerHTML = esc(parts.join(' '));
    }

    const heroPara = document.querySelector('.hero > div > p:not(.eyebrow)');
    if (heroPara) heroPara.textContent = heroDescription;

    const eyebrow = document.querySelector('.hero .eyebrow');
    if (eyebrow) eyebrow.textContent = tagline;

    const fallback = document.querySelector('.rkb-brand-fallback span:last-child');
    if (fallback) fallback.textContent = siteName;
  }

  async function saveSetting(key,value) {
    const {data,error} = await db.rpc('admin_set_site_setting',{
      p_key:key,
      p_value:value
    });

    if (error) {
      throw error;
    }

    settings[key] = value;
    applySettings();
    return data;
  }

  async function uploadLogo(file,key) {
    if (!file) throw new Error('Please select an image.');

    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are allowed.');
    }

    if (file.size > 5*1024*1024) {
      throw new Error('Image must be smaller than 5 MB.');
    }

    const path =
      `site-logos/${key}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;

    const {error} = await db.storage
      .from('blog-images')
      .upload(path,file,{upsert:false});

    if (error) throw error;

    const {data} = db.storage
      .from('blog-images')
      .getPublicUrl(path);

    return data.publicUrl;
  }

  // =========================
  // CATEGORIES
  // =========================

  async function loadCategories() {
    const {data,error} = await db
      .from('categories')
      .select('id,name,slug')
      .order('name');

    if (error) {
      console.error(error);
      return;
    }

    categories = data || [];

    $('categoryFilter').innerHTML =
      '<option value="">All categories</option>' +
      categories.map(c =>
        `<option value="${esc(c.id)}">${esc(c.name)}</option>`
      ).join('');

    $('postCategory').innerHTML =
      '<option value="">Choose category</option>' +
      categories.map(c =>
        `<option value="${esc(c.id)}">${esc(c.name)}</option>`
      ).join('');
  }

  // =========================
  // AUTH
  // =========================

  async function loadProfile() {
    profile = null;

    if (session?.user) {
      const {data,error} = await db
        .from('profiles')
        .select('*')
        .eq('id',session.user.id)
        .maybeSingle();

      if (!error) profile = data;
    }

    renderAuth();
    renderWrite();
    await renderDashboard();
  }

  function renderAuth() {
    if (session?.user) {
      $('authArea').innerHTML =
        `<span class="postmeta">${
          esc(profile?.username || profile?.full_name || session.user.email)
        }${profile?.role ? ' · '+esc(profile.role) : ''}</span>
        <button class="smallbtn" id="logoutBtn">Logout</button>`;

      $('logoutBtn').onclick = async () => {
        await db.auth.signOut();
      };

      return;
    }

    $('authArea').innerHTML =
      '<button class="btn" id="loginBtn">Login / Sign up</button>';

    $('loginBtn').onclick = () => {
      modal(`
        <h2>Login / Sign up</h2>
        <form id="authForm" class="adminlist">
          <input id="authEmail" type="email" required placeholder="Email">
          <input id="authPassword" type="password" minlength="6" required placeholder="Password (min 6 characters)">
          <div class="inlineform">
            <button class="btn" type="submit">Login</button>
            <button class="btn secondary" id="signupBtn" type="button">Create account</button>
          </div>
          <p id="authMsg" class="muted"></p>
        </form>
      `);

      $('authForm').onsubmit = async e => {
        e.preventDefault();

        const email = $('authEmail').value;
        const password = $('authPassword').value;

        const {error} = await db.auth.signInWithPassword({
          email,password
        });

        $('authMsg').textContent = error?.message || 'Login successful';

        if (!error) $('modal').hidden = true;
      };

      $('signupBtn').onclick = async () => {
        const email = $('authEmail').value;
        const password = $('authPassword').value;

        if (!email || password.length < 6) {
          $('authMsg').textContent =
            'Enter email and password (at least 6 characters).';
          return;
        }

        const {error} = await db.auth.signUp({email,password});

        $('authMsg').textContent =
          error?.message ||
          'Signup submitted. Check your email if confirmation is required.';
      };
    };
  }

  function renderWrite() {
    const eligible = canWrite();

    $('writePrompt').hidden = eligible;
    $('postForm').hidden = !eligible;
  }

  // =========================
  // DASHBOARD
  // =========================

  async function renderDashboard() {
    if (!session?.user) {
      $('dashboardContent').textContent =
        'Sign in to view your dashboard.';
      return;
    }

    let html = `
      <p>Signed in as <b>${esc(session.user.email)}</b> · Role:
      <b>${esc(profile?.role || 'user')}</b></p>
      <h3>Your articles</h3>
      <div id="myPosts" class="adminlist">Loading…</div>
    `;

    if (isAdmin()) {
      html += `
        <hr>
        <h2>Website Branding Settings</h2>
        <div id="brandingPanel"></div>
        <hr>
        <h3>Moderation queue</h3>
        <div id="moderation" class="adminlist">Loading…</div>
        <hr>
        <h3>Manage categories</h3>
        <form id="catForm" class="inlineform">
          <input id="catName" placeholder="New category" required>
          <button class="btn" type="submit">Add</button>
        </form>
        <div id="catMsg"></div>
        <hr>
        <h3>Users</h3>
        <div id="usersList" class="adminlist">Loading…</div>
      `;
    }

    $('dashboardContent').innerHTML = html;

    const {data:mine,error:mineError} = await db
      .from('posts')
      .select('id,title,status,created_at')
      .eq('author_id',session.user.id)
      .order('created_at',{ascending:false});

    if (mineError) {
      $('myPosts').textContent = mineError.message;
    } else {
      $('myPosts').innerHTML = (mine || []).length
        ? mine.map(p => `
            <div class="adminrow">
              <div>
                <b>${esc(p.title)}</b>
                <div class="postmeta">
                  ${esc(p.status)} · ${new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
              <button class="smallbtn" data-own="${p.id}">View</button>
            </div>
          `).join('')
        : 'No articles yet.';
    }

    $('myPosts').querySelectorAll('[data-own]').forEach(b => {
      b.onclick = () => openPost(b.dataset.own);
    });

    if (isAdmin()) await loadAdmin();
  }

  // =========================
  // ADMIN BRANDING PANEL
  // =========================

  function renderBrandingPanel() {
    if (!isAdmin() || !$('brandingPanel')) return;

    const logoFields = [
      ['logo_header','Header Logo'],
      ['logo_home','Home Logo'],
      ['logo_login','Login Logo'],
      ['logo_admin','Admin Logo'],
      ['logo_footer','Footer Logo']
    ];

    $('brandingPanel').innerHTML = `
      <div class="adminlist">
        <label>Website Name</label>
        <input id="settingSiteName" value="${esc(setting('site_name','RK BlogSphere'))}">
        <label>Website Tagline</label>
        <input id="settingTagline" value="${esc(setting('site_tagline','CREATE · SHARE · INSPIRE'))}">
        <label>Homepage Heading</label>
        <input id="settingHeroTitle" value="${esc(setting('hero_title','Ideas worth sharing.'))}">
        <label>Homepage Description</label>
        <textarea id="settingHeroDescription" rows="3">${esc(setting('hero_description','Discover stories and perspectives from the BlogSphere community.'))}</textarea>

        <hr>
        <h3>Logo Upload / Change</h3>
        <p class="postmeta">Upload image files up to 5 MB. Images will be stored in the blog-images bucket.</p>

        ${logoFields.map(([key,label]) => `
          <div class="adminrow" style="display:block">
            <b>${esc(label)}</b>
            <div>
              <img
                src="${esc(setting(key,'rk-blogspheere-logo.png'))}"
                alt="${esc(label)}"
                style="max-width:220px;max-height:100px;object-fit:contain;margin:10px 0"
                onerror="this.style.display='none'"
              >
            </div>
            <input type="file" id="file_${key}" accept="image/*">
            <button class="smallbtn" data-upload-logo="${key}">Upload / Change</button>
          </div>
        `).join('')}

        <button class="btn" id="saveSiteSettings">Save Website Settings</button>
        <p id="brandingMessage"></p>
      </div>
    `;

    $('saveSiteSettings').onclick = async () => {
      const values = {
        site_name:$('settingSiteName').value.trim(),
        site_tagline:$('settingTagline').value.trim(),
        hero_title:$('settingHeroTitle').value.trim(),
        hero_description:$('settingHeroDescription').value.trim()
      };

      const msg = $('brandingMessage');
      msg.textContent = 'Saving…';

      try {
        for (const [key,value] of Object.entries(values)) {
          await saveSetting(key,value);
        }

        msg.textContent = 'Website settings saved successfully.';
      } catch (e) {
        msg.textContent = e.message;
      }
    };

    $('brandingPanel').querySelectorAll('[data-upload-logo]').forEach(b => {
      b.onclick = async () => {
        const key = b.dataset.uploadLogo;
        const file = $('file_'+key).files[0];

        if (!file) {
          $('brandingMessage').textContent = 'Select a logo file first.';
          return;
        }

        $('brandingMessage').textContent = 'Uploading…';

        try {
          const url = await uploadLogo(file,key);
          await saveSetting(key,url);
          $('brandingMessage').textContent =
            'Logo uploaded and setting saved successfully.';
          renderBrandingPanel();
        } catch (e) {
          $('brandingMessage').textContent = e.message;
        }
      };
    });
  }

  // =========================
  // ADMIN
  // =========================

  async function loadAdmin() {
    renderBrandingPanel();

    const {data:queue,error} = await db
      .from('posts')
      .select('id,title,status,author_id,created_at')
      .neq('status','published')
      .order('created_at',{ascending:false});

    if (error) {
      $('moderation').textContent = error.message;
      return;
    }

    $('moderation').innerHTML = (queue || []).length
      ? queue.map(p => `
          <div class="adminrow">
            <div>
              <b>${esc(p.title)}</b>
              <div class="postmeta">${esc(p.status)} · ${esc(p.author_id)}</div>
            </div>
            <div class="inlineform">
              <button class="smallbtn" data-approve="${p.id}">Publish</button>
              <button class="smallbtn" data-reject="${p.id}">Reject</button>
              <button class="smallbtn" data-delete="${p.id}">Delete</button>
            </div>
          </div>
        `).join('')
      : 'No pending or unpublished articles.';

    $('moderation').querySelectorAll('[data-approve]').forEach(b => {
      b.onclick = () => moderate(b.dataset.approve,'published');
    });

    $('moderation').querySelectorAll('[data-reject]').forEach(b => {
      b.onclick = () => moderate(b.dataset.reject,'rejected');
    });

    $('moderation').querySelectorAll('[data-delete]').forEach(b => {
      b.onclick = () => deletePost(b.dataset.delete);
    });

    $('catForm').onsubmit = async e => {
      e.preventDefault();

      const name = $('catName').value.trim();
      const slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/(^-|-$)/g,'');

      const {error} = await db.from('categories').insert({name,slug});

      $('catMsg').textContent = error?.message || 'Category added';

      if (!error) {
        $('catName').value = '';
        await loadCategories();
      }
    };

    await loadUsers();
  }

  // =========================
  // SECURE USER ROLE MANAGEMENT
  // =========================

  async function loadUsers() {
    const {data:users,error} = await db
      .from('profiles')
      .select('id,email,username,role,created_at')
      .order('created_at',{ascending:false})
      .limit(100);

    if (error) {
      $('usersList').textContent = error.message;
      return;
    }

    $('usersList').innerHTML = (users || []).map(u => {
      const allowed = isSuperAdmin()
        ? ['user','author','editor','admin','super_admin']
        : ['user','author'];

      return `
        <div class="adminrow">
          <div>
            <b>${esc(u.email || u.username || u.id)}</b>
            <div class="postmeta">${esc(u.role)}</div>
          </div>
          <select data-role="${u.id}" ${u.id===session.user.id?'disabled':''}>
            ${allowed.map(r =>
              `<option value="${r}" ${u.role===r?'selected':''}>${r}</option>`
            ).join('')}
          </select>
        </div>
      `;
    }).join('');

    $('usersList').querySelectorAll('[data-role]').forEach(sel => {
      sel.onchange = async () => {
        const {error} = await db.rpc('admin_set_user_role',{
          p_user_id:sel.dataset.role,
          p_role:sel.value
        });

        if (error) {
          alert('Role update failed: '+error.message);
          await renderDashboard();
        } else {
          alert('Role updated.');
          await renderDashboard();
        }
      };
    });
  }

  // =========================
  // MODERATION
  // =========================

  async function moderate(id,status) {
    const {data,error} = await db.rpc('admin_moderate_post',{
      p_post_id:id,
      p_status:status
    });

    if (error) {
      alert('Moderation failed: '+error.message);
      return;
    }

    alert(data || 'Post status updated.');
    await loadPosts();
    await renderDashboard();
  }

  async function deletePost(id) {
    if (!confirm('Delete this article permanently?')) return;

    const {data,error} = await db.rpc('admin_delete_post',{
      p_post_id:id
    });

    if (error) {
      alert('Delete failed: '+error.message);
      return;
    }

    alert(data || 'Post deleted.');
    await loadPosts();
    await renderDashboard();
  }

  // =========================
  // POSTS
  // =========================

  async function loadPosts() {
    $('feedStatus').textContent = 'Loading…';

    const {data,error} = await db
      .from('posts')
      .select('id,title,slug,excerpt,content,cover_image,category_id,status,featured,views,created_at,published_at,author_id')
      .eq('status','published')
      .order('featured',{ascending:false})
      .order('published_at',{ascending:false});

    if (error) {
      $('feedStatus').textContent = error.message;
      $('posts').innerHTML = '';
      return;
    }

    posts = data || [];

    const ids = posts.map(p => p.category_id).filter(Boolean);
    let catMap = {};

    if (ids.length) {
      const {data:c} = await db
        .from('categories')
        .select('id,name')
        .in('id',ids);

      (c || []).forEach(x => catMap[x.id] = x.name);
    }

    const query = $('search').value.toLowerCase().trim();
    const cat = $('categoryFilter').value;

    const filtered = posts.filter(p =>
      (!cat || p.category_id === cat) &&
      (!query || `${p.title} ${p.excerpt || ''} ${p.content || ''}`
        .toLowerCase().includes(query))
    );

    $('feedStatus').textContent = `${filtered.length} article(s)`;

    $('posts').innerHTML = filtered.length
      ? filtered.map(p => `
          <article class="postcard">
            ${p.cover_image
              ? `<img src="${esc(p.cover_image)}" alt="" loading="lazy">`
              : `<div style="height:190px;background:#dce5e1;display:grid;place-items:center;font-size:2rem;color:#146c60">✦</div>`
            }
            <div 
