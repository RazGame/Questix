import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User, Menu } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useState } from 'react';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, token, clearAuth } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  return (
    <nav className="bg-primary text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="text-2xl font-bold">
            ⚔️ Questix
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex space-x-4 items-center">
            <Link to="/games" className="hover:text-gray-200 transition">
              Квесты
            </Link>
            {token && (
              <>
                <Link to="/my-appls" className="hover:text-gray-200 transition">
                  Мои заявки
                </Link>
                {user?.roles?.includes('admin') && (
                  <Link to="/admin" className="hover:text-gray-200 transition">
                    Админ
                  </Link>
                )}
              </>
            )}

            {!token ? (
              <>
                <Link to="/login" className="hover:text-gray-200 transition">
                  Вход
                </Link>
                <Link
                  to="/signup"
                  className="bg-secondary px-4 py-2 rounded hover:bg-opacity-80 transition"
                >
                  Регистрация
                </Link>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <User size={20} />
                  <span>{user?.nickname}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 hover:text-gray-200 transition"
                >
                  <LogOut size={20} />
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden"
          >
            <Menu size={24} />
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <Link
              to="/games"
              className="block hover:text-gray-200 transition py-2"
            >
              Квесты
            </Link>
            {token && (
              <>
                <Link
                  to="/my-appls"
                  className="block hover:text-gray-200 transition py-2"
                >
                  Мои заявки
                </Link>
                {user?.roles?.includes('admin') && (
                  <Link
                    to="/admin"
                    className="block hover:text-gray-200 transition py-2"
                  >
                    Админ
                  </Link>
                )}
              </>
            )}
            {!token ? (
              <>
                <Link
                  to="/login"
                  className="block hover:text-gray-200 transition py-2"
                >
                  Вход
                </Link>
                <Link
                  to="/signup"
                  className="block bg-secondary px-4 py-2 rounded hover:bg-opacity-80 transition"
                >
                  Регистрация
                </Link>
              </>
            ) : (
              <button
                onClick={handleLogout}
                className="block w-full text-left hover:text-gray-200 transition py-2"
              >
                Выход
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
