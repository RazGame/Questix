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
import Profile from './pages/Profile';
import { TeamManager } from './pages/TeamManager';
import { GameStatisticsPage } from './pages/GameResults';
import MusicAdmin from './pages/MusicAdmin';
import MusicScreen from './pages/MusicScreen';
import MusicPlay from './pages/MusicPlay';
import PrivateRoute from './components/PrivateRoute';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const token = useAuthStore((state) => state.token);

  return (
    <Router>
      <div className="flex min-h-[100dvh] flex-col">
        <Navbar />
        <main className="flex-1 overflow-x-hidden">
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
                path="/profile"
                element={<PrivateRoute component={Profile} />}
              />
              <Route
                path="/profile/:userId"
                element={<PrivateRoute component={Profile} />}
              />
              <Route
                path="/game/:gameId/play/:gameApplId"
                element={<PrivateRoute component={QuestGame} />}
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
                path="/games/:gameId/results"
                element={<PrivateRoute component={GameStatisticsPage} />}
              />
              <Route
                path="/admin"
                element={<PrivateRoute component={AdminPanel} roles={['admin', 'organizer']} />}
              />
              <Route
                path="/admin/game/:gameId/tasks"
                element={<PrivateRoute component={TaskManager} roles={['admin', 'organizer']} />}
              />
              <Route
                path="/admin/music"
                element={<PrivateRoute component={MusicAdmin} roles={['admin', 'organizer']} />}
              />
              {/* «Угадай мелодию»: экран-проектор и телефоны — публичные, без регистрации */}
              <Route path="/m/screen/:gameId" element={<MusicScreen />} />
              <Route path="/m/play" element={<MusicPlay />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </Router>
  );
}

export default App;
