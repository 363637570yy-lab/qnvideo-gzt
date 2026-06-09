function tableReady(db) {
  try {
    db.prepare('SELECT id FROM ai_quota_policies LIMIT 1').get();
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeServiceType(value) {
  const raw = String(value || '').trim();
  if (raw === 'audio') return 'tts';
  return raw;
}

function normalizeUnit(value) {
  const raw = String(value || 'requests').trim();
  const aliases = {
    token: 'tokens',
    total_tokens: 'tokens',
    image: 'images',
    image_count: 'images',
    video_second: 'video_seconds',
    audio_second: 'audio_seconds',
    second: 'seconds',
    request: 'requests',
  };
  return aliases[raw] || raw;
}

function nowDate() {
  return new Date();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function periodRange(periodType = 'day', now = nowDate()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  let start;
  let end;
  let key;
  if (periodType === 'month') {
    start = new Date(Date.UTC(y, m, 1));
    end = new Date(Date.UTC(y, m + 1, 1));
    key = `${y}-${pad2(m + 1)}`;
  } else if (periodType === 'quarter') {
    const qStart = Math.floor(m / 3) * 3;
    start = new Date(Date.UTC(y, qStart, 1));
    end = new Date(Date.UTC(y, qStart + 3, 1));
    key = `${y}-Q${Math.floor(m / 3) + 1}`;
  } else if (periodType === 'year') {
    start = new Date(Date.UTC(y, 0, 1));
    end = new Date(Date.UTC(y + 1, 0, 1));
    key = `${y}`;
  } else {
    start = new Date(Date.UTC(y, m, d));
    end = new Date(Date.UTC(y, m, d + 1));
    key = `${y}-${pad2(m + 1)}-${pad2(d)}`;
  }
  return { key, since: start.toISOString(), until: end.toISOString() };
}

function mapPolicy(row = {}) {
  return {
    id: row.id,
    scope_type: row.scope_type || 'config',
    scope_id: row.scope_id || '',
    service_type: normalizeServiceType(row.service_type || ''),
    model: row.model || '',
    scene_key: row.scene_key || '',
    period_type: row.period_type || 'day',
    limit_unit: normalizeUnit(row.limit_unit || 'requests'),
    limit_value: Number(row.limit_value || 0),
    action_on_exceed: row.action_on_exceed || 'fallback',
    enabled: row.enabled !== false && row.enabled !== 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function listPolicies(db, query = {}) {
  if (!tableReady(db)) return [];
  const where = ['deleted_at IS NULL'];
  const params = [];
  const serviceType = normalizeServiceType(query.service_type || '');
  if (serviceType) {
    where.push('(service_type = ? OR service_type IS NULL OR service_type = \'\')');
    params.push(serviceType);
  }
  if (query.enabled != null && query.enabled !== '') {
    where.push('enabled = ?');
    params.push(query.enabled === true || query.enabled === 1 || query.enabled === 'true' || query.enabled === '1' ? 1 : 0);
  }
  return db.prepare(`
    SELECT *
    FROM ai_quota_policies
    WHERE ${where.join(' AND ')}
    ORDER BY enabled DESC, service_type, scope_type, scope_id, id DESC
  `).all(...params).map(mapPolicy);
}

function upsertPolicy(db, body = {}) {
  if (!tableReady(db)) throw new Error('ai_quota_policies 表不存在，请先运行迁移');
  const now = new Date().toISOString();
  const policy = {
    id: body.id != null ? Number(body.id) : null,
    scope_type: body.scope_type || 'config',
    scope_id: body.scope_id != null ? String(body.scope_id) : '',
    service_type: normalizeServiceType(body.service_type || ''),
    model: body.model || '',
    scene_key: body.scene_key || '',
    period_type: body.period_type || 'day',
    limit_unit: normalizeUnit(body.limit_unit || 'requests'),
    limit_value: Number(body.limit_value || 0),
    action_on_exceed: body.action_on_exceed || 'fallback',
    enabled: body.enabled === false || body.enabled === 0 ? 0 : 1,
  };
  if (!Number.isFinite(policy.limit_value) || policy.limit_value < 0) {
    throw new Error('limit_value 必须是非负数字');
  }
  if (policy.id) {
    const info = db.prepare(`
      UPDATE ai_quota_policies
      SET scope_type = ?, scope_id = ?, service_type = ?, model = ?, scene_key = ?,
          period_type = ?, limit_unit = ?, limit_value = ?, action_on_exceed = ?,
          enabled = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(
      policy.scope_type,
      policy.scope_id,
      policy.service_type,
      policy.model,
      policy.scene_key,
      policy.period_type,
      policy.limit_unit,
      policy.limit_value,
      policy.action_on_exceed,
      policy.enabled,
      now,
      policy.id
    );
    if (!info.changes) throw new Error('额度策略不存在');
    return listPolicies(db, {}).find((item) => Number(item.id) === policy.id) || { ...policy, updated_at: now };
  }
  const info = db.prepare(`
    INSERT INTO ai_quota_policies (
      scope_type, scope_id, service_type, model, scene_key, period_type,
      limit_unit, limit_value, action_on_exceed, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    policy.scope_type,
    policy.scope_id,
    policy.service_type,
    policy.model,
    policy.scene_key,
    policy.period_type,
    policy.limit_unit,
    policy.limit_value,
    policy.action_on_exceed,
    policy.enabled,
    now,
    now
  );
  const id = Number(info.lastInsertRowid || 0);
  return listPolicies(db, {}).find((item) => Number(item.id) === id) || { id, ...policy, created_at: now, updated_at: now };
}

function deletePolicy(db, id) {
  if (!tableReady(db)) return false;
  const now = new Date().toISOString();
  const info = db.prepare('UPDATE ai_quota_policies SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(now, now, Number(id));
  return !!info.changes;
}

function fieldMatches(policyValue, actualValue) {
  const p = String(policyValue || '').trim();
  if (!p || p === 'all') return true;
  return p === String(actualValue || '').trim();
}

function scopeMatches(policy, ctx) {
  const scope = policy.scope_type || 'config';
  const scopeId = String(policy.scope_id || '').trim();
  if (scope === 'global') return true;
  if (!scopeId) return true;
  if (scope === 'config') return scopeId === String(ctx.config_id || ctx.configId || ctx.config?.id || '');
  if (scope === 'model') return scopeId === String(ctx.model || '');
  if (scope === 'scene') return scopeId === String(ctx.scene_key || ctx.sceneKey || '');
  if (scope === 'user') return scopeId === String(ctx.user_id || ctx.userId || '');
  if (scope === 'project') return scopeId === String(ctx.project_id || ctx.projectId || ctx.drama_id || '');
  return true;
}

function policyApplies(policy, ctx) {
  return (
    policy.enabled &&
    fieldMatches(policy.service_type, normalizeServiceType(ctx.service_type || ctx.serviceType || '')) &&
    fieldMatches(policy.model, ctx.model || '') &&
    fieldMatches(policy.scene_key, ctx.scene_key || ctx.sceneKey || '') &&
    scopeMatches(policy, ctx)
  );
}

function unitExpression(unit) {
  const normalized = normalizeUnit(unit);
  if (normalized === 'tokens') return 'SUM(CASE WHEN total_tokens IS NOT NULL THEN total_tokens ELSE 0 END)';
  if (normalized === 'images') return 'SUM(CASE WHEN image_count IS NOT NULL THEN image_count ELSE 0 END)';
  if (normalized === 'video_seconds') return 'SUM(CASE WHEN video_seconds IS NOT NULL THEN video_seconds ELSE 0 END)';
  if (normalized === 'audio_seconds') return 'SUM(CASE WHEN audio_seconds IS NOT NULL THEN audio_seconds ELSE 0 END)';
  if (normalized === 'seconds') {
    return 'SUM(CASE WHEN video_seconds IS NOT NULL THEN video_seconds ELSE 0 END) + SUM(CASE WHEN audio_seconds IS NOT NULL THEN audio_seconds ELSE 0 END)';
  }
  if (normalized === 'cost') {
    return 'SUM(CASE WHEN actual_cost IS NOT NULL THEN actual_cost WHEN estimated_cost IS NOT NULL THEN estimated_cost ELSE 0 END)';
  }
  if (normalized === 'storage_bytes') return 'SUM(CASE WHEN storage_bytes IS NOT NULL THEN storage_bytes ELSE 0 END)';
  return 'COUNT(*)';
}

function usedValueForPolicy(db, policy, ctx, range) {
  const where = ['created_at >= ?', 'created_at < ?'];
  const params = [range.since, range.until];
  const add = (col, value) => {
    const raw = String(value || '').trim();
    if (raw && raw !== 'all') {
      where.push(`${col} = ?`);
      params.push(raw);
    }
  };
  add('service_type', policy.service_type || ctx.service_type || ctx.serviceType);
  add('model', policy.model);
  add('scene_key', policy.scene_key);

  const scope = policy.scope_type || 'config';
  const scopeId = String(policy.scope_id || '').trim();
  if (scope === 'config' && scopeId) add('config_id', scopeId);
  if (scope === 'model' && scopeId) add('model', scopeId);
  if (scope === 'scene' && scopeId) add('scene_key', scopeId);
  if (scope === 'user' && scopeId) add('user_id', scopeId);
  if (scope === 'project' && scopeId) add('project_id', scopeId);

  const row = db.prepare(`
    SELECT ${unitExpression(policy.limit_unit)} AS used
    FROM ai_usage_events
    WHERE ${where.join(' AND ')}
  `).get(...params);
  return Number(row?.used || 0);
}

function reserveValueForUnit(unit, estimate = {}) {
  const normalized = normalizeUnit(unit);
  if (normalized === 'tokens') return Number(estimate.total_tokens || estimate.tokens || 0);
  if (normalized === 'images') return Number(estimate.image_count || estimate.images || 0);
  if (normalized === 'video_seconds') return Number(estimate.video_seconds || 0);
  if (normalized === 'audio_seconds') return Number(estimate.audio_seconds || 0);
  if (normalized === 'seconds') return Number(estimate.seconds || estimate.video_seconds || estimate.audio_seconds || 0);
  if (normalized === 'cost') return Number(estimate.cost || estimate.actual_cost || estimate.estimated_cost || 0);
  if (normalized === 'storage_bytes') return Number(estimate.storage_bytes || 0);
  return Number(estimate.requests || 1);
}

function checkQuota(db, context = {}, estimate = {}) {
  if (!tableReady(db)) return { allowed: true, violations: [], checked: 0 };
  const policies = listPolicies(db, { service_type: context.service_type || context.serviceType, enabled: 1 })
    .filter((policy) => policyApplies(policy, context));
  const violations = [];
  for (const policy of policies) {
    if (!policy.limit_value) continue;
    const range = periodRange(policy.period_type);
    const used = usedValueForPolicy(db, policy, context, range);
    const reserve = reserveValueForUnit(policy.limit_unit, estimate);
    const exceeded = used + reserve > policy.limit_value;
    if (exceeded) {
      violations.push({
        policy_id: policy.id,
        scope_type: policy.scope_type,
        scope_id: policy.scope_id,
        service_type: policy.service_type,
        model: policy.model,
        scene_key: policy.scene_key,
        period_type: policy.period_type,
        period_key: range.key,
        limit_unit: policy.limit_unit,
        limit_value: policy.limit_value,
        used_value: used,
        reserved_value: reserve,
        action_on_exceed: policy.action_on_exceed,
      });
    }
  }
  const blocking = violations.filter((item) => item.action_on_exceed !== 'warn_only');
  return {
    allowed: blocking.length === 0,
    violations,
    checked: policies.length,
  };
}

function isConfigQuotaAllowed(db, context = {}, estimate = {}) {
  const config = context.config || {};
  const model = context.model || config.default_model || (Array.isArray(config.model) ? config.model[0] : config.model) || '';
  return checkQuota(db, {
    ...context,
    config_id: context.config_id || context.configId || config.id,
    service_type: context.service_type || context.serviceType || config.service_type,
    model,
  }, estimate);
}

module.exports = {
  checkQuota,
  deletePolicy,
  isConfigQuotaAllowed,
  listPolicies,
  periodRange,
  policyApplies,
  recordQuotaPolicy: upsertPolicy,
  upsertPolicy,
};
