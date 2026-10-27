// Versioned, local English lexicon. No model or network receives chat.
export const SENTIMENT_VERSION = "english-lexicon-1";
const positive = new Set(
  "love loved loving like liked enjoy enjoyed amazing awesome excellent fantastic great good nice beautiful brilliant perfect wonderful happy excited energetic uplifting catchy groovy smooth fun fire banger favorite favourite best fantastic superb adore incredible gorgeous delightful solid impressive cool vibing yay yes".split(
    " ",
  ),
);
const negative = new Set(
  "hate hated hating dislike disliked awful terrible bad boring bored dull annoying annoyed horrible worst disappointing disappointed unpleasant harsh painful sad tired sleepy weak messy dreadful irritating rubbish trash sucks dislike miserable depressing awful skip".split(
    " ",
  ),
);
export function scoreSentiment(text) {
  const words =
    text
      .toLowerCase()
      .replace(/n['’]t\b/g, " not")
      .match(/[a-z]+|[.!?,;]/g) || [];
  let total = 0,
    hits = 0,
    negation = 0,
    intensity = 1;
  for (const word of words) {
    if (/^[.!?,;]$/.test(word) || ["but", "however"].includes(word)) {
      negation = 0;
      intensity = 1;
      continue;
    }
    if (["not", "never", "no", "hardly"].includes(word)) {
      negation = 3;
      continue;
    }
    if (
      ["very", "really", "so", "extremely", "absolutely", "totally"].includes(
        word,
      )
    ) {
      intensity = 1.5;
      continue;
    }
    if (["slightly", "somewhat", "barely"].includes(word)) {
      intensity = 0.5;
      continue;
    }
    const sign = positive.has(word) ? 1 : negative.has(word) ? -1 : 0;
    if (sign) {
      total += sign * intensity * (negation ? -1 : 1);
      hits++;
      intensity = 1;
    }
    if (negation) negation--;
  }
  const score = hits ? Math.max(-1, Math.min(1, total / (hits * 1.5))) : 0;
  return {
    sentimentScore: score,
    sentimentBucket:
      score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral",
    algorithmVersion: SENTIMENT_VERSION,
  };
}
export function rollingSentiment(samples, now) {
  const active = Object.values(samples || {}).filter(
    (s) => now - s.at < 30000 && now >= s.at,
  );
  return {
    rollingScore: active.length
      ? active.reduce((sum, s) => sum + s.score, 0) / active.length
      : 0,
    sampleSize: active.length,
    windowSeconds: 30,
    algorithmVersion: SENTIMENT_VERSION,
  };
}
