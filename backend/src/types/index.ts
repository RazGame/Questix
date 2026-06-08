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
  gameAppls: string[]; // IDs заявок
  createdBy?: string; // ID администратора
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGameAppl {
  _id?: string;
  userId: Types.ObjectId;
  gameId: Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  teamName?: string;
  teamMembers?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface JWTPayload {
  id: string;
  username: string;
  roles: string[];
}
