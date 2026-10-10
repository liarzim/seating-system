import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { settingOn, useAuth } from '../auth/AuthProvider';
import { ROLE_LABEL } from '../data/types';

interface NavItem {
  to: string;
  label: string;
  ready: boolean; // false = screen comes in a later milestone
  who: 'all' | 'manager' | 'admin';
}

export const NAV: NavItem[] = [
  { to: '/', label: 'היום', ready: true, who: 'all' },
  { to: '/map', label: 'מפה', ready: false, who: 'all' },
  { to: '/free', label: 'פנויים', ready: false, who: 'all' },
  { to: '/reports', label: 'דוחות', ready: false, who: 'all' },
  { to: '/org', label: 'מבנה ארגוני', ready: false, who: 'manager' },
  { to: '/data', label: 'נתונים', ready: false, who: 'manager' },
  { to: '/users', label: 'משתמשים', ready: true, who: 'admin' },
  { to: '/settings', label: 'הגדרות', ready: false, who: 'admin' },
];

export default function Layout() {
  const { session, appUser, isManager, isSystemAdmin, settings, signOut } = useAuth();
  const navigate = useNavigate();
  const showSoon = settingOn(settings, 'show_coming_soon');
  const orgName = typeof settings.org_name === 'string' ? settings.org_name : 'מערכת הושבה';

  const items = NAV.filter((n) =>
    (n.who === 'all' || (n.who === 'manager' && isManager) || (n.who === 'admin' && isSystemAdmin)) &&
    (n.ready || showSoon));

  return (
    <div className="shell">
      <a className="skip" href="#main">דלג לתוכן</a>
      <header className="bar">
        <div className="brand">{orgName}</div>
        <nav aria-label="ניווט ראשי">
          <ul className="nav">
            {items.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}${n.ready ? '' : ' is-soon'}`}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="who">
          {session && appUser ? (
            <>
              <span className="who-name" title={appUser.email}>{ROLE_LABEL[appUser.role]}</span>
              <button className="link-btn" onClick={async () => { await signOut(); navigate('/'); }}>יציאה</button>
            </>
          ) : (
            <NavLink className="link-btn" to="/login">כניסה</NavLink>
          )}
        </div>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
    </div>
  );
}
