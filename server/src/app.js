import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import transferRoutes from './routes/transfers.js';
import requestRoutes from './routes/requests.js';
import transactionRoutes from './routes/transactions.js';
import insightRoutes from './routes/insights.js';
import webhookRoutes from './routes/webhooks.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      exposedHeaders: ['Idempotent-Replayed', 'Content-Disposition'],
    }),
  );
  // Webhooks need the raw bytes to check the signature, so they are mounted
  // before the JSON parser.
  app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '100kb' }), webhookRoutes);
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/wallet', requireAuth, walletRoutes);
  app.use('/api/transfers', requireAuth, transferRoutes);
  app.use('/api/requests', requireAuth, requestRoutes);
  app.use('/api/transactions', requireAuth, transactionRoutes);
  app.use('/api/insights', requireAuth, insightRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
