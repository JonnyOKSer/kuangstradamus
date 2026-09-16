import express from 'express';
import { analyzeTrade } from '../utils/tradeLogic.js';
import { pickProverb } from '../utils/proverbLogic.js';
import { sendError } from './errors.js';

const router = express.Router();

// POST /api/chat  { message, lang?: 'en'|'zh', scoring?: 'ppr'|'half_ppr'|'std', leagueId? }
router.post('/', async (req, res) => {
  try {
    const { message, lang = 'en', scoring, leagueId } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing message input' });
    }
    const result = await analyzeTrade({ message }, { scoring, leagueId });
    const proverb = pickProverb(result.category);
    const reply = lang === 'zh' ? result.summaryZh : result.summary;
    res.json({
      reply,
      proverb: { en: proverb.en, zh: proverb.zh, category: proverb.category },
      players: result.players,
      analysis: result,
    });
  } catch (err) {
    sendError(res, err, 'chat');
  }
});

export default router;
