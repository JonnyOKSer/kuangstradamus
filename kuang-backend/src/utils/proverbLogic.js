import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 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, // Railway injects this
});

export async function generateProverb(tradeText) {
  const prompt = `Create a wise, poetic Chinese-style proverb based on this fantasy football trade: "${tradeText}". The proverb should sound ancient and metaphorical. Respond only with the proverb.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    return reply || 'A silent river hides the deepest stones.';
  } catch (err) {
    console.error('🧨 OpenAI proverb generation failed:', err);
    return 'A silent river hides the deepest stones.';
  }
}
