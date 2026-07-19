import mongoose from 'mongoose';
import { config } from './config';

// Миграции при старте — идемпотентные updateMany, без отдельного тула.
const runMigrations = async (): Promise<void> => {
  // Этап 3: организаторы, созданные до появления organizerOf, могут всё.
  const res = await mongoose.connection
    .collection('users')
    .updateMany(
      { roles: 'organizer', organizerOf: { $exists: false } },
      { $set: { organizerOf: ['*'] } }
    );
  if (res.modifiedCount > 0) {
    console.log(`🔧 Миграция organizerOf: обновлено ${res.modifiedCount} организаторов → ['*']`);
  }
};

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('✅ MongoDB подключена успешно');
    await runMigrations();
  } catch (error) {
    console.error('❌ Ошибка подключения к MongoDB:', error);
    process.exit(1);
  }
};
