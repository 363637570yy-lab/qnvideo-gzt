import { ElMessage } from 'element-plus'

function valueOf(input, fallback = undefined) {
  const value = input && typeof input === 'object' && 'value' in input ? input.value : input
  return value === undefined ? fallback : value
}

export function createProjectSettingsSaver(options = {}) {
  const {
    AI_ROUTE_METADATA_KEY,
    dramaAPI,
    generationStyle,
    lastFrameUseFirstLayoutLock,
    normalizeStoryboardFrameCount,
    projectAiRouteSelectionForSave,
    projectMediaSpecMetadata,
    projectStylePromptMetadata,
    scriptLanguage,
    store,
    storyboardFrameCount,
    storyboardIncludeNarration,
    storyboardUniversalOmni,
    storyboardUseFirstLastFrame,
    storyStyle,
    storyType,
    videoClipDuration,
    projectAspectRatio,
  } = options

  return async function saveProjectSettings(includeGenerationStyle = false, options = {}) {
    if (!store?.dramaId) return
    const shouldNotify = options.notify !== false
    const metadata = {
      ...projectMediaSpecMetadata(),
      [AI_ROUTE_METADATA_KEY]: projectAiRouteSelectionForSave(),
      story_style: valueOf(storyStyle) || undefined,
      aspect_ratio: valueOf(projectAspectRatio) || '16:9',
      video_clip_duration: valueOf(videoClipDuration) || 10,
      script_language: valueOf(scriptLanguage) || 'zh',
      storyboard_include_narration: !!valueOf(storyboardIncludeNarration),
      storyboard_universal_omni: !!valueOf(storyboardUniversalOmni),
      storyboard_use_first_last_frame: !!valueOf(storyboardUseFirstLastFrame),
      storyboard_frame_count: normalizeStoryboardFrameCount(valueOf(storyboardFrameCount)),
      last_frame_use_first_layout_lock: !!valueOf(lastFrameUseFirstLayoutLock),
    }
    if (includeGenerationStyle) {
      Object.assign(metadata, projectStylePromptMetadata())
    }
    const payload = {
      genre: valueOf(storyType) || undefined,
      metadata,
    }
    if (includeGenerationStyle) {
      payload.style = valueOf(generationStyle) || undefined
    }
    try {
      await dramaAPI.saveOutline(store.dramaId, payload)
      if (shouldNotify) {
        ElMessage({
          type: 'success',
          message: '修改已实时保存，再次生成素材、分镜或视频时将按当前设置生效。',
          duration: 2600,
          showClose: true,
        })
      }
    } catch (e) {
      console.error('Settings auto-save failed', e)
      ElMessage.error(e?.message || '项目设置保存失败')
    }
  }
}
