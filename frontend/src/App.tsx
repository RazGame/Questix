import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Games from './pages/Games';
import GameDetail from './pages/GameDetail';
import MyAppls from './pages/MyAppls';
import AdminPanel from './pages/AdminPanel';
import TaskManager from './pages/TaskManager';
import QuestGame from './pages/QuestGame';
import PrivateRoute from './components/PrivateRoute';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const token = useAuthStore((state) => state.token);

  return (
    <Router>
      <Navbar />
      <main className="min-h-[calc(100vh-4rem)] bg-gray-50">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={token ? <Games /> : <Login />} />
            <Route path="/signup" element={token ? <Games /> : <Signup />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/:id" element={<GameDetail />} />
            <Route
              path="/my-appls"
              element={<PrivateRoute component={MyAppls} />}
            />
            <Route
              path="/game/:gameId/play/:gameApplId"
              element={<PrivateRoute component={QuestGame} />}
            />
            <Route
              path="/admin"
              element={<PrivateRoute component={AdminPanel} role="admin" />}
            />
            <Route
              path="/admin/game/:gameId/tasks"
              element={<PrivateRoute component={TaskManager} role="admin" />}
            />
          </Routes>
        </ErrorBoundary>
      </main>
    </Router>
  );
}

export default App;
