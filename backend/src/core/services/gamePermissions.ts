// Единая проверка прав модерации игры:
// администратор модерирует все игры,
// организатор - игры, которые создал, и игры, куда добавлен соорганизатором.
interface GameLike {
  createdBy?: any;
  organizers?: any[];
}

interface UserLike {
  id?: string;
  roles?: string[];
}

// Поля могут быть как ObjectId, так и populated-документами
const toId = (value: any): string => String(value?._id ?? value);

export const isGameModerator = (game: GameLike, user: UserLike): boolean => {
  const roles = user?.roles || [];

  if (roles.includes('admin')) {
    return true;
  }

  if (!user?.id) {
    return false;
  }

  const moderatorIds = [game.createdBy, ...(game.organizers || [])]
    .filter(Boolean)
    .map(toId);

  return moderatorIds.includes(String(user.id));
};

// Управлять списком соорганизаторов может админ или создатель игры
export const canManageOrganizers = (game: GameLike, user: UserLike): boolean => {
  const roles = user?.roles || [];

  if (roles.includes('admin')) {
    return true;
  }

  return !!user?.id && !!game.createdBy && toId(game.createdBy) === String(user.id);
};

// Этап 3: может ли пользователь СОЗДАВАТЬ игры данного типа.
// Админ — любые; организатор — типы из organizerOf ('*' — все).
// Пустой organizerOf = без ограничений: легаси-организаторы и бутстрап
// через mongosh не должны терять доступ. Ограничение включается явным
// назначением списка типов в админке.
export const canCreateGame = (
  user: UserLike & { organizerOf?: string[] },
  kind: string
): boolean => {
  const roles = user?.roles || [];
  if (roles.includes('admin')) return true;
  if (!roles.includes('organizer')) return false;
  const kinds = user?.organizerOf || [];
  if (kinds.length === 0) return true;
  return kinds.some((k) => k === '*' || k === kind);
};
