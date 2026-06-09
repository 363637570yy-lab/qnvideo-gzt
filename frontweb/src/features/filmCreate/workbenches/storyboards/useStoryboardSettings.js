import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

const STORYBOARD_FRAME_COUNT_OPTIONS = [2, 4, 6, 9, 12]

export function useStoryboardSettings(deps = {}) {
  const {
    scriptContent,
    videoClipDuration,
    scheduleProjectSettingsSave = () => {},
  } = deps

  const storyboardCount = ref(null)
  const videoDuration = ref(null)
  const storyboardIncludeNarration = ref(false)
  const storyboardUniversalOmni = ref(false)
  const storyboardUseFirstLastFrame = ref(false)
  const exportingStoryboardSheet = ref(false)
  const lastFrameUseFirstLayoutLock = ref(true)
  const storyboardFrameCountOptions = STORYBOARD_FRAME_COUNT_OPTIONS
  const storyboardFrameCount = ref(4)

  function normalizeStoryboardFrameCount(value) {
    const n = Number(value)
    if (storyboardFrameCountOptions.includes(n)) return n
    return n === 1 ? 2 : 4
  }

  function effectiveStoryboardFrameCount(frameType = null) {
    if (frameType) return 1
    return normalizeStoryboardFrameCount(storyboardFrameCount.value)
  }

  function clipSecondsForStoryboardEstimate() {
    const c = Number(videoClipDuration?.value)
    return Math.max(2, Math.min(60, Number.isFinite(c) && c > 0 ? c : 10))
  }

  function shotCountEstimateFromDurationSec(sec) {
    const s = Math.max(10, Math.min(600, Math.round(Number(sec) || 0)))
    const clip = clipSecondsForStoryboardEstimate()
    const ideal = s / clip
    const locked = Math.max(1, Math.min(200, Math.round(ideal)))
    const minR = Math.max(1, locked - 1)
    const maxR = Math.min(200, locked + 1)
    const range = minR >= maxR ? { min: locked, max: locked } : { min: minR, max: maxR }
    return { locked, range, clip }
  }

  function estimateVideoDurationSecFromCharLen(charLen) {
    const len = Math.max(0, Math.floor(Number(charLen) || 0))
    if (len < 1) return null
    const raw = Math.round(10 + (len / 600) * 60)
    return Math.min(600, Math.max(10, raw))
  }

  const scriptStoryboardEstimate = computed(() => {
    const script = (scriptContent?.value || '').toString().trim()
    const len = script.length
    if (!len) return null
    const sec = estimateVideoDurationSecFromCharLen(len)
    if (sec == null) return null
    const { locked, range, clip } = shotCountEstimateFromDurationSec(sec)
    return { sec, locked, range, clip, len }
  })

  const scriptEstimateVideoDurationHint = computed(() => {
    const e = scriptStoryboardEstimate.value
    if (!e) return ''
    return `（约 ${e.sec}s）`
  })

  const scriptEstimateVideoDurationTitle = computed(() => {
    const e = scriptStoryboardEstimate.value
    if (!e) return ''
    return `按当前剧本文本约 ${e.len} 个字符（含标点；常见汉字在浏览器里一字一算，并非按 UTF-8 字节翻倍）、短剧公式 round(10+(字符/600)×60) 粗估总时长约 ${e.sec} 秒；未填输入框时该值会作为约束传给生成接口。仅供参考`
  })

  const scriptEstimateStoryboardHint = computed(() => {
    const e = scriptStoryboardEstimate.value
    if (!e) return ''
    if (e.range && e.range.min !== e.range.max) {
      return `（约 ${e.locked} 镜，参考 ${e.range.min}–${e.range.max}）`
    }
    return `（约 ${e.locked} 镜）`
  })

  const scriptEstimateStoryboardTitle = computed(() => {
    const e = scriptStoryboardEstimate.value
    if (!e) return ''
    return `按估算时长 ${e.sec}s ÷ 项目「每段 ${e.clip} 秒」四舍五入粗估约 ${e.locked} 镜；旁注区间为 ±1 镜供参考。切换「X秒/段」会同步改变本估算。`
  })

  function scriptTextTrimmedForEstimate() {
    return (scriptContent?.value || '').toString().trim()
  }

  function userFilledStoryboardCount() {
    const v = storyboardCount.value
    return v != null && Number.isFinite(Number(v)) && Number(v) >= 1
  }

  function userFilledVideoDuration() {
    const v = videoDuration.value
    return v != null && Number.isFinite(Number(v)) && Number(v) >= 10
  }

  function getVideoDurationForApi() {
    if (userFilledVideoDuration()) return Math.round(Number(videoDuration.value))
    const len = scriptTextTrimmedForEstimate().length
    if (len < 1) return undefined
    return estimateVideoDurationSecFromCharLen(len) ?? undefined
  }

  function getStoryboardCountForApi() {
    if (userFilledStoryboardCount()) return Math.round(Number(storyboardCount.value))
    const sec = getVideoDurationForApi()
    if (sec == null || !Number.isFinite(sec)) return undefined
    return shotCountEstimateFromDurationSec(sec).locked
  }

  function onStoryboardUseFirstLastFrameChange() {
    if (storyboardUseFirstLastFrame.value && storyboardFrameCount.value !== 2) {
      storyboardFrameCount.value = 2
      ElMessage.info('首尾帧模式已开启，关键帧数量已切换为 2 张')
    }
    scheduleProjectSettingsSave(false)
  }

  function hydrateStoryboardSettingsFromMetadata(metadata = {}) {
    storyboardIncludeNarration.value = !!metadata.storyboard_include_narration
    storyboardUniversalOmni.value = !!metadata.storyboard_universal_omni
    storyboardUseFirstLastFrame.value = !!metadata.storyboard_use_first_last_frame
    storyboardFrameCount.value = normalizeStoryboardFrameCount(metadata.storyboard_frame_count)
    lastFrameUseFirstLayoutLock.value = metadata.last_frame_use_first_layout_lock !== false
    if (storyboardUseFirstLastFrame.value) storyboardFrameCount.value = 2
  }

  function resetStoryboardSettings() {
    storyboardCount.value = null
    videoDuration.value = null
    storyboardIncludeNarration.value = false
    storyboardUniversalOmni.value = false
    storyboardUseFirstLastFrame.value = false
    exportingStoryboardSheet.value = false
    lastFrameUseFirstLayoutLock.value = true
    storyboardFrameCount.value = 4
  }

  return {
    clipSecondsForStoryboardEstimate,
    effectiveStoryboardFrameCount,
    estimateVideoDurationSecFromCharLen,
    exportingStoryboardSheet,
    getStoryboardCountForApi,
    getVideoDurationForApi,
    hydrateStoryboardSettingsFromMetadata,
    lastFrameUseFirstLayoutLock,
    normalizeStoryboardFrameCount,
    onStoryboardUseFirstLastFrameChange,
    resetStoryboardSettings,
    scriptEstimateStoryboardHint,
    scriptEstimateStoryboardTitle,
    scriptEstimateVideoDurationHint,
    scriptEstimateVideoDurationTitle,
    scriptStoryboardEstimate,
    scriptTextTrimmedForEstimate,
    shotCountEstimateFromDurationSec,
    storyboardCount,
    storyboardFrameCount,
    storyboardFrameCountOptions,
    storyboardIncludeNarration,
    storyboardUniversalOmni,
    storyboardUseFirstLastFrame,
    userFilledStoryboardCount,
    userFilledVideoDuration,
    videoDuration,
  }
}
