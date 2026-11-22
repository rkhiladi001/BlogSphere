BLOGSPHERE - STARTER WEBSITE (GitHub + Supabase + Netlify)

IMPORTANT: This is a starter frontend. It is not yet production hardened. Review database policies, triggers, moderation and admin workflows before using real data.

1. Open config.js and replace:
   SUPABASE_URL = your Project URL
   SUPABASE_ANON_KEY = your anon/public key
   Never use the service_role key.

2. Create a GitHub repository and upload all 4 files:
   index.html, config.js, app.js, style.css
   README.txt is for instructions.

3. Deploy the repository to Netlify (import project from GitHub). Build command blank; publish directory: .

4. App features currently included:
   - Public article feed and search/category filter
   - Login and signup
   - Writer form with optional image upload (authors/editors/admins)
   - Articles enter pending moderation
   - Dashboard for account articles
   - Editor/admin moderation controls and category creation
   - Admin profile-role interface (role changes depend on the installed RLS policies)
   - Approved comments display and comment submission
   - Like/bookmark actions

5. Supabase tables and policy assumptions match the database setup discussed in this chat. Please test with dummy accounts first.
