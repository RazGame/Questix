import express, { Application } from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUiExpress from 'swagger-ui-express';
import { config } from './core/config/config';
import { connectDB } from './core/config/database';
import { MEDIA_DIR } from './core/services/media';
import { modules } from './core/moduleRegistry';

// Core-роуты (аккаунты, команды, вход по коду) — не зависят от игровых модулей.
import authRoutes from './core/routes/auth';
import userRoutes from './core/routes/user';
import teamRoutes from './core/routes/team';
import joinRoutes from './core/routes/join';

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
  apis: ['./src/core/routes/*.ts', './src/modules/*/routes/*.ts'],
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUiExpress.serve, swaggerUiExpress.setup(swaggerSpec));

// Core-роуты
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/teams', teamRoutes);
app.use('/join', joinRoutes);

// Игровые модули из реестра: у каждого свой mountPath
// (quest монтируется в '/' и держит свои исторические /games,/appls,/tasks,/progress).
for (const gameModule of modules) {
  app.use(gameModule.mountPath, gameModule.router);
}

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

// HTTP-сервер с Socket.IO; реалтайм регистрируют сами модули
const httpServer = http.createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: corsOrigin },
  // websocket-only: убираем polling-апгрейд ради минимальных задержек баззера
  transports: ['websocket'],
  pingInterval: 2500,
  pingTimeout: 3000,
});
for (const gameModule of modules) {
  gameModule.registerSockets?.(io);
}

export { io };

// Connect DB and Start Server
const startServer = async () => {
  try {
    await connectDB();
    httpServer.listen(config.port, '0.0.0.0', () => {
      console.log(`🚀 Backend запущен на http://localhost:${config.port}`);
      console.log(`📚 Swagger UI: http://localhost:${config.port}/api-docs`);
      console.log(`🧩 Модули: ${modules.map((m) => m.kind).join(', ')}`);
    });
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
};

startServer();

export default app;
