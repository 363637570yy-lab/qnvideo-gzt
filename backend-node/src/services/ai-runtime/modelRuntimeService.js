function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function tableReady(db) {
  try {
    db.prepare('SELECT id FROM ai_model_call_logs LIMIT 1').get();
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeServiceType(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === 'all') return null;
  if (raw === 'audio') return 'tts';
  return raw;
}

function normalizeStatus(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === 'all') return null;
  return raw;
}

function normalizeDateRange(query = {}) {
  const days = clampInt(query.days, 7, 1, 366);
  const since = query.since ? String(query.since) : isoDaysAgo(days);
  const until = query.until ? String(query.until) : new Date().toISOString();
  return { days, since, until };
}

function buildWhere(query = {}) {
  const where = [];
  const params = [];
  const range = normalizeDateRange(query);
  where.push('l.created_at >= ?');
  params.push(range.since);
  where.push('l.created_at <= ?');
  params.push(range.until);

  const serviceType = normalizeServiceType(query.service_type);
  if (serviceType) {
    where.push('l.service_type = ?');
    params.push(serviceType);
  }

  const status = normalizeStatus(query.status);
  if (status) {
    where.push('l.status = ?');
    params.push(status);
  }

  const configId = Number(query.config_id);
  if (Number.isInteger(configId) && configId > 0) {
    where.push('l.config_id = ?');
    params.push(configId);
  }

  const model = String(query.model || '').trim();
  if (model) {
    where.push('l.model = ?');
    params.push(model);
  }

  const sceneKey = String(query.scene_key || '').trim();
  if (sceneKey) {
    where.push('l.scene_key = ?');
    params.push(sceneKey);
  }

  const traceId = String(query.trace_id || query.traceId || '').trim();
  if (traceId) {
    where.push('l.trace_id = ?');
    params.push(traceId);
  }

  const taskId = String(query.task_id || query.taskId || '').trim();
  if (taskId) {
    where.push('l.task_id = ?');
    params.push(taskId);
  }

  const projectId = Number(query.project_id || query.projectId || query.drama_id);
  if (Number.isInteger(projectId) && projectId > 0) {
    where.push('l.project_id = ?');
    params.push(projectId);
  }

  const slowMs = Number(query.slow_ms);
  if (Number.isFinite(slowMs) && slowMs > 0) {
    where.push('l.elapsed_ms >= ?');
    params.push(Math.trunc(slowMs));
  }

  return {
    sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    range,
  };
}

function mapLogRow(row) {
  return {
    ...row,
    usage: safeJsonParse(row.usage_json),
    diagnostics: safeJsonParse(row.diagnostics_json),
  };
}

function emptySummary(range) {
  return {
    range,
    totals: {
      requests: 0,
      success: 0,
      failed: 0,
      avg_elapsed_ms: 0,
      max_elapsed_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      image_count: 0,
      audio_seconds: 0,
      video_seconds: 0,
    },
    by_service: [],
    by_config: [],
    slow_calls: [],
  };
}

function normalizeAgg(row = {}) {
  const num = (value) => Number(value || 0);
  return {
    requests: num(row.requests),
    success: num(row.success),
    failed: num(row.failed),
    avg_elapsed_ms: Math.round(num(row.avg_elapsed_ms)),
    max_elapsed_ms: num(row.max_elapsed_ms),
    input_tokens: num(row.input_tokens),
    output_tokens: num(row.output_tokens),
    total_tokens: num(row.total_tokens),
    image_count: num(row.image_count),
    audio_seconds: num(row.audio_seconds),
    video_seconds: num(row.video_seconds),
  };
}

function aggregateSelect(prefix = 'l') {
  return `
    COUNT(*) AS requests,
    SUM(CASE WHEN ${prefix}.status = 'success' THEN 1 ELSE 0 END) AS success,
    SUM(CASE WHEN ${prefix}.status != 'success' THEN 1 ELSE 0 END) AS failed,
    AVG(CASE WHEN ${prefix}.elapsed_ms IS NOT NULL THEN ${prefix}.elapsed_ms ELSE NULL END) AS avg_elapsed_ms,
    MAX(${prefix}.elapsed_ms) AS max_elapsed_ms,
    SUM(CASE WHEN ${prefix}.input_tokens IS NOT NULL THEN ${prefix}.input_tokens ELSE 0 END) AS input_tokens,
    SUM(CASE WHEN ${prefix}.output_tokens IS NOT NULL THEN ${prefix}.output_tokens ELSE 0 END) AS output_tokens,
    SUM(CASE WHEN ${prefix}.total_tokens IS NOT NULL THEN ${prefix}.total_tokens ELSE 0 END) AS total_tokens,
    SUM(CASE WHEN ${prefix}.image_count IS NOT NULL THEN ${prefix}.image_count ELSE 0 END) AS image_count,
    SUM(CASE WHEN ${prefix}.audio_seconds IS NOT NULL THEN ${prefix}.audio_seconds ELSE 0 END) AS audio_seconds,
    SUM(CASE WHEN ${prefix}.video_seconds IS NOT NULL THEN ${prefix}.video_seconds ELSE 0 END) AS video_seconds
  `;
}

function listModelCallLogs(db, query = {}) {
  const range = normalizeDateRange(query);
  if (!tableReady(db)) {
    return { items: [], total: 0, limit: 0, offset: 0, range };
  }
  const limit = clampInt(query.limit, 50, 1, 200);
  const offset = clampInt(query.offset, 0, 0, 100000);
  const filter = buildWhere(query);
  const rows = db.prepare(`
    SELECT
      l.id, l.service_type, l.scene_key, l.config_id, c.name AS config_name,
      l.provider, l.api_protocol, l.model, l.status, l.elapsed_ms,
      l.input_tokens, l.output_tokens, l.total_tokens, l.image_count,
      l.audio_seconds, l.video_seconds, l.prompt_chars, l.prompt_hash,
      l.task_id, l.project_id, l.trace_id, l.error_message, l.usage_json,
      l.diagnostics_json, l.created_at
    FROM ai_model_call_logs l
    LEFT JOIN ai_service_configs c ON c.id = l.config_id
    ${filter.sql}
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT ? OFFSET ?
  `).all(...filter.params, limit, offset).map(mapLogRow);
  const totalRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM ai_model_call_logs l
    ${filter.sql}
  `).get(...filter.params);
  return {
    items: rows,
    total: Number(totalRow?.total || 0),
    limit,
    offset,
    range: filter.range,
  };
}

function getModelUsageSummary(db, query = {}) {
  const filter = buildWhere(query);
  if (!tableReady(db)) return emptySummary(filter.range);

  const totalsRow = db.prepare(`
    SELECT ${aggregateSelect('l')}
    FROM ai_model_call_logs l
    ${filter.sql}
  `).get(...filter.params);

  const byService = db.prepare(`
    SELECT l.service_type, ${aggregateSelect('l')}
    FROM ai_model_call_logs l
    ${filter.sql}
    GROUP BY l.service_type
    ORDER BY requests DESC, l.service_type
  `).all(...filter.params).map((row) => ({
    service_type: row.service_type,
    ...normalizeAgg(row),
  }));

  const byConfig = db.prepare(`
    SELECT
      l.config_id, c.name AS config_name, l.provider, l.api_protocol, l.model,
      ${aggregateSelect('l')}
    FROM ai_model_call_logs l
    LEFT JOIN ai_service_configs c ON c.id = l.config_id
    ${filter.sql}
    GROUP BY l.config_id, c.name, l.provider, l.api_protocol, l.model
    ORDER BY requests DESC, failed DESC
    LIMIT 20
  `).all(...filter.params).map((row) => ({
    config_id: row.config_id,
    config_name: row.config_name,
    provider: row.provider,
    api_protocol: row.api_protocol,
    model: row.model,
    ...normalizeAgg(row),
  }));

  const slowCalls = db.prepare(`
    SELECT
      l.id, l.service_type, l.scene_key, l.config_id, c.name AS config_name,
      l.provider, l.api_protocol, l.model, l.status, l.elapsed_ms,
      l.prompt_chars, l.prompt_hash, l.task_id, l.project_id,
      l.trace_id, l.error_message, l.created_at
    FROM ai_model_call_logs l
    LEFT JOIN ai_service_configs c ON c.id = l.config_id
    ${filter.sql}
    ORDER BY l.elapsed_ms DESC, l.created_at DESC
    LIMIT 8
  `).all(...filter.params);

  return {
    range: filter.range,
    totals: normalizeAgg(totalsRow),
    by_service: byService,
    by_config: byConfig,
    slow_calls: slowCalls,
  };
}

module.exports = {
  listModelCallLogs,
  getModelUsageSummary,
  _test: {
    buildWhere,
    normalizeAgg,
    normalizeDateRange,
  },
};
