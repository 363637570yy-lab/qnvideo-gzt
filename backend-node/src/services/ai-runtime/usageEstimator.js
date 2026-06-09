function charsFromPrompt(promptLike) {
  if (Array.isArray(promptLike)) {
    return promptLike.map((item) => String(item || '')).join('\n').length;
  }
  return String(promptLike || '').length;
}

function estimateTextTokensFromChars(chars) {
  const n = Number(chars || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.ceil(n / 2));
}

function estimateTextUsage(userPrompt, systemPrompt, options = {}) {
  const inputTokens = estimateTextTokensFromChars(charsFromPrompt([systemPrompt, userPrompt]));
  const requestedMax = Number(options.max_tokens ?? options.maxTokens ?? options.min_max_tokens ?? 0);
  const outputTokens = Number.isFinite(requestedMax) && requestedMax > 0 ? Math.ceil(requestedMax) : 0;
  const total = inputTokens + outputTokens;
  return {
    input_tokens: inputTokens || null,
    output_tokens: outputTokens || null,
    total_tokens: total || null,
  };
}

function estimateImageUsage(opts = {}) {
  const count = Number(opts.image_count ?? opts.images ?? opts.n ?? 1);
  return { image_count: Number.isFinite(count) && count > 0 ? Math.ceil(count) : 1 };
}

function estimateVideoUsage(opts = {}) {
  const seconds = Number(opts.video_seconds ?? opts.duration_seconds ?? opts.duration ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? { video_seconds: seconds } : {};
}

function estimateTtsAudioSeconds(text, speed) {
  const chars = String(text || '').trim().length;
  if (chars <= 0) return 0;
  const safeSpeed = Math.min(3, Math.max(0.25, Number(speed) || 1));
  return Math.max(1, Number((chars / 4.2 / safeSpeed).toFixed(2)));
}

function estimateTtsUsage(text, speed) {
  const audioSeconds = estimateTtsAudioSeconds(text, speed);
  return audioSeconds > 0 ? { audio_seconds: audioSeconds } : {};
}

module.exports = {
  charsFromPrompt,
  estimateImageUsage,
  estimateTextTokensFromChars,
  estimateTextUsage,
  estimateTtsAudioSeconds,
  estimateTtsUsage,
  estimateVideoUsage,
};
