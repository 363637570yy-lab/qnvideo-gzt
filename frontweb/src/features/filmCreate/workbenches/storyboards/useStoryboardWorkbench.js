import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storyboardsAPI } from '@/api/storyboards'
import { useStoryboardFieldState } from './useStoryboardFieldState'
import { useStoryboardFramePrompts } from './useStoryboardFramePrompts'
import { useStoryboardImageUpload } from './useStoryboardImageUpload'
import { useStoryboardImageGeneration } from './useStoryboardImageGeneration'
import { storyboardAuxRoleOptions, useStoryboardMediaSelectors } from './useStoryboardMediaSelectors'
import { useStoryboardMediaLoader } from './useStoryboardMediaLoader'

export function useStoryboardWorkbench(deps = {}) {
  const {
    store,
    imagesAPI,
    videosAPI,
    uploadAPI,
    genStore,
    genResource = {},
    getDramaId = () => null,
    getCurrentEpisodeId = () => null,
    getSelectedStyle = () => undefined,
    getSelectedStylePrompt = () => '',
    getSelectedStylePromptZh = () => '',
    projectAspectRatio,
    lastFrameUseFirstLayoutLock,
    effectiveStoryboardFrameCount = () => 1,
    storyboardImageAiPayload = () => ({}),
    pipelineRunning,
    pipelineConcurrency,
    runConcurrently = async (items, _limit, worker) => {
      for (const item of items) await worker(item)
    },
    pollTask = async () => null,
    pollTaskWithPause = async () => null,
    loadDrama = async () => {},
    buildSbGenMeta = () => ({}),
    angleToPromptFragment = () => ({ label: '' }),
    imageReferenceUrlForApi = () => '',
    getStoryboardAssetReferenceImages = () => [],
    getSbStoryboardReferenceImages = () => [],
    videoClipDuration,
    storyboardUseFirstLastFrame,
    storyboardFrameCount,
    normalizeStoryboardFrameCount = (count) => Number(count) || 1,
    assetImageUrl = () => '',
    assetThumbUrl = () => '',
    assetVideoUrl = () => '',
    recordHasPlayableVideoUrl = () => false,
    openImagePreview = () => {},
    confirmAdminProjectOperation = async () => true,
  } = deps

  const {
    charactersAvailableToAddToSb,
    getMovementLabel,
    getSbCharacterId,
    getSbCharacterIds,
    getSbPropId,
    getSbPropIds,
    getSbSelectedCharacters,
    getSbSelectedProps,
    getSbSelectedScene,
    onSbAddCharacterCommand,
    onStoryboardCharacterChange,
    onStoryboardPropChange,
    onStoryboardSceneChange,
    sbAction,
    sbAngle,
    sbAngleH,
    sbAngleS,
    sbAngleV,
    sbAtmosphere,
    sbCharacterIds,
    sbCreationMode,
    sbDialogue,
    sbDof,
    sbDuration,
    sbLayoutDescription,
    sbLighting,
    sbLocation,
    sbMovement,
    sbNarration,
    sbPropIds,
    sbResult,
    sbSceneId,
    sbShotType,
    sbTime,
    sbTitle,
    sbUniversalSegmentText,
    setSbCharacterId,
    setSbPropId,
    syncStoryboardStateFromEpisode,
  } = useStoryboardFieldState({ store, videoClipDuration })

  const sbImages = ref({})
  const sbVideos = ref({})
  const sbVideoErrors = ref({})
  const sbSelectedImgId = ref({})
  const sbSelectedLastImgId = ref({})
  const sbSelectedVideoId = ref({})
  const sbImageUploadSlotById = ref({})

  const generatingSbImageIds = reactive(new Set())
  const generatingSbFirstImageIds = reactive(new Set())
  const generatingSbLastImageIds = reactive(new Set())
  const generatingSbVideoIds = reactive(new Set())
  const generatingUniversalSegmentIds = reactive(new Set())
  const regenSbImagesForAsset = reactive(new Set())
  const regeneratingLayoutSbIds = reactive(new Set())
  const upscalingSbIds = reactive(new Set())
  const ttsSbIds = reactive(new Set())
  const ttsSbNarrationIds = reactive(new Set())
  const linkingTailFrameIds = reactive(new Set())
  const usingPrevTailAsFirstIds = reactive(new Set())

  const regenSbImagesProgress = ref({})
  const batchImageRunning = ref(false)
  const batchImageStopping = ref(false)
  const batchImageProgress = ref({ current: 0, total: 0, failed: 0 })
  const batchImageErrors = ref([])
  const batchVideoRunning = ref(false)
  const batchVideoStopping = ref(false)
  const batchVideoProgress = ref({ current: 0, total: 0, failed: 0 })
  const batchVideoErrors = ref([])

  const inferringParams = ref(false)
  const showVideoParamsDialog = ref(false)
  const videoParamsTarget = ref(null)
  const videoParamsSaving = ref(false)
  const splitByAudioLoading = ref(false)
  const videoFrameContiguity = ref(false)

  const sbDialogueAudioPaths = ref({})
  const sbNarrationAudioPaths = ref({})
  const editingSbVideoPromptId = ref(null)
  const editingSbVideoPromptText = ref('')
  const editingSbImagePromptId = ref(null)
  const editingSbImagePromptText = ref('')
  const showSbPromptDialog = ref(false)
  const sbPromptTarget = ref(null)
  const sbPromptImageText = ref('')
  const sbPromptPolishedText = ref('')
  const sbPromptVideoText = ref('')
  const sbPromptSaving = ref(false)
  const sbPromptPolishing = ref(false)
  function defaultStoryboardDuration() {
    return Number(videoClipDuration?.value ?? videoClipDuration) || 10
  }

  function isFirstLastFrameMode() {
    return !!(storyboardUseFirstLastFrame?.value ?? storyboardUseFirstLastFrame)
  }

  function getDramaIdValue() {
    const value = typeof getDramaId === 'function' ? getDramaId() : getDramaId
    return value?.value ?? value
  }

  function getCurrentEpisodeIdValue() {
    const value = typeof getCurrentEpisodeId === 'function' ? getCurrentEpisodeId() : getCurrentEpisodeId
    return value?.value ?? value
  }

  function getRefValue(source, fallback = undefined) {
    return source?.value ?? source ?? fallback
  }

  const {
    auxRoleFrameType,
    auxRoleLabel,
    buildKeyframeParamsJson,
    canUsePrevTailAsFirst,
    compactKeyframeText,
    defaultKeyframeDescription,
    formatKeyframeSecond,
    frameTypeForSlot,
    getNextStoryboard,
    getPrevStoryboard,
    getQuadGridImage,
    getSbAllImages,
    getSbAllVideos,
    getSbFirstImage,
    getSbImage,
    getSbLastImage,
    getSbPrimaryImages,
    getSbVideo,
    getSbVideoError,
    getStripItems,
    getVideoStripItems,
    groupByStoryboardId,
    hasSbFirstLastPair,
    hasSbImage,
    isAuxStoryboardImage,
    keyframeDescriptionFromParams,
    keyframeIndexInfo,
    keyframeItemLabel,
    keyframeTimelineLine,
    keyframeTimeRange,
    parseImageParamsJson,
    parseJsonObject,
    quadPanelLabel,
    resolveSbImageById,
    sbMainVideoPlayerKey,
    stripItemTitle,
    uploadingSbImageSlot,
  } = useStoryboardMediaSelectors({
    store,
    sbImages,
    sbVideos,
    sbVideoErrors,
    sbSelectedImgId,
    sbSelectedLastImgId,
    sbSelectedVideoId,
    sbImageUploadSlotById,
    storyboardFrameCount,
    videoClipDuration,
    normalizeStoryboardFrameCount,
    isFirstLastFrameMode,
    assetImageUrl,
    assetThumbUrl,
    assetVideoUrl,
    recordHasPlayableVideoUrl,
  })

  const {
    loadSingleStoryboardMedia,
    loadStoryboardMedia,
    restoreSelectionsFromBackend,
    updateStoryboardImageMeta,
  } = useStoryboardMediaLoader({
    store,
    imagesAPI,
    videosAPI,
    sbImages,
    sbVideos,
    sbSelectedImgId,
    sbSelectedLastImgId,
    groupByStoryboardId,
    getSbAllImages,
  })

  const {
    dragOverSbId,
    doUploadSbImage,
    onSbImageDragLeave,
    onSbImageDragOver,
    onSbImageDrop,
    onSbImageFileChange,
    onUploadSbImageClick,
    sbImageFileInput,
    sbImageUploadForId,
    uploadingSbImageId,
  } = useStoryboardImageUpload({
    store,
    imagesAPI,
    uploadAPI,
    sbImageUploadSlotById,
    sbSelectedImgId,
    getDramaIdValue,
    isFirstLastFrameMode,
    frameTypeForSlot,
    confirmAdminProjectOperation,
    loadSingleStoryboardMedia,
    restoreSelectionsFromBackend,
    onSelectSbFrameImage,
  })

  const {
    buildFirstFrameImagePrompt,
    buildLastFrameImagePrompt,
    editingFramePromptRegenerating,
    editingFramePromptSaving,
    editingFramePromptSb,
    editingFramePromptSlot,
    editingFramePromptText,
    ensureProfessionalFramePrompt,
    openFramePromptEditor,
    regenerateEditingFramePrompt,
    saveEditingFramePrompt,
    showFramePromptEditor,
    showSbFramePromptPreview,
  } = useStoryboardFramePrompts({
    store,
    storyboardsAPI,
    pollTask,
    sbLocation,
    sbTime,
    sbShotType,
    sbAngleH,
    sbAngleV,
    sbAngleS,
    sbResult,
    sbAction,
    sbAtmosphere,
    angleToPromptFragment,
    getSelectedStylePrompt,
    getSelectedStylePromptZh,
  })


  const {
    buildAuxPrompt,
    buildStoryboardKeyframePrompt,
    createStoryboardImageBatchId,
    createStoryboardImageTasks,
    onGenerateStoryboardAux,
    onGenerateSbFrameImage,
    onGenerateSbFramePair,
    onGenerateSbImage,
    startBatchImageGeneration,
    stopBatchImageGeneration,
    submitSbFrameImageTask,
  } = useStoryboardImageGeneration({
    store,
    imagesAPI,
    storyboardsAPI,
    genStore,
    genResource,
    sbCharacterIds,
    sbImages,
    sbSelectedImgId,
    sbSelectedLastImgId,
    generatingSbImageIds,
    generatingSbFirstImageIds,
    generatingSbLastImageIds,
    batchImageRunning,
    batchImageStopping,
    batchImageProgress,
    batchImageErrors,
    getDramaIdValue,
    getCurrentEpisodeIdValue,
    getRefValue,
    getSelectedStyle,
    projectAspectRatio,
    lastFrameUseFirstLayoutLock,
    effectiveStoryboardFrameCount,
    storyboardImageAiPayload,
    pipelineRunning,
    pipelineConcurrency,
    runConcurrently,
    pollTask,
    pollTaskWithPause,
    loadDrama,
    buildSbGenMeta,
    imageReferenceUrlForApi,
    getStoryboardAssetReferenceImages,
    getSbStoryboardReferenceImages,
    confirmAdminProjectOperation,
    isFirstLastFrameMode,
    ensureProfessionalFramePrompt,
    buildLastFrameImagePrompt,
    frameTypeForSlot,
    buildKeyframeParamsJson,
    getSbFirstImage,
    hasSbImage,
    auxRoleFrameType,
    auxRoleLabel,
    assetImageUrl,
    loadSingleStoryboardMedia,
    loadStoryboardMedia,
    restoreSelectionsFromBackend,
  })

  async function onEditKeyframeDescription(storyboard, item) {
    if (!storyboard?.id || !item?.img || item.aux) return
    const current = keyframeTimelineLine(storyboard, item.img)
    let value = ''
    try {
      const result = await ElMessageBox.prompt(
        '这段文字会随关键帧一起进入视频提示词，用来补充时间轴、动作承接和剪辑意图。',
        '编辑关键帧描述',
        {
          confirmButtonText: '保存',
          cancelButtonText: '取消',
          inputType: 'textarea',
          inputValue: current,
          inputPlaceholder: '例如：0-5秒 首帧：角色站在门口迟疑，镜头缓慢推近，右侧留出进入空间',
        }
      )
      value = (result?.value || '').toString().trim()
    } catch {
      return
    }
    const params = parseImageParamsJson(item.img)
    const nextParams = {
      ...params,
      keyframe_description: value || defaultKeyframeDescription(storyboard, item.img),
      keyframe_description_updated_at: new Date().toISOString(),
    }
    try {
      await updateStoryboardImageMeta(storyboard.id, item.img, { params_json: nextParams })
      ElMessage.success('关键帧描述已保存')
    } catch (error) {
      ElMessage.error(error.message || '保存失败')
    }
  }

  async function onToggleKeyframeLocked(storyboard, item) {
    if (!storyboard?.id || !item?.img) return
    try {
      await updateStoryboardImageMeta(storyboard.id, item.img, { locked: !item.img.locked })
      ElMessage.success(item.img.locked ? '已解锁' : '已锁定')
    } catch (error) {
      ElMessage.error(error.message || '操作失败')
    }
  }

  async function onToggleKeyframeSelected(storyboard, item) {
    if (!storyboard?.id || !item?.img) return
    if (item.aux || isAuxStoryboardImage(item.img)) {
      ElMessage.info('辅助稿只作为视频参考，不设为主图')
      return
    }
    try {
      const next = !item.img.selected
      await updateStoryboardImageMeta(storyboard.id, item.img, { selected: next })
      if (next) sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: item.img.id }
      ElMessage.success(next ? '已确认该格' : '已取消确认')
    } catch (error) {
      ElMessage.error(error.message || '操作失败')
    }
  }

  async function onStripItemClick(storyboard, item) {
    if (item?.aux || isAuxStoryboardImage(item?.img)) {
      openImagePreview(item.src)
      return
    }
    if (!isFirstLastFrameMode()) {
      onSelectStripItem(storyboard, item)
      return
    }
    try {
      await ElMessageBox.confirm('将此图绑定到哪个槽位？', '设置参考帧', {
        confirmButtonText: '设为首帧',
        cancelButtonText: '设为尾帧',
        distinguishCancelAndClose: true,
        type: 'info',
      })
      onSelectSbFrameImage(storyboard, item.img, 'first')
      ElMessage.success('已设为首帧')
    } catch (action) {
      if (action === 'cancel') {
        onSelectSbFrameImage(storyboard, item.img, 'last')
        ElMessage.success('已设为尾帧')
      }
    }
  }

  function onSelectStripItem(storyboard, item) {
    if (item?.aux || isAuxStoryboardImage(item?.img)) {
      openImagePreview(item.src)
      return
    }
    onSelectSbMainImage(storyboard, item.img)
  }

  function onSelectSbFrameImage(storyboard, image, slot) {
    if (!storyboard?.id || !image) return
    const isLast = slot === 'last'

    if (isLast) {
      sbSelectedLastImgId.value = { ...sbSelectedLastImgId.value, [storyboard.id]: image.id }
    } else {
      sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: image.id }
    }

    const list = store?.currentEpisode?.storyboards
    if (Array.isArray(list)) {
      const row = list.find((item) => Number(item.id) === Number(storyboard.id))
      if (row) {
        const now = new Date().toISOString()
        if (isLast) {
          row.last_frame_image_id = image.id
          row.last_frame_image_url = image.image_url || null
          row.last_frame_local_path = image.local_path || null
        } else {
          row.first_frame_image_id = image.id
          row.image_url = image.image_url || null
          row.local_path = image.local_path || null
        }
        row.updated_at = now
      }
    }

    const patch = { updated_at: new Date().toISOString() }
    if (isLast) {
      patch.last_frame_image_id = image.id
      patch.last_frame_image_url = image.image_url || null
      patch.last_frame_local_path = image.local_path || undefined
    } else {
      patch.image_url = image.image_url || null
      patch.local_path = image.local_path || undefined
      patch.first_frame_image_id = image.id
    }

    storyboardsAPI.update(storyboard.id, patch).catch((error) => console.warn('[参考帧] 保存失败', error))
  }

  function onSelectSbMainImage(storyboard, image) {
    onSelectSbFrameImage(storyboard, image, 'first')
  }

  async function onRemoveSbHistoryImage(storyboardId, imageGenId) {
    if (!storyboardId || !imageGenId) return
    if (!(await confirmAdminProjectOperation('删除历史参考图'))) return
    try {
      await ElMessageBox.confirm('确定删除这张历史参考图？此操作不可恢复。', '删除历史图', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true,
      })
      await imagesAPI.delete(imageGenId)
      await loadSingleStoryboardMedia(storyboardId)
      ElMessage.success('历史图已删除')
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(error?.message || '删除失败')
      }
    }
  }

  function getNeighborKeyframeRefs(storyboardId, image) {
    const all = getSbAllImages(storyboardId)
      .filter((item) => item.frame_type === 'storyboard_keyframe' && item.batch_id && item.batch_id === image.batch_id)
    const prev = all.find((item) => Number(item.slot_index) === Number(image.slot_index) - 1)
    const next = all.find((item) => Number(item.slot_index) === Number(image.slot_index) + 1)
    return { prev, next }
  }

  function buildRegenerateKeyframePrompt(storyboard, image, userNote = '') {
    const base = storyboard.polished_prompt || storyboard.image_prompt || storyboard.description || ''
    if (image?.aux_role) {
      return [
        `请重生成该分镜的「${auxRoleLabel(image.aux_role) || '辅助稿'}」。`,
        '保持与已确认关键帧、角色、场景、道具一致；只改进辅助表达，不改变本镜头叙事。',
        userNote ? `用户修改要求：${userNote}` : '',
        base,
      ].filter(Boolean).join('\n')
    }
    const slotText = image?.batch_count ? `第 ${Number(image.slot_index ?? 0) + 1}/${image.batch_count} 格` : '当前格'
    return [
      `请重生成同一条分镜连贯关键帧组中的${slotText}。`,
      '必须承接上一格动作状态，并自然过渡到下一格；保持角色、服装、场景、道具、光影和镜头方向连续。',
      '只修改当前格，不要生成拼图、分屏、宫格或多画面并列。',
      userNote ? `用户修改要求：${userNote}` : '',
      base,
    ].filter(Boolean).join('\n')
  }

  async function onRegenerateKeyframeItem(storyboard, item) {
    if (!storyboard?.id || !item?.img) return
    if (item.img.locked) {
      ElMessage.warning('该格已锁定，先解锁再重生')
      return
    }
    let userNote = ''
    try {
      const res = await ElMessageBox.prompt('写下这一格要调整的内容；留空则只按前后格做连贯重生。', '单格重生', {
        confirmButtonText: '开始重生',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: '例如：人物表情更紧张，镜头稍微推近，手部动作更清晰',
      })
      userNote = res?.value || ''
    } catch {
      return
    }
    generatingSbImageIds.add(storyboard.id)
    try {
      const { prev, next } = getNeighborKeyframeRefs(storyboard.id, item.img)
      const refs = [
        imageReferenceUrlForApi(prev),
        imageReferenceUrlForApi(item.img),
        imageReferenceUrlForApi(next),
        ...getStoryboardAssetReferenceImages(storyboard.id),
      ].filter(Boolean)
      const result = await createStoryboardImageTasks(storyboard, {
        prompt: buildRegenerateKeyframePrompt(storyboard, item.img, userNote),
        frameType: item.img.frame_type || 'storyboard_keyframe',
        batchId: item.img.batch_id || createStoryboardImageBatchId(storyboard.id, 'kf'),
        slotIndex: Number(item.img.slot_index ?? 0),
        batchCount: Number(item.img.batch_count || storyboardFrameCount?.value || storyboardFrameCount || 1),
        referenceImages: refs,
        auxRole: item.img.aux_role || undefined,
        selected: !!item.img.selected,
        paramsJson: {
          ...parseImageParamsJson(item.img),
          keyframe_description: keyframeTimelineLine(storyboard, item.img),
          regenerate_from_image_id: item.img.id,
          user_note: userNote,
          prev_image_id: prev?.id || null,
          next_image_id: next?.id || null,
        },
      })
      if (result.failed > 0) throw new Error(result.error || '重生失败')
      if (item.img.selected) await updateStoryboardImageMeta(storyboard.id, item.img, { selected: false })
      ElMessage.success('该格已重生')
      await loadSingleStoryboardMedia(storyboard.id)
    } catch (error) {
      ElMessage.error(error.message || '重生失败')
    } finally {
      generatingSbImageIds.delete(storyboard.id)
    }
  }

  function onSelectSbMainVideo(storyboard, video) {
    sbSelectedVideoId.value = { ...sbSelectedVideoId.value, [storyboard.id]: video.id }
    storyboardsAPI.update(storyboard.id, {
      video_url: video.video_url || null,
      local_path: video.local_path || undefined,
    }).catch((error) => console.warn('[主视频] 保存后端失败', error))
  }

  return {
    batchImageErrors,
    batchImageProgress,
    batchImageRunning,
    batchImageStopping,
    batchVideoErrors,
    batchVideoProgress,
    batchVideoRunning,
    batchVideoStopping,
    charactersAvailableToAddToSb,
    canUsePrevTailAsFirst,
    dragOverSbId,
    doUploadSbImage,
    editingFramePromptRegenerating,
    editingFramePromptSaving,
    editingFramePromptSb,
    editingFramePromptSlot,
    editingFramePromptText,
    editingSbImagePromptId,
    editingSbImagePromptText,
    editingSbVideoPromptId,
    editingSbVideoPromptText,
    generatingSbFirstImageIds,
    generatingSbImageIds,
    generatingSbLastImageIds,
    generatingSbVideoIds,
    generatingUniversalSegmentIds,
    frameTypeForSlot,
    auxRoleFrameType,
    auxRoleLabel,
    buildFirstFrameImagePrompt,
    buildKeyframeParamsJson,
    buildLastFrameImagePrompt,
    buildRegenerateKeyframePrompt,
    buildStoryboardKeyframePrompt,
    compactKeyframeText,
    createStoryboardImageBatchId,
    createStoryboardImageTasks,
    defaultKeyframeDescription,
    formatKeyframeSecond,
    getMovementLabel,
    getNextStoryboard,
    getPrevStoryboard,
    getQuadGridImage,
    getStripItems,
    getSbAllImages,
    getSbAllVideos,
    getSbCharacterId,
    getSbCharacterIds,
    getSbFirstImage,
    getSbImage,
    getSbLastImage,
    getSbPrimaryImages,
    getSbPropId,
    getSbPropIds,
    getSbSelectedCharacters,
    getSbSelectedProps,
    getSbSelectedScene,
    getSbVideo,
    getSbVideoError,
    getVideoStripItems,
    keyframeDescriptionFromParams,
    keyframeIndexInfo,
    keyframeItemLabel,
    keyframeTimelineLine,
    keyframeTimeRange,
    groupByStoryboardId,
    hasSbFirstLastPair,
    hasSbImage,
    inferringParams,
    isAuxStoryboardImage,
    linkingTailFrameIds,
    regeneratingLayoutSbIds,
    regenSbImagesForAsset,
    regenSbImagesProgress,
    sbAction,
    sbAngle,
    sbAngleH,
    sbAngleS,
    sbAngleV,
    sbAtmosphere,
    sbCharacterIds,
    sbCreationMode,
    sbDialogue,
    sbDialogueAudioPaths,
    sbDof,
    sbDuration,
    sbImageFileInput,
    sbImages,
    sbImageUploadForId,
    sbImageUploadSlotById,
    sbLayoutDescription,
    sbLighting,
    sbLocation,
    sbMovement,
    sbNarration,
    sbNarrationAudioPaths,
    sbPropIds,
    sbPromptImageText,
    sbPromptPolishedText,
    sbPromptPolishing,
    sbPromptSaving,
    sbPromptTarget,
    sbPromptVideoText,
    sbResult,
    sbSceneId,
    sbSelectedImgId,
    sbSelectedLastImgId,
    sbSelectedVideoId,
    sbShotType,
    sbTime,
    sbTitle,
    sbUniversalSegmentText,
    sbVideoErrors,
    sbVideos,
    storyboardAuxRoleOptions,
    loadSingleStoryboardMedia,
    loadStoryboardMedia,
    onSbAddCharacterCommand,
    onEditKeyframeDescription,
    onRemoveSbHistoryImage,
    onSbImageDragLeave,
    onSbImageDragOver,
    onSbImageDrop,
    onSbImageFileChange,
    onGenerateSbFrameImage,
    onGenerateSbFramePair,
    onGenerateSbImage,
    onGenerateStoryboardAux,
    onRegenerateKeyframeItem,
    onSelectSbFrameImage,
    onSelectSbMainImage,
    onSelectSbMainVideo,
    onSelectStripItem,
    onStoryboardCharacterChange,
    onStoryboardPropChange,
    onStoryboardSceneChange,
    onStripItemClick,
    onToggleKeyframeLocked,
    onToggleKeyframeSelected,
    onUploadSbImageClick,
    parseImageParamsJson,
    parseJsonObject,
    quadPanelLabel,
    regenerateEditingFramePrompt,
    resolveSbImageById,
    restoreSelectionsFromBackend,
    sbMainVideoPlayerKey,
    setSbCharacterId,
    setSbPropId,
    saveEditingFramePrompt,
    showFramePromptEditor,
    showSbFramePromptPreview,
    showSbPromptDialog,
    showVideoParamsDialog,
    splitByAudioLoading,
    startBatchImageGeneration,
    stopBatchImageGeneration,
    syncStoryboardStateFromEpisode,
    ttsSbIds,
    ttsSbNarrationIds,
    updateStoryboardImageMeta,
    uploadingSbImageId,
    uploadingSbImageSlot,
    upscalingSbIds,
    usingPrevTailAsFirstIds,
    videoFrameContiguity,
    videoParamsSaving,
    videoParamsTarget,
    openFramePromptEditor,
    submitSbFrameImageTask,
  }
}
