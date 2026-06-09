const settingsService = require('../settingsService');

const ROUTING_POLICY_KEY = 'ai_routing_policies';
const ROUTING_CURSOR_KEY = 'ai_routing_cursors';

const DEFAULT_ROUTING_POLICIES = {
  text: {
    strategy: 'sequential',
    max_attempt_configs: 0,
    concurrency_limit: 20,
    retry_count: 1,
    cooldown_seconds: 30,
    cooldown_max_seconds: 1800,
    request_timeout_seconds: 120,
    video_poll_timeout_seconds: null,
  },
  image: {
    strategy: 'sequential',
    max_attempt_configs: 0,
    concurrency_limit: 4,
    retry_count: 1,
    cooldown_seconds: 120,
    cooldown_max_seconds: 1800,
    request_timeout_seconds: 900,
    video_poll_timeout_seconds: null,
  },
  video: {
    strategy: 'sequential',
    max_attempt_configs: 0,
    concurrency_limit: 10,
    retry_count: 0,
    cooldown_seconds: 300,
    cooldown_max_seconds: 3600,
    request_timeout_seconds: 180,
    video_poll_timeout_seconds: 3600,
  },
  tts: {
    strategy: 'sequential',
    max_attempt_configs: 0,
    concurrency_limit: 10,
    retry_count: 1,
    cooldown_seconds: 60,
    cooldown_max_seconds: 1800,
    request_timeout_seconds: 180,
    video_poll_timeout_seconds: null,
  },
  jimeng2_character_auth: {
    strategy: 'sequential',
    max_attempt_configs: 0,
    concurrency_limit: 5,
    retry_count: 0,
    cooldown_seconds: 300,
    cooldown_max_seconds: 3600,
    request_timeout_seconds: 120,
    video_poll_timeout_seconds: null,
  },
};

function normalizeServiceType(serviceType) {
  return serviceType === 'storyboard_image' ? 'image' : (serviceType || 'text');
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function timeoutSecondsToMs(value, fallbackMs = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallbackMs;
  return clampInt(n, Math.ceil(fallbackMs / 1000), 0, 30 * 60) * 1000;
}

function timeoutMsToSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 1000);
}

function parseSettings(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function normalizeRoutingPolicy(serviceType, raw = {}) {
  const key = normalizeServiceType(serviceType);
  const defaults = DEFAULT_ROUTING_POLICIES[key] || DEFAULT_ROUTING_POLICIES.text;
  const strategy = raw.strategy === 'round_robin' ? 'round_robin' : 'sequential';
  const concurrencyMax = key === 'image' ? 8 : 500;
  const requestTimeoutSeconds = clampInt(
    raw.request_timeout_seconds,
    defaults.request_timeout_seconds,
    1,
    30 * 60
  );
  const videoPollTimeoutSeconds = key === 'video'
    ? clampInt(
        raw.video_poll_timeout_seconds,
        defaults.video_poll_timeout_seconds,
        1,
        24 * 3600
      )
    : null;
  return {
    strategy,
    max_attempt_configs: clampInt(raw.max_attempt_configs, defaults.max_attempt_configs, 0, 50),
    concurrency_limit: clampInt(raw.concurrency_limit, defaults.concurrency_limit, 1, concurrencyMax),
    retry_count: clampInt(raw.retry_count, defaults.retry_count, 0, 5),
    cooldown_seconds: clampInt(raw.cooldown_seconds, defaults.cooldown_seconds, 0, 24 * 3600),
    cooldown_max_seconds: clampInt(raw.cooldown_max_seconds, defaults.cooldown_max_seconds, 1, 24 * 3600),
    request_timeout_seconds: requestTimeoutSeconds,
    video_poll_timeout_seconds: videoPollTimeoutSeconds,
  };
}

function getRoutingPolicies(db) {
  const saved = settingsService.getGlobalSetting(db, ROUTING_POLICY_KEY, {});
  const out = {};
  for (const key of Object.keys(DEFAULT_ROUTING_POLICIES)) {
    out[key] = normalizeRoutingPolicy(key, saved?.[key] || {});
  }
  return out;
}

function getRoutingPolicy(db, serviceType) {
  const key = normalizeServiceType(serviceType);
  return getRoutingPolicies(db)[key] || normalizeRoutingPolicy(key);
}

function updateRoutingPolicy(db, serviceType, patch) {
  const key = normalizeServiceType(serviceType);
  if (!DEFAULT_ROUTING_POLICIES[key]) {
    throw new Error(`不支持的服务类型: ${serviceType}`);
  }
  const all = getRoutingPolicies(db);
  all[key] = normalizeRoutingPolicy(key, { ...all[key], ...(patch || {}) });
  settingsService.setGlobalSetting(db, ROUTING_POLICY_KEY, all);
  return all;
}

function getRoutingCursor(db, serviceType) {
  const cursors = settingsService.getGlobalSetting(db, ROUTING_CURSOR_KEY, {});
  const n = Number(cursors?.[serviceType] || 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function bumpRoutingCursor(db, serviceType, step = 1) {
  const cursors = settingsService.getGlobalSetting(db, ROUTING_CURSOR_KEY, {});
  const current = Number(cursors?.[serviceType] || 0);
  cursors[serviceType] = (Number.isFinite(current) ? current : 0) + step;
  settingsService.setGlobalSetting(db, ROUTING_CURSOR_KEY, cursors);
}

function rotateByCursor(items, cursor) {
  if (!Array.isArray(items) || items.length <= 1) return items;
  const idx = Math.abs(cursor) % items.length;
  return [...items.slice(idx), ...items.slice(0, idx)];
}

function capAttemptConfigs(items, policy) {
  const max = Number(policy?.max_attempt_configs || 0);
  if (!Number.isFinite(max) || max <= 0) return items;
  return items.slice(0, Math.max(1, Math.trunc(max)));
}

function resolveConfigRoutingPolicy(db, config, serviceType, modelName) {
  const key = normalizeServiceType(serviceType || config?.service_type || 'text');
  const base = { ...getRoutingPolicy(db, key) };
  let requestTimeoutMs = clampInt(base.request_timeout_seconds, 120, 1, 30 * 60) * 1000;
  if (config) {
    if (Number(config.retry_count) > 0) base.retry_count = clampInt(config.retry_count, base.retry_count, 0, 5);
    if (Number(config.cooldown_seconds) > 0) base.cooldown_seconds = clampInt(config.cooldown_seconds, base.cooldown_seconds, 0, 24 * 3600);
    if (Number(config.request_timeout_seconds) > 0) requestTimeoutMs = timeoutSecondsToMs(config.request_timeout_seconds, requestTimeoutMs);
    const settings = parseSettings(config.settings);
    const routing = settings.routing && typeof settings.routing === 'object' ? settings.routing : {};
    if (routing.retry_count != null) base.retry_count = clampInt(routing.retry_count, base.retry_count, 0, 5);
    if (routing.cooldown_seconds != null) base.cooldown_seconds = clampInt(routing.cooldown_seconds, base.cooldown_seconds, 0, 24 * 3600);
    if (routing.cooldown_max_seconds != null) base.cooldown_max_seconds = clampInt(routing.cooldown_max_seconds, base.cooldown_max_seconds, 1, 24 * 3600);
    if (routing.request_timeout_seconds != null) requestTimeoutMs = clampInt(routing.request_timeout_seconds, Math.ceil(requestTimeoutMs / 1000), 1, 30 * 60) * 1000;
    const modelKey = modelName ? String(modelName).trim() : '';
    const modelOverrides = routing.model_overrides && typeof routing.model_overrides === 'object' ? routing.model_overrides : {};
    const modelPatch = modelKey ? modelOverrides[modelKey] : null;
    if (modelPatch && typeof modelPatch === 'object') {
      if (modelPatch.retry_count != null) base.retry_count = clampInt(modelPatch.retry_count, base.retry_count, 0, 5);
      if (modelPatch.cooldown_seconds != null) base.cooldown_seconds = clampInt(modelPatch.cooldown_seconds, base.cooldown_seconds, 0, 24 * 3600);
      if (modelPatch.request_timeout_seconds != null) requestTimeoutMs = clampInt(modelPatch.request_timeout_seconds, Math.ceil(requestTimeoutMs / 1000), 1, 30 * 60) * 1000;
    }
  }
  base.request_timeout_seconds = Math.ceil(Number(requestTimeoutMs || 0) / 1000);
  base.request_timeout_ms = requestTimeoutMs;
  return base;
}

function getRetryCountForConfig(db, config, serviceType, modelName) {
  return resolveConfigRoutingPolicy(db, config, serviceType, modelName).retry_count;
}

function getRequestTimeoutMsForConfig(db, config, serviceType, modelName, fallbackMs) {
  const policy = resolveConfigRoutingPolicy(db, config, serviceType, modelName);
  return clampInt(policy.request_timeout_ms, fallbackMs, 1000, 30 * 60 * 1000);
}

module.exports = {
  DEFAULT_ROUTING_POLICIES,
  normalizeServiceType,
  clampInt,
  timeoutSecondsToMs,
  timeoutMsToSeconds,
  normalizeRoutingPolicy,
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
  _test: {
    parseSettings,
    normalizeRoutingPolicy,
  },
};
