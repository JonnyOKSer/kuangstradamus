import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import tradeRoutes from './routes/trade.js';
import chatRoutes from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Restrict CORS to only allow Netlify frontend
app.use(cors({
  origin: ['https://kuangstradamus.xyz'],
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(express.json());

// ✅ Mount routes
app.use('/api', tradeRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
  res.send('👋 Fantasy Trade Analyzer API is live!');
});

app.listen(PORT, () => {
  console.log(`🚀 Fantasy Trade Analyzer live on port ${PORT}`);
});

export default app;
