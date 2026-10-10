import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// GoTrue sends errors back in the URL after a Google round trip.
function errorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const desc = params.get('error_description');
  if (!desc) return null;
  if (/signups? not allowed/i.test(desc)) return 'חשבון Google הזה לא רשום במערכת. פנו למנהל המערכת כדי שיפתח לכם משתמש.';
  return `ההתחברות עם Google נכשלה: ${desc}`;
}

export default function Login() {
  const { session, appUser, notRegistered, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(errorFromUrl);

  useEffect(() => {
    if (error && window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, [error]);

  if (session && appUser) return <Navigate to="/" replace />;

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(/invalid/i.test(err.message) ? 'האימייל או הסיסמה שגויים.' : err.message);
  }

  async function onGoogle() {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (err) setError(err.message);
  }

  return (
    <section className="narrow">
      <h1>כניסה</h1>
      <p className="lead">צפייה במפה ובמקומות הפנויים פתוחה לכולם. הכניסה נדרשת לעריכה ולניהול.</p>

      {notRegistered && (
        <div className="notice" role="alert">
          <p>החשבון שאיתו נכנסתם לא רשום במערכת. פנו למנהל המערכת כדי שיפתח לכם משתמש.</p>
          <button className="link-btn" onClick={signOut}>יציאה מהחשבון</button>
        </div>
      )}
      {error && <div className="notice" role="alert">{error}</div>}

      <button type="button" className="btn btn-google" onClick={onGoogle}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        כניסה עם Google
      </button>

      <div className="or"><span>או עם סיסמה</span></div>

      <form onSubmit={onPassword} className="form">
        <label>
          אימייל
          <input type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          סיסמה
          <input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'נכנס...' : 'כניסה'}</button>
      </form>
      <p className="hint">שכחתם סיסמה? מנהל המערכת יכול לקבוע לכם סיסמה זמנית חדשה.</p>
    </section>
  );
}
