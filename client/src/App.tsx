import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import Home from './pages/Home';
import Send from './pages/Send';
import RequestMoney from './pages/RequestMoney';
import Requests from './pages/Requests';
import AddMoney from './pages/AddMoney';
import History from './pages/History';
import Settings from './pages/Settings';
import MyQr from './pages/MyQr';

// Charts and the camera scanner are big libraries, so these pages load only
// when opened.
const Insights = lazy(() => import('./pages/Insights'));
const ScanPay = lazy(() => import('./pages/ScanPay'));

const page = (el: ReactElement) => (
  <Suspense fallback={<p className="py-10 text-center text-slate-500">Loading…</p>}>{el}</Suspense>
);

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="send" element={<Send />} />
            <Route path="request" element={<RequestMoney />} />
            <Route path="requests" element={<Requests />} />
            <Route path="add-money" element={<AddMoney />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
            <Route path="insights" element={page(<Insights />)} />
            <Route path="qr" element={<MyQr />} />
            <Route path="scan" element={page(<ScanPay />)} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
