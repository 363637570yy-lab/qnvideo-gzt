import { computed, ref } from 'vue'
import {
  IMAGE_TIER_AREAS,
  VIDEO_TIER_AREAS,
  defaultImageSpec,
  defaultVideoSpec,
  dimensionsForArea as mediaDimensionsForArea,
  imageRatioOptions,
  imageTierOptions,
  normalizeImageSpec,
  normalizeVideoSpec,
  parseRatioValue as parseMediaRatioValue,
  resolveImageSpec as resolveMediaImageSpec,
  resolveVideoSpec as resolveMediaVideoSpec,
  roundToMultiple,
  videoTierOptions,
} from '@/utils/filmCreate/mediaSpec'
import {
  generationStyleOptions,
  getStylePromptEn,
  getStylePromptZh,
  stylePromptMetadataForSave,
} from '@/constants/styleOptions'

const DEFAULT_GENERATION_STYLE = 'xianxia 3d'
const DEFAULT_PROJECT_SETTINGS_SAVE_DELAY_MS = 500

export function useProjectSettings(options = {}) {
  const {
    store,
    saveProjectSettings,
    saveDelayMs = DEFAULT_PROJECT_SETTINGS_SAVE_DELAY_MS,
  } = options

  const PROJECT_SETTINGS_SAVE_DELAY_MS = saveDelayMs
  const projectSettingsHydrating = ref(false)
  const projectSettingsSaveTimer = ref(null)
  const pendingProjectStyleSave = ref(false)
  const pendingProjectSettingsSaveNotify = ref(false)
  const projectSettingsSaveSuppressedUntil = ref(0)

  const scriptLanguage = ref('zh')
  const scriptStoryboardStyle = ref('')
  const generationStyle = ref(DEFAULT_GENERATION_STYLE)
  const projectAspectRatio = ref('16:9')
  const videoClipDuration = ref(10)
  const imageSpecDialogVisible = ref(false)
  const projectImageSpec = ref(defaultImageSpec())
  const projectVideoSpec = ref(defaultVideoSpec())
  const imageSpecDraft = ref(defaultImageSpec())

  function scheduleProjectSettingsSave(includeGenerationStyle = false, options = {}) {
    if (projectSettingsHydrating.value || Date.now() < projectSettingsSaveSuppressedUntil.value || !store?.dramaId) return
    pendingProjectStyleSave.value = pendingProjectStyleSave.value || !!includeGenerationStyle
    pendingProjectSettingsSaveNotify.value = pendingProjectSettingsSaveNotify.value || options.notify !== false
    if (projectSettingsSaveTimer.value) clearTimeout(projectSettingsSaveTimer.value)
    projectSettingsSaveTimer.value = setTimeout(() => {
      projectSettingsSaveTimer.value = null
      const shouldSaveStyle = pendingProjectStyleSave.value
      const shouldNotify = pendingProjectSettingsSaveNotify.value
      pendingProjectStyleSave.value = false
      pendingProjectSettingsSaveNotify.value = false
      saveProjectSettings?.(shouldSaveStyle, { notify: shouldNotify })
    }, PROJECT_SETTINGS_SAVE_DELAY_MS)
  }

  function clearPendingProjectSettingsSave() {
    if (projectSettingsSaveTimer.value) {
      clearTimeout(projectSettingsSaveTimer.value)
      projectSettingsSaveTimer.value = null
    }
    pendingProjectStyleSave.value = false
    pendingProjectSettingsSaveNotify.value = false
  }

  function setProjectSettingsHydrating(value) {
    const hydrating = !!value
    projectSettingsHydrating.value = hydrating
    if (hydrating) {
      clearPendingProjectSettingsSave()
      return
    }
    projectSettingsSaveSuppressedUntil.value = Date.now() + PROJECT_SETTINGS_SAVE_DELAY_MS + 300
  }

  function hydrateProjectSettingsFromDrama(drama) {
    const metadata = drama?.metadata || {}
    generationStyle.value = drama?.style || DEFAULT_GENERATION_STYLE
    projectAspectRatio.value = metadata.aspect_ratio || '16:9'
    projectImageSpec.value = normalizeImageSpec(metadata.image_spec || {})
    projectVideoSpec.value = normalizeVideoSpec(metadata.video_spec || {})
    videoClipDuration.value = metadata.video_clip_duration ? Number(metadata.video_clip_duration) : 10
    scriptLanguage.value = metadata.script_language || 'zh'
  }

  function resetProjectSettings() {
    scriptLanguage.value = 'zh'
    scriptStoryboardStyle.value = ''
    generationStyle.value = DEFAULT_GENERATION_STYLE
    projectAspectRatio.value = '16:9'
    videoClipDuration.value = 10
    projectImageSpec.value = defaultImageSpec()
    projectVideoSpec.value = defaultVideoSpec()
  }

  function parseRatioValue(value, fallback = '16:9') {
    return parseMediaRatioValue(value, fallback, projectAspectRatio.value)
  }

  function dimensionsForArea(area, ratioValue) {
    return mediaDimensionsForArea(area, ratioValue, projectAspectRatio.value)
  }

  function resolveImageSpec(spec) {
    return resolveMediaImageSpec(spec, projectAspectRatio.value)
  }

  function resolveVideoSpec(spec) {
    return resolveMediaVideoSpec(spec, projectAspectRatio.value)
  }

  const imageSpecPreview = computed(() => resolveImageSpec(imageSpecDraft.value))
  const resolvedProjectImageSpec = computed(() => resolveImageSpec(projectImageSpec.value))
  const resolvedProjectVideoSpec = computed(() => resolveVideoSpec(projectVideoSpec.value))
  const imageSpecSummary = computed(() => {
    const r = resolvedProjectImageSpec.value
    return `${r.tier} · ${r.aspect_ratio} · ${r.width}x${r.height}`
  })
  const projectVideoResolution = computed({
    get: () => normalizeVideoSpec(projectVideoSpec.value).tier,
    set: (tier) => {
      projectVideoSpec.value = normalizeVideoSpec({ tier })
    },
  })
  const videoResolution = computed(() => resolvedProjectVideoSpec.value.resolution || '720p')

  function cloneSpec(spec) {
    return JSON.parse(JSON.stringify(spec || {}))
  }

  function openImageSpecDialog() {
    imageSpecDraft.value = normalizeImageSpec(cloneSpec(projectImageSpec.value))
    imageSpecDialogVisible.value = true
  }

  function confirmImageSpec() {
    projectImageSpec.value = normalizeImageSpec(imageSpecDraft.value)
    imageSpecDialogVisible.value = false
    scheduleProjectSettingsSave(false)
  }

  function onProjectVideoResolutionChange() {
    projectVideoSpec.value = normalizeVideoSpec(projectVideoSpec.value)
    scheduleProjectSettingsSave(false)
  }

  function projectMediaSpecMetadata() {
    return {
      image_spec: normalizeImageSpec(projectImageSpec.value),
      video_spec: normalizeVideoSpec(projectVideoSpec.value),
    }
  }

  function findStyleOption(value) {
    for (const group of generationStyleOptions) {
      const found = group.options.find((option) => option.value === value)
      if (found) return found
    }
    return null
  }

  function getSelectedStylePrompt() {
    const value = String(generationStyle.value || '').trim()
    if (!value) return undefined
    const option = findStyleOption(value)
    if (option) return option.promptEn || option.prompt || value
    return value
  }

  function getSelectedStylePromptZh() {
    const value = String(generationStyle.value || '').trim()
    if (!value) return undefined
    const option = findStyleOption(value)
    if (option) return option.prompt || option.promptEn || value
    return value
  }

  function getSelectedStyle() {
    return getSelectedStylePrompt()
  }

  function projectStylePromptMetadata() {
    return stylePromptMetadataForSave(generationStyle.value)
  }

  return {
    DEFAULT_GENERATION_STYLE,
    IMAGE_TIER_AREAS,
    PROJECT_SETTINGS_SAVE_DELAY_MS,
    VIDEO_TIER_AREAS,
    cloneSpec,
    clearPendingProjectSettingsSave,
    confirmImageSpec,
    defaultImageSpec,
    defaultVideoSpec,
    dimensionsForArea,
    generationStyle,
    generationStyleOptions,
    getSelectedStyle,
    getSelectedStylePrompt,
    getSelectedStylePromptZh,
    getStylePromptEn,
    getStylePromptZh,
    hydrateProjectSettingsFromDrama,
    imageRatioOptions,
    imageSpecDialogVisible,
    imageSpecDraft,
    imageSpecPreview,
    imageSpecSummary,
    imageTierOptions,
    normalizeImageSpec,
    normalizeVideoSpec,
    onProjectVideoResolutionChange,
    openImageSpecDialog,
    parseRatioValue,
    pendingProjectStyleSave,
    pendingProjectSettingsSaveNotify,
    projectAspectRatio,
    projectImageSpec,
    projectMediaSpecMetadata,
    projectSettingsHydrating,
    projectSettingsSaveTimer,
    projectSettingsSaveSuppressedUntil,
    projectStylePromptMetadata,
    projectVideoResolution,
    projectVideoSpec,
    resetProjectSettings,
    resolvedProjectImageSpec,
    resolvedProjectVideoSpec,
    resolveImageSpec,
    resolveVideoSpec,
    roundToMultiple,
    scheduleProjectSettingsSave,
    scriptLanguage,
    scriptStoryboardStyle,
    setProjectSettingsHydrating,
    stylePromptMetadataForSave,
    videoClipDuration,
    videoResolution,
    videoTierOptions,
  }
}
