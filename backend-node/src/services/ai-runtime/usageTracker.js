function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value) {
  const n = numberOrNull(value);
  return n == null ? null : Math.trunc(n);
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function tableReady(db) {
  try {
    db.prepare('SELECT id FROM ai_usage_events LIMIT 1').get();
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeUsage(usage = {}) {
  return {
    input_tokens: intOrNull(usage.input_tokens ?? usage.prompt_tokens),
    output_tokens: intOrNull(usage.output_tokens ?? usage.completion_tokens),
    total_tokens: intOrNull(usage.total_tokens),
    image_count: intOrNull(usage.image_count),
    video_seconds: numberOrNull(usage.video_seconds ?? usage.duration_seconds),
    audio_seconds: numberOrNull(usage.audio_seconds),
    storage_bytes: intOrNull(usage.storage_bytes),
    estimated_cost: numberOrNull(usage.estimated_cost),
    actual_cost: numberOrNull(usage.actual_cost),
  };
}

function hasMeteredUsage(usage) {
  return [
    usage.input_tokens,
    usage.output_tokens,
    usage.total_tokens,
    usage.image_count,
    usage.video_seconds,
    usage.audio_seconds,
    usage.storage_bytes,
    usage.estimated_cost,
    usage.actual_cost,
  ].some((value) => value != null && Number(value) !== 0);
}

function periodKeyFromDate(value) {
  const raw = value ? String(value) : new Date().toISOString();
  const m = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function recordUsageEvent(db, data = {}) {
  if (!db) return false;
  const createdAt = data.created_at || data.createdAt || new Date().toISOString();
  const usage = normalizeUsage(data.usage || {});
  const usageSource = data.usage_source || data.usageSource || (hasMeteredUsage(usage) ? 'real' : 'none');
  try {
    db.prepare(
      `INSERT INTO ai_usage_events (
        call_log_id, service_type, scene_key, config_id, provider, api_protocol, model,
        user_id, project_id, task_id, status, input_tokens, output_tokens, total_tokens,
        image_count, video_seconds, audio_seconds, storage_bytes, estimated_cost,
        actual_cost, usage_source, period_key, trace_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.call_log_id || data.callLogId || null,
      data.service_type || data.serviceType || '',
      data.scene_key || data.sceneKey || null,
      data.config_id || data.configId || null,
      data.provider || null,
      data.api_protocol || data.protocol || null,
      data.model || null,
      data.user_id || data.userId || data.operator_user_id || null,
      data.project_id || data.projectId || data.drama_id || null,
      data.task_id || data.taskId || null,
      data.status || 'unknown',
      usage.input_tokens,
      usage.output_tokens,
      usage.total_tokens,
      usage.image_count,
      usage.video_seconds,
      usage.audio_seconds,
      usage.storage_bytes,
      usage.estimated_cost,
      usage.actual_cost,
      usageSource,
      data.period_key || data.periodKey || periodKeyFromDate(createdAt),
      data.trace_id || data.traceId || null,
      createdAt
    );
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeDateRange(query = {}) {
  const days = clampInt(query.days, 30, 1, 366);
  const since = query.since ? String(query.since) : isoDaysAgo(days);
  const until = query.until ? String(query.until) : new Date().toISOString();
  return { days, since, until };
}

function buildWhere(query = {}) {
  const where = [];
  const params = [];
  const range = normalizeDateRange(query);
  where.push('created_at >= ?');
  params.push(range.since);
  where.push('created_at <= ?');
  params.push(range.until);

  for (const [key, column] of [
    ['service_type', 'service_type'],
    ['status', 'status'],
    ['scene_key', 'scene_key'],
    ['model', 'model'],
    ['period_key', 'period_key'],
    ['trace_id', 'trace_id'],
  ]) {
    const raw = String(query[key] || '').trim();
    if (raw && raw !== 'all') {
      where.push(`${column} = ?`);
      params.push(raw);
    }
  }

  const configId = Number(query.config_id);
  if (Number.isInteger(configId) && configId > 0) {
    where.push('config_id = ?');
    params.push(configId);
  }

  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, range };
}

function aggregateSelect() {
  return `
    COUNT(*) AS requests,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
    SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN input_tokens IS NOT NULL THEN input_tokens ELSE 0 END) AS input_tokens,
    SUM(CASE WHEN output_tokens IS NOT NULL THEN output_tokens ELSE 0 END) AS output_tokens,
    SUM(CASE WHEN total_tokens IS NOT NULL THEN total_tokens ELSE 0 END) AS total_tokens,
    SUM(CASE WHEN image_count IS NOT NULL THEN image_count ELSE 0 END) AS image_count,
    SUM(CASE WHEN video_seconds IS NOT NULL THEN video_seconds ELSE 0 END) AS video_seconds,
    SUM(CASE WHEN audio_seconds IS NOT NULL THEN audio_seconds ELSE 0 END) AS audio_seconds,
    SUM(CASE WHEN storage_bytes IS NOT NULL THEN storage_bytes ELSE 0 END) AS storage_bytes,
    SUM(CASE WHEN estimated_cost IS NOT NULL THEN estimated_cost ELSE 0 END) AS estimated_cost,
    SUM(CASE WHEN actual_cost IS NOT NULL THEN actual_cost ELSE 0 END) AS actual_cost
  `;
}

function normalizeAgg(row = {}) {
  const num = (value) => Number(value || 0);
  return {
    requests: num(row.requests),
    success: num(row.success),
    failed: num(row.failed),
    input_tokens: num(row.input_tokens),
    output_tokens: num(row.output_tokens),
    total_tokens: num(row.total_tokens),
    image_count: num(row.image_count),
    video_seconds: num(row.video_seconds),
    audio_seconds: num(row.audio_seconds),
    storage_bytes: num(row.storage_bytes),
    estimated_cost: num(row.estimated_cost),
    actual_cost: num(row.actual_cost),
  };
}

function emptySummary(range) {
  return {
    range,
    totals: normalizeAgg(),
    by_day: [],
    by_config: [],
    by_scene: [],
  };
}

function getUsageDailySummary(db, query = {}) {
  const filter = buildWhere(query);
  if (!tableReady(db)) return emptySummary(filter.range);

  const totals = db.prepare(`
    SELECT ${aggregateSelect()}
    FROM ai_usage_events
    ${filter.sql}
  `).get(...filter.params);

  const byDay = db.prepare(`
    SELECT period_key, service_type, ${aggregateSelect()}
    FROM ai_usage_events
    ${filter.sql}
    GROUP BY period_key, service_type
    ORDER BY period_key DESC, service_type
  `).all(...filter.params).map((row) => ({
    period_key: row.period_key,
    service_type: row.service_type,
    ...normalizeAgg(row),
  }));

  const byConfig = db.prepare(`
    SELECT config_id, provider, api_protocol, model, ${aggregateSelect()}
    FROM ai_usage_events
    ${filter.sql}
    GROUP BY config_id, provider, api_protocol, model
    ORDER BY requests DESC
    LIMIT 30
  `).all(...filter.params).map((row) => ({
    config_id: row.config_id,
    provider: row.provider,
    api_protocol: row.api_protocol,
    model: row.model,
    ...normalizeAgg(row),
  }));

  const byScene = db.prepare(`
    SELECT service_type, scene_key, ${aggregateSelect()}
    FROM ai_usage_events
    ${filter.sql}
    GROUP BY service_type, scene_key
    ORDER BY requests DESC
    LIMIT 30
  `).all(...filter.params).map((row) => ({
    service_type: row.service_type,
    scene_key: row.scene_key,
    ...normalizeAgg(row),
  }));

  return {
    range: filter.range,
    totals: normalizeAgg(totals),
    by_day: byDay,
    by_config: byConfig,
    by_scene: byScene,
  };
}

module.exports = {
  getUsageDailySummary,
  normalizeUsage,
  periodKeyFromDate,
  recordUsageEvent,
};
