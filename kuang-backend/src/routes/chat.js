import express from 'express';
import { analyzeTrade } from '../utils/tradeLogic.js';
import { generateProverb } from '../utils/proverbLogic.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message, lang = 'en' } = req.body;

    console.log('💬 Incoming trade + proverb request:', { message, lang });

    if (!message) {
      return res.status(400).json({ error: 'Missing message input' });
    }

    // Run trade analysis
    const result = await analyzeTrade(message);
    if (!result || typeof result !== 'object' || !result.summary || !result.players) {
      console.warn('⚠️ Invalid trade result:', result);
      return res.status(500).json({ error: 'Trade analysis failed' });
    }

    // Generate proverb
    const proverbText = await generateProverb(message);
    const proverb = {
      en: proverbText,
      zh: `古语有云: ${proverbText}`,
    };

    const reply = lang === 'zh'
      ? `交易分析结果: ${result.summary}`
      : result.summary;

    res.json({ reply, proverb, players: result.players });
  } catch (error) {
    console.error('💥 Error in chat route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
