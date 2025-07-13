import express from 'express';
import { analyzeTrade } from '../utils/tradeLogic.js'; // still used
import { generateProverb } from '../utils/proverbLogic.js'; // new logic file

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message, lang, mode = 'trade' } = req.body;

    console.log(`💬 Incoming ${mode} request:`, { message, lang });

    if (!message) {
      return res.status(400).json({ error: 'Missing message input' });
    }

    let result;

    if (mode === 'proverb') {
      result = await generateProverb(message);
    } else {
      result = await analyzeTrade(message);
    }

    if (!result || typeof result !== 'string') {
      console.warn('⚠️ No valid result:', result);
      return res.status(500).json({ error: `${mode} generation failed` });
    }

    const reply = lang === 'zh'
      ? mode === 'proverb'
        ? `古语有云: ${result}`
        : `交易分析结果: ${result}`
      : result;

    console.log('🧠 Final reply:', reply);

    res.json({ reply });
  } catch (error) {
    console.error('💥 Error in chat route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
