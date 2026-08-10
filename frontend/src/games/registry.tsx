import { ReactElement } from 'react';
import { Route } from 'react-router-dom';
import PrivateRoute from '../core/components/PrivateRoute';

import Games from './quest/pages/Games';
import GameDetail from './quest/pages/GameDetail';
import MyAppls from './quest/pages/MyAppls';
import QuestGame from './quest/pages/QuestGame';
import TaskManager from './quest/pages/TaskManager';
import { GameStatisticsPage } from './quest/pages/GameResults';

import MusicAdmin from './guess-song/pages/MusicAdmin';
import MusicHost from './guess-song/pages/MusicHost';
import MusicScreen from './guess-song/pages/MusicScreen';
import MusicPlay from './guess-song/pages/MusicPlay';
import HapticsDebug from './guess-song/pages/HapticsDebug';

// Реестр игровых модулей фронта (ROADMAP этап 2).
// Новая игра = папка в games/ + запись здесь: роуты попадают в App,
// вкладка редактора — в AdminPanel, вход по коду — через playerPath.
export interface GameModuleFrontend {
  kind: string; // совпадает с Game.kind на бэке
  title: string; // название вкладки в админке
  routes: ReactElement[]; // <Route> элементы модуля
  AdminEditor?: React.FC<{ isTab?: boolean }>; // вкладка в AdminPanel
  adminTabId?: string; // id вкладки в ?tab= (историческое 'music')
  playerPath?: (code: string) => string; // страница игрока по коду
}

const questModule: GameModuleFrontend = {
  kind: 'quest',
  title: 'Квесты',
  routes: [
    <Route key="q-catalog" path="/games" element={<Games />} />,
    <Route key="q-detail" path="/games/:id" element={<GameDetail />} />,
    <Route key="q-appls" path="/my-appls" element={<PrivateRoute component={MyAppls} />} />,
    <Route
      key="q-play"
      path="/game/:gameId/play/:gameApplId"
      element={<PrivateRoute component={QuestGame} />}
    />,
    <Route
      key="q-results"
      path="/games/:gameId/results"
      element={<PrivateRoute component={GameStatisticsPage} />}
    />,
    <Route
      key="q-tasks"
      path="/admin/game/:gameId/tasks"
      element={<PrivateRoute component={TaskManager} roles={['admin', 'organizer']} />}
    />,
  ],
  // Редактор квестов пока живёт внутри AdminPanel (вкладка «Квесты») —
  // вынос в модуль отложен до session-kernel (этап 7).
};

const guessSongModule: GameModuleFrontend = {
  kind: 'guess_song',
  title: 'Музыкальные игры',
  routes: [
    <Route
      key="m-admin"
      path="/admin/music"
      element={<PrivateRoute component={MusicAdmin} roles={['admin', 'organizer']} />}
    />,
    <Route
      key="m-host"
      path="/admin/music/host/:gameId"
      element={<PrivateRoute component={MusicHost} roles={['admin', 'organizer']} />}
    />,
    // Экран-проектор и телефоны — публичные, без регистрации
    <Route key="m-screen" path="/m/screen/:gameId" element={<MusicScreen />} />,
    <Route key="m-play" path="/m/play" element={<MusicPlay />} />,
    // Диагностика вибрации: iOS проверяется только на живом устройстве
    <Route key="m-haptics" path="/m/haptics" element={<HapticsDebug />} />,
  ],
  AdminEditor: MusicAdmin,
  adminTabId: 'music',
  playerPath: (code: string) => `/m/play?code=${code}`,
};

export const gameModules: GameModuleFrontend[] = [questModule, guessSongModule];
