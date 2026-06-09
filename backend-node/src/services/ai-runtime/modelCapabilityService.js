const CAPABILITY_DEFINITIONS = {
  input_text: { label: '文本输入', group: 'input' },
  image_input: { label: '参考图', group: 'input' },
  multi_image_reference: { label: '多参考图', group: 'input' },
  first_last_frame: { label: '首尾帧', group: 'input' },
  image_output: { label: '图片输出', group: 'output' },
  video_output: { label: '视频输出', group: 'output' },
  audio_output: { label: '音频输出', group: 'output' },
  tts: { label: 'TTS', group: 'audio' },
  streaming: { label: '流式', group: 'runtime' },
  partial_images: { label: '局部预览', group: 'runtime' },
  async_task: { label: '异步任务', group: 'runtime' },
  sync_result: { label: '同步返回', group: 'runtime' },
  usage_tokens: { label: 'Token 用量', group: 'usage' },
  usage_images: { label: '图片用量', group: 'usage' },
  usage_video_seconds: { label: '视频秒数', group: 'usage' },
  usage_audio_seconds: { label: '音频秒数', group: 'usage' },
  negative_prompt: { label: '负向词', group: 'control' },
  seed: { label: '随机种子', group: 'control' },
  resolution: { label: '分辨率', group: 'control' },
  camera_control: { label: '运镜控制', group: 'control' },
};

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function asList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

function add(set, ...keys) {
  for (const key of keys) {
    if (CAPABILITY_DEFINITIONS[key]) set.add(key);
  }
}

function inferCapabilities(config = {}) {
  const serviceType = String(config.service_type || '').toLowerCase();
  const provider = String(config.provider || '').toLowerCase();
  const protocol = String(config.api_protocol || '').toLowerCase();
  const models = asList(config.default_model || config.model);
  const modelText = models.join(' ').toLowerCase();
  const caps = new Set();

  if (serviceType === 'text') {
    add(caps, 'input_text', 'sync_result', 'streaming', 'usage_tokens');
  }

  if (serviceType === 'image') {
    add(caps, 'input_text', 'image_output', 'sync_result', 'resolution');
    if (/gpt_image|cliproxy|openai|gemini|kling|nano|dashscope|qwen|seedream|image/i.test(`${protocol} ${provider} ${modelText}`)) {
      add(caps, 'image_input');
    }
    if (/gpt_image|cliproxy|gemini|nano|kling|qwen|seedream|edit/i.test(`${protocol} ${provider} ${modelText}`)) {
      add(caps, 'multi_image_reference');
    }
    if (/gpt_image|cliproxy/.test(`${protocol} ${provider}`)) {
      add(caps, 'streaming', 'partial_images', 'usage_images');
    }
    if (/stable|sd|seed|wan|dashscope|qwen/i.test(`${provider} ${modelText}`)) {
      add(caps, 'negative_prompt', 'seed');
    }
  }

  if (serviceType === 'video') {
    add(caps, 'input_text', 'video_output', 'async_task', 'resolution', 'usage_video_seconds');
    if (/i2v|image|seedance|kling|vidu|veo|omni|wan|sora/i.test(`${protocol} ${provider} ${modelText}`)) {
      add(caps, 'image_input');
    }
    if (/first|last|tail|首尾|omni|seedance|kling/i.test(`${protocol} ${provider} ${modelText}`)) {
      add(caps, 'first_last_frame');
    }
    if (/kling|vidu|seedance|veo|omni/i.test(`${protocol} ${provider} ${modelText}`)) {
      add(caps, 'camera_control');
    }
  }

  if (serviceType === 'tts') {
    add(caps, 'input_text', 'audio_output', 'tts', 'sync_result', 'usage_audio_seconds');
  }

  if (serviceType === 'jimeng2_character_auth') {
    add(caps, 'image_input', 'sync_result');
  }

  return [...caps];
}

function normalizeCapabilities(raw, config = {}) {
  const inferred = new Set(inferCapabilities(config));
  const overrides = parseJsonObject(raw);
  const enabled = asList(overrides.enabled || overrides.add);
  const disabled = asList(overrides.disabled || overrides.remove);
  for (const key of enabled) {
    if (CAPABILITY_DEFINITIONS[key]) inferred.add(key);
  }
  for (const key of disabled) inferred.delete(key);
  return [...inferred].map((key) => ({
    key,
    label: CAPABILITY_DEFINITIONS[key]?.label || key,
    group: CAPABILITY_DEFINITIONS[key]?.group || 'other',
  }));
}

function getCapabilityDefinitions() {
  return Object.entries(CAPABILITY_DEFINITIONS).map(([key, value]) => ({
    key,
    ...value,
  }));
}

module.exports = {
  CAPABILITY_DEFINITIONS,
  inferCapabilities,
  normalizeCapabilities,
  getCapabilityDefinitions,
  _test: {
    parseJsonObject,
    asList,
  },
};
