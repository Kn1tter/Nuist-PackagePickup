import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import uploadRoutes from './routes/upload.js';
import forumRoutes from './routes/forum.js';
import resourceRoutes from './routes/resources.js';
import inboxRoutes from './routes/inbox.js';
import gamesRoutes from './routes/games.js';
import scheduleRoutes from './routes/schedule.js';
import videoRoutes from './routes/video.js';
import poolRoutes from './routes/pool.js';
import skullRoutes from './routes/skull.js';
import tankRoutes from './routes/tank.js';
import dinoRoutes from './routes/dino.js';
import curlingRoutes from './routes/curling.js';
import adminRoutes from './routes/admin.js';
import arcadeApiRoutes from './routes/arcade.js';
import hubRoutes from './routes/hub.js';
import changelogRoutes from './routes/changelog.js';
import chaoxingRoutes from './routes/chaoxing.js';
import { ready } from './db/index.js';
import { getJwtSecret } from './lib/jwt.js';
import { runChaoxingCron } from './lib/chaoxingJob.js';
import { attachPoolWs } from './lib/poolWs.js';
import { attachSkullWs } from './lib/skullWs.js';
import { attachTankWs } from './lib/tankWs.js';
import { attachDinoWs } from './lib/dinoWs.js';
import { attachCurlingWs } from './lib/curlingWs.js';

// Fail fast if production secret is missing/weak
getJwtSecret();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const origins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// `*` + credentials 会被浏览器拒绝；`*` 时回显请求 Origin
const corsOrigin = origins.includes('*')
  ? true
  : origins.length
    ? origins
    : undefined;

app.use(
  cors(
    corsOrigin !== undefined
      ? { origin: corsOrigin, credentials: true }
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
app.use('/api/forum', forumRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/pool', poolRoutes);
app.use('/api/skull', skullRoutes);
app.use('/api/tank', tankRoutes);
app.use('/api/dino', dinoRoutes);
app.use('/api/curling', curlingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/arcade', arcadeApiRoutes);
app.use('/api/hub', hubRoutes);
app.use('/api/changelog', changelogRoutes);
app.use('/api/chaoxing', chaoxingRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

await ready;

if (!process.env.VERCEL) {
  const server = http.createServer(app);
  const poolWss = attachPoolWs(server);
  const skullWss = attachSkullWs(server);
  const tankWss = attachTankWs(server);
  const dinoWss = attachDinoWs(server);
  const curlingWss = attachCurlingWs(server);
  // One upgrade router — multiple {server,path} WSS would 400 each other
  server.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname === '/api/pool/ws') {
      poolWss.handleUpgrade(req, socket, head, (ws) => {
        poolWss.emit('connection', ws, req);
      });
      return;
    }
    if (pathname === '/api/skull/ws') {
      skullWss.handleUpgrade(req, socket, head, (ws) => {
        skullWss.emit('connection', ws, req);
      });
      return;
    }
    if (pathname === '/api/tank/ws') {
      tankWss.handleUpgrade(req, socket, head, (ws) => {
        tankWss.emit('connection', ws, req);
      });
      return;
    }
    if (pathname === '/api/dino/ws') {
      dinoWss.handleUpgrade(req, socket, head, (ws) => {
        dinoWss.emit('connection', ws, req);
      });
      return;
    }
    if (pathname === '/api/curling/ws') {
      curlingWss.handleUpgrade(req, socket, head, (ws) => {
        curlingWss.emit('connection', ws, req);
      });
      return;
    }
    socket.destroy();
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NUIST Package Pickup API → http://0.0.0.0:${PORT}`);
  });

  // 本地/常驻进程：定时拉取学习通并推送（Vercel 用 vercel.json crons）
  const cronMs = Number(process.env.CHAOXING_CRON_MS || 6 * 3600_000);
  if (cronMs > 0 && process.env.CHAOXING_CRON_DISABLE !== '1') {
    const tick = async () => {
      try {
        const summary = await runChaoxingCron({ limit: 40 });
        console.log('[chaoxing cron]', summary);
      } catch (e) {
        console.error('[chaoxing cron]', e.message || e);
      }
    };
    setTimeout(tick, 45_000);
    setInterval(tick, cronMs);
  }
}

export default app;
