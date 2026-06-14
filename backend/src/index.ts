import express, { Application } from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUiExpress from 'swagger-ui-express';
import { config } from './config/config';
import { connectDB } from './config/database';

import authRoutes from './routes/auth';
import gameRoutes from './routes/game';
import applRoutes from './routes/gameAppl';
import userRoutes from './routes/user';
import taskRoutes from './routes/task';
import progressRoutes from './routes/gameProgress';
import teamRoutes from './routes/team';
import musicRoutes from './routes/music';
import { MEDIA_DIR } from './controllers/music';
import { registerMusicSockets } from './sockets/music';
import { setIo } from './sockets/ioRef';

const app: Application = express();
const devOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const corsOrigin = config.corsOrigin || ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || devOriginPattern.test(origin)) {
    callback(null, true);
    return;
  }

  callback(null, false);
});

// Middleware
app.use(express.json());
app.use(cors({ origin: corsOrigin }));

// Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Questix API',
      version: '1.0.0',
      description: 'Modern API для платформы организации квестов',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUiExpress.serve, swaggerUiExpress.setup(swaggerSpec));

// Routes
app.use('/auth', authRoutes);
app.use('/games', gameRoutes);
app.use('/appls', applRoutes);
app.use('/users', userRoutes);
app.use('/tasks', taskRoutes);
app.use('/progress', progressRoutes);
app.use('/teams', teamRoutes);
app.use('/music', musicRoutes);

// Статика аудиофайлов «Угадай мелодию»
app.use('/media', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
}, express.static(MEDIA_DIR));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// HTTP-сервер с Socket.IO для realtime «Угадай мелодию»
const httpServer = http.createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: corsOrigin },
  // websocket-only: убираем polling-апгрейд ради минимальных задержек баззера
  transports: ['websocket'],
});
registerMusicSockets(io);
setIo(io);

// io доступен другим модулям (фоновая загрузка песен шлёт song-updated)
export { io };

// Connect DB and Start Server
const startServer = async () => {
  try {
    await connectDB();
    httpServer.listen(config.port, '0.0.0.0', () => {
      console.log(`🚀 Backend запущен на http://localhost:${config.port}`);
      console.log(`📚 Swagger UI: http://localhost:${config.port}/api-docs`);
      console.log(`🎵 Socket.IO «Угадай мелодию» активен`);
    });
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
};

startServer();

export default app;
