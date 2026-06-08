const NO_AI_CONFIG_MESSAGES = {
  text: '未配置文本模型：请联系管理员在「AI 配置」中添加并启用“文本/对话”模型后再生成。',
  image: '未配置图像模型：请联系管理员在「AI 配置」中添加并启用“图像”模型后再生成。',
  video: '未配置视频模型：请联系管理员在「AI 配置」中添加并启用“视频”模型后再生成。',
}

function detectNoConfigType(message) {
  const text = String(message || '')
  if (!text) return null
  if (/未配置.*(图片|图像).*模型|no\s+(ai\s+)?image\s*model/i.test(text)) return 'image'
  if (/未配置.*视频.*模型|no\s+(ai\s+)?video\s*model/i.test(text)) return 'video'
  if (/未配置.*(文本|文字).*模型|no\s+(ai\s+)?text\s*model|no\s+(ai\s+)?model\s*configured/i.test(text)) return 'text'
  return null
}

export function normalizeAiFriendlyMessage(message) {
  const type = detectNoConfigType(message)
  if (!type) return message
  return NO_AI_CONFIG_MESSAGES[type]
}

export { NO_AI_CONFIG_MESSAGES }
