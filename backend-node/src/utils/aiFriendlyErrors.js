const NO_AI_CONFIG_MESSAGES = {
  text: '未配置文本模型：请联系管理员在「AI 配置」中添加并启用“文本/对话”模型后再生成。',
  image: '未配置图像模型：请联系管理员在「AI 配置」中添加并启用“图像”模型后再生成。',
  video: '未配置视频模型：请联系管理员在「AI 配置」中添加并启用“视频”模型后再生成。',
  tts: '未配置语音模型：请联系管理员在「AI 配置」中添加并启用“音频/TTS”模型后再生成。',
};

function normalizeServiceType(serviceType) {
  const raw = String(serviceType || '').trim().toLowerCase();
  if (raw.includes('image') || raw.includes('picture')) return 'image';
  if (raw.includes('video')) return 'video';
  if (raw.includes('tts') || raw.includes('audio') || raw.includes('voice')) return 'tts';
  return 'text';
}

function getNoAiConfigMessage(serviceType = 'text') {
  return NO_AI_CONFIG_MESSAGES[normalizeServiceType(serviceType)] || NO_AI_CONFIG_MESSAGES.text;
}

function isNoAiConfigMessage(message) {
  const text = String(message || '');
  return /未配置.*(文本|文字|图片|图像|视频|语音|TTS).*模型/i.test(text)
    || /no\s+(ai\s+)?(text|image|video|tts|audio)?\s*model\s*(configured|config)/i.test(text);
}

function normalizeNoAiConfigMessage(message, serviceType = 'text') {
  return isNoAiConfigMessage(message) ? getNoAiConfigMessage(serviceType) : message;
}

module.exports = {
  NO_AI_CONFIG_MESSAGES,
  getNoAiConfigMessage,
  isNoAiConfigMessage,
  normalizeNoAiConfigMessage,
};
