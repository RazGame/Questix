import bcryptjs from 'bcryptjs';
import { config } from '../config/config';

export const hashPassword = async (password: string): Promise<string> => {
  return bcryptjs.hash(password, config.bcryptRounds);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcryptjs.compare(password, hashedPassword);
};
