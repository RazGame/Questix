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
