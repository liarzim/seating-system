import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { repo } from '../data/repo';
import { useAuth } from '../auth/AuthProvider';

export function passwordProblem(p: string): string | null {
  if (p.length < 10) return 'לפחות 10 תווים.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'צריך לשלב אותיות באנגלית וספרות.';
  return null;
}

export default function ChangePassword() {
  const { session, mustChangePassword, refresh } = useAuth();
  const navigate = useNavigate();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Navigate to="/login" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(p1);
    if (problem) return setError(problem);
    if (p1 !== p2) return setError('שתי הסיסמאות לא זהות.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: p1 });
    if (err) {
      setBusy(false);
      return setError(/same/i.test(err.message) ? 'הסיסמה החדשה חייבת להיות שונה מהזמנית.' : err.message);
    }
    try {
      await repo.completePasswordChange();
      await refresh();
      navigate('/', { replace: true });
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <h1>{mustChangePassword ? 'קביעת סיסמה אישית' : 'החלפת סיסמה'}</h1>
      {mustChangePassword && <p className="lead">נכנסתם עם סיסמה זמנית. כדי להמשיך, קבעו סיסמה משלכם.</p>}
      {error && <div className="notice" role="alert">{error}</div>}
      <form onSubmit={onSubmit} className="form">
        <label>
          סיסמה חדשה
          <input type="password" dir="ltr" autoComplete="new-password" required value={p1} onChange={(e) => setP1(e.target.value)} />
        </label>
        <label>
          שוב, לאימות
          <input type="password" dir="ltr" autoComplete="new-password" required value={p2} onChange={(e) => setP2(e.target.value)} />
        </label>
        <p className="hint">לפחות 10 תווים, עם אותיות באנגלית וספרות.</p>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'שומר...' : 'שמירת הסיסמה'}</button>
      </form>
    </section>
  );
}
