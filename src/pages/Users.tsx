import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminRepo, generatePassword } from '../data/repo';
import { ROLE_LABEL, type AppRole, type ManagedUser } from '../data/types';
import { useAuth } from '../auth/AuthProvider';

const ROLES: AppRole[] = ['employee', 'manager', 'system_admin'];

// Shown once, after create or reset. The password is not stored anywhere readable.
function PasswordOnce({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="once" role="status">
      <p>הסיסמה הזמנית של <span dir="ltr">{email}</span>. היא מוצגת עכשיו בלבד, והמשתמש יתבקש להחליף אותה בכניסה הראשונה.</p>
      <div className="once-row">
        <code dir="ltr" className="once-pass">{password}</code>
        <button className="btn" onClick={async () => { await navigator.clipboard.writeText(password); setCopied(true); }}>
          {copied ? 'הועתק' : 'העתקה'}
        </button>
        <button className="link-btn" onClick={onClose}>סגירה</button>
      </div>
    </div>
  );
}

export default function Users() {
  const { appUser, isSystemAdmin } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('manager');
  const [employeeNo, setEmployeeNo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => adminRepo.list().then(setUsers).catch((e) => setError(e.message)), []);
  useEffect(() => { if (isSystemAdmin) load(); }, [isSystemAdmin, load]);

  if (!isSystemAdmin) return <div className="notice">המסך הזה פתוח למנהלי מערכת בלבד.</div>;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const password = generatePassword();
    setBusy(true);
    await run(async () => {
      await adminRepo.create(email.trim(), password, role, employeeNo.trim() || undefined);
      setShown({ email: email.trim(), password });
      setEmail('');
      setEmployeeNo('');
    });
    setBusy(false);
  }

  return (
    <>
      <h1>משתמשים</h1>
      <p className="lead">רק מי שמופיע כאן יכול להיכנס, עם Google או עם סיסמה. ההרשמה העצמית סגורה.</p>

      {error && <div className="notice" role="alert">{error}</div>}
      {shown && <PasswordOnce {...shown} onClose={() => setShown(null)} />}

      <form className="form form-inline" onSubmit={onCreate} aria-label="משתמש חדש">
        <label>
          אימייל
          <input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          תפקיד
          <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label>
          <span>מספר עובד <span className="muted">(רשות)</span></span>
          <input dir="ltr" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'יוצר...' : 'הוספת משתמש'}</button>
      </form>

      {users === null ? <p className="muted">טוען...</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>אימייל</th><th className="nowrap">אדם מקושר</th><th>תפקיד</th><th>כניסה אחרונה</th><th>מצב</th><th><span className="sr-only">פעולות</span></th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === appUser?.id;
                return (
                  <tr key={u.id} className={u.active ? '' : 'is-off'}>
                    <td dir="ltr" className="cell-email">{u.email}</td>
                    <td className="nowrap">{u.person_name ?? <span className="muted">לא מקושר</span>}</td>
                    <td>
                      <select aria-label={`תפקיד של ${u.email}`} value={u.role} disabled={self}
                        onChange={(e) => run(() => adminRepo.setRole(u.id, e.target.value as AppRole))}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : <span className="muted">טרם נכנס</span>}</td>
                    <td>{!u.active ? 'מושבת' : u.must_change_password ? 'ממתין לסיסמה אישית' : 'פעיל'}</td>
                    <td>
                      <div className="cell-actions">
                      <button className="link-btn" onClick={() => {
                        const p = generatePassword();
                        run(async () => { await adminRepo.resetPassword(u.id, p); setShown({ email: u.email, password: p }); });
                      }}>סיסמה זמנית חדשה</button>
                      {!self && (
                        <button className="link-btn" onClick={() => run(() => adminRepo.setActive(u.id, !u.active))}>
                          {u.active ? 'השבתה' : 'הפעלה'}
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
