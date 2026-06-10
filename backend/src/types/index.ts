import { Types } from 'mongoose';

export interface IUser {
  _id?: string;
  firstName: string;
  lastName: string;
  nickname: string;
  username: string; // email
  city: string;
  phone: string;
  password?: string;
  hashed_pwd: string;
  roles: string[];
  gameAppls: string[]; // IDs квестовых заявок
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGame {
  _id?: string;
  title: string;
  city: string;
  dateofstart: Date;
  dateofend: Date;
  deposit: string;
  prize: string;
  description: string;
  published?: boolean; // Опубликованы ли результаты игры
  gameAppls: string[]; // IDs заявок
  createdBy?: string; // ID создателя игры (организатор/админ)
  organizers?: Types.ObjectId[]; // Соорганизаторы: могут править игру наравне с создателем
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGameAppl {
  _id?: string;
  userId: Types.ObjectId;
  gameId: Types.ObjectId;
  team?: Types.ObjectId; // Ссылка на Team
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  teamName?: string;
  teamMembers?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITeam {
  _id?: string;
  name: string;
  captain: Types.ObjectId; // ID капитана (User)
  members: Types.ObjectId[]; // IDs участников (Users)
  gameAppl?: Types.ObjectId; // Ссылка на GameAppl (заявка команды)
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITeamLog {
  _id?: string;
  team: Types.ObjectId; // ID Team
  gameAppl: Types.ObjectId; // ID GameAppl
  game: Types.ObjectId; // ID Game
  user: Types.ObjectId; // ID пользователя, совершившего действие
  task: Types.ObjectId; // ID Task
  action: 'game_started' | 'task_answered' | 'task_correct' | 'task_incorrect' | 'task_passed' | 'game_finished' | 'game_abandoned';
  answer?: string; // Отправленный ответ
  isCorrect?: boolean; // Правильный ли ответ
  timestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface JWTPayload {
  id: string;
  username: string;
  roles: string[];
}
