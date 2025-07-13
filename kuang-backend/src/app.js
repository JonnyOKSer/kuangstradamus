import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import tradeRoutes from './routes/trade.js';
import chatRoutes from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Handle CORS preflight explicitly
app.options('*', cors({
  origin: ['https://kuangstradamus.xyz'],
  methods: ['GET', 'POST'],
  credentials: true,
}));

// ✅ Allow main CORS requests
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
