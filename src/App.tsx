import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { isConfigured } from './lib/supabase';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Users from './pages/Users';
import ComingSoon from './pages/ComingSoon';
import Org from './pages/Org';
import DataPage from './pages/DataPage';

// Anyone holding a temporary password goes to the change screen first.
function Gate({ children }: { children: ReactNode }) {
  const { ready, mustChangePassword } = useAuth();
  const { pathname } = useLocation();
  if (!ready) return <p className="muted boot">טוען...</p>;
  if (mustChangePassword && pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

export default function App() {
  if (!isConfigured) {
    return <div className="notice boot">כתובת השרת לא הוגדרה (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).</div>;
  }
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="login" element={<Login />} />
              <Route path="change-password" element={<ChangePassword />} />
              <Route path="users" element={<Users />} />
              <Route path="map" element={<ComingSoon />} />
              <Route path="free" element={<ComingSoon />} />
              <Route path="reports" element={<ComingSoon />} />
              <Route path="org" element={<Org />} />
              <Route path="data" element={<DataPage />} />
              <Route path="settings" element={<ComingSoon />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Gate>
      </BrowserRouter>
    </AuthProvider>
  );
}
