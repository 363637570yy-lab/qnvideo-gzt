const VOLC_VIDEO_CREATE_PATH = '/contents/generations/tasks';
const VOLC_VIDEO_QUERY_PATH = '/contents/generations/tasks';

const VOLC_MODEL_ALIASES = {
  'doubao-seedance-1.0-pro-fast': 'doubao-seedance-1-0-pro-250528',
  'doubao-seedance-1.0-pro': 'doubao-seedance-1-0-pro-250528',
  'doubao-seedance-1-0-pro': 'doubao-seedance-1-0-pro-250528',
  'doubao-seedance-1.0-lite': 'doubao-seedance-1-0-lite-250428',
  'doubao-seedance-1-0-lite': 'doubao-seedance-1-0-lite-250428',
  'doubao-seedance-1.5-pro': 'doubao-seedance-1-5-pro-251215',
  'doubao-seedance-1-5-pro': 'doubao-seedance-1-5-pro-251215',
  'doubao-seedance-2.0-pro': 'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-pro': 'doubao-seedance-2-0-260128',
  'doubao-seedance-2.0-fast': 'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2-0-fast': 'doubao-seedance-2-0-fast-260128',
};

function inferVideoProtocol(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'dashscope') return 'dashscope';
  if (p === 'gemini' || p === 'google') return 'gemini';
  if (p === 'volces' || p === 'volcengine' || p === 'volc') return 'volcengine';
  if (p === 'vidu') return 'vidu';
  if (p === 'ffir') return 'kling_omni';
  if (p === 'kling' || p === 'klingai') return 'kling';
  if (p === 'jimeng_ai_api') return 'jimeng_ai_api';
  if (p === 'xai' || p === 'grok') return 'xai';
  return 'openai';
}

function resolveVideoProtocol(config = {}, modelHint) {
  const provider = (config.provider || '').toLowerCase();
  const explicit = String(config.api_protocol || '').trim();
  let protocol = explicit.toLowerCase() || inferVideoProtocol(provider);
  const baseLower = String(config.base_url || '').toLowerCase();
  const modelLower = String(modelHint || '').toLowerCase();
  if (!explicit && protocol === 'openai') {
    if (/api\.x\.ai(\/|$)/.test(baseLower)) protocol = 'xai';
    else if (/grok-imagine|grok.*video/.test(modelLower)) protocol = 'xai';
  }
  return protocol;
}

function getVolcVideoBase(config = {}) {
  let base = (config.base_url || '').replace(/\/$/, '');
  base = base.replace(/\/(contents|video)\/.*$/i, '');
  return base || 'https://ark.cn-beijing.volces.com/api/v3';
}

function buildVideoUrl(config = {}, options = {}) {
  const p = (config.provider || '').toLowerCase();
  const isVolc = p === 'volces' || p === 'volcengine' || p === 'volc';
  if (isVolc) return getVolcVideoBase(config) + VOLC_VIDEO_CREATE_PATH;
  const base = (config.base_url || '').replace(/\/$/, '');
  const fallbackEp = options.defaultEndpoint != null ? options.defaultEndpoint : '/video/generations';
  let ep = config.endpoint || fallbackEp;
  if (!ep.startsWith('/')) ep = '/' + ep;
  return base + ep;
}

function buildQueryUrl(config = {}, taskId) {
  const p = (config.provider || '').toLowerCase();
  const proto = resolveVideoProtocol(config);
  const isDashScope = proto === 'dashscope' || p === 'dashscope';
  const isVolc = p === 'volces' || p === 'volcengine' || p === 'volc';
  const isSora = proto === 'sora';
  if (isVolc) return getVolcVideoBase(config) + VOLC_VIDEO_QUERY_PATH + '/' + encodeURIComponent(taskId);
  const base = (config.base_url || '').replace(/\/$/, '');
  let defaultEp;
  if (isSora) defaultEp = '/v1/videos/{taskId}';
  else if (proto === 'xai') defaultEp = '/v1/videos/{taskId}';
  else if (proto === 'veo3') defaultEp = '/v1/video/query?id={taskId}';
  else if (isDashScope) defaultEp = '/api/v1/tasks/{taskId}';
  else if (proto === 'volcengine_omni') defaultEp = '/v1/videos/generations/async/{taskId}';
  else defaultEp = '/video/task/{taskId}';
  let ep = config.query_endpoint || defaultEp;
  ep = String(ep)
    .replace(/\{taskId\}/gi, encodeURIComponent(taskId))
    .replace(/\{task_id\}/gi, encodeURIComponent(taskId))
    .replace(/\{id\}/gi, encodeURIComponent(taskId));
  if (!ep.startsWith('/')) ep = '/' + ep;
  return base + ep;
}

function normalizeVolcModel(name) {
  if (!name) return name;
  return VOLC_MODEL_ALIASES[String(name).toLowerCase()] || name;
}

function getModelFromConfig(config = {}, preferredModel) {
  const models = Array.isArray(config.model) ? config.model : (config.model != null ? [config.model] : []);
  if (preferredModel && models.includes(preferredModel)) return preferredModel;
  if (config.default_model && models.includes(config.default_model)) return config.default_model;
  return models[0] || '';
}

module.exports = {
  VOLC_VIDEO_CREATE_PATH,
  VOLC_VIDEO_QUERY_PATH,
  VOLC_MODEL_ALIASES,
  inferVideoProtocol,
  resolveVideoProtocol,
  getVolcVideoBase,
  buildVideoUrl,
  buildQueryUrl,
  normalizeVolcModel,
  getModelFromConfig,
};
