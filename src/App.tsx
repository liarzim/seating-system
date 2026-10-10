import { useEffect, useState } from 'react';

// Placeholder page until milestone 3. Shows whether the NAS gateway is reachable,
// using VITE_SUPABASE_URL when it is set in Vercel.
const API_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

type Status = 'unset' | 'checking' | 'ok' | 'down';

export default function App() {
  const [status, setStatus] = useState<Status>(API_URL ? 'checking' : 'unset');

  useEffect(() => {
    if (!API_URL) return;
    fetch(`${API_URL.replace(/\/+$/, '')}/auth/v1/health`)
      .then((r) => setStatus(r.ok ? 'ok' : 'down'))
      .catch(() => setStatus('down'));
  }, []);

  const label: Record<Status, string> = {
    unset: 'כתובת השרת עוד לא הוגדרה',
    checking: 'בודק חיבור לשרת...',
    ok: 'השרת מחובר',
    down: 'אין חיבור לשרת',
  };

  return (
    <main className="page">
      <h1>מערכת הושבה</h1>
      <p>המערכת בהקמה.</p>
      <p className={`status status-${status}`}>{label[status]}</p>
    </main>
  );
}
