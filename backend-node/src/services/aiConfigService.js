// AI 配置 CRUD，与 Go application/services/ai_service.go 对齐
const fs = require('fs');
const path = require('path');
const { normalizeMaterialHubToken } = require('./jimengMaterialHubService');
const minimaxTtsAdapter = require('./ai-audio/adapters/minimaxTts');
const openAiTtsAdapter = require('./ai-audio/adapters/openAiTts');
const routingPolicyService = require('./ai-runtime/routingPolicyService');
const modelCapabilityService = require('./ai-runtime/modelCapabilityService');
const quotaGuard = require('./ai-runtime/quotaGuard');
const {
  normalizeServiceType,
  clampInt,
  timeoutSecondsToMs,
  timeoutMsToSeconds,
  getRoutingPolicies,
  getRoutingPolicy,
  updateRoutingPolicy,
  getRoutingCursor,
  bumpRoutingCursor,
  rotateByCursor,
  capAttemptConfigs,
  resolveConfigRoutingPolicy,
  getRetryCountForConfig,
  getRequestTimeoutMsForConfig,
} = routingPolicyService;

function normalizeApiKeyForService(serviceType, apiKey) {
  if (serviceType === 'jimeng2_character_auth' && apiKey != null) {
    return normalizeMaterialHubToken(apiKey);
  }
  return apiKey;
}
const { applyDeepSeekConnectivityOptions } = require('./deepseekConfig');
function modelToDb(model) {
  if (model == null) return null;
  if (Array.isArray(model)) return JSON.stringify(model);
  if (typeof model === 'string') return JSON.stringify([model]);
  return JSON.stringify([]);
}

function modelFromDb(val) {
  if (val == null || val === '') return [];
  try {
    const arr = JSON.parse(val);
    return Array.isArray(arr) ? arr : [String(arr)];
  } catch {
    return [String(val)];
  }
}

const RUNTIME_ROUTE_TYPES = [
  { key: 'text', label: '文本' },
  { key: 'image', label: '图像' },
  { key: 'video', label: '视频' },
  { key: 'tts', label: '音频' },
];

function listConfigs(db, serviceType) {
  const order = 'ORDER BY route_order ASC, created_at DESC, id ASC';
  let sql = 'SELECT * FROM ai_service_configs WHERE deleted_at IS NULL ' + order;
  const params = [];
  if (serviceType) {
    serviceType = normalizeServiceType(serviceType);
    sql = 'SELECT * FROM ai_service_configs WHERE deleted_at IS NULL AND service_type = ? ' + order;
    params.push(serviceType);
  }
  const rows = params.length ? db.prepare(sql).all(...params) : db.prepare(sql).all();
  return rows.map(rowToConfig);
}

function capabilityOverridesToDb(value) {
  if (value === undefined) return undefined;
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function getActivePublicConfig(db, serviceType) {
  const cfg = getRuntimeConfigCandidates(db, serviceType, { selectForRequest: false })[0] || null;
  if (!cfg) return null;
  return toPublicRuntimeConfig(cfg);
}

function toPublicRuntimeConfig(cfg) {
  return {
    id: cfg.id,
    service_type: cfg.service_type,
    provider: cfg.provider,
    api_protocol: cfg.api_protocol || '',
    name: cfg.name,
    model: cfg.model,
    default_model: cfg.default_model,
    is_active: cfg.is_active,
    route_order: cfg.route_order || 0,
    retry_count: cfg.retry_count || 0,
    cooldown_seconds: cfg.cooldown_seconds || 0,
    request_timeout_seconds: cfg.request_timeout_seconds || 0,
    capabilities: cfg.capabilities || [],
    health_status: cfg.health_status || 'ok',
    disabled_until: cfg.disabled_until || null,
    last_error: cfg.last_error || null,
    last_error_at: cfg.last_error_at || null,
  };
}

function listRuntimePublicConfigs(db, serviceType) {
  return getRuntimeConfigCandidates(db, serviceType, { includeCoolingDown: true, selectForRequest: false })
    .map(toPublicRuntimeConfig);
}

function getRuntimeModelRoutes(db) {
  const keys = RUNTIME_ROUTE_TYPES.map((item) => item.key);
  const placeholders = keys.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT * FROM ai_service_configs
     WHERE deleted_at IS NULL AND service_type IN (${placeholders})
     ORDER BY service_type ASC, route_order ASC, created_at DESC, id ASC`
  ).all(...keys);
  const nowMs = Date.now();
  const options = Object.fromEntries(keys.map((key) => [key, []]));
  for (const row of rows) {
    const cfg = rowToConfig(row);
    if (cfg.is_active === false) continue;
    options[cfg.service_type] = options[cfg.service_type] || [];
    options[cfg.service_type].push(toPublicRuntimeConfig(cfg));
  }
  const defaults = {};
  for (const key of keys) {
    const candidates = options[key] || [];
    defaults[key] = candidates.find((cfg) => isRouteEligible(cfg, nowMs))
      || null;
  }
  return {
    service_types: RUNTIME_ROUTE_TYPES,
    options,
    defaults,
    routing_policies: getRoutingPolicies(db),
    selected: Object.fromEntries(keys.map((key) => [key, ''])),
  };
}

function getConfig(db, id) {
  const row = db.prepare('SELECT * FROM ai_service_configs WHERE id = ? AND deleted_at IS NULL').get(id);
  return row ? rowToConfig(row) : null;
}

function createConfig(db, log, req) {
  const now = new Date().toISOString();
  const model = modelToDb(req.model);
  let endpoint = req.endpoint || '';
  let queryEndpoint = req.query_endpoint || '';
  const serviceType = normalizeServiceType(req.service_type || 'text');
  if (!endpoint && req.provider) {
    const p = req.provider.toLowerCase();
    const st = serviceType.toLowerCase();
    if (p === 'openai') {
      if (st === 'text') endpoint = '/chat/completions';
      else if (st === 'image') endpoint = '/images/generations';
      else if (st === 'video') {
        endpoint = '/videos';
        queryEndpoint = '/videos/{taskId}';
      }
    } else if (p === 'gemini' || p === 'google') {
      endpoint = '/v1beta/models/{model}:generateContent';
    } else if (p === 'dashscope' || p === 'qwen_image') {
      if (st === 'image') endpoint = '/api/v1/services/aigc/multimodal-generation/generation';
      else if (st === 'video' && p === 'dashscope') {
        endpoint = '/api/v1/services/aigc/image2video/video-synthesis';
        queryEndpoint = '/api/v1/tasks/{taskId}';
      }
    } else if (p === 'volces' || p === 'volcengine' || p === 'volc') {
      if (st === 'video') {
        endpoint = '/contents/generations/tasks';
        queryEndpoint = '/contents/generations/tasks/{taskId}';
      } else if (st === 'image') {
        endpoint = '/images/generations';
      }
    } else if (p === 'nano_banana') {
      if (st === 'image') {
        endpoint = '/api/v1/nanobanana/generate-2';
        queryEndpoint = '/api/v1/nanobanana/record-info';
      }
    }
  }
  const defaultModel = req.default_model != null ? String(req.default_model).trim() || null : null;
  const info = db.prepare(
    `INSERT INTO ai_service_configs (service_type, provider, api_protocol, name, base_url, api_key, model, default_model, endpoint, query_endpoint, route_order, retry_count, cooldown_seconds, request_timeout_ms, is_active, capabilities_json, settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).run(
    serviceType,
    req.provider || '',
    req.api_protocol || '',
    req.name || '',
    req.base_url || '',
    normalizeApiKeyForService(req.service_type, req.api_key || ''),
    model,
    defaultModel,
    endpoint,
    queryEndpoint,
    req.route_order ?? 0,
    req.retry_count ?? 0,
    req.cooldown_seconds ?? 0,
    timeoutSecondsToMs(req.request_timeout_seconds, 0),
    capabilityOverridesToDb(req.capabilities_json ?? req.capabilities) || null,
    req.settings || null,
    now,
    now
  );
  log.info('AI config created', { config_id: info.lastInsertRowid, provider: req.provider });
  const newId = info.lastInsertRowid;
  return getConfig(db, newId);
}

function updateConfig(db, log, id, req) {
  const existing = getConfig(db, id);
  if (!existing) return null;
  const updates = [];
  const params = [];
  if (req.name != null) {
    updates.push('name = ?');
    params.push(req.name);
  }
  if (req.provider != null) {
    updates.push('provider = ?');
    params.push(req.provider);
  }
  if (req.api_protocol != null) {
    updates.push('api_protocol = ?');
    params.push(req.api_protocol);
  }
  if (req.base_url != null) {
    updates.push('base_url = ?');
    params.push(req.base_url);
  }
  if (req.api_key != null) {
    updates.push('api_key = ?');
    const st = req.service_type != null ? req.service_type : existing.service_type;
    params.push(normalizeApiKeyForService(st, req.api_key));
  }
  if (req.model != null) {
    updates.push('model = ?');
    params.push(modelToDb(req.model));
  }
  if (req.default_model !== undefined) {
    updates.push('default_model = ?');
    params.push(req.default_model != null ? String(req.default_model).trim() || null : null);
  }
  if (req.service_type != null) {
    updates.push('service_type = ?');
    params.push(normalizeServiceType(req.service_type));
  }
  if (req.route_order != null) {
    updates.push('route_order = ?');
    params.push(clampInt(req.route_order, 0, 0, 9999));
  }
  if (req.retry_count != null) {
    updates.push('retry_count = ?');
    params.push(clampInt(req.retry_count, 0, 0, 5));
  }
  if (req.cooldown_seconds != null) {
    updates.push('cooldown_seconds = ?');
    params.push(clampInt(req.cooldown_seconds, 0, 0, 24 * 3600));
  }
  if (req.request_timeout_seconds != null) {
    updates.push('request_timeout_ms = ?');
    params.push(timeoutSecondsToMs(req.request_timeout_seconds, 0));
  }
  if (req.endpoint !== undefined) {
    updates.push('endpoint = ?');
    params.push(req.endpoint || '');
  }
  if (req.query_endpoint !== undefined) {
    updates.push('query_endpoint = ?');
    params.push(req.query_endpoint || '');
  }
  if (req.settings != null) {
    updates.push('settings = ?');
    params.push(req.settings);
  }
  if (req.capabilities_json !== undefined || req.capabilities !== undefined) {
    updates.push('capabilities_json = ?');
    params.push(capabilityOverridesToDb(req.capabilities_json ?? req.capabilities));
  }
  if (typeof req.is_active === 'boolean') {
    updates.push('is_active = ?');
    params.push(req.is_active ? 1 : 0);
    if (req.is_active) {
      updates.push('health_status = ?');
      params.push('ok');
      updates.push('disabled_until = ?');
      params.push(null);
    } else {
      updates.push('health_status = ?');
      params.push('disabled');
    }
  }
  if (updates.length === 0) return existing;
  params.push(new Date().toISOString(), id);
  db.prepare('UPDATE ai_service_configs SET ' + updates.join(', ') + ', updated_at = ? WHERE id = ?').run(...params);
  log.info('AI config updated', { config_id: id });
  return getConfig(db, id);
}

function reorderConfigs(db, log, ids) {
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0))];
  if (cleanIds.length === 0) throw new Error('缺少有效配置ID');

  const placeholders = cleanIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, service_type FROM ai_service_configs
     WHERE deleted_at IS NULL AND id IN (${placeholders})`
  ).all(...cleanIds);
  if (rows.length !== cleanIds.length) {
    throw new Error('排序列表包含不存在或已删除的配置');
  }

  const rowById = new Map(rows.map((row) => [Number(row.id), normalizeServiceType(row.service_type)]));
  const grouped = new Map();
  for (const id of cleanIds) {
    const serviceType = rowById.get(Number(id));
    if (!grouped.has(serviceType)) grouped.set(serviceType, []);
    grouped.get(serviceType).push(Number(id));
  }

  for (const [serviceType, orderedIds] of grouped.entries()) {
    const existingIds = db.prepare(
      `SELECT id FROM ai_service_configs
       WHERE deleted_at IS NULL AND service_type = ?
       ORDER BY route_order ASC, created_at DESC, id ASC`
    ).all(serviceType).map((row) => Number(row.id));
    const orderedSet = new Set(orderedIds);
    if (existingIds.length !== orderedIds.length || existingIds.some((id) => !orderedSet.has(id))) {
      throw new Error(`排序列表未覆盖全部 ${serviceType} 配置`);
    }
  }

  const now = new Date().toISOString();
  const update = db.prepare(
    'UPDATE ai_service_configs SET route_order = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
  );
  const applyOrder = db.transaction(() => {
    for (const orderedIds of grouped.values()) {
      orderedIds.forEach((id, index) => update.run(index, now, id));
    }
  });
  applyOrder();
  log?.info?.('AI config order updated', { count: cleanIds.length, service_types: [...grouped.keys()] });
  return cleanIds.length;
}

function deleteConfig(db, log, id) {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE ai_service_configs SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, id);
  if (result.changes === 0) return false;
  log.info('AI config deleted', { config_id: id });
  return true;
}

function rowToConfig(r) {
  const cfg = {
    id: r.id,
    service_type: normalizeServiceType(r.service_type),
    provider: r.provider,
    api_protocol: r.api_protocol || '',
    name: r.name,
    base_url: r.base_url,
    api_key: r.api_key,
    model: modelFromDb(r.model),
    default_model: r.default_model ? String(r.default_model).trim() : null,
    endpoint: r.endpoint,
    query_endpoint: r.query_endpoint,
    route_order: Number(r.route_order || 0),
    retry_count: Number(r.retry_count || 0),
    cooldown_seconds: Number(r.cooldown_seconds || 0),
    request_timeout_seconds: timeoutMsToSeconds(r.request_timeout_ms),
    capabilities_json: r.capabilities_json || null,
    is_active: r.is_active == null ? true : !!r.is_active,
    health_status: r.health_status || 'ok',
    disabled_until: r.disabled_until || null,
    last_error: r.last_error || null,
    last_error_at: r.last_error_at || null,
    failure_count: Number(r.failure_count || 0),
    settings: r.settings,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
  // TTS 配置：从 settings JSON 展开 voice_id / group_id 供 ttsService 直接读取
  if (r.service_type === 'tts' && r.settings) {
    try {
      const s = JSON.parse(r.settings);
      if (s.voice_id) cfg.voice_id = s.voice_id;
      if (s.group_id) cfg.group_id = s.group_id;
    } catch (_) {}
  }
  cfg.capabilities = modelCapabilityService.normalizeCapabilities(r.capabilities_json, cfg);
  return cfg;
}

function isInCooldown(cfg, nowMs = Date.now()) {
  if (!cfg || !cfg.disabled_until) return false;
  const until = Date.parse(cfg.disabled_until);
  return Number.isFinite(until) && until > nowMs;
}

function isRouteEligible(cfg, nowMs = Date.now(), options = {}) {
  if (!cfg) return false;
  if (!options.includeInactive && cfg.is_active === false) return false;
  if (!options.includeCoolingDown && isInCooldown(cfg, nowMs)) return false;
  if (!options.includeCoolingDown && cfg.health_status === 'auth_failed') return false;
  return true;
}

function isQuotaAllowedForRuntime(db, serviceType, cfg, options = {}) {
  if (options.includeQuotaExceeded) return true;
  try {
    const model = options.model || options.preferredModel || cfg.default_model || (Array.isArray(cfg.model) ? cfg.model[0] : cfg.model) || '';
    const estimate = {
      requests: 1,
      ...(options.usage_estimate || options.usageEstimate || options.estimate || {}),
    };
    return quotaGuard.isConfigQuotaAllowed(db, {
      config: cfg,
      service_type: serviceType,
      scene_key: options.scene_key || options.sceneKey,
      model,
      user_id: options.user_id || options.userId,
      project_id: options.project_id || options.projectId || options.drama_id,
    }, estimate).allowed;
  } catch (_) {
    return true;
  }
}

function formatQuotaViolation(violation = {}) {
  const unitLabels = {
    requests: '请求数',
    tokens: 'Token',
    images: '图片张数',
    video_seconds: '视频秒数',
    audio_seconds: '音频秒数',
    seconds: '音视频秒数',
    cost: '成本',
    storage_bytes: '存储',
  };
  const unit = unitLabels[violation.limit_unit] || violation.limit_unit || '用量';
  const used = Number(violation.used_value || 0);
  const reserve = Number(violation.reserved_value || 0);
  const limit = Number(violation.limit_value || 0);
  return `${unit}额度不足：已用 ${used}，本次预计 ${reserve}，限额 ${limit}`;
}

function getRuntimeQuotaBlockMessage(db, serviceType, options = {}) {
  if (options.includeQuotaExceeded) return null;
  try {
    serviceType = normalizeServiceType(serviceType);
    const list = listConfigs(db, serviceType);
    const nowMs = Date.now();
    const requestedId = options.config_id != null || options.ai_config_id != null
      ? Number(options.config_id ?? options.ai_config_id)
      : null;
    const preferredModel = options.model || options.preferredModel || null;
    const estimate = {
      requests: 1,
      ...(options.usage_estimate || options.usageEstimate || options.estimate || {}),
    };
    const eligible = list.filter((cfg) => {
      if (!isRouteEligible(cfg, nowMs, {
        includeInactive: !!options.includeInactive,
        includeCoolingDown: !!options.includeCoolingDown,
      })) return false;
      if (requestedId && Number.isFinite(requestedId) && Number(cfg.id) !== requestedId) return false;
      if (preferredModel) {
        const models = Array.isArray(cfg.model) ? cfg.model : (cfg.model != null ? [cfg.model] : []);
        if (!models.includes(String(preferredModel).trim())) return false;
      }
      return true;
    });
    const quotaViolations = [];
    for (const cfg of eligible) {
      const model = preferredModel || cfg.default_model || (Array.isArray(cfg.model) ? cfg.model[0] : cfg.model) || '';
      const check = quotaGuard.isConfigQuotaAllowed(db, {
        config: cfg,
        service_type: serviceType,
        scene_key: options.scene_key || options.sceneKey,
        model,
        user_id: options.user_id || options.userId,
        project_id: options.project_id || options.projectId || options.drama_id,
      }, estimate);
      if (!check.allowed) quotaViolations.push(...check.violations);
    }
    if (!quotaViolations.length) return null;
    return `当前${serviceType}模型额度已达到限制，${formatQuotaViolation(quotaViolations[0])}`;
  } catch (_) {
    return null;
  }
}

function getRuntimeConfigCandidates(db, serviceType, options = {}) {
  serviceType = normalizeServiceType(serviceType);
  const list = listConfigs(db, serviceType);
  const nowMs = Date.now();
  const includeCoolingDown = !!options.includeCoolingDown;
  const includeInactive = !!options.includeInactive;
  const selectForRequest = options.selectForRequest !== false;
  const requestedId = options.config_id != null || options.ai_config_id != null
    ? Number(options.config_id ?? options.ai_config_id)
    : null;
  const preferredModel = options.model || options.preferredModel || null;

  let candidates = list.filter((cfg) => {
    return (
      isRouteEligible(cfg, nowMs, { includeInactive, includeCoolingDown }) &&
      isQuotaAllowedForRuntime(db, serviceType, cfg, options)
    );
  });

  if (requestedId && Number.isFinite(requestedId)) {
    const requested = list.find((cfg) => Number(cfg.id) === requestedId);
    if (!requested) return [];
    if (
      !isRouteEligible(requested, nowMs, { includeInactive, includeCoolingDown }) ||
      !isQuotaAllowedForRuntime(db, serviceType, requested, options)
    ) {
      return options.fallback === false
        ? []
        : capAttemptConfigs(candidates.filter((cfg) => Number(cfg.id) !== requestedId), getRoutingPolicy(db, serviceType));
    }
    const rest = options.fallback === false
      ? []
      : candidates.filter((cfg) => Number(cfg.id) !== requestedId);
    return capAttemptConfigs([requested, ...rest], getRoutingPolicy(db, serviceType));
  }

  if (preferredModel) {
    const model = String(preferredModel).trim();
    const matched = candidates.filter((cfg) => {
      const models = Array.isArray(cfg.model) ? cfg.model : (cfg.model != null ? [cfg.model] : []);
      return models.includes(model);
    });
    const rest = candidates.filter((cfg) => !matched.some((m) => Number(m.id) === Number(cfg.id)));
    candidates = [...matched, ...rest];
  }

  const policy = getRoutingPolicy(db, serviceType);
  if (selectForRequest && policy.strategy === 'round_robin' && candidates.length > 1) {
    const cursor = getRoutingCursor(db, serviceType);
    candidates = rotateByCursor(candidates, cursor);
    bumpRoutingCursor(db, serviceType);
  }
  return capAttemptConfigs(candidates, policy);
}

function sanitizeErrorMessage(err) {
  const raw = typeof err === 'string' ? err : (err?.message || String(err || ''));
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/sk-[A-Za-z0-9_-]{12,}/gi, 'sk-***')
    .slice(0, 500);
}

function getConfigByIdForRuntime(db, configId) {
  if (!db || !configId) return null;
  try {
    const row = db.prepare('SELECT * FROM ai_service_configs WHERE id = ? AND deleted_at IS NULL').get(configId);
    return row ? rowToConfig(row) : null;
  } catch (_) {
    return null;
  }
}

function classifyAiFailure(err) {
  const msg = sanitizeErrorMessage(err);
  const statusMatch = msg.match(/\bhttp\s+(\d{3})\b/i) || msg.match(/\bstatus(?:Code)?[:= ]+(\d{3})\b/i);
  const status = statusMatch ? Number(statusMatch[1]) : 0;

  if (
    /quota|insufficient_quota|billing|balance|credit|resource exhausted/i.test(msg)
    || /额度|余额|欠费|用量|账单|资源已耗尽/.test(msg)
  ) {
    return { message: msg, health_status: 'quota_exhausted', disabled_until: null, disableActive: false, fallbackable: true, reason: 'quota' };
  }
  if (status === 401 || status === 403 || /invalid api key|unauthorized|forbidden|permission denied|api key.*invalid|鉴权|认证|无权限/i.test(msg)) {
    return { message: msg, health_status: 'auth_failed', disabled_until: null, disableActive: false, fallbackable: true, reason: 'auth' };
  }
  if (status === 429 || /rate limit|too many requests|限流|请求过多/i.test(msg)) {
    return { message: msg, health_status: 'cooldown', disabled_until: null, disableActive: false, fallbackable: true, reason: 'rate_limit' };
  }
  if (status >= 500 || /timeout|timed out|fetch failed|network|econnreset|etimedout|socket hang up|超时|网络/i.test(msg)) {
    return { message: msg, health_status: 'cooldown', disabled_until: null, disableActive: false, fallbackable: true, reason: 'transient' };
  }
  if (/返回内容为空|empty|未返回|no image|no video/i.test(msg)) {
    return { message: msg, health_status: 'cooldown', disabled_until: null, disableActive: false, fallbackable: true, reason: 'empty_result' };
  }
  return { message: msg, health_status: 'failed', disabled_until: null, disableActive: false, fallbackable: false, reason: 'request_error' };
}

function recordConfigSuccess(db, configId) {
  if (!configId) return;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE ai_service_configs
     SET health_status = 'ok',
         disabled_until = NULL,
         failure_count = 0,
         last_error = NULL,
         last_error_at = NULL,
         updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`
  ).run(now, configId);
}

function recordConfigFailure(db, configId, err, options = {}) {
  if (!configId) return classifyAiFailure(err);
  const info = classifyAiFailure(err);
  const now = new Date().toISOString();
  const cfg = getConfigByIdForRuntime(db, configId);
  const policy = resolveConfigRoutingPolicy(db, cfg, options.serviceType || cfg?.service_type, options.model);
  const oldFailureCount = Number(cfg?.failure_count || 0);
  const nextFailureCount = oldFailureCount + 1;
  let disabledUntil = info.disabled_until;
  if (info.reason === 'quota') {
    disabledUntil = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  } else if (info.health_status === 'cooldown') {
    const baseSeconds = Math.max(0, Number(policy.cooldown_seconds || 0));
    const maxSeconds = Math.max(1, Number(policy.cooldown_max_seconds || baseSeconds || 1));
    const scaled = baseSeconds * Math.pow(2, Math.max(0, nextFailureCount - 1));
    const seconds = Math.min(maxSeconds, Math.max(baseSeconds, scaled));
    disabledUntil = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
  }
  const updates = [
    'failure_count = ?',
    'health_status = ?',
    'disabled_until = ?',
    'last_error = ?',
    'last_error_at = ?',
    'updated_at = ?',
  ];
  const params = [
    nextFailureCount,
    info.health_status,
    disabledUntil,
    info.message,
    now,
    now,
  ];
  params.push(configId);
  db.prepare(`UPDATE ai_service_configs SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...params);
  return { ...info, disabled_until: disabledUntil };
}

/**
 * 测试连接：与 Go AIService.TestConnection 对齐，根据 provider 发最小请求验证 base_url + api_key
 * @param opts { base_url, api_key, model (string|string[]), default_model?, provider?, endpoint?, settings? }
 * @returns Promise<void> 成功 resolve，失败 reject(error)
 */
async function testConnection(opts) {
  const base = (opts.base_url || '').replace(/\/$/, '');
  if (!base) throw new Error('base_url 必填');
  if (!opts.api_key) throw new Error('api_key 必填');
  const models = Array.isArray(opts.model) ? opts.model : opts.model != null ? [opts.model] : [];
  const defaultModel = String(opts.default_model || '').trim();
  const model = defaultModel || models[0] || '';
  if (!model && (opts.provider === 'gemini' || opts.provider === 'google')) throw new Error('model 必填');
  const provider = (opts.provider || 'openai').toLowerCase();
  const serviceType = (opts.service_type || '').toLowerCase();
  let endpoint = opts.endpoint || '';

  // --- NanoBanana ---
  if (provider === 'nano_banana') {
    // 用 record-info 查询一个不存在的 taskId：401/403=key 无效，404=key 有效已联通
    const url = base + '/api/v1/nanobanana/record-info?taskId=test-connectivity';
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + (opts.api_key || '') },
    });
    if (res.status === 401 || res.status === 403) {
      const text = await res.text();
      let errMsg = `API Key 无效 (${res.status})`;
      try { const j = JSON.parse(text); errMsg = j.msg || j.message || errMsg; } catch {}
      throw new Error(errMsg);
    }
    return;
  }

  // --- Gemini ---
  if (provider === 'gemini' || provider === 'google') {
    endpoint = endpoint || '/v1beta/models/{model}:generateContent';
    const path = endpoint.replace(/{model}/g, model || 'gemini-pro');
    const url = base + (path.startsWith('/') ? path : '/' + path) + '?key=' + encodeURIComponent(opts.api_key || '');
    const body = { contents: [{ parts: [{ text: 'Hello' }] }] };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`请求失败: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = await res.json().catch(() => ({}));
    if (data.candidates == null && data.error != null) {
      throw new Error(data.error.message || data.error || 'Gemini 返回错误');
    }
    return;
  }

  // --- TTS 语音合成 ---
  if (serviceType === 'tts') {
    let ttsSettings = {};
    try { ttsSettings = opts.settings ? (typeof opts.settings === 'string' ? JSON.parse(opts.settings) : opts.settings) : {}; } catch (_) {}
    const groupId = opts.group_id || ttsSettings.group_id || '';
    const voiceId = opts.voice_id || ttsSettings.voice_id || (provider === 'minimax' ? 'female-shaonv' : 'alloy');
    const probeUrl = provider === 'minimax'
      ? minimaxTtsAdapter.buildMinimaxTtsUrl(base, groupId)
      : openAiTtsAdapter.buildOpenAiTtsUrl(base);
    const probeBody = provider === 'minimax'
      ? JSON.stringify({
          model: model || 'speech-02-hd',
          text: 'hi',
          stream: false,
          voice_setting: { voice_id: voiceId, speed: 1.0, vol: 1.0, pitch: 0 },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
        })
      : JSON.stringify({
          model: model || 'tts-1',
          input: 'hi',
          voice: voiceId,
          response_format: 'mp3',
        });
    const res = await fetch(probeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (opts.api_key || '') },
      body: probeBody,
    });
    if (res.status === 401 || res.status === 403) {
      const text = await res.text();
      let errMsg = `API Key 无效 (${res.status})`;
      try { const j = JSON.parse(text); errMsg = j.base_resp?.status_msg || j.error?.message || j.message || errMsg; } catch {}
      throw new Error(errMsg);
    }
    // 其他状态（400 缺参数、404 端点不对等）说明网络通、key 疑似有效
    return;
  }

  // service_type 作为主要判断信号
  const isImageService = normalizeServiceType(serviceType) === 'image';
  const isVideoService = serviceType === 'video';
  const hasImageEndpoint = !!(endpoint && endpoint.includes('/images/'));

  const isDashscope = provider === 'dashscope' || provider === 'qwen_image';
  const isVolcengine = provider === 'volces' || provider === 'volcengine' || provider === 'volc';
  const modelLower = model.toLowerCase();

  // 兜底识别图片/视频模型（service_type 未传时使用）
  const looksLikeImageModel = /seedream|image2video|text2image|img2img|wanx|wan\d|flux|stable.?diff|dall.?e|imagen|-image$/i.test(modelLower)
    || (isVolcengine && /seedream|vision|image/i.test(modelLower));
  const looksLikeVideoModel = /seedance|video.?gen|video2video|kf2v|cogvideo|sora|kling/i.test(modelLower);
  // DashScope 图片/视频专用端点特征
  const isDashscopeNonChatEndpoint = isDashscope && !!(endpoint && (endpoint.includes('aigc') || endpoint.includes('multimodal') || endpoint.includes('video')));

  // 综合判断是否为图片服务
  const treatAsImage = isImageService || hasImageEndpoint || isDashscopeNonChatEndpoint
    || looksLikeImageModel
    || (isVolcengine && !serviceType && !endpoint);

  // --- DashScope 图片 / 视频 / 分镜 ---
  // 通义万象 / WAN 系列：API key 通过 compatible-mode chat 接口验证即可（同一 key 通用）
  if (isDashscope && (isImageService || isVideoService || looksLikeImageModel || looksLikeVideoModel || isDashscopeNonChatEndpoint)) {
    const chatUrl = base.replace(/\/(api\/v1|compatible-mode)\/.*$/, '') + '/compatible-mode/v1/chat/completions';
    const body = { model: 'qwen-turbo', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 };
    console.log('[testConnection] DashScope 非文本服务，用 compatible chat 验证 key', { chatUrl, serviceType, model });
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + opts.api_key },
      body: JSON.stringify(body),
    });
    // 401/403 = key 无效，其他均视为联通
    if (res.status === 401 || res.status === 403) {
      const text = await res.text();
      let errMsg = `API Key 无效 (${res.status})`;
      try { const j = JSON.parse(text); errMsg = j.error?.message || j.message || errMsg; } catch {}
      throw new Error(errMsg);
    }
    return;
  }

  // --- 视频生成服务（非 DashScope）：通过 chat/completions 验证 key 合法性 ---
  // 视频生成 API 调用代价高昂，无法直接测试；但同账号 chat 接口验证 key 有效性即可
  if (isVideoService || looksLikeVideoModel) {
    const chatPath = '/chat/completions';
    const url = base + chatPath;
    const body = { model: model || '', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 };
    console.log('[testConnection] 视频服务，用 chat/completions 验证 key', { url, serviceType, model });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (opts.api_key || '') },
      body: JSON.stringify(body),
    });
    // 401/403 = key 无效；其他（400 模型不存在等）视为联通
    if (res.status === 401 || res.status === 403) {
      const text = await res.text();
      let errMsg = `API Key 无效 (${res.status})`;
      try { const j = JSON.parse(text); errMsg = j.error?.message || j.message || errMsg; } catch {}
      throw new Error(errMsg);
    }
    return;
  }

  // --- OpenAI 兼容图片生成（volcengine、OpenAI DALL·E、其他）---
  if (treatAsImage) {
    endpoint = endpoint || '/images/generations';
    const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const url = base + path;
    const body = { model: model || '', prompt: 'test connectivity', n: 1 };
    console.log('[testConnection] 图片服务', { url, serviceType, model, body });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (opts.api_key || ''),
      },
      body: JSON.stringify(body),
    });
    // 401/403 = key 无效；其他状态（含 400 参数错误、429 限流等）表示已联通
    if (res.status === 401 || res.status === 403) {
      const text = await res.text();
      let errMsg = `API Key 无效 (${res.status})`;
      try {
        const j = JSON.parse(text);
        errMsg = j.error?.message || j.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
    if (!res.ok) {
      // 其他 4xx/5xx：如果能解析出明确的 auth 错误才拒绝，否则视为联通
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      const msg = parsed?.error?.message || parsed?.message || '';
      const lmsg = msg.toLowerCase();
      const isAuthErr = lmsg.includes('unauthorized') || lmsg.includes('invalid api key')
        || lmsg.includes('authentication') || lmsg.includes('forbidden');
      if (isAuthErr) throw new Error(`API Key 无效: ${msg || res.status}`);
      // 其他错误（如模型不支持某个 API 参数）说明网络通、key 有效
      return;
    }
    return;
  }

  // --- OpenAI / 默认：chat completions ---
  endpoint = endpoint || '/chat/completions';
  const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  const url = base + path;
  let body = {
    model: model || 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 5,
  };
  body = applyDeepSeekConnectivityOptions(
    { provider, base_url: base, settings: opts.settings },
    body
  );
  console.log('[testConnection] 文本/chat 服务', { url, serviceType, model });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (opts.api_key || ''),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let errMsg = `请求失败: ${res.status}`;
    try {
      const j = JSON.parse(text);
      errMsg += ' - ' + (j.error?.message || j.message || j.error || text.slice(0, 150));
    } catch {
      if (text) errMsg += ' - ' + text.slice(0, 150);
    }
    throw new Error(errMsg);
  }
  const data = await res.json().catch(() => ({}));
  if (data.choices == null && data.error != null) {
    throw new Error(data.error.message || data.error || '接口返回错误');
  }
}

/**
 * 返回 vendor_lock 状态
 */
function getVendorLockStatus(cfg) {
  const lock = cfg?.vendor_lock;
  return {
    enabled: !!(lock?.enabled),
    config_file: lock?.config_file || '',
  };
}

/**
 * 启动时同步 vendor_lock 指定的配置文件到数据库。
 * - 软删除所有现有配置，按文件重新导入
 * - 若同 service_type + provider 在 DB 中已有记录，则保留用户修改过的 api_key
 */
function applyVendorLock(db, log, cfg) {
  const status = getVendorLockStatus(cfg);
  if (!status.enabled) return;

  const configFile = status.config_file;
  if (!configFile) {
    log.warn && log.warn('vendor_lock enabled but config_file is empty');
    return;
  }

  const candidates = [
    path.join(process.cwd(), 'configs', configFile),
    path.join(__dirname, '..', '..', 'configs', configFile),
  ];
  let raw = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) { raw = fs.readFileSync(p, 'utf8'); break; }
  }
  if (!raw) {
    console.warn('[vendor_lock] config file not found:', configFile);
    return;
  }

  let configs;
  try {
    configs = JSON.parse(raw);
    if (!Array.isArray(configs)) throw new Error('config file must be a JSON array');
  } catch (e) {
    console.error('[vendor_lock] failed to parse config file:', e.message);
    return;
  }

  // 保存现有 api_key（key: "service_type:provider"）
  const existing = db.prepare('SELECT service_type, provider, api_key FROM ai_service_configs WHERE deleted_at IS NULL').all();
  const savedKeys = new Map();
  for (const row of existing) {
    savedKeys.set(`${row.service_type}:${row.provider}`, row.api_key);
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE ai_service_configs SET deleted_at = ? WHERE deleted_at IS NULL').run(now);

  for (const item of configs) {
    const mapKey = `${item.service_type}:${item.provider}`;
    const apiKey = savedKeys.get(mapKey) ?? item.api_key ?? '';
    const model = Array.isArray(item.model)
      ? JSON.stringify(item.model)
      : item.model ? JSON.stringify([item.model]) : '[]';
    db.prepare(
      `INSERT INTO ai_service_configs
        (service_type, provider, api_protocol, name, base_url, api_key, model, default_model, endpoint, query_endpoint, route_order, retry_count, cooldown_seconds, request_timeout_ms, is_active, capabilities_json, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).run(
      normalizeServiceType(item.service_type || 'text'),
      item.provider || '',
      item.api_protocol || '',
      item.name || '',
      item.base_url || '',
      apiKey,
      model,
      item.default_model || null,
      item.endpoint || '',
      item.query_endpoint || '',
      item.route_order ?? 0,
      item.retry_count ?? 0,
      item.cooldown_seconds ?? 0,
      timeoutSecondsToMs(item.request_timeout_seconds, 0),
      capabilityOverridesToDb(item.capabilities_json ?? item.capabilities) || null,
      item.settings || null,
      now,
      now
    );
  }
  for (const item of configs) {
    console.log(`[vendor_lock] loaded: service_type=${item.service_type} provider=${item.provider} api_protocol=${item.api_protocol || '(auto)'} endpoint=${item.endpoint || '(auto)'}`);
  }
  console.log(`[vendor_lock] synced ${configs.length} configs from ${configFile}`);
}

/**
 * 批量替换所有配置的 api_key（仅限锁定模式下使用）
 */
function bulkUpdateApiKey(db, log, newKey) {
  const now = new Date().toISOString();
  const info = db.prepare(
    'UPDATE ai_service_configs SET api_key = ?, updated_at = ? WHERE deleted_at IS NULL'
  ).run(newKey, now);
  log.info('Bulk update api_key', { updated: info.changes });
  return info.changes;
}

module.exports = {
  listConfigs,
  getRoutingPolicies,
  getRoutingPolicy,
  updateRoutingPolicy,
  getActivePublicConfig,
  listRuntimePublicConfigs,
  getRuntimeModelRoutes,
  getRuntimeConfigCandidates,
  getRuntimeQuotaBlockMessage,
  recordConfigSuccess,
  recordConfigFailure,
  classifyAiFailure,
  getRetryCountForConfig,
  getRequestTimeoutMsForConfig,
  resolveConfigRoutingPolicy,
  normalizeServiceType,
  getConfig,
  createConfig,
  updateConfig,
  reorderConfigs,
  deleteConfig,
  testConnection,
  getVendorLockStatus,
  applyVendorLock,
  bulkUpdateApiKey,
};
