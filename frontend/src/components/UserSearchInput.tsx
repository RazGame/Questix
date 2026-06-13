import { useEffect, useRef, useState } from 'react';
import { Search, User } from 'lucide-react';
import { userService, UserSearchResult } from '../services/users';

interface UserSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (user: UserSearchResult) => void;
  placeholder?: string;
  /** ID пользователей, которых не нужно предлагать (уже в команде, сам капитан и т.п.) */
  excludeIds?: string[];
  /** Никнеймы, которые не нужно предлагать (уже выбраны в форме) */
  excludeNicknames?: string[];
}

export default function UserSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Никнейм пользователя',
  excludeIds = [],
  excludeNicknames = [],
}: UserSearchInputProps) {
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Не предлагаем тех, кого добавить нельзя или кто уже выбран
  const visibleResults = results.filter(
    (user) =>
      !excludeIds.includes(user._id) && !excludeNicknames.includes(user.nickname)
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const query = value.trim();

    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setIsLoading(true);
        const data = await userService.search(query);
        setResults(data);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 220);

    return () => clearTimeout(timeout);
  }, [value]);

  const handleSelect = (user: UserSearchResult) => {
    onChange(user.nickname);
    onSelect?.(user);
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={17} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className="input-dark pl-9"
      />

      {isOpen && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#17111f] shadow-xl shadow-black/40">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-zinc-400">Поиск...</div>
          )}

          {!isLoading && visibleResults.length === 0 && (
            <div className="px-4 py-3 text-sm text-zinc-400">Пользователи не найдены</div>
          )}

          {!isLoading &&
            visibleResults.map((user) => (
              <button
                key={user._id}
                type="button"
                onClick={() => handleSelect(user)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/10"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-violet-200">
                  <User size={17} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-zinc-100">@{user.nickname}</div>
                  <div className="truncate text-sm text-zinc-400">
                    {user.firstName} {user.lastName}
                    {user.city ? `, ${user.city}` : ''}
                  </div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
