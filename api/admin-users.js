// Vercel serverless function: user management for system admins.
// The only place that holds the GoTrue admin key (SUPABASE_SERVICE_ROLE_KEY).
// Every request is checked: valid session + active system_admin in app_users.
//
// Env (Vercel project settings):
//   SUPABASE_URL or VITE_SUPABASE_URL           gateway address
//   SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY public key
//   SUPABASE_SERVICE_ROLE_KEY                   admin key - never VITE_*

const ROLES = ['employee', 'manager', 'system_admin'];

function config() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anon || !service) throw Object.assign(new Error('השרת לא מוגדר: חסרים משתני סביבה'), { status: 500 });
  return { url, anon, service };
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function call(cfg, path, { method = 'GET', body, token, prefer } = {}) {
  const headers = { apikey: cfg.service, Authorization: `Bearer ${token || cfg.service}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${cfg.url}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!r.ok) {
    const msg = (json && (json.msg || json.message || json.error_description || json.error)) || `HTTP ${r.status}`;
    throw new HttpError(r.status >= 500 ? 502 : r.status, String(msg));
  }
  return json;
}

// Who is calling? Must be an active system admin.
async function requireAdmin(cfg, req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new HttpError(401, 'נדרשת כניסה');
  let user;
  try {
    const r = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.anon, Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error();
    user = await r.json();
  } catch {
    throw new HttpError(401, 'הכניסה פגה, היכנסו מחדש');
  }
  const rows = await call(cfg, `/rest/v1/app_users?select=role,active&id=eq.${user.id}`);
  if (!rows?.[0] || !rows[0].active || rows[0].role !== 'system_admin') throw new HttpError(403, 'הפעולה מותרת למנהלי מערכת בלבד');
  return user;
}

function validPassword(p) {
  return typeof p === 'string' && p.length >= 10 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
}
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

const actions = {
  async list(cfg) {
    const [authUsers, appUsers] = await Promise.all([
      call(cfg, '/auth/v1/admin/users?per_page=1000'),
      call(cfg, '/rest/v1/app_users?select=id,email,role,active,must_change_password,person_id,people(full_name)&order=email'),
    ]);
    const byId = new Map((authUsers.users || []).map((u) => [u.id, u]));
    return {
      users: appUsers.map((a) => ({
        id: a.id, email: a.email, role: a.role, active: a.active,
        must_change_password: a.must_change_password, person_id: a.person_id,
        person_name: a.people?.full_name ?? null,
        last_sign_in_at: byId.get(a.id)?.last_sign_in_at ?? null,
        providers: byId.get(a.id)?.app_metadata?.providers ?? [],
      })),
    };
  },

  async create(cfg, b) {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'כתובת אימייל לא תקינה');
    if (!ROLES.includes(b.role)) throw new HttpError(400, 'תפקיד לא תקין');
    if (!validPassword(b.password)) throw new HttpError(400, 'הסיסמה הזמנית לא עומדת בדרישות');
    let personId = null;
    if (b.employee_no) {
      const p = await call(cfg, `/rest/v1/people?select=id&employee_no=eq.${encodeURIComponent(b.employee_no)}`);
      if (!p[0]) throw new HttpError(400, `לא נמצא עובד עם מספר ${b.employee_no}`);
      personId = p[0].id;
    }
    let created;
    try {
      created = await call(cfg, '/auth/v1/admin/users', {
        method: 'POST',
        body: { email, password: b.password, email_confirm: true, app_metadata: { app_role: b.role } },
      });
    } catch (e) {
      if (/already/i.test(e.message)) throw new HttpError(409, 'כבר קיים משתמש עם האימייל הזה');
      throw e;
    }
    try {
      await call(cfg, '/rest/v1/app_users', {
        method: 'POST', prefer: 'return=minimal',
        body: { id: created.id, email, role: b.role, person_id: personId, must_change_password: true },
      });
    } catch (e) {
      // keep auth and app_users consistent
      await call(cfg, `/auth/v1/admin/users/${created.id}`, { method: 'DELETE' }).catch(() => undefined);
      if (/duplicate|unique/i.test(e.message)) throw new HttpError(409, 'העובד הזה כבר מקושר למשתמש אחר');
      throw e;
    }
    return { id: created.id };
  },

  async reset_password(cfg, b) {
    if (!isUuid(b.user_id)) throw new HttpError(400, 'משתמש לא תקין');
    if (!validPassword(b.password)) throw new HttpError(400, 'הסיסמה הזמנית לא עומדת בדרישות');
    await call(cfg, `/auth/v1/admin/users/${b.user_id}`, { method: 'PUT', body: { password: b.password } });
    await call(cfg, `/rest/v1/app_users?id=eq.${b.user_id}`, { method: 'PATCH', prefer: 'return=minimal', body: { must_change_password: true } });
    return { ok: true };
  },

  async set_role(cfg, b, caller) {
    if (!isUuid(b.user_id) || !ROLES.includes(b.role)) throw new HttpError(400, 'בקשה לא תקינה');
    if (b.user_id === caller.id) throw new HttpError(400, 'אי אפשר לשנות את התפקיד של עצמך');
    await call(cfg, `/rest/v1/app_users?id=eq.${b.user_id}`, { method: 'PATCH', prefer: 'return=minimal', body: { role: b.role } });
    await call(cfg, `/auth/v1/admin/users/${b.user_id}`, { method: 'PUT', body: { app_metadata: { app_role: b.role } } });
    return { ok: true };
  },

  async set_active(cfg, b, caller) {
    if (!isUuid(b.user_id) || typeof b.active !== 'boolean') throw new HttpError(400, 'בקשה לא תקינה');
    if (b.user_id === caller.id) throw new HttpError(400, 'אי אפשר להשבית את עצמך');
    // Ban in GoTrue too, so a disabled user cannot get a new session at all.
    await call(cfg, `/auth/v1/admin/users/${b.user_id}`, { method: 'PUT', body: { ban_duration: b.active ? 'none' : '876000h' } });
    await call(cfg, `/rest/v1/app_users?id=eq.${b.user_id}`, { method: 'PATCH', prefer: 'return=minimal', body: { active: b.active } });
    return { ok: true };
  },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  try {
    const cfg = config();
    const caller = await requireAdmin(cfg, req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fn = actions[body.action];
    if (!fn) throw new HttpError(400, 'פעולה לא מוכרת');
    return res.status(200).json(await fn(cfg, body, caller));
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'שגיאה' });
  }
}
