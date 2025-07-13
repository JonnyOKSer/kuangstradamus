import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Make sure this is set in your Railway secrets
});
const openai = new OpenAIApi(configuration);

export async function generateProverb(tradeText) {
  const prompt = `Create a wise, poetic Chinese-style proverb based on this fantasy football trade: "${tradeText}". The proverb should sound ancient and metaphorical. Respond only with the proverb.`;

  try {
    const completion = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
    });

    const reply = completion.data.choices[0]?.message?.content?.trim();
    return reply || 'A silent river hides the deepest stones.';
  } catch (err) {
    console.error('🧨 OpenAI proverb generation failed:', err);
    return 'A silent river hides the deepest stones.'; // fallback
  }
}
