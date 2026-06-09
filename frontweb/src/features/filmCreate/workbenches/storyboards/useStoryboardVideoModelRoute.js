import { ElMessageBox } from 'element-plus'

export function useStoryboardVideoModelRoute(deps = {}) {
  const {
    aiAPI,
  } = deps

  let activeVideoAiConfigCache = null
  let activeVideoAiConfigCacheAt = 0
  const ACTIVE_VIDEO_AI_CONFIG_TTL_MS = 15000

  function invalidateActiveVideoAiConfigCache() {
    activeVideoAiConfigCache = null
    activeVideoAiConfigCacheAt = 0
  }

  async function getActiveVideoAiConfig() {
    const now = Date.now()
    if (activeVideoAiConfigCache && now - activeVideoAiConfigCacheAt < ACTIVE_VIDEO_AI_CONFIG_TTL_MS) {
      return activeVideoAiConfigCache
    }
    try {
      activeVideoAiConfigCache = await aiAPI.active('video')
    } catch {
      activeVideoAiConfigCache = null
    }
    activeVideoAiConfigCacheAt = now
    return activeVideoAiConfigCache
  }

  function videoModelNameFromAiConfig(cfg) {
    if (!cfg) return ''
    const dm = (cfg.default_model || '').toString().trim()
    if (dm) return dm
    const m = cfg.model
    if (Array.isArray(m) && m.length) return String(m[0]).trim()
    return String(m || '').trim()
  }

  function isSeedance2VideoModel(modelName) {
    const m = String(modelName || '').toLowerCase()
    if (!m.includes('seedance')) return false
    return /2[-_]0/.test(m) || /seedance[-_]?2|seedance2/.test(m)
  }

  function canUseUniversalOmniVideoApi(cfg) {
    if (!cfg) return false
    const proto = String(cfg.api_protocol || '').toLowerCase()
    if (proto === 'kling_omni') return true
    if (proto === 'volcengine_omni') {
      return isSeedance2VideoModel(videoModelNameFromAiConfig(cfg))
    }
    return false
  }

  async function confirmUniversalNonSeedance2Video() {
    await ElMessageBox.confirm(
      '你当前模型不是 Seedance 2.0，只能用分镜图片生成视频；当前可能只会传入场景作为参考图。是否强制继续？',
      '全能模式与模型不匹配',
      { confirmButtonText: '强制继续', cancelButtonText: '取消', type: 'warning' }
    )
  }

  return {
    ACTIVE_VIDEO_AI_CONFIG_TTL_MS,
    canUseUniversalOmniVideoApi,
    confirmUniversalNonSeedance2Video,
    getActiveVideoAiConfig,
    invalidateActiveVideoAiConfigCache,
    isSeedance2VideoModel,
    videoModelNameFromAiConfig,
  }
}
