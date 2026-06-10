import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Shield, User, Users, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useEffect, useRef, useState } from 'react';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, token, clearAuth } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canAdmin = user?.roles?.includes('admin') || user?.roles?.includes('organizer');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    clearAuth();
    setIsUserMenuOpen(false);
    navigate('/');
  };

  const goTo = (path: string) => {
    setIsUserMenuOpen(false);
    setIsOpen(false);
    navigate(path);
  };

  const linkClass = 'text-zinc-300 hover:text-white transition';
  const mobileLinkClass = 'block text-zinc-300 hover:text-white transition py-2';

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-surface/70 text-white backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold tracking-wide">
            QUEST
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              IX
            </span>
          </Link>

          <div className="hidden items-center space-x-6 md:flex">
            <Link to="/games" className={linkClass}>
              Квесты
            </Link>
            {token && (
              <Link to="/my-appls" className={linkClass}>
                Мои заявки
              </Link>
            )}

            {!token ? (
              <>
                <Link to="/login" className={linkClass}>
                  Вход
                </Link>
                <Link to="/signup" className="btn-grad rounded-lg px-4 py-2 font-semibold">
                  Регистрация
                </Link>
              </>
            ) : (
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setIsUserMenuOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 transition hover:border-primary/40 hover:bg-white/10"
                >
                  <User size={18} className="text-violet-300" />
                  <span className="text-sm font-semibold">{user?.nickname}</span>
                  <ChevronDown size={16} className="text-zinc-400" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-white/10 bg-[#17111f] shadow-xl shadow-black/40">
                    <button
                      onClick={() => goTo('/profile')}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/10"
                    >
                      <User size={17} className="text-violet-300" />
                      Мой профиль
                    </button>
                    <button
                      onClick={() => goTo('/teams')}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/10"
                    >
                      <Users size={17} className="text-violet-300" />
                      Моя команда
                    </button>
                    {canAdmin && (
                      <button
                        onClick={() => goTo('/admin')}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/10"
                      >
                        <Shield size={17} className="text-violet-300" />
                        {user?.roles?.includes('admin') ? 'Админ' : 'Мои игры'}
                      </button>
                    )}
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-left text-sm text-rose-200 transition hover:bg-rose-500/10"
                    >
                      <LogOut size={17} />
                      Выход
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button onClick={() => setIsOpen((value) => !value)} className="md:hidden">
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isOpen && (
          <div className="space-y-1 pb-4 md:hidden">
            <Link to="/games" className={mobileLinkClass} onClick={() => setIsOpen(false)}>
              Квесты
            </Link>
            {token && (
              <>
                <Link to="/my-appls" className={mobileLinkClass} onClick={() => setIsOpen(false)}>
                  Мои заявки
                </Link>
                <button onClick={() => goTo('/profile')} className={`${mobileLinkClass} w-full text-left`}>
                  Мой профиль
                </button>
                <button onClick={() => goTo('/teams')} className={`${mobileLinkClass} w-full text-left`}>
                  Моя команда
                </button>
                {canAdmin && (
                  <button onClick={() => goTo('/admin')} className={`${mobileLinkClass} w-full text-left`}>
                    {user?.roles?.includes('admin') ? 'Админ' : 'Мои игры'}
                  </button>
                )}
              </>
            )}
            {!token ? (
              <>
                <Link to="/login" className={mobileLinkClass} onClick={() => setIsOpen(false)}>
                  Вход
                </Link>
                <Link
                  to="/signup"
                  className="block rounded-lg px-4 py-2 text-center font-semibold btn-grad"
                  onClick={() => setIsOpen(false)}
                >
                  Регистрация
                </Link>
              </>
            ) : (
              <button
                onClick={handleLogout}
                className="block w-full py-2 text-left text-zinc-300 transition hover:text-white"
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
