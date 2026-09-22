import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import uploadRoutes from './routes/upload.js';
import { ready } from './db/index.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const origins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors(
    origins.length
      ? { origin: origins, credentials: true }
      : undefined
  )
);
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'nuist-packagepickup',
    db: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

await ready;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NUIST Package Pickup API → http://0.0.0.0:${PORT}`);
});
