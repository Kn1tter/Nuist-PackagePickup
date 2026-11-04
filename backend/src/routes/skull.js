import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { listWaitingRooms, stats } from '../lib/skullRooms.js';

const router = Router();

router.get('/rooms', auth, (_req, res) => {
  res.json({ rooms: listWaitingRooms(), stats: stats() });
});

export default router;
