import express, { Application } from 'express';
import cors from 'cors';
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Connect DB and Start Server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(config.port, () => {
      console.log(`🚀 Backend запущен на http://localhost:${config.port}`);
      console.log(`📚 Swagger UI: http://localhost:${config.port}/api-docs`);
    });
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
};

startServer();

export default app;
