(() => {
  const cfg = window.BLOGSPHERE_CONFIG || {};
  const missing =
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_URL.includes('PASTE_') ||
    cfg.SUPABASE_ANON_KEY.includes('PASTE_');

  const $ = id => document.getElementById(id);

  $('year').textContent = new Date().getFullYear();

  if (missing || !window.supabase) {
    $('feedStatus').textContent = 'Setup required: add Supabase URL and anon key in config.js';
    $('posts').innerHTML = '<div class="message">Add your Supabase URL and anon/public key in config.js.</div>';
    return;
  }

  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  let session = null, profile = null, categories = [], posts = [];

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

  const modal = html => {
    $('modalContent').innerHTML = html;
    $('modal').hidden = false;
  };

  $('closeModal').onclick = () => $('modal').hidden = true;

  $('modal').addEventListener('click', e => {
    if (e.target === $('modal')) $('modal').hidden = true;
  });

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
    renderDashboard();
    renderWrite();
  }

  function renderAuth() {
    if (session?.user) {
      $('authArea').innerHTML =
        `<span class="postmeta">${
          esc(profile?.username || profile?.full_name || session.user.email)
        }${profile?.role ? ` · ${esc(profile.role)}` : ''}</span>
        <button class="smallbtn" id="logoutBtn">Logout</button>`;

      $('logoutBtn').onclick = async () => {
        await db.auth.signOut();
      };
    } else {
      $('authArea').innerHTML =
        '<button class="btn" id="loginBtn">Login / Sign up</button>';
    }

    const loginBtn = $('loginBtn');
    if (!loginBtn) return;

    loginBtn.onclick = () => modal(`
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

    $('modalContent').addEventListener('submit', async e => {
      if (e.target.id !== 'authForm') return;
      e.preventDefault();

      const email = $('authEmail').value;
      const password = $('authPassword').value;

      const {error} = await db.auth.signInWithPassword({email,password});

      $('authMsg').textContent = error?.message || 'Logged in';

      if (!error) $('modal').hidden = true;
    }, {once:true});

    const signup = $('signupBtn');

    if (signup) signup.onclick = async () => {
      const email = $('authEmail').value;
      const password = $('authPassword').value;

      if (!email || password.length < 6) {
        $('authMsg').textContent = 'Enter email and password (at least 6 characters).';
        return;
      }

      const {error} = await db.auth.signUp({email,password});

      $('authMsg').textContent =
        error?.message || 'Signup submitted. Check your email if confirmation is required.';
    };
  }

  function renderWrite() {
    const eligible = canWrite();
    $('writePrompt').hidden = eligible;
    $('postForm').hidden = !eligible;
  }

  async function renderDashboard() {
    if (!session?.user) {
      $('dashboardContent').textContent = 'Sign in to view your dashboard.';
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

    const {data:mine} = await db
      .from('posts')
      .select('id,title,status,created_at')
      .eq('author_id',session.user.id)
      .order('created_at',{ascending:false});

    $('myPosts').innerHTML = (mine || []).length
      ? (mine || []).map(p => `
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

    $('myPosts').querySelectorAll('[data-own]').forEach(b => {
      b.onclick = () => openPost(b.dataset.own);
    });

    if (isAdmin()) await loadAdmin();
  }

  async function loadAdmin() {
    const {data:queue,error} = await db
      .from('posts')
      .select('id,title,status,author_id')
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

    const {data:users,error:ue} = await db
      .from('profiles')
      .select('id,email,username,role')
      .order('created_at',{ascending:false})
      .limit(100);

    if (ue) {
      $('usersList').textContent = ue.message;
      return;
    }

    $('usersList').innerHTML = (users || []).map(u => `
      <div class="adminrow">
        <div>
          <b>${esc(u.email || u.username || u.id)}</b>
          <div class="postmeta">${esc(u.role)}</div>
        </div>
        <select data-role="${u.id}">
          <option value="user" ${u.role==='user'?'selected':''}>user</option>
          <option value="author" ${u.role==='author'?'selected':''}>author</option>
          <option value="editor" ${u.role==='editor'?'selected':''}>editor</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
          <option value="super_admin" ${u.role==='super_admin'?'selected':''}>super_admin</option>
        </select>
      </div>
    `).join('');

    $('usersList').querySelectorAll('[data-role]').forEach(sel => {
      sel.onchange = async () => {
        const {error} = await db
          .from('profiles')
          .update({role:sel.value})
          .eq('id',sel.dataset.role);

        if (error) {
          alert('Role update failed: ' + error.message);
          await renderDashboard();
        } else {
          alert('Role updated.');
          await renderDashboard();
        }
      };
    });
  }

  // Publish or reject a post using the database moderation function.
  async function moderate(id,status) {
    const {data,error} = await db.rpc('admin_moderate_post',{
      p_post_id:id,
      p_status:status
    });

    if (error) {
      alert('Moderation failed: ' + error.message);
      return;
    }

    alert(data || 'Post status updated.');

    await loadPosts();
    await renderDashboard();
  }

  // Delete a post using the database delete function.
  async function deletePost(id) {
    if (!confirm('Are you sure you want to permanently delete this post?')) return;

    const {data,error} = await db.rpc('admin_delete_post',{
      p_post_id:id
    });

    if (error) {
      alert('Delete failed: ' + error.message);
      return;
    }

    alert(data || 'Post deleted.');

    await loadPosts();
    await renderDashboard();
  }

  async function loadPosts() {
    $('feedStatus').textContent = 'Loading…';

    let q = db.from('posts')
      .select('id,title,slug,excerpt,content,cover_image,category_id,status,featured,views,created_at,published_at,author_id')
      .eq('status','published')
      .order('featured',{ascending:false})
      .order('published_at',{ascending:false});

    const {data,error} = await q;

    if (error) {
      $('feedStatus').textContent = error.message;
      $('posts').innerHTML = '';
      return;
    }

    posts = data || [];

    const ids = posts.map(p => p.category_id).filter(Boolean);
    let catMap = {};

    if (ids.length) {
      const {data:c} = await db.from('categories').select('id,name').in('id',ids);
      (c || []).forEach(x => catMap[x.id] = x.name);
    }

    const query = $('search').value.toLowerCase().trim();
    const cat = $('categoryFilter').value;

    const filtered = posts.filter(p =>
      (!cat || p.category_id === cat) &&
      (!query || `${p.title} ${p.excerpt || ''} ${p.content || ''}`.toLowerCase().includes(query)
      )
    );

    $('feedStatus').textContent = `${filtered.length} article(s)`;

    $('posts').innerHTML = filtered.length
      ? filtered.map(p => `
          <article class="postcard">
            ${p.cover_image
              ? `<img src="${esc(p.cover_image)}" alt="" loading="lazy">`
              : `<div style="height:190px;background:#dce5e1;display:grid;place-items:center;font-size:2rem;color:#146c60">✦</div>`
            }
            <div class="postbody">
              <span class="tag">${esc(catMap[p.category_id] || 'Article')}${p.featured ? ' · FEATURED' : ''}</span>
              <h3>${esc(p.title)}</h3>
              <p>${esc(p.excerpt || '')}</p>
              <span class="postmeta">
                ${new Date(p.published_at || p.created_at).toLocaleDateString()} · ${p.views || 0} views
              </span>
              <div class="postactions">
                <button data-read="${p.id}">Read article</button>
                ${session ? `<button data-save="${p.id}">Bookmark</button><button data-like="${p.id}">Like</button>` : ''}
              </div>
            </div>
          </article>
        `).join('')
      : '<div class="message">No articles found yet. Once published, articles will appear here.</div>';

    $('posts').querySelectorAll('[data-read]').forEach(b => {
      b.onclick = () => openPost(b.dataset.read);
    });

    $('posts').querySelectorAll('[data-save]').forEach(b => {
      b.onclick = () => bookmark(b.dataset.save);
    });

    $('posts').querySelectorAll('[data-like]').forEach(b => {
      b.onclick = () => like(b.dataset.like);
    });
  }

  async function openPost(id) {
    const p = posts.find(x => x.id === id);
    if (!p) return;

    await db.rpc('increment_post_view',{post_id_input:id}).catch(() => {});

    const {data:comments} = await db
      .from('comments')
      .select('content,author_id,created_at')
      .eq('post_id',id)
      .eq('status','approved')
      .order('created_at');

    modal(`
      <h2>${esc(p.title)}</h2>
      ${p.cover_image ? `<img style="width:100%;border-radius:12px" src="${esc(p.cover_image)}">` : ''}
      <p class="postmeta">${new Date(p.published_at || p.created_at).toLocaleDateString()}</p>
      <div class="articlecontent">${esc(p.content)}</div>
      <hr>
      <h3>Comments</h3>
      <div>
        ${(comments || []).map(c => `
          <p>${esc(c.content)}
          <small class="postmeta">${new Date(c.created_at).toLocaleDateString()}</small></p>
        `).join('') || 'No comments yet.'}
      </div>
      ${session ? `
        <form id="commentForm">
          <textarea id="commentText" rows="3" placeholder="Add a comment…" required></textarea>
          <button class="btn" type="submit">Submit comment</button>
          <p class="postmeta">Comments may require moderation.</p>
        </form>
      ` : '<p class="postmeta">Sign in to comment.</p>'}
    `);

    if ($('commentForm')) {
      $('commentForm').onsubmit = async e => {
        e.preventDefault();

        const {error} = await db.from('comments').insert({
          post_id:id,
          author_id:session.user.id,
          content:$('commentText').value.trim(),
          status:'pending'
        });

        alert(error?.message || 'Comment submitted for review.');

        if (!error) $('modal').hidden = true;
      };
    }
  }

  async function bookmark(id) {
    const {error} = await db.from('bookmarks').insert({
      post_id:id,
      user_id:session.user.id
    });

    alert(error?.message || 'Saved to bookmarks.');
  }

  async function like(id) {
    const {error} = await db.from('likes').insert({
      post_id:id,
      user_id:session.user.id
    });

    alert(error?.message || 'Liked.');
  }

  $('postForm').onsubmit = async e => {
    e.preventDefault();

    if (!canWrite()) {
      $('postMessage').textContent = 'Author permission required.';
      return;
    }

    const title = $('postTitle').value.trim();
    const content = $('postContent').value.trim();
    const category_id = $('postCategory').value;

    let cover_image = null;
    const file = $('coverFile').files[0];

    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        $('postMessage').textContent = 'Image must be smaller than 5 MB.';
        return;
      }

      const path =
        `${session.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;

      const {error:up} = await db.storage
        .from('blog-images')
        .upload(path,file,{upsert:false});

      if (up) {
        $('postMessage').textContent = up.message;
        return;
      }

      const {data:url} = db.storage.from('blog-images').getPublicUrl(path);
      cover_image = url.publicUrl;
    }

    const slug =
      title.toLowerCase()
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/(^-|-$)/g,'') +
      '-' +
      Date.now().toString().slice(-5);

    const {error} = await db.from('posts').insert({
      author_id:session.user.id,
      title,
      slug,
      excerpt:$('postExcerpt').value.trim(),
      content,
      cover_image,
      category_id:category_id || null,
      status:'pending'
    });

    $('postMessage').textContent =
      error?.message || 'Article submitted for moderation.';

    if (!error) {
      e.target.reset();
      await renderDashboard();
    }
  };

  $('search').oninput = loadPosts;
  $('categoryFilter').onchange = loadPosts;
  $('refreshBtn').onclick = loadPosts;

  db.auth.onAuthStateChange((_event,s) => {
    session = s;
    setTimeout(async () => {
      await loadProfile();
      await loadPosts();
    },0);
  });

  (async () => {
    const {data} = await db.auth.getSession();
    session = data.session;
    await loadCategories();
    await loadProfile();
    await loadPosts();
  })();
})();
