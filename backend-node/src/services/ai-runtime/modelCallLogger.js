const crypto = require('crypto');
const usageTracker = require('./usageTracker');

function sha1(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

function safeJson(value, maxLen = 2000) {
  if (value == null) return null;
  try {
    return JSON.stringify(value).slice(0, maxLen);
  } catch (_) {
    return null;
  }
}

function createTraceId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
}

function sanitizeErrorMessage(err) {
  const raw = typeof err === 'string' ? err : (err?.message || String(err || ''));
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/sk-[A-Za-z0-9_-]{12,}/gi, 'sk-***')
    .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]{80,}/gi, 'data:***;base64,***')
    .slice(0, 500);
}

function normalizeUsage(usage = {}) {
  const numberOrNull = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return {
    input_tokens: numberOrNull(usage.input_tokens ?? usage.prompt_tokens),
    output_tokens: numberOrNull(usage.output_tokens ?? usage.completion_tokens),
    total_tokens: numberOrNull(usage.total_tokens),
    image_count: numberOrNull(usage.image_count),
    audio_seconds: numberOrNull(usage.audio_seconds),
    video_seconds: numberOrNull(usage.video_seconds),
    raw: usage && Object.keys(usage).length ? usage : null,
  };
}

function buildPromptSummary(promptLike) {
  const text = Array.isArray(promptLike)
    ? promptLike.map((item) => String(item || '')).join('\n')
    : String(promptLike || '');
  return {
    prompt_chars: text.length,
    prompt_hash: text ? sha1(text).slice(0, 16) : null,
  };
}

function recordModelCall(db, data = {}) {
  if (!db) return false;
  const now = new Date().toISOString();
  const usage = normalizeUsage(data.usage || {});
  const promptSummary = buildPromptSummary(data.prompt || data.prompt_text || '');
  const traceId = data.trace_id || data.traceId || createTraceId();
  try {
    const info = db.prepare(
      `INSERT INTO ai_model_call_logs (
        service_type, scene_key, config_id, provider, api_protocol, model, status,
        elapsed_ms, input_tokens, output_tokens, total_tokens, image_count,
        audio_seconds, video_seconds, prompt_chars, prompt_hash, task_id,
        project_id, trace_id, error_message, usage_json, diagnostics_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.service_type || data.serviceType || '',
      data.scene_key || data.sceneKey || null,
      data.config_id || data.configId || null,
      data.provider || null,
      data.api_protocol || data.protocol || null,
      data.model || null,
      data.status || 'unknown',
      Number.isFinite(Number(data.elapsed_ms)) ? Number(data.elapsed_ms) : null,
      usage.input_tokens,
      usage.output_tokens,
      usage.total_tokens,
      usage.image_count,
      usage.audio_seconds,
      usage.video_seconds,
      promptSummary.prompt_chars,
      promptSummary.prompt_hash,
      data.task_id || data.taskId || null,
      data.project_id || data.projectId || data.drama_id || null,
      traceId,
      data.error ? sanitizeErrorMessage(data.error) : null,
      safeJson(usage.raw),
      safeJson(data.diagnostics),
      now
    );
    usageTracker.recordUsageEvent(db, {
      ...data,
      call_log_id: info?.lastInsertRowid || null,
      usage,
      trace_id: traceId,
      created_at: now,
    });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  buildPromptSummary,
  createTraceId,
  normalizeUsage,
  recordModelCall,
  sanitizeErrorMessage,
  _test: {
    buildPromptSummary,
    createTraceId,
    normalizeUsage,
    sanitizeErrorMessage,
  },
};
