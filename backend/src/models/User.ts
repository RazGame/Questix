import mongoose from 'mongoose';
import { IUser } from '../types';
import { hashPassword } from '../utils/password';

const userSchema = new mongoose.Schema<IUser>(
  {
    firstName: {
      type: String,
      required: [true, 'Имя обязательно'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Фамилия обязательна'],
      trim: true,
    },
    nickname: {
      type: String,
      required: [true, 'Никнейм обязателен'],
      unique: true,
      trim: true,
    },
    username: {
      type: String,
      required: [true, 'Email обязателен'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'Город обязателен'],
    },
    phone: {
      type: String,
      required: [true, 'Телефон обязателен'],
    },
    hashed_pwd: {
      type: String,
      required: [true, 'Пароль обязателен'],
    },
    roles: {
      type: [String],
      default: ['user'],
      enum: ['user', 'admin'],
    },
    gameAppls: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameAppl',
      },
    ],
  },
  { timestamps: true }
);

// Хеширование пароля перед сохранением
userSchema.pre('save', async function (next) {
  if (!this.isModified('hashed_pwd')) {
    next();
    return;
  }

  try {
    const hashedPassword = await hashPassword(this.hashed_pwd);
    this.hashed_pwd = hashedPassword;
    next();
  } catch (error) {
    next(error as Error);
  }
});

export const User = mongoose.model<IUser>('User', userSchema);
