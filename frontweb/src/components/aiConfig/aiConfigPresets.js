/** 预设厂商与模型（与参考前端一致） */
export const providerConfigs = {
  text: [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4', 'gpt-3.5-turbo'] },
    { id: 'volcengine', name: '火山引擎', models: ['deepseek-v3-2-251201', 'doubao-1-5-pro-32k-250115', 'kimi-k2-thinking-251104'] },
    // { id: 'chatfire', name: 'Chatfire', models: ['gemini-3-flash-preview', 'claude-sonnet-4-5-20250929', 'doubao-seed-1-8-251228'] },
    { id: 'gemini', name: 'Google Gemini', models: ['gemini-2.5-pro', 'gemini-3-flash-preview'] },
    { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
    { id: 'qwen', name: '通义千问', models: ['qwen3-max', 'qwen-plus', 'qwen-flash'] }
  ],
  image: [
    { id: 'volcengine', name: '火山引擎', models: ['doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828'] },
    { id: 'kling', name: '可灵 Kling', models: ['kling-image', 'kling-omni-image'] },
    { id: 'nano_banana', name: 'NanoBanana', models: ['nano-banana-2', 'nano-banana-pro', 'nano-banana'] },
    // { id: 'chatfire', name: 'Chatfire', models: ['nano-banana-pro', 'doubao-seedream-4-5-251128', 'qwen-image'] },
    { id: 'gemini', name: 'Google Gemini', models: ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'] },
    { id: 'cliproxy', name: 'CLIProxyAPI', models: ['gpt-image-2'] },
    { id: 'openai', name: 'OpenAI', models: ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'] },
    { id: 'dashscope', name: '通义万象', models: ['wan2.6-image', 'qwen-image-edit-plus-2026-01-09', 'qwen-image-edit-plus', 'qwen-image-edit-max'] },
    { id: 'qwen_image', name: '通义千问', models: ['qwen-image-max', 'qwen-image-plus', 'qwen-image'] }
  ],
  video: [
    { id: 'klingai', name: '可灵官方 Omni (api-beijing.klingai.com)', models: ['kling-video-o1', 'kling-v3-omni'] },
    { id: 'ffir', name: '飞儿API / 可灵 Omni-Video (ffir.cn)', models: ['kling-video-o1', 'kling-v3-omni'] },
    { id: 'kling', name: '可灵 Kling', models: ['kling-omni-video', 'kling-video', 'kling-motion-control'] },
    { id: 'vidu', name: 'Vidu', models: ['viduq2', 'viduq2-pro', 'viduq2-turbo', 'viduq3-pro'] },
    { id: 'volces', name: '火山引擎', models: ['doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-0-lite-i2v-250428', 'doubao-seedance-1-0-lite-t2v-250428', 'doubao-seedance-1-0-pro-250528', 'doubao-seedance-1-0-pro-fast-251015'] },
    // { id: 'chatfire', name: 'Chatfire', models: ['doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-0-lite-i2v-250428', 'doubao-seedance-1-0-lite-t2v-250428', 'doubao-seedance-1-0-pro-250528', 'doubao-seedance-1-0-pro-fast-251015', 'sora-2', 'sora-2-pro'] },
    { id: 'minimax', name: 'MiniMax 海螺', models: ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast', 'MiniMax-Hailuo-02'] },
    { id: 'gemini', name: 'Google Gemini (Veo)', models: ['veo-3.1-generate-preview', 'veo-3.0-generate-preview', 'veo-3.0-fast-generate-preview'] },
    { id: 'dashscope', name: '通义万相', models: ['wan2.6-r2v-flash', 'wan2.6-t2v', 'wan2.2-kf2v-flash', 'wan2.6-i2v-flash', 'wanx2.1-vace-plus'] },
    {
      id: 'jimeng_ai_api',
      name: 'Jimeng AI API（自建即梦免费 API）',
      models: [
        'jimeng-video-seedance-2.0',
        'seedance-2.0',
        'jimeng-video-seedance-2.0-fast',
        'jimeng-video-3.0',
        'jimeng-video-3.0-pro',
        'jimeng-video-3.5-pro',
      ],
    },
    { id: 'openai', name: 'OpenAI', models: ['sora-2', 'sora-2-pro'] },
    { id: 'xai', name: 'xAI Grok Imagine', models: ['grok-imagine-video'] },
  ],
  tts: [
    { id: 'minimax', name: 'MiniMax T2A', models: ['speech-02-hd', 'speech-02-turbo'] },
  ],
  jimeng2_character_auth: [
    { id: 'jimeng_material_api', name: '即梦业务素材 API（/api/business/v1）', models: ['-'] },
  ],
}

/** 厂商 id → 默认接口规范（api_protocol） */
export const providerProtocolMap = {
  // image
  volcengine: 'volcengine',
  volces: 'volcengine',
  volc: 'volcengine',
  nano_banana: 'nano_banana',
  cliproxy: 'cliproxy_gpt_image2',
  cliproxyapi: 'cliproxy_gpt_image2',
  cli_proxy_api: 'cliproxy_gpt_image2',
  dashscope: 'dashscope',
  qwen_image: 'dashscope',
  gemini: 'gemini',
  google: 'gemini',
  kling: 'kling',
  ffir: 'kling_omni',
  klingai: 'kling_omni',
  // video
  vidu: 'vidu',
  xai: 'xai',
  grok: 'xai',
  minimax: 'openai',
  openai: 'openai',
  chatfire: 'openai',
  qwen: 'openai',
  deepseek: 'openai',
  jimeng_ai_api: 'jimeng_ai_api',
  jimeng_material_api: '',
}

/** 厂商 id → 默认 Base URL（与参考前端 AIConfigDialog 757-775 一致） */
export function getBaseUrlForProvider(provider) {
  if (!provider) return ''
  const p = String(provider).toLowerCase()
  if (p === 'gemini' || p === 'google') return 'https://generativelanguage.googleapis.com'
  if (p === 'minimax') return 'https://api.minimaxi.com/v1'
  if (p === 'volces' || p === 'volcengine') return 'https://ark.cn-beijing.volces.com/api/v3'
  if (p === 'openai') return 'https://api.openai.com/v1'
  if (p === 'cliproxy' || p === 'cliproxyapi' || p === 'cli_proxy_api') return ''
  if (p === 'deepseek') return 'https://api.deepseek.com'
  if (p === 'dashscope') return 'https://dashscope.aliyuncs.com'
  if (p === 'qwen_image') return 'https://dashscope.aliyuncs.com'
  if (p === 'qwen') return 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  if (p === 'nano_banana') return 'https://api.nanobananaapi.ai'
  if (p === 'vidu') return 'https://api.vidu.cn'
  if (p === 'kling') return 'https://api.klingai.com'
  if (p === 'klingai') return 'https://api-beijing.klingai.com'
  if (p === 'ffir') return 'https://ffir.cn'
  if (p === 'jimeng_ai_api') return 'http://127.0.0.1:8000'
  if (p === 'jimeng_material_api') return 'https://silvamux.tingyutech.com'
  if (p === 'xai' || p === 'grok') return 'https://api.x.ai'
  return 'https://api.chatfire.site/v1'
}

export const CUSTOM_PROVIDER_SENTINEL = '__custom__'

/** 通义一键配置用 */
export const TONGYI_CONFIGS = [
  { service_type: 'text', name: '通义千问', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', provider: 'qwen', model: ['qwen-plus'] },
  { service_type: 'image', name: '通义万象 图像', base_url: 'https://dashscope.aliyuncs.com', provider: 'dashscope', model: ['wan2.6-image'] },
  { service_type: 'image', name: '通义千问 文本生图', base_url: 'https://dashscope.aliyuncs.com', provider: 'qwen_image', model: ['qwen-image-max', 'qwen-image-plus', 'qwen-image'] },
  { service_type: 'video', name: '通义万相', base_url: 'https://dashscope.aliyuncs.com', provider: 'dashscope', model: ['wan2.2-kf2v-flash'] }
]

/** 火山引擎一键配置用 */
export const VOLCENGINE_CONFIGS = [
  { service_type: 'text', name: '火山引擎 文本', base_url: 'https://ark.cn-beijing.volces.com/api/v3', provider: 'volcengine', model: ['deepseek-v3-2-251201', 'doubao-1-5-pro-32k-250115', 'kimi-k2-thinking-251104'] },
  { service_type: 'image', name: '火山引擎 即梦 图像', base_url: 'https://ark.cn-beijing.volces.com/api/v3', provider: 'volcengine', model: ['doubao-seedream-4-5-251128'] },
  { service_type: 'video', name: '火山引擎 即梦 视频', base_url: 'https://ark.cn-beijing.volces.com/api/v3', provider: 'volces', model: ['doubao-seedance-1-5-pro-251215'] }
]
