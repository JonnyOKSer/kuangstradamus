import express from 'express';
import { analyzeTrade } from '../utils/tradeLogic.js'; // adjust path if needed

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message, lang } = req.body;

    console.log('💬 Incoming trade analysis request:', { message, lang });

    if (!message) {
      return res.status(400).json({ error: 'Missing message input' });
    }

    // Run the actual trade analysis
    const result = await analyzeTrade(message);

    // Fallback if the analysis returns nothing
    if (!result || typeof result !== 'string') {
      console.warn('⚠️ No valid result from trade analysis:', result);
      return res.status(500).json({ error: 'Trade analysis failed' });
    }

    const reply = lang === 'zh'
      ? `交易分析结果: ${result}`
      : result;

    console.log('🧠 Trade analysis result:', reply);

    res.json({ reply });

  } catch (error) {
    console.error('💥 Error in chat route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
