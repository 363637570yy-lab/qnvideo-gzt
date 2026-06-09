const aiConfigService = require('../aiConfigService');

function getDefaultConfig(db, serviceType) {
  return aiConfigService.getRuntimeConfigCandidates(db, serviceType)[0] || null;
}

function getConfigForModel(db, serviceType, modelName) {
  return aiConfigService.getRuntimeConfigCandidates(db, serviceType, { model: modelName })[0] || null;
}

function getSceneRouteRow(db, sceneKey) {
  if (!db || !sceneKey) return null;
  try {
    return db.prepare('SELECT * FROM ai_model_map WHERE key = ?').get(sceneKey) || null;
  } catch (_) {
    return null;
  }
}

function getSceneMappedEntries(db, sceneKey, options = {}) {
  const row = getSceneRouteRow(db, sceneKey);
  if (!row) return [];
  const serviceType = aiConfigService.normalizeServiceType(row.service_type || options.serviceType || 'text');
  const preferredModel = row.model_override || options.model || options.preferredModel || null;
  const requestedConfigId = row.config_id || options.config_id || options.ai_config_id || null;
  const candidates = aiConfigService.getRuntimeConfigCandidates(db, serviceType, {
    model: preferredModel,
    config_id: requestedConfigId,
    fallback: options.fallback,
    scene_key: sceneKey,
    user_id: options.user_id || options.userId,
    project_id: options.project_id || options.projectId || options.drama_id,
    usage_estimate: options.usage_estimate || options.usageEstimate,
  });
  return candidates.map((config) => {
    const models = Array.isArray(config.model) ? config.model : (config.model != null ? [config.model] : []);
    const isMappedConfig = row.config_id && String(config.id) === String(row.config_id);
    const modelOverride = row.model_override && (isMappedConfig || models.includes(row.model_override))
      ? row.model_override
      : null;
    return {
      config,
      modelOverride,
      sceneKey,
      serviceType,
      source: 'scene_map',
    };
  });
}

function getSceneMappedEntry(db, sceneKey, options = {}) {
  return getSceneMappedEntries(db, sceneKey, options)[0] || null;
}

function recordConfigSuccess(db, configId) {
  return aiConfigService.recordConfigSuccess(db, configId);
}

function recordConfigFailure(db, configId, err, options = {}) {
  return aiConfigService.recordConfigFailure(db, configId, err, options);
}

function getRetryCountForConfig(db, config, serviceType, modelName) {
  return aiConfigService.getRetryCountForConfig(db, config, serviceType, modelName);
}

function getRequestTimeoutMsForConfig(db, config, serviceType, modelName, fallbackMs) {
  return aiConfigService.getRequestTimeoutMsForConfig(db, config, serviceType, modelName, fallbackMs);
}

module.exports = {
  getDefaultConfig,
  getConfigForModel,
  getSceneMappedEntries,
  getSceneMappedEntry,
  getSceneRouteRow,
  getRuntimeConfigCandidates: aiConfigService.getRuntimeConfigCandidates,
  getRuntimeQuotaBlockMessage: aiConfigService.getRuntimeQuotaBlockMessage,
  recordConfigSuccess,
  recordConfigFailure,
  getRetryCountForConfig,
  getRequestTimeoutMsForConfig,
  classifyAiFailure: aiConfigService.classifyAiFailure,
};
