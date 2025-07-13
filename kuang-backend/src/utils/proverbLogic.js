export async function generateProverb(tradeText) {
  // Later: you can hook this up to GPT API or finetuned model
  const sampleProverbs = [
    "When the tiger offers a goat, beware the teeth beneath the smile.",
    "A man who trades gold for bronze will soon miss the gleam.",
    "Even a broken sword can pierce the heart if wielded with faith.",
    "One who sells the ox for a rooster wakes to an empty field.",
    "If you chase two rabbits, both will escape."
  ];

  const index = Math.floor(Math.random() * sampleProverbs.length);
  return sampleProverbs[index];
}
