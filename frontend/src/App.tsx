import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './core/store/authStore';
import Navbar from './core/components/Navbar';
import Home from './core/pages/Home';
import Login from './core/pages/Login';
import Signup from './core/pages/Signup';
import Profile from './core/pages/Profile';
import AdminPanel from './core/pages/AdminPanel';
import JoinByCode from './core/pages/JoinByCode';
import { TeamManager } from './core/pages/TeamManager';
import PrivateRoute from './core/components/PrivateRoute';
import ErrorBoundary from './core/components/ErrorBoundary';
import { usePlatformInfo, kindAvailable } from './core/services/platform';
import { gameModules } from './games/registry';

function App() {
  const token = useAuthStore((state) => state.token);
  // Этап 6: на станции backend поднимает только offline-модули —
  // фронт регистрирует роуты только доступных видов игр.
  const platform = usePlatformInfo();
  const activeModules = gameModules.filter((m) => kindAvailable(platform, m.kind));

  return (
    <Router>
      <div className="flex min-h-[100dvh] flex-col">
        <Navbar />
        <main className="flex-1 overflow-x-hidden">
          <ErrorBoundary>
            <Routes>
              {/* Core: аккаунты, команды, админка, вход по коду */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={token ? <Navigate to="/games" replace /> : <Login />} />
              <Route path="/signup" element={token ? <Navigate to="/games" replace /> : <Signup />} />
              <Route path="/join" element={<JoinByCode />} />
              <Route path="/join/:code" element={<JoinByCode />} />
              <Route
                path="/profile"
                element={<PrivateRoute component={Profile} />}
              />
              <Route
                path="/profile/:userId"
                element={<PrivateRoute component={Profile} />}
              />
              <Route
                path="/teams"
                element={<PrivateRoute component={TeamManager} />}
              />
              <Route
                path="/teams/:teamId"
                element={<PrivateRoute component={TeamManager} />}
              />
              <Route
                path="/admin"
                element={<PrivateRoute component={AdminPanel} roles={['admin', 'organizer']} />}
              />
              {/* Роуты игровых модулей из реестра (доступных в текущем режиме) */}
              {activeModules.flatMap((m) => m.routes)}
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </Router>
  );
}

export default App;
