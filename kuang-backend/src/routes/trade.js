// trade.js
import express from 'express';
import { analyzeTrade } from '../utils/tradeLogic.js';

const router = express.Router();

router.post('/trade', async (req, res) => {
  try {
    const { teamA, teamB } = req.body;
    const result = await analyzeTrade(teamA, teamB);
    res.json(result);
  } catch (err) {
    console.error('💥 Trade evaluation error:', err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
