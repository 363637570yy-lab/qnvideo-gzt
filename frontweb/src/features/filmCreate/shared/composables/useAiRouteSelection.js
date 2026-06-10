import { reactive, ref } from 'vue'
import { aiAPI } from '@/api/ai'

export const AI_ROUTE_METADATA_KEY = 'ai_route_config_ids'

export const aiRouteTypes = [
  { key: 'text', label: '文本' },
  { key: 'image', label: '图像' },
  { key: 'video', label: '视频' },
  { key: 'tts', label: '音频' },
]

export const pipelineModelStrategyTypes = [
  { key: 'text', label: '文本' },
  { key: 'image', label: '图像' },
  { key: 'video', label: '视频' },
  { key: 'tts', label: '音频' },
]

function createRouteMap(initialValue) {
  return Object.fromEntries(aiRouteTypes.map(({ key }) => [key, typeof initialValue === 'function' ? initialValue(key) : initialValue]))
}

export function normalizeAiRouteId(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : ''
}

export function normalizeRuntimeConcurrency(value, fallback, max = 500) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(max, Math.max(1, Math.trunc(n)))
}

export function useAiRouteSelection(options = {}) {
  const aiRouteLoading = ref(false)
  const aiRoutesLoaded = ref(false)
  const aiRoutesExpanded = ref(false)
  const runtimeAiConfigs = reactive(createRouteMap(() => []))
  const runtimeRoutingPolicies = reactive(createRouteMap(null))
  const selectedAiConfigIds = reactive(createRouteMap(''))

  function projectAiRouteSelectionForSave() {
    return Object.fromEntries(
      aiRouteTypes.map(({ key }) => [key, normalizeAiRouteId(selectedAiConfigIds[key])])
    )
  }

  function applyProjectAiRouteSelection(metadata = {}) {
    const saved =
      metadata?.[AI_ROUTE_METADATA_KEY] ||
      metadata?.ai_routes ||
      metadata?.ai_config_ids ||
      {}
    aiRouteTypes.forEach(({ key }) => {
      selectedAiConfigIds[key] = normalizeAiRouteId(saved?.[key])
    })
  }

  function configOptionLabel(cfg) {
    const name = cfg?.name || cfg?.provider || '未命名配置'
    const model = cfg?.default_model || (Array.isArray(cfg?.model) ? cfg.model[0] : '')
    const status = cfg?.health_status && cfg.health_status !== 'ok' ? ` · ${cfg.health_status}` : ''
    return `${name}${model ? ' · ' + model : ''}${status}`
  }

  function aiRoutePayload(type, field = 'ai_config_id') {
    const id = Number(selectedAiConfigIds[type])
    if (!Number.isFinite(id) || id <= 0) return {}
    return { [field]: id }
  }

  function textAiPayload() {
    return aiRoutePayload('text', 'text_config_id')
  }

  function imageAiPayload() {
    return aiRoutePayload('image', 'image_config_id')
  }

  function storyboardImageAiPayload() {
    return imageAiPayload()
  }

  function videoAiPayload() {
    return aiRoutePayload('video', 'video_config_id')
  }

  function ttsAiPayload() {
    return aiRoutePayload('tts', 'tts_config_id')
  }

  function applyRuntimeRoutingPolicies(policies = {}) {
    aiRouteTypes.forEach(({ key }) => {
      runtimeRoutingPolicies[key] = policies?.[key] || null
    })
    if (options.pipelineConcurrency) {
      options.pipelineConcurrency.value = normalizeRuntimeConcurrency(runtimeRoutingPolicies.image?.concurrency_limit, 4, 8)
    }
    if (options.pipelineVideoConcurrency) {
      options.pipelineVideoConcurrency.value = normalizeRuntimeConcurrency(runtimeRoutingPolicies.video?.concurrency_limit, 3)
    }
  }

  async function loadRuntimeAiConfigs(force = false) {
    if (aiRoutesLoaded.value && !force) return
    aiRouteLoading.value = true
    try {
      const res = await aiAPI.runtimeRoutes()
      const groups = res?.options || res?.items || {}
      aiRouteTypes.forEach(({ key }) => {
        const rows = Array.isArray(groups[key]) ? groups[key] : []
        runtimeAiConfigs[key] = rows
        if (selectedAiConfigIds[key] && !rows.some((cfg) => String(cfg.id) === String(selectedAiConfigIds[key]))) {
          selectedAiConfigIds[key] = ''
        }
      })
      applyRuntimeRoutingPolicies(res?.routing_policies || {})
      aiRoutesLoaded.value = true
    } catch (_) {
      aiRouteTypes.forEach(({ key }) => {
        runtimeAiConfigs[key] = []
      })
      if (typeof options.setPipelineConcurrencyFallback === 'function') {
        options.setPipelineConcurrencyFallback()
      }
    } finally {
      aiRouteLoading.value = false
    }
  }

  function toggleAiRoutesExpanded() {
    aiRoutesExpanded.value = !aiRoutesExpanded.value
    if (aiRoutesExpanded.value) loadRuntimeAiConfigs()
  }

  function onAiRouteSelectVisible(visible) {
    if (visible) loadRuntimeAiConfigs()
  }

  return {
    AI_ROUTE_METADATA_KEY,
    aiRouteLoading,
    aiRoutesLoaded,
    aiRoutesExpanded,
    aiRouteTypes,
    pipelineModelStrategyTypes,
    runtimeAiConfigs,
    runtimeRoutingPolicies,
    selectedAiConfigIds,
    normalizeAiRouteId,
    normalizeRuntimeConcurrency,
    projectAiRouteSelectionForSave,
    applyProjectAiRouteSelection,
    configOptionLabel,
    aiRoutePayload,
    textAiPayload,
    imageAiPayload,
    storyboardImageAiPayload,
    videoAiPayload,
    ttsAiPayload,
    applyRuntimeRoutingPolicies,
    loadRuntimeAiConfigs,
    toggleAiRoutesExpanded,
    onAiRouteSelectVisible,
  }
}
